"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { parseAccount, toAccountColumns, validateAccount, withoutPassword } from "@/lib/vendors/validate";
import type { RegisterFormState } from "@/components/vendor/register-form";

function answer(values: ReturnType<typeof parseAccount>, errors: Record<string, string>): RegisterFormState {
  return { errors, values: withoutPassword(values), attempt: Date.now() };
}

/**
 * REG-01: public account creation with the short form. The server creates the account as already
 * confirmed (no confirmation e-mail, CLAUDE.md rule 1), registration status DRAFT, signs the vendor in
 * and opens its home page. No approval is needed and nobody is notified yet.
 */
export async function registerVendor(_prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  const values = parseAccount(formData);
  const errors: Record<string, string> = { ...validateAccount(values) };
  if (Object.keys(errors).length > 0) return answer(values, errors);

  const admin = createAdminClient();
  const vendor = toAccountColumns(values);

  // AC4: one vendor per tax number; checked before any account is created.
  const { data: taken } = await admin.rpc("vendor_tax_number_taken", {
    p_voen: vendor.voen,
    p_foreign_tax_number: vendor.foreign_tax_number,
    p_id_card_number: vendor.id_card_number,
  });
  const taxField = vendor.foreign_tax_number ? "foreignTaxNumber" : vendor.id_card_number ? "idCardNumber" : "voen";
  if (taken) return answer(values, { [taxField]: "errors.taxNumberTaken" });

  // AC5
  const { data: emailUser } = await admin.from("app_user").select("id").ilike("email", values.contactEmail).maybeSingle();
  if (emailUser) return answer(values, { contactEmail: "users.errors.emailInUse" });

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: values.contactEmail,
    password: values.password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    const inUse = authError?.code === "email_exists" || authError?.status === 422;
    return answer(values, inUse ? { contactEmail: "users.errors.emailInUse" } : { form: "common.genericError" });
  }
  const userId = created.user.id;

  const { error: registerError } = await admin.rpc("register_vendor", {
    p_user_id: userId,
    p_vendor: { ...vendor, contact_email: values.contactEmail },
  });
  if (registerError) {
    await admin.auth.admin.deleteUser(userId);
    if (registerError.code === "23505") return answer(values, { [taxField]: "errors.taxNumberTaken" });
    return answer(values, { form: errorKey(registerError) ?? "common.genericError" });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: values.contactEmail,
    password: values.password,
  });
  if (signInError) redirect("/sign-in");
  redirect("/");
}
