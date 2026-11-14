"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSignedIn, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { errorKey } from "@/lib/db-errors";
import { generateTempPassword, validatePasswordChange, type PasswordErrors } from "@/lib/users/password";

export type PasswordState = { errors: PasswordErrors & { form?: string }; saved?: boolean; attempt?: number };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

/**
 * PLT-03 AC1-AC3: the signed-in user changes their own password. The current password is checked by signing in with
 * it on a throwaway client; the new one is set with the user's own session; the database then clears the "must change"
 * mark and records PASSWORD_CHANGED. No password is logged or stored here.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireSignedIn();
  const values = { current: text(formData, "current"), next: text(formData, "next"), confirm: text(formData, "confirm") };
  const errors: PasswordState["errors"] = validatePasswordChange(values);

  if (values.current && !errors.current) {
    const { error } = await createStatelessClient().auth.signInWithPassword({ email: user.email, password: values.current });
    if (error) errors.current = "password.errors.currentWrong";
  }
  if (Object.keys(errors).length > 0) return { errors, attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: values.next });
  if (error) {
    const weak = error.code === "weak_password" || error.code === "same_password";
    return { errors: weak ? { next: "password.errors.tooShort" } : { form: "common.genericError" }, attempt: Date.now() };
  }
  const { error: doneError } = await supabase.rpc("password_change_done");
  if (doneError) return { errors: { form: errorKey(doneError) ?? "common.genericError" }, attempt: Date.now() };

  revalidatePath("/", "layout");
  if (user.mustChangePassword) redirect("/");
  return { errors: {}, saved: true, attempt: Date.now() };
}

export type ResetState = { error: string | null; tempPassword?: string; attempt?: number };

/**
 * PLT-03 AC4, AC5: reset the password of a locked-out user. The database decides who may reset whom (an Admin resets
 * internal users, a Procurement Specialist resets vendor accounts, nobody resets themselves). The temporary password
 * is set in Supabase Auth, returned once to the caller and kept nowhere else: it is not stored, logged or audited.
 */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  await requireUser();
  const userId = text(formData, "userId");
  const vendorId = text(formData, "vendorId");
  const supabase = await createClient();

  const { data: target, error: authorizeError } = await supabase.rpc("password_reset_authorize", {
    p_target: userId || null,
    p_vendor: vendorId || null,
  });
  if (authorizeError || !target) return { error: errorKey(authorizeError) ?? "errors.noAccess", attempt: Date.now() };

  const tempPassword = generateTempPassword();
  const { error: setError } = await createAdminClient().auth.admin.updateUserById(target as string, { password: tempPassword });
  if (setError) return { error: "common.genericError", attempt: Date.now() };

  // mark, end the sessions, audit; one retry because the new password is already in force
  let applied = await supabase.rpc("password_reset_apply", { p_target: target });
  if (applied.error) applied = await supabase.rpc("password_reset_apply", { p_target: target });
  if (applied.error) return { error: errorKey(applied.error) ?? "common.genericError", attempt: Date.now() };

  revalidatePath("/admin/users");
  return { error: null, tempPassword, attempt: Date.now() };
}
