import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrationFormState } from "@/components/vendor/registration-form";
import type { OwnerRole, VendorType } from "./constants";

export const VENDOR_COLUMNS =
  "id, company_id, vendor_type, legal_name, voen, foreign_tax_number, country_code, id_card_number, legal_address, " +
  "director_name, is_vat_payer, contact_person, contact_email, phone, bank_name, iban, swift, status, standing, " +
  "standing_until, standing_reason, founded_on, main_activity, main_goods, bank_guarantee_available, " +
  "bank_guarantee_types, bank_guarantee_max, bank_guarantee_currency, review_comment, submitted_at, created_at";

export type VendorRow = {
  id: string;
  company_id: string;
  vendor_type: VendorType;
  legal_name: string;
  voen: string | null;
  foreign_tax_number: string | null;
  country_code: string;
  id_card_number: string | null;
  legal_address: string | null;
  director_name: string | null;
  is_vat_payer: boolean | null;
  contact_person: string;
  contact_email: string;
  phone: string;
  bank_name: string;
  iban: string;
  swift: string;
  status: string;
  standing: string | null;
  standing_until: string | null;
  standing_reason: string | null;
  founded_on: string | null;
  main_activity: string | null;
  main_goods: string[];
  bank_guarantee_available: boolean;
  bank_guarantee_types: string[];
  bank_guarantee_max: string | null;
  bank_guarantee_currency: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  created_at: string;
};

export type OwnerRow = { id: string; full_name: string; id_number: string; share_percent: string | null; role: OwnerRole };
export type FileRow = { id: string; file_name: string; kind: string | null; uploaded_at: string; owner_id: string };

export async function loadVendor(supabase: SupabaseClient, vendorId: string) {
  const [{ data: vendor }, { data: owners }, { data: files }] = await Promise.all([
    supabase.from("vendor").select(VENDOR_COLUMNS).eq("id", vendorId).maybeSingle<VendorRow>(),
    supabase
      .from("vendor_owner")
      .select("id, full_name, id_number, share_percent, role")
      .eq("vendor_id", vendorId)
      .order("role")
      .returns<OwnerRow[]>(),
    supabase
      .from("file")
      .select("id, file_name, kind, uploaded_at, owner_id")
      .eq("owner_type", "vendor")
      .eq("owner_id", vendorId)
      .order("uploaded_at")
      .returns<FileRow[]>(),
  ]);
  return { vendor, owners: owners ?? [], files: files ?? [] };
}

export function toFormState(vendor: VendorRow, owners: OwnerRow[]): RegistrationFormState {
  return {
    errors: {},
    values: {
      vendorType: vendor.vendor_type,
      legalName: vendor.legal_name,
      voen: vendor.voen ?? "",
      foreignTaxNumber: vendor.foreign_tax_number ?? "",
      countryCode: vendor.country_code,
      idCardNumber: vendor.id_card_number ?? "",
      legalAddress: vendor.legal_address ?? "",
      directorName: vendor.director_name ?? "",
      isVatPayer: vendor.is_vat_payer === null ? "" : vendor.is_vat_payer ? "yes" : "no",
      contactPerson: vendor.contact_person,
      contactEmail: vendor.contact_email,
      phone: vendor.phone,
      bankName: vendor.bank_name,
      iban: vendor.iban,
      swift: vendor.swift,
      foundedOn: vendor.founded_on ?? "",
      owners: owners.map((o) => ({
        fullName: o.full_name,
        idNumber: o.id_number,
        sharePercent: o.share_percent === null ? "" : String(Number(o.share_percent)),
        role: o.role,
      })),
    },
  };
}

/** Files grouped by kind, for the registration form. */
export function filesByKind(files: FileRow[]) {
  const map: Record<string, { id: string; file_name: string }[]> = {};
  for (const f of files) if (f.kind) (map[f.kind] ??= []).push({ id: f.id, file_name: f.file_name });
  return map;
}
