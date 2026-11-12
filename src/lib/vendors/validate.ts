import { COUNTRIES, OWNER_ROLES, VENDOR_TYPES, type OwnerRole, type VendorType } from "./constants";

/**
 * Registration rules (REG-01, REG-06, REG-07). Return message keys (messages/en.json) per field;
 * the database re-checks the same rules (constraints and functions).
 */
export type Owner = { fullName: string; idNumber: string; sharePercent: string; role: OwnerRole };

/** REG-07 AC5, REG-06 AC3: one or more accounts, exactly one main. */
export type BankAccount = { bankName: string; iban: string; swift: string; currency: string; isMain: boolean };

export const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
export const VOEN_PATTERN = /^[0-9]{10}$/;
export const IBAN_PATTERN = /^[A-Z0-9]{1,34}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// ---- REG-01: the short account form ----

export type AccountValues = {
  vendorType: VendorType;
  legalName: string;
  voen: string;
  foreignTaxNumber: string;
  countryCode: string;
  idCardNumber: string;
  contactPerson: string;
  contactEmail: string;
  phone: string;
  password: string;
};

export type AccountErrors = Partial<Record<keyof AccountValues | "form", string>>;

export function parseAccount(formData: FormData): AccountValues {
  const type = str(formData, "vendorType");
  return {
    vendorType: (VENDOR_TYPES as readonly string[]).includes(type) ? (type as VendorType) : "LOCAL_COMPANY",
    legalName: str(formData, "legalName"),
    voen: str(formData, "voen").replace(/\s/g, ""),
    foreignTaxNumber: str(formData, "foreignTaxNumber"),
    countryCode: str(formData, "countryCode").toUpperCase(),
    idCardNumber: str(formData, "idCardNumber"),
    contactPerson: str(formData, "contactPerson"),
    contactEmail: str(formData, "contactEmail").toLowerCase(),
    phone: str(formData, "phone").replace(/[\s-]/g, ""),
    password: String(formData.get("password") ?? ""),
  };
}

/** REG-01 AC1-AC3. Uniqueness of the tax number and the e-mail (AC4, AC5) is checked by the server. */
export function validateAccount(v: AccountValues): AccountErrors {
  const e: AccountErrors = {};
  const req = (key: keyof AccountValues, value: string) => {
    if (!value) e[key] = "errors.required";
  };
  req("legalName", v.legalName);
  if (v.vendorType === "LOCAL_COMPANY") {
    if (!v.voen) e.voen = "errors.required";
    else if (!VOEN_PATTERN.test(v.voen)) e.voen = "errors.voenFormat";
  } else if (v.vendorType === "INDIVIDUAL") {
    req("idCardNumber", v.idCardNumber);
  } else {
    if (!v.countryCode || v.countryCode === "AZ" || !(COUNTRIES as readonly string[]).includes(v.countryCode)) {
      e.countryCode = "errors.required";
    }
    if (!v.foreignTaxNumber) e.foreignTaxNumber = "errors.required";
    else if (v.foreignTaxNumber.length < 3 || v.foreignTaxNumber.length > 30) e.foreignTaxNumber = "errors.foreignTaxFormat";
  }
  req("contactPerson", v.contactPerson);
  if (!PHONE_PATTERN.test(v.phone)) e.phone = "errors.phoneFormat";
  if (!EMAIL_PATTERN.test(v.contactEmail)) e.contactEmail = "errors.emailInvalid";
  if (v.password.length < 8) e.password = "errors.passwordShort";
  return e;
}

/** Form values sent back to the browser: never the password. */
export function withoutPassword(v: AccountValues): Omit<AccountValues, "password"> {
  const copy: Partial<AccountValues> = { ...v };
  delete copy.password;
  return copy as Omit<AccountValues, "password">;
}

/** The vendor row created by public.register_vendor. */
export function toAccountColumns(v: AccountValues) {
  const isForeign = v.vendorType === "FOREIGN_COMPANY";
  return {
    vendor_type: v.vendorType,
    legal_name: v.legalName,
    voen: v.vendorType === "LOCAL_COMPANY" ? v.voen : null,
    foreign_tax_number: isForeign ? v.foreignTaxNumber : null,
    country_code: isForeign ? v.countryCode : "AZ",
    id_card_number: v.vendorType === "INDIVIDUAL" ? v.idCardNumber : null,
    contact_person: v.contactPerson,
    phone: v.phone,
  };
}

// ---- Company details step (REG-07 AC2, REG-06 AC1) ----

export type CompanyValues = {
  voen: string;
  legalAddress: string;
  directorName: string;
  foundedOn: string;
  isVatPayer: "" | "yes" | "no";
};
export type CompanyErrors = Partial<Record<keyof CompanyValues, string>>;

export function parseCompany(formData: FormData): CompanyValues {
  const vat = str(formData, "isVatPayer");
  return {
    voen: str(formData, "voen").replace(/\s/g, ""),
    legalAddress: str(formData, "legalAddress"),
    directorName: str(formData, "directorName"),
    foundedOn: str(formData, "foundedOn"),
    isVatPayer: vat === "yes" || vat === "no" ? vat : "",
  };
}

/** Local: address, director, founding date, VAT payer. Foreign: address, founding date. Individual: optional VÖEN only. */
export function validateCompany(type: VendorType, v: CompanyValues, today: string): CompanyErrors {
  const e: CompanyErrors = {};
  if (type === "INDIVIDUAL") {
    if (v.voen && !VOEN_PATTERN.test(v.voen)) e.voen = "errors.voenFormat";
    return e;
  }
  if (!v.legalAddress) e.legalAddress = "errors.required";
  if (type === "LOCAL_COMPANY") {
    if (!v.directorName) e.directorName = "errors.required";
    if (!v.isVatPayer) e.isVatPayer = "errors.required";
  }
  if (!v.foundedOn) e.foundedOn = "errors.required";
  else if (!DATE_PATTERN.test(v.foundedOn) || v.foundedOn > today) e.foundedOn = "errors.dateInvalid";
  return e;
}

// ---- Owners step (REG-06 AC1, AC2) ----

/** Sum of owner shares > 100 (REG-06 AC2). */
export function sharesExceed100(owners: Owner[]): boolean {
  const total = owners.reduce((sum, o) => sum + (Number(o.sharePercent) || 0), 0);
  return Math.round(total * 100) / 100 > 100;
}

export function parseOwners(raw: FormDataEntryValue | null): Owner[] {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list
      .map((o) => ({
        fullName: String(o?.fullName ?? "").trim(),
        idNumber: String(o?.idNumber ?? "").trim(),
        sharePercent: String(o?.sharePercent ?? "").trim(),
        role: ((OWNER_ROLES as readonly string[]).includes(o?.role) ? o.role : "SHAREHOLDER") as OwnerRole,
      }))
      .filter((o) => o.fullName || o.idNumber || o.sharePercent);
  } catch {
    return [];
  }
}

/** Message key or undefined (companies only; an Individual has no owners). */
export function validateOwners(owners: Owner[]): string | undefined {
  const incomplete = owners.some(
    (o) => !o.fullName || !o.idNumber || (o.sharePercent !== "" && !(Number(o.sharePercent) > 0 && Number(o.sharePercent) <= 100)),
  );
  if (incomplete) return "errors.ownerIncomplete";
  if (!owners.some((o) => o.role === "HEAD")) return "errors.headOwnerRequired";
  if (sharesExceed100(owners)) return "errors.sharesOver100";
  return undefined;
}

export function toOwnerRows(owners: Owner[]) {
  return owners.map((o) => ({
    full_name: o.fullName,
    id_number: o.idNumber,
    share_percent: o.sharePercent === "" ? null : Number(o.sharePercent),
    role: o.role,
  }));
}

// ---- Contact persons step (REG-07 AC4) ----

export type ContactValues = { fullName: string; position: string; phone: string; email: string; isLegal: boolean };
export type ContactErrors = Partial<Record<keyof ContactValues | "proof", string>>;

export function parseContact(formData: FormData): ContactValues {
  return {
    fullName: str(formData, "fullName"),
    position: str(formData, "position"),
    phone: str(formData, "phone").replace(/[\s-]/g, ""),
    email: str(formData, "email").toLowerCase(),
    isLegal: formData.get("isLegal") === "on",
  };
}

export function validateContact(v: ContactValues): ContactErrors {
  const e: ContactErrors = {};
  if (!v.fullName) e.fullName = "errors.required";
  if (!PHONE_PATTERN.test(v.phone)) e.phone = "errors.phoneFormat";
  if (!EMAIL_PATTERN.test(v.email)) e.email = "errors.emailInvalid";
  return e;
}

// ---- Bank accounts step (REG-07 AC5, REG-06 AC3) ----

/** Bank accounts sent by the form as JSON; rows left completely empty are dropped. */
export function parseBankAccounts(raw: FormDataEntryValue | null): BankAccount[] {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list
      .map((a) => ({
        bankName: String(a?.bankName ?? "").trim(),
        iban: String(a?.iban ?? "").replace(/\s/g, "").toUpperCase(),
        swift: String(a?.swift ?? "").replace(/\s/g, "").toUpperCase(),
        currency: String(a?.currency ?? "").trim().toUpperCase(),
        isMain: a?.isMain === true,
      }))
      .filter((a) => a.bankName || a.iban || a.swift);
  } catch {
    return [];
  }
}

/** At least one complete account, IBAN up to 34 letters and digits, exactly one main. */
export function validateBankAccounts(accounts: BankAccount[]): string | undefined {
  if (accounts.length === 0) return "errors.bankAccountRequired";
  if (accounts.some((a) => !a.bankName || !a.iban || !a.swift || !/^[A-Z]{3}$/.test(a.currency))) {
    return "errors.bankAccountIncomplete";
  }
  if (accounts.some((a) => !IBAN_PATTERN.test(a.iban))) return "errors.ibanFormat";
  if (accounts.filter((a) => a.isMain).length !== 1) return "errors.mainAccountOne";
  return undefined;
}

/** A row the database can store: complete and with a valid IBAN. Incomplete rows stay in the form only. */
export function isStorableAccount(a: BankAccount): boolean {
  return Boolean(a.bankName && a.swift && IBAN_PATTERN.test(a.iban) && /^[A-Z]{3}$/.test(a.currency));
}

/** Rows for public.bank_accounts_save / registration_bank_save. */
export function toBankAccountRows(accounts: BankAccount[]) {
  return accounts.map((a) => ({ bank_name: a.bankName, iban: a.iban, swift: a.swift, currency: a.currency, is_main: a.isMain }));
}
