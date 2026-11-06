"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { INTERNAL_ROLES } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseUserForm,
  validateNewUser,
  validateUserUpdate,
  type UserFormErrors,
  type UserFormValues,
} from "@/lib/users/validate";

/** `attempt` changes on every server answer so the form can remount its checkboxes. */
export type UserFormState = { errors: UserFormErrors; values: Omit<UserFormValues, "password">; attempt?: number };

const GENERIC = "common.genericError";
const BANNED = "876000h"; // ~100 years: an inactive user cannot sign in or refresh a session

function state(values: UserFormValues, errors: UserFormErrors): UserFormState {
  const { fullName, email, roles, isActive } = values;
  return { errors, values: { fullName, email, roles, isActive }, attempt: Date.now() };
}

async function requireAdmin() {
  const user = await requireUser();
  return canAccess(user.roles, "adminUsers") ? user : null;
}

/**
 * PLT-01 AC1/AC2. The Auth user needs the secret key; the app_user and user_role rows are
 * written with the Admin's own session, so RLS still checks company and role.
 */
export async function createUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const values = parseUserForm(formData);
  const admin = await requireAdmin();
  if (!admin) return state(values, { form: "access.denied" });

  const errors = validateNewUser(values);
  if (Object.keys(errors).length > 0) return state(values, errors);

  const supabase = await createClient();
  const { data: existing } = await supabase.from("app_user").select("id").ilike("email", values.email).maybeSingle();
  if (existing) return state(values, { email: "users.errors.emailInUse" });

  const adminClient = createAdminClient();
  const { data: created, error: authError } = await adminClient.auth.admin.createUser({
    email: values.email,
    password: values.password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    const inUse = authError?.code === "email_exists" || authError?.status === 422;
    return state(values, inUse ? { email: "users.errors.emailInUse" } : { form: GENERIC });
  }

  const id = created.user.id;
  const { error: userError } = await supabase.from("app_user").insert({
    id,
    company_id: admin.companyId,
    full_name: values.fullName,
    email: values.email,
  });
  const { error: roleError } = userError
    ? { error: userError }
    : await supabase.from("user_role").insert(values.roles.map((role) => ({ user_id: id, role })));

  if (userError || roleError) {
    await adminClient.auth.admin.deleteUser(id); // cascades to app_user / user_role
    return state(values, userError?.code === "23505" ? { email: "users.errors.emailInUse" } : { form: GENERIC });
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** Edit full name, roles and active flag. E-mail stays as created (it is the sign-in name). */
export async function updateUser(id: string, _prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const values = parseUserForm(formData);
  const admin = await requireAdmin();
  if (!admin) return state(values, { form: "access.denied" });

  const errors = validateUserUpdate(values, { targetId: id, currentUserId: admin.id });
  if (Object.keys(errors).length > 0) return state(values, errors);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("app_user")
    .select("id, is_active, user_role(role)")
    .eq("id", id)
    .maybeSingle();
  if (!target) return state(values, { form: "users.errors.notFound" });

  const currentRoles = (target.user_role ?? []).map((r: { role: string }) => r.role);
  if (currentRoles.includes("VENDOR")) return state(values, { form: "users.errors.vendorAccount" });

  const { error: updateError } = await supabase
    .from("app_user")
    .update({ full_name: values.fullName, is_active: values.isActive })
    .eq("id", id);
  if (updateError) return state(values, { form: GENERIC });

  const toRemove = INTERNAL_ROLES.filter((r) => currentRoles.includes(r) && !values.roles.includes(r));
  const toAdd = values.roles.filter((r) => !currentRoles.includes(r));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("user_role").insert(toAdd.map((role) => ({ user_id: id, role })));
    if (error) return state(values, { form: GENERIC });
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from("user_role").delete().eq("user_id", id).in("role", toRemove);
    if (error) return state(values, { form: GENERIC });
  }

  if (target.is_active !== values.isActive) {
    const { error } = await createAdminClient().auth.admin.updateUserById(id, {
      ban_duration: values.isActive ? "none" : BANNED,
    });
    if (error) return state(values, { form: GENERIC });
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
