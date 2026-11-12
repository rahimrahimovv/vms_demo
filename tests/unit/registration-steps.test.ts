import { describe, expect, it } from "vitest";
import {
  isStorableAccount,
  sharesExceed100,
  validateAccount,
  validateBankAccounts,
  validateCompany,
  validateContact,
  validateOwners,
  type AccountValues,
  type BankAccount,
  type CompanyValues,
  type Owner,
} from "@/lib/vendors/validate";
import {
  contactsError,
  firstIncompleteStep,
  incompleteSteps,
  neighbourStep,
  progress,
  requiredKinds,
  stepStatuses,
  type RegistrationSnapshot,
} from "@/lib/vendors/steps";

const TODAY = "2026-11-10";

function account(overrides: Partial<AccountValues> = {}): AccountValues {
  return {
    vendorType: "LOCAL_COMPANY",
    legalName: "Alpha Agro LLC",
    voen: "1234567890",
    foreignTaxNumber: "",
    countryCode: "AZ",
    idCardNumber: "",
    contactPerson: "Kamran Aliyev",
    contactEmail: "info@alpha-agro.test",
    phone: "+994501234567",
    password: "long-enough",
    ...overrides,
  };
}

describe("REG-01 short account form", () => {
  it("accepts the Alpha Agro scenario values", () => {
    expect(validateAccount(account())).toEqual({});
  });

  it("AC3: VÖEN must be 10 digits", () => {
    expect(validateAccount(account({ voen: "12345" })).voen).toBe("errors.voenFormat");
    expect(validateAccount(account({ voen: "12345678901" })).voen).toBe("errors.voenFormat");
  });

  it("AC2: phone is + and 8 to 15 digits, any country code", () => {
    expect(validateAccount(account({ phone: "0501234567" })).phone).toBe("errors.phoneFormat");
    expect(validateAccount(account({ phone: "+9055500000" })).phone).toBeUndefined();
    expect(validateAccount(account({ phone: "+1234567" })).phone).toBe("errors.phoneFormat");
  });

  it("AC1: an individual needs the ID card number and no VÖEN", () => {
    const individual = account({ vendorType: "INDIVIDUAL", voen: "", idCardNumber: "" });
    expect(validateAccount(individual)).toEqual({ idCardNumber: "errors.required" });
    expect(validateAccount({ ...individual, idCardNumber: "AA1234567" })).toEqual({});
  });

  it("AC1: a foreign company needs country and a 3-30 character tax number", () => {
    const foreign = account({ vendorType: "FOREIGN_COMPANY", voen: "", countryCode: "TR", foreignTaxNumber: "TR" });
    expect(validateAccount(foreign).foreignTaxNumber).toBe("errors.foreignTaxFormat");
    expect(validateAccount({ ...foreign, foreignTaxNumber: "TR-4810276" })).toEqual({});
    expect(validateAccount({ ...foreign, countryCode: "" }).countryCode).toBe("errors.required");
  });

  it("the account form asks for no bank, owner or address data", () => {
    expect(Object.keys(account()).sort()).toEqual(
      ["contactEmail", "contactPerson", "countryCode", "foreignTaxNumber", "idCardNumber", "legalName", "password", "phone", "vendorType", "voen"].sort(),
    );
  });

  it("password of at least 8 characters", () => {
    expect(validateAccount(account({ password: "short" })).password).toBe("errors.passwordShort");
  });
});

describe("REG-07 step rules", () => {
  const company = (o: Partial<CompanyValues> = {}): CompanyValues => ({
    voen: "1234567890",
    legalAddress: "Demo street 1, Baku",
    directorName: "Kamran Aliyev",
    foundedOn: "2012-03-15",
    isVatPayer: "yes",
    ...o,
  });
  const owners = (): Owner[] => [
    { fullName: "Kamran Aliyev", idNumber: "AZE-1", sharePercent: "60", role: "HEAD" },
    { fullName: "Sabina Huseynova", idNumber: "AZE-2", sharePercent: "40", role: "SHAREHOLDER" },
  ];
  const bank = (): BankAccount[] => [
    { bankName: "Demo Bank", iban: "AZ00DEMO0000000000000001", swift: "DEMOAZ22", currency: "AZN", isMain: true },
  ];
  const snapshot = (o: Partial<RegistrationSnapshot> = {}): RegistrationSnapshot => ({
    vendorType: "LOCAL_COMPANY",
    status: "DRAFT",
    company: company(),
    owners: owners(),
    contacts: [{ isLegalRepresentative: true, hasProof: true }],
    bankAccounts: bank(),
    fileKinds: ["charter", "vat_certificate"],
    ...o,
  });

  it("company details: a local company needs address, director, founding date and the VAT answer (AC2)", () => {
    expect(validateCompany("LOCAL_COMPANY", company(), TODAY)).toEqual({});
    expect(validateCompany("LOCAL_COMPANY", company({ isVatPayer: "", directorName: "" }), TODAY)).toEqual({
      directorName: "errors.required",
      isVatPayer: "errors.required",
    });
    expect(validateCompany("LOCAL_COMPANY", company({ foundedOn: "2027-01-01" }), TODAY).foundedOn).toBe("errors.dateInvalid");
  });

  it("company details: a foreign company needs no director; an individual only an optional 10-digit VÖEN", () => {
    expect(validateCompany("FOREIGN_COMPANY", company({ directorName: "", isVatPayer: "" }), TODAY)).toEqual({});
    expect(validateCompany("INDIVIDUAL", company({ voen: "", legalAddress: "", foundedOn: "" }), TODAY)).toEqual({});
    expect(validateCompany("INDIVIDUAL", company({ voen: "123" }), TODAY).voen).toBe("errors.voenFormat");
  });

  it("owners: a head is required and shares cannot exceed 100% (REG-06 AC1, AC2)", () => {
    expect(validateOwners(owners())).toBeUndefined();
    expect(validateOwners([{ fullName: "A", idNumber: "1", sharePercent: "50", role: "FOUNDER" }])).toBe("errors.headOwnerRequired");
    const over = [
      { fullName: "A", idNumber: "1", sharePercent: "60", role: "HEAD" as const },
      { fullName: "B", idNumber: "2", sharePercent: "40.01", role: "SHAREHOLDER" as const },
    ];
    expect(sharesExceed100(over)).toBe(true);
    expect(validateOwners(over)).toBe("errors.sharesOver100");
    expect(validateOwners([{ fullName: "A", idNumber: "", sharePercent: "", role: "HEAD" }])).toBe("errors.ownerIncomplete");
  });

  it("owners: the Individual exception - the step is Not needed and counts as complete (AC3)", () => {
    const s = stepStatuses(snapshot({ vendorType: "INDIVIDUAL", owners: [], fileKinds: ["id_card"] }), TODAY);
    expect(s.owners).toBe("NOT_NEEDED");
    expect(incompleteSteps(s)).not.toContain("owners");
  });

  it("contacts: a company needs a legal representative with a proof file (AC4)", () => {
    expect(contactsError("LOCAL_COMPANY", [{ isLegalRepresentative: false, hasProof: false }])).toBe("errors.legalRepresentativeRequired");
    expect(contactsError("LOCAL_COMPANY", [{ isLegalRepresentative: true, hasProof: false }])).toBe("errors.legalRepresentativeRequired");
    expect(contactsError("FOREIGN_COMPANY", [{ isLegalRepresentative: true, hasProof: true }])).toBeUndefined();
  });

  it("contacts: the Individual exception - the main contact alone is enough (AC4)", () => {
    expect(contactsError("INDIVIDUAL", [{ isLegalRepresentative: false, hasProof: false }])).toBeUndefined();
    const s = stepStatuses(
      snapshot({ vendorType: "INDIVIDUAL", owners: [], contacts: [{ isLegalRepresentative: false, hasProof: false }], fileKinds: ["id_card"] }),
      TODAY,
    );
    expect(s.contacts).toBe("COMPLETE");
  });

  it("contacts: format of a contact person's phone and e-mail", () => {
    expect(validateContact({ fullName: "A", position: "", phone: "+994501234567", email: "a@b.test", isLegal: false })).toEqual({});
    expect(validateContact({ fullName: "", position: "", phone: "123", email: "x", isLegal: false })).toEqual({
      fullName: "errors.required",
      phone: "errors.phoneFormat",
      email: "errors.emailInvalid",
    });
  });

  it("bank accounts: at least one, exactly one main, IBAN up to 34 letters and digits (AC5)", () => {
    expect(validateBankAccounts(bank())).toBeUndefined();
    expect(validateBankAccounts([])).toBe("errors.bankAccountRequired");
    expect(validateBankAccounts([{ ...bank()[0], isMain: false }])).toBe("errors.mainAccountOne");
    expect(validateBankAccounts([{ ...bank()[0], iban: "AZ-00" }])).toBe("errors.ibanFormat");
    expect(isStorableAccount({ ...bank()[0], swift: "" })).toBe(false);
  });

  it("documents by type (AC6)", () => {
    expect(requiredKinds("LOCAL_COMPANY", true)).toEqual(["charter", "vat_certificate"]);
    expect(requiredKinds("LOCAL_COMPANY", false)).toEqual(["charter"]);
    expect(requiredKinds("INDIVIDUAL", false)).toEqual(["id_card"]);
    expect(requiredKinds("FOREIGN_COMPANY", true)).toEqual(["registration_certificate"]);
  });

  it("a fully filled company has every step Complete and Submit is not blocked (AC9)", () => {
    const s = stepStatuses(snapshot(), TODAY);
    expect(s).toEqual({ company: "COMPLETE", owners: "COMPLETE", contacts: "COMPLETE", bank: "COMPLETE", documents: "COMPLETE", review: "IN_PROGRESS" });
    expect(incompleteSteps(s)).toEqual([]);
    expect(progress(s)).toEqual({ done: 6, total: 7 });
    expect(firstIncompleteStep(s)).toBe("review");
  });

  it("a new account: only the main contact exists, the other steps are Not started or In progress (AC1)", () => {
    const s = stepStatuses(
      snapshot({
        company: company({ legalAddress: "", directorName: "", foundedOn: "", isVatPayer: "" }),
        owners: [],
        contacts: [{ isLegalRepresentative: false, hasProof: false }],
        bankAccounts: [],
        fileKinds: [],
      }),
      TODAY,
    );
    expect(s.company).toBe("IN_PROGRESS");
    expect(s.owners).toBe("NOT_STARTED");
    expect(s.contacts).toBe("IN_PROGRESS");
    expect(s.bank).toBe("NOT_STARTED");
    expect(s.documents).toBe("NOT_STARTED");
    expect(incompleteSteps(s)).toEqual(["company", "owners", "contacts", "bank", "documents"]);
    expect(firstIncompleteStep(s)).toBe("company");
    expect(progress(s).done).toBe(1);
  });

  it("a missing VAT certificate keeps Documents In progress", () => {
    expect(stepStatuses(snapshot({ fileKinds: ["charter"] }), TODAY).documents).toBe("IN_PROGRESS");
  });

  it("Review and submit is Complete once SUBMITTED; steps move forward and back (AC8)", () => {
    expect(stepStatuses(snapshot({ status: "SUBMITTED" }), TODAY).review).toBe("COMPLETE");
    expect(neighbourStep("LOCAL_COMPANY", "company", 1)).toBe("owners");
    expect(neighbourStep("LOCAL_COMPANY", "company", -1)).toBeNull();
    expect(neighbourStep("LOCAL_COMPANY", "review", 1)).toBeNull();
  });
});
