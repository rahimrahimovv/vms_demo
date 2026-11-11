import { ACCOUNT_CURRENCIES, COUNTRIES, OWNER_ROLES, VENDOR_TYPES, type OwnerRole, type VendorType } from "./constants";

/**
 * REG-01 / REG-06 registration rules. Returns message keys (messages/en.json) per field;
 * the database re-checks the same rules (constraints and functions).
 */
export type Owner = { fullName: string; idNumber: string; sharePercent: string; role: OwnerRole };

/** REG-01 AC4, REG-06 AC3: one or more accounts, exactly one main. */
export type BankAccount = { bankName: string; iban: string; swift: string; currency: string; isMain: boolean };

export type RegistrationValues = {
  vendorType: VendorType;
  legalName: string;
  voen: string;
  foreignTaxNumber: string;
  countryCode: string;
  idCardNumber: string;
  legalAddress: string;
  directorName: string;
  isVatPayer: "" | "yes" | "no";
  contactPerson: string;
  contactEmail: string;
  phone: string;
  password: string;
  bankAccounts: BankAccount[];
  foundedOn: string;
  owners: Owner[];
};

export type RegistrationErrors = Partial<Record<keyof RegistrationValues | "form" | "files", string>> & {
  owners?: string;
  bankAccounts?: string;
};

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export function parseRegistration(formData: FormData): RegistrationValues {
  const type = str(formData, "vendorType");
  let owners: Owner[] = [];
  try {
    const raw = JSON.parse(String(formData.get("owners") ?? "[]"));
    if (Array.isArray(raw)) {
      owners = raw.map((o) => ({
        fullName: String(o?.fullName ?? "").trim(),
        idNumber: String(o?.idNumber ?? "").trim(),
        sharePercent: String(o?.sharePercent ?? "").trim(),
        role: (OWNER_ROLES as readonly string[]).includes(o?.role) ? o.role : "SHAREHOLDER",
      }));
    }
  } catch {
    owners = [];
  }
  const vat = str(formData, "isVatPayer");
  return {
    vendorType: (VENDOR_TYPES as readonly string[]).includes(type) ? (type as VendorType) : "LOCAL_COMPANY",
    legalName: str(formData, "legalName"),
    voen: str(formData, "voen").replace(/\s/g, ""),
    foreignTaxNumber: str(formData, "foreignTaxNumber"),
    countryCode: str(formData, "countryCode").toUpperCase(),
    idCardNumber: str(formData, "idCardNumber"),
    legalAddress: str(formData, "legalAddress"),
    directorName: str(formData, "directorName"),
    isVatPayer: vat === "yes" || vat === "no" ? vat : "",
    contactPerson: str(formData, "contactPerson"),
    contactEmail: str(formData, "contactEmail").toLowerCase(),
    phone: str(formData, "phone").replace(/[\s-]/g, ""),
    password: String(formData.get("password") ?? ""),
    bankAccounts: parseBankAccounts(formData.get("bankAccounts")),
    foundedOn: str(formData, "foundedOn"),
    owners: owners.filter((o) => o.fullName || o.idNumber || o.sharePercent),
  };
}

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

export const IBAN_PATTERN = /^[A-Z0-9]{1,34}$/;

/** REG-01 AC4 / REG-06 AC3: at least one complete account, IBAN up to 34 letters and digits, exactly one main. */
export function validateBankAccounts(accounts: BankAccount[]): string | undefined {
  if (accounts.length === 0) return "errors.bankAccountRequired";
  if (accounts.some((a) => !a.bankName || !a.iban || !a.swift || !(ACCOUNT_CURRENCIES as readonly string[]).includes(a.currency))) {
    return "errors.bankAccountIncomplete";
  }
  if (accounts.some((a) => !IBAN_PATTERN.test(a.iban))) return "errors.ibanFormat";
  if (accounts.filter((a) => a.isMain).length !== 1) return "errors.mainAccountOne";
  return undefined;
}

/** Rows for public.register_vendor / public.bank_accounts_save. */
export function toBankAccountRows(accounts: BankAccount[]) {
  return accounts.map((a) => ({ bank_name: a.bankName, iban: a.iban, swift: a.swift, currency: a.currency, is_main: a.isMain }));
}

export const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
export const VOEN_PATTERN = /^[0-9]{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Sum of owner shares > 100 (REG-06 AC2). */
export function sharesExceed100(owners: Owner[]): boolean {
  const total = owners.reduce((sum, o) => sum + (Number(o.sharePercent) || 0), 0);
  return Math.round(total * 100) / 100 > 100;
}

/**
 * @param options.withAccount new registrations also check e-mail and password
 * @param options.today Asia/Baku date "YYYY-MM-DD" for the founding date check
 */
export function validateRegistration(
  v: RegistrationValues,
  options: { withAccount: boolean; today: string },
): RegistrationErrors {
  const e: RegistrationErrors = {};
  const req = (key: keyof RegistrationValues, value: string) => {
    if (!value) e[key] = "errors.required";
  };
  const isLocal = v.vendorType === "LOCAL_COMPANY";
  const isIndividual = v.vendorType === "INDIVIDUAL";
  const isForeign = v.vendorType === "FOREIGN_COMPANY";

  req("legalName", v.legalName);

  // REG-01 AC1, AC2, AC6: VÖEN required for a local company, optional for an individual
  if (isLocal || (isIndividual && v.voen)) {
    if (!v.voen) e.voen = "errors.required";
    else if (!VOEN_PATTERN.test(v.voen)) e.voen = "errors.voenFormat";
  }
  if (isLocal) {
    req("legalAddress", v.legalAddress);
    req("directorName", v.directorName);
    if (!v.isVatPayer) e.isVatPayer = "errors.required";
  }
  if (isIndividual) req("idCardNumber", v.idCardNumber);

  // REG-01 AC3 (#90): foreign company
  if (isForeign) {
    if (!v.countryCode || !(COUNTRIES as readonly string[]).includes(v.countryCode)) e.countryCode = "errors.required";
    if (!v.foreignTaxNumber) e.foreignTaxNumber = "errors.required";
    else if (v.foreignTaxNumber.length < 3 || v.foreignTaxNumber.length > 30) e.foreignTaxNumber = "errors.foreignTaxFormat";
    req("legalAddress", v.legalAddress);
  }

  // REG-01 AC4, AC5
  req("contactPerson", v.contactPerson);
  if (!PHONE_PATTERN.test(v.phone)) e.phone = "errors.phoneFormat";
  const accountError = validateBankAccounts(v.bankAccounts);
  if (accountError) e.bankAccounts = accountError;
  if (options.withAccount) {
    if (!EMAIL_PATTERN.test(v.contactEmail)) e.contactEmail = "errors.emailInvalid";
    if (v.password.length < 8) e.password = "errors.passwordShort";
  }

  // REG-06 AC1, AC2: companies give the founding date and at least the company head
  if (!isIndividual) {
    if (!v.foundedOn) e.foundedOn = "errors.required";
    else if (!DATE_PATTERN.test(v.foundedOn) || v.foundedOn > options.today) e.foundedOn = "errors.dateInvalid";

    const incomplete = v.owners.some(
      (o) => !o.fullName || !o.idNumber || (o.sharePercent !== "" && !(Number(o.sharePercent) > 0 && Number(o.sharePercent) <= 100)),
    );
    if (incomplete) e.owners = "errors.ownerIncomplete";
    else if (!v.owners.some((o) => o.role === "HEAD")) e.owners = "errors.headOwnerRequired";
    else if (sharesExceed100(v.owners)) e.owners = "errors.sharesOver100";
  }
  return e;
}

/** Form values sent back to the browser: never the password. */
export function withoutPassword(v: RegistrationValues): Omit<RegistrationValues, "password"> {
  const copy: Partial<RegistrationValues> = { ...v };
  delete copy.password;
  return copy as Omit<RegistrationValues, "password">;
}

/** Row for public.register_vendor / the vendor update (snake_case columns). */
export function toVendorColumns(v: RegistrationValues) {
  const isIndividual = v.vendorType === "INDIVIDUAL";
  const isForeign = v.vendorType === "FOREIGN_COMPANY";
  return {
    vendor_type: v.vendorType,
    legal_name: v.legalName,
    voen: isForeign ? null : v.voen || null,
    foreign_tax_number: isForeign ? v.foreignTaxNumber : null,
    country_code: isForeign ? v.countryCode : "AZ",
    id_card_number: isIndividual ? v.idCardNumber : null,
    legal_address: v.legalAddress || null,
    director_name: isIndividual ? null : v.directorName || null,
    is_vat_payer: v.isVatPayer === "" ? null : v.isVatPayer === "yes",
    contact_person: v.contactPerson,
    phone: v.phone,
    founded_on: isIndividual ? null : v.foundedOn || null,
  };
}

export function toOwnerRows(v: RegistrationValues) {
  if (v.vendorType === "INDIVIDUAL") return [];
  return v.owners.map((o) => ({
    full_name: o.fullName,
    id_number: o.idNumber,
    share_percent: o.sharePercent === "" ? null : Number(o.sharePercent),
    role: o.role,
  }));
}
