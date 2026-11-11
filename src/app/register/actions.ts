"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { storeFile } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";
import { bakuToday } from "@/lib/vendors/rules";
import {
  parseRegistration,
  toOwnerRows,
  toVendorColumns,
  validateRegistration,
  withoutPassword,
} from "@/lib/vendors/validate";
import { collectRegistrationFiles } from "@/lib/vendors/registration-files";
import type { RegistrationFormState } from "@/components/vendor/registration-form";

function answer(values: ReturnType<typeof parseRegistration>, errors: Record<string, string>): RegistrationFormState {
  return { errors, values: withoutPassword(values), attempt: Date.now() };
}

/**
 * REG-01: public self-registration. The account is created by the server as already confirmed
 * (no confirmation e-mail, CLAUDE.md rule 1), then the vendor is signed in. Save leaves the
 * registration in DRAFT; Submit also sends it for review (REG-01 AC10).
 */
export async function registerVendor(_prev: RegistrationFormState, formData: FormData): Promise<RegistrationFormState> {
  const submit = formData.get("intent") === "submit";
  const values = parseRegistration(formData);
  const errors: Record<string, string> = { ...validateRegistration(values, { withAccount: true, today: bakuToday() }) };
  const uploads = await collectRegistrationFiles(formData, values.vendorType, values.isVatPayer === "yes", {
    submit,
    have: new Set(),
  });
  Object.assign(errors, uploads.errors);
  if (Object.keys(errors).length > 0) return answer(values, errors);

  const admin = createAdminClient();
  const vendor = toVendorColumns(values);

  // REG-01 AC7: one vendor per tax number; checked before any account is created.
  const { data: taken } = await admin.rpc("vendor_tax_number_taken", {
    p_voen: vendor.voen,
    p_foreign_tax_number: vendor.foreign_tax_number,
  });
  if (taken) {
    return answer(values, { [vendor.foreign_tax_number ? "foreignTaxNumber" : "voen"]: "errors.taxNumberTaken" });
  }
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

  const { data: vendorId, error: registerError } = await admin.rpc("register_vendor", {
    p_user_id: userId,
    p_vendor: { ...vendor, contact_email: values.contactEmail },
    p_owners: toOwnerRows(values),
  });
  if (registerError || !vendorId) {
    await admin.auth.admin.deleteUser(userId);
    if (registerError?.code === "23505") {
      return answer(values, { [vendor.foreign_tax_number ? "foreignTaxNumber" : "voen"]: "errors.taxNumberTaken" });
    }
    return answer(values, { form: errorKey(registerError) ?? "common.genericError" });
  }

  const { data: row } = await admin.from("vendor").select("company_id").eq("id", vendorId).single();
  for (const upload of uploads.files) {
    await storeFile({
      companyId: row!.company_id,
      ownerType: "vendor",
      ownerId: vendorId,
      kind: upload.kind,
      file: upload.file,
      userId,
    });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: values.contactEmail,
    password: values.password,
  });
  if (signInError) redirect("/sign-in");

  if (submit) {
    const { error } = await supabase.rpc("registration_submit");
    if (error) redirect(`/vendor/registration?error=${encodeURIComponent(errorKey(error) ?? "common.genericError")}`);
  }
  redirect("/vendor/registration?saved=1");
}
