import type { VendorType } from "./constants";
import {
  validateBankAccounts,
  validateCompany,
  validateOwners,
  type BankAccount,
  type CompanyValues,
  type Owner,
} from "./validate";

/** REG-07: the steps after the account step, in order. "review" is Review and submit. */
export const STEP_KEYS = ["company", "owners", "contacts", "bank", "documents", "review"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type StepStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "NOT_NEEDED";

export type ContactSummary = { isLegalRepresentative: boolean; hasProof: boolean };

export type RegistrationSnapshot = {
  vendorType: VendorType;
  status: string;
  company: CompanyValues;
  owners: Owner[];
  contacts: ContactSummary[];
  bankAccounts: BankAccount[];
  /** kinds of the files stored on the vendor record */
  fileKinds: string[];
};

/** Document kinds a vendor type must upload (REG-07 AC6). */
export function requiredKinds(vendorType: VendorType, isVatPayer: boolean): string[] {
  const kinds = vendorType === "LOCAL_COMPANY" ? ["charter"] : vendorType === "INDIVIDUAL" ? ["id_card"] : ["registration_certificate"];
  if (vendorType !== "FOREIGN_COMPANY" && isVatPayer) kinds.push("vat_certificate");
  return kinds;
}

/** REG-07 AC4: companies need one legal representative with a proof file; an Individual needs only the main contact. */
export function contactsError(vendorType: VendorType, contacts: ContactSummary[]): string | undefined {
  if (vendorType === "INDIVIDUAL") return undefined;
  return contacts.some((c) => c.isLegalRepresentative && c.hasProof) ? undefined : "errors.legalRepresentativeRequired";
}

const hasAny = (values: string[]) => values.some((v) => v !== "");

/** Status of every step from the stored data: Complete only when every required field is valid (REG-07 AC8). */
export function stepStatuses(s: RegistrationSnapshot, today: string): Record<Exclude<StepKey, "review">, StepStatus> & { review: StepStatus } {
  const company = s.company;
  const companyErrors = validateCompany(s.vendorType, company, today);
  const companyTouched = hasAny([company.legalAddress, company.directorName, company.foundedOn, company.isVatPayer, company.voen]);

  const ownersStatus: StepStatus =
    s.vendorType === "INDIVIDUAL"
      ? "NOT_NEEDED"
      : s.owners.length === 0
        ? "NOT_STARTED"
        : validateOwners(s.owners)
          ? "IN_PROGRESS"
          : "COMPLETE";

  // the primary contact exists from the start, so a company's contact step is at least In progress
  const contactsStatus: StepStatus = contactsError(s.vendorType, s.contacts) ? "IN_PROGRESS" : "COMPLETE";

  const bankStatus: StepStatus =
    s.bankAccounts.length === 0 ? "NOT_STARTED" : validateBankAccounts(s.bankAccounts) ? "IN_PROGRESS" : "COMPLETE";

  const required = requiredKinds(s.vendorType, company.isVatPayer === "yes");
  const present = required.filter((k) => s.fileKinds.includes(k));
  const documentsStatus: StepStatus =
    present.length === required.length ? "COMPLETE" : present.length > 0 ? "IN_PROGRESS" : "NOT_STARTED";

  const companyStatus: StepStatus =
    Object.keys(companyErrors).length === 0 ? "COMPLETE" : companyTouched ? "IN_PROGRESS" : "NOT_STARTED";

  const done = [companyStatus, ownersStatus, contactsStatus, bankStatus, documentsStatus].every(
    (st) => st === "COMPLETE" || st === "NOT_NEEDED",
  );
  const submitted = ["SUBMITTED", "APPROVED"].includes(s.status);
  return {
    company: companyStatus,
    owners: ownersStatus,
    contacts: contactsStatus,
    bank: bankStatus,
    documents: documentsStatus,
    review: submitted ? "COMPLETE" : done ? "IN_PROGRESS" : "NOT_STARTED",
  };
}

/** Steps that block Submit, in order. */
export function incompleteSteps(statuses: ReturnType<typeof stepStatuses>): StepKey[] {
  return STEP_KEYS.filter((k) => k !== "review" && statuses[k] !== "COMPLETE" && statuses[k] !== "NOT_NEEDED");
}

/** The step the Continue button opens: the first incomplete one, else Review and submit. */
export function firstIncompleteStep(statuses: ReturnType<typeof stepStatuses>): StepKey {
  return incompleteSteps(statuses)[0] ?? "review";
}

/** Progress bar: the Account step is always complete; Review and submit counts once submitted. */
export function progress(statuses: ReturnType<typeof stepStatuses>): { done: number; total: number } {
  const keys = Object.keys(statuses) as StepKey[];
  const done = 1 + keys.filter((k) => statuses[k] === "COMPLETE" || statuses[k] === "NOT_NEEDED").length;
  return { done, total: keys.length + 1 };
}

/** The step before (-1) or after (+1) `from`; null before the first step (back to the home page) and after the last one. */
export function neighbourStep(_vendorType: VendorType, from: StepKey, direction: 1 | -1): StepKey | null {
  const i = STEP_KEYS.indexOf(from) + direction;
  return STEP_KEYS[i] ?? null;
}
