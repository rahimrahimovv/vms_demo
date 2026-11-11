"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeFiles, storeFile } from "@/lib/files/server";
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

function answer(
  values: ReturnType<typeof parseRegistration>,
  errors: Record<string, string>,
  saved = false,
): RegistrationFormState {
  return { errors, values: withoutPassword(values), attempt: Date.now(), saved };
}

/**
 * REG-01 AC10, REG-02 AC4: the vendor edits its DRAFT or RETURNED registration and saves or submits.
 * Columns and owners are written with the vendor's own session (RLS + the read-only guard);
 * files go through the server after the ownership check.
 */
export async function updateRegistration(_prev: RegistrationFormState, formData: FormData): Promise<RegistrationFormState> {
  const submit = formData.get("intent") === "submit";
  const values = parseRegistration(formData);
  const user = await requireUser();
  if (!user.vendorId || !canAccess(user.roles, "vendorRegistration")) return answer(values, { form: "access.denied" });

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("vendor")
    .select("id, company_id, status, contact_email")
    .eq("id", user.vendorId)
    .single();
  if (!current) return answer(values, { form: "access.denied" });
  values.contactEmail = current.contact_email;
  if (!["DRAFT", "RETURNED"].includes(current.status)) return answer(values, { form: "errors.registrationReadOnly" });

  const errors: Record<string, string> = { ...validateRegistration(values, { withAccount: false, today: bakuToday() }) };
  const { data: stored } = await supabase.from("file").select("kind").eq("owner_type", "vendor").eq("owner_id", current.id);
  const uploads = await collectRegistrationFiles(formData, values.vendorType, values.isVatPayer === "yes", {
    submit,
    have: new Set((stored ?? []).map((f) => f.kind as string)),
  });
  Object.assign(errors, uploads.errors);
  if (Object.keys(errors).length > 0) return answer(values, errors);

  const vendor = toVendorColumns(values);
  const { data: taken } = await createAdminClient().rpc("vendor_tax_number_taken", {
    p_voen: vendor.voen,
    p_foreign_tax_number: vendor.foreign_tax_number,
    p_except: current.id,
  });
  if (taken) return answer(values, { [vendor.foreign_tax_number ? "foreignTaxNumber" : "voen"]: "errors.taxNumberTaken" });

  const { error: updateError } = await supabase.from("vendor").update(vendor).eq("id", current.id);
  if (updateError) {
    if (updateError.code === "23505") return answer(values, { voen: "errors.taxNumberTaken" });
    return answer(values, { form: errorKey(updateError) ?? "common.genericError" });
  }

  const { error: deleteError } = await supabase.from("vendor_owner").delete().eq("vendor_id", current.id);
  if (deleteError) return answer(values, { owners: errorKey(deleteError) ?? "common.genericError" });
  const owners = toOwnerRows(values).map((o) => ({ ...o, vendor_id: current.id }));
  if (owners.length > 0) {
    const { error } = await supabase.from("vendor_owner").insert(owners);
    if (error) return answer(values, { owners: errorKey(error) ?? "common.genericError" });
  }

  for (const upload of uploads.files) {
    await removeFiles("vendor", current.id, upload.kind);
    const { error } = await storeFile({
      companyId: current.company_id,
      ownerType: "vendor",
      ownerId: current.id,
      kind: upload.kind,
      file: upload.file,
      userId: user.id,
    });
    if (error) return answer(values, { [`file_${upload.kind}`]: error });
  }

  if (submit) {
    const { error } = await supabase.rpc("registration_submit");
    if (error) return answer(values, { form: errorKey(error) ?? "common.genericError" });
  }

  revalidatePath("/vendor/registration");
  revalidatePath("/");
  return answer(values, {}, true);
}
