import "server-only";
import { isUpload } from "@/lib/files/rules";
import { validateUpload, type FileKind } from "@/lib/files/server";
import type { VendorType } from "./constants";

export const REGISTRATION_FILE_KINDS = ["charter", "id_card", "registration_certificate", "vat_certificate"] as const;
export type RegistrationFileKind = (typeof REGISTRATION_FILE_KINDS)[number];

/** Which document fields the form shows for a type (REG-01 AC1-AC3, AC8). */
export function kindsForType(vendorType: VendorType, isVatPayer: boolean): RegistrationFileKind[] {
  const kinds: RegistrationFileKind[] =
    vendorType === "LOCAL_COMPANY" ? ["charter"] : vendorType === "INDIVIDUAL" ? ["id_card"] : ["registration_certificate"];
  if (vendorType !== "FOREIGN_COMPANY" && isVatPayer) kinds.push("vat_certificate");
  return kinds;
}

/**
 * Picks the uploaded registration documents from the form and checks type and size (NFR-009).
 * `have` lists kinds already stored, so Submit only asks for what is still missing.
 */
export async function collectRegistrationFiles(
  formData: FormData,
  vendorType: VendorType,
  isVatPayer: boolean,
  options: { submit: boolean; have: Set<string> },
): Promise<{ files: { kind: FileKind; file: File }[]; errors: Record<string, string> }> {
  const files: { kind: FileKind; file: File }[] = [];
  const errors: Record<string, string> = {};
  for (const kind of kindsForType(vendorType, isVatPayer)) {
    const value = formData.get(`file_${kind}`);
    if (isUpload(value)) {
      const error = await validateUpload(value);
      if (error) errors[`file_${kind}`] = error;
      else files.push({ kind, file: value });
    } else if (options.submit && !options.have.has(kind)) {
      errors[`file_${kind}`] = kind === "vat_certificate" ? "errors.uploadVatCertificate" : "errors.fileRequired";
    }
  }
  return { files, errors };
}
