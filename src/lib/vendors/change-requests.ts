/** REG-08: change requests for core company data. Pure helpers shared by the forms, the server actions and the tests. */
import type { VendorType } from "./constants";

export const CHANGE_SECTIONS = ["COMPANY_DETAILS", "OWNERS", "BANK_ACCOUNTS", "DOCUMENTS"] as const;
export type ChangeSection = (typeof CHANGE_SECTIONS)[number];

export function isChangeSection(value: string): value is ChangeSection {
  return (CHANGE_SECTIONS as readonly string[]).includes(value);
}

/** URL segment of a section on the vendor's Profile. */
export const SECTION_SLUGS: Record<ChangeSection, string> = {
  COMPANY_DETAILS: "company",
  OWNERS: "owners",
  BANK_ACCOUNTS: "bank-accounts",
  DOCUMENTS: "documents",
};

export function sectionFromSlug(slug: string): ChangeSection | null {
  return CHANGE_SECTIONS.find((s) => SECTION_SLUGS[s] === slug) ?? null;
}

/** Fields of the Company details section by vendor type, exactly the keys the database stores (app.cr_current). */
export const COMPANY_FIELDS: Record<VendorType, readonly string[]> = {
  LOCAL_COMPANY: ["legal_name", "voen", "legal_address", "director_name", "is_vat_payer", "founded_on"],
  FOREIGN_COMPANY: ["legal_name", "foreign_tax_number", "legal_address", "founded_on"],
  INDIVIDUAL: ["legal_name", "voen", "id_card_number", "legal_address"],
};

/** Labels (keys under registration.fields) of those fields. */
export const COMPANY_FIELD_LABELS: Record<string, string> = {
  legal_name: "legalName",
  voen: "voen",
  foreign_tax_number: "foreignTaxNumber",
  id_card_number: "idCardNumber",
  legal_address: "legalAddress",
  director_name: "directorName",
  is_vat_payer: "vatPayer",
  founded_on: "foundedOn",
};

/** The document kinds a vendor can replace: the registration documents of its type (REG-07 AC6). */
export function documentKinds(vendorType: VendorType, isVatPayer: boolean | null): string[] {
  const base = vendorType === "LOCAL_COMPANY" ? ["charter"] : vendorType === "INDIVIDUAL" ? ["id_card"] : ["registration_certificate"];
  return isVatPayer ? [...base, "vat_certificate"] : base;
}

type Values = Record<string, unknown>;

/** The proposal of the Company details form, with the keys of the vendor's type only. Empty text stays "". */
export function parseCompanyProposal(vendorType: VendorType, formData: FormData): Values {
  const out: Values = {};
  for (const key of COMPANY_FIELDS[vendorType]) {
    const raw = String(formData.get(key) ?? "").trim();
    out[key] = key === "is_vat_payer" ? (raw === "yes" ? true : raw === "no" ? false : null) : raw;
  }
  return out;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * REG-08 AC1: a supporting file is required for a change of the legal name, the tax number, the owners or the
 * bank accounts. Mirrors app.cr_needs_support; the database checks it again at approval.
 */
export function needsSupportingFile(section: ChangeSection, current: Values, proposed: Values): boolean {
  if (section === "OWNERS" || section === "BANK_ACCOUNTS") return true;
  if (section !== "COMPANY_DETAILS") return false;
  return ["legal_name", "voen", "foreign_tax_number", "id_card_number"].some((key) => text(current[key]) !== text(proposed[key]));
}

/** Message key of the form field a database error belongs to; everything else is shown above the form. */
export function fieldForError(key: string, vendorType: VendorType): string {
  switch (key) {
    case "errors.voenFormat":
      return "voen";
    case "errors.taxNumberTaken":
      return vendorType === "FOREIGN_COMPANY" ? "foreign_tax_number" : vendorType === "INDIVIDUAL" ? "id_card_number" : "voen";
    case "errors.foreignTaxFormat":
      return "foreign_tax_number";
    case "errors.dateInvalid":
    case "errors.foundedOnRequired":
      return "founded_on";
    case "errors.reasonRequired":
      return "reason";
    case "errors.supportRequired":
      return "support";
    case "errors.sharesOver100":
    case "errors.headOwnerRequired":
    case "errors.ownerIncomplete":
      return "owners";
    case "errors.bankAccountRequired":
    case "errors.bankAccountIncomplete":
    case "errors.ibanFormat":
    case "errors.mainAccountOne":
    case "errors.currencyInvalid":
      return "bankAccounts";
    case "errors.documentKinds":
    case "errors.documentFileRequired":
      return "documents";
    default:
      return "form";
  }
}

/** REG-08 AC10: an IBAN is shown with its last 4 characters only. */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s/g, "");
  return `****${compact.slice(-4)}`;
}

/** Whole days since a timestamp (for the "age" column of the Change requests list), never negative. */
export function ageInDays(since: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000));
}

/**
 * "Profile updated" entries: the stored reason is a code such as BRANDS, or "BANK_ACCOUNTS: ****1234 AZN main".
 * Returns the code and the detail (after the first colon), or null when the code is not a known section.
 */
export const PROFILE_SECTION_CODES = [
  "ACTIVITY",
  "MAIN_GOODS",
  "BANK_GUARANTEE",
  "BRANDS",
  "CERTIFICATES",
  "CONTACT_PERSONS",
  "COMPANY_DETAILS",
  "OWNERS",
  "BANK_ACCOUNTS",
  "DOCUMENTS",
] as const;

export function parseProfileEvent(reason: string | null): { code: string; detail: string | null } | null {
  if (!reason) return null;
  const i = reason.indexOf(":");
  const code = (i === -1 ? reason : reason.slice(0, i)).trim();
  if (!(PROFILE_SECTION_CODES as readonly string[]).includes(code)) return null;
  return { code, detail: i === -1 ? null : reason.slice(i + 1).trim() || null };
}
