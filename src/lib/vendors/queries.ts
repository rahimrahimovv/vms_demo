import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerRole, VendorType } from "./constants";
import type { BankAccount, CompanyValues } from "./validate";
import type { RegistrationSnapshot } from "./steps";

export const VENDOR_COLUMNS =
  "id, company_id, vendor_type, legal_name, voen, foreign_tax_number, country_code, id_card_number, legal_address, " +
  "director_name, is_vat_payer, contact_person, contact_email, phone, status, standing, " +
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
export type BankAccountRow = { id: string; bank_name: string; iban: string; swift: string; currency: string; is_main: boolean };

/** REG-01 AC4 / REG-06 AC7: the main account first. */
export async function loadBankAccounts(supabase: SupabaseClient, vendorId: string) {
  const { data } = await supabase
    .from("vendor_bank_account")
    .select("id, bank_name, iban, swift, currency, is_main")
    .eq("vendor_id", vendorId)
    .order("is_main", { ascending: false })
    .order("created_at")
    .returns<BankAccountRow[]>();
  return data ?? [];
}

export function toBankAccounts(rows: BankAccountRow[]): BankAccount[] {
  return rows.map((a) => ({ bankName: a.bank_name, iban: a.iban, swift: a.swift, currency: a.currency, isMain: a.is_main }));
}

export async function loadVendor(supabase: SupabaseClient, vendorId: string) {
  const [{ data: vendor }, { data: owners }, { data: files }, bankAccounts] = await Promise.all([
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
    loadBankAccounts(supabase, vendorId),
  ]);
  return { vendor, owners: owners ?? [], files: files ?? [], bankAccounts };
}

export type ContactRow = {
  id: string;
  full_name: string;
  position: string | null;
  phone: string;
  email: string;
  is_primary: boolean;
  is_legal_representative: boolean;
  proof: { id: string; file_name: string }[];
};

/** REG-07 AC4, REG-06 AC7: contact persons, the main one first, each with its proof-of-authority file(s). */
export async function loadContacts(supabase: SupabaseClient, vendorId: string): Promise<ContactRow[]> {
  const { data } = await supabase
    .from("vendor_contact")
    .select("id, full_name, position, phone, email, is_primary, is_legal_representative")
    .eq("vendor_id", vendorId)
    .order("is_primary", { ascending: false })
    .order("created_at");
  const rows = (data ?? []) as Omit<ContactRow, "proof">[];
  if (rows.length === 0) return [];
  const { data: files } = await supabase
    .from("file")
    .select("id, file_name, owner_id")
    .eq("owner_type", "vendor_contact")
    .eq("kind", "proof_of_authority")
    .in("owner_id", rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    proof: (files ?? []).filter((f) => f.owner_id === r.id).map((f) => ({ id: f.id, file_name: f.file_name })),
  }));
}

export function toCompanyValues(vendor: VendorRow): CompanyValues {
  return {
    voen: vendor.voen ?? "",
    legalAddress: vendor.legal_address ?? "",
    directorName: vendor.director_name ?? "",
    foundedOn: vendor.founded_on ?? "",
    isVatPayer: vendor.is_vat_payer === null ? "" : vendor.is_vat_payer ? "yes" : "no",
  };
}

export function toOwners(owners: OwnerRow[]) {
  return owners.map((o) => ({
    fullName: o.full_name,
    idNumber: o.id_number,
    sharePercent: o.share_percent === null ? "" : String(Number(o.share_percent)),
    role: o.role,
  }));
}

/** Everything the step rules need, read with the caller's own session (RLS). */
export async function loadSnapshot(supabase: SupabaseClient, vendorId: string) {
  const [{ vendor, owners, files, bankAccounts }, contacts] = await Promise.all([
    loadVendor(supabase, vendorId),
    loadContacts(supabase, vendorId),
  ]);
  if (!vendor) return null;
  const snapshot: RegistrationSnapshot = {
    vendorType: vendor.vendor_type,
    status: vendor.status,
    company: toCompanyValues(vendor),
    owners: toOwners(owners),
    contacts: contacts.map((c) => ({ isLegalRepresentative: c.is_legal_representative, hasProof: c.proof.length > 0 })),
    bankAccounts: toBankAccounts(bankAccounts),
    fileKinds: files.map((f) => f.kind ?? ""),
  };
  return { vendor, owners, files, bankAccounts, contacts, snapshot };
}

/** Files grouped by kind, for the registration form. */
export function filesByKind(files: FileRow[]) {
  const map: Record<string, { id: string; file_name: string }[]> = {};
  for (const f of files) if (f.kind) (map[f.kind] ??= []).push({ id: f.id, file_name: f.file_name });
  return map;
}
