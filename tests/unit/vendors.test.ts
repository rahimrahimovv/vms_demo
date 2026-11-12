import { describe, expect, it } from "vitest";

const TODAY = "2026-11-10";
import {
  bakuToday,
  canRetakeEarly,
  certificateStatus,
  gradeFor,
  questionnaireScore,
  yearsInBusiness,
} from "@/lib/vendors/rules";
import {
  parseBankAccounts,
  validateBankAccounts,
  type BankAccount,
} from "@/lib/vendors/validate";
import { checkFile, MAX_FILE_BYTES } from "@/lib/files/rules";
import { ancestorsOf, flattenTree } from "@/lib/categories";
import { validateQuestion } from "@/lib/questionnaire/validate";

describe("REG-01 AC4 / REG-06 AC3 bank accounts", () => {
  const account = (overrides: Partial<BankAccount> = {}): BankAccount => ({
    bankName: "Demo Bank",
    iban: "AZ00DEMO0000000000000001",
    swift: "DEMOAZ22",
    currency: "AZN",
    isMain: false,
    ...overrides,
  });

  it("accepts one main account, or several with exactly one main", () => {
    expect(validateBankAccounts([account({ isMain: true })])).toBeUndefined();
    expect(validateBankAccounts([account({ isMain: true }), account({ currency: "USD" })])).toBeUndefined();
  });

  it("needs at least one account", () => {
    expect(validateBankAccounts([])).toBe("errors.bankAccountRequired");
  });

  it("needs exactly one main account", () => {
    expect(validateBankAccounts([account(), account()])).toBe("errors.mainAccountOne");
    expect(validateBankAccounts([account({ isMain: true }), account({ isMain: true })])).toBe("errors.mainAccountOne");
  });

  it("IBAN is up to 34 letters and digits", () => {
    expect(validateBankAccounts([account({ isMain: true, iban: "A".repeat(34) })])).toBeUndefined();
    expect(validateBankAccounts([account({ isMain: true, iban: "A".repeat(35) })])).toBe("errors.ibanFormat");
    expect(validateBankAccounts([account({ isMain: true, iban: "AZ00-DEMO" })])).toBe("errors.ibanFormat");
  });

  it("every account needs bank name, IBAN, SWIFT and a 3-letter currency code (the database checks the dictionary)", () => {
    expect(validateBankAccounts([account({ isMain: true, swift: "" })])).toBe("errors.bankAccountIncomplete");
    expect(validateBankAccounts([account({ isMain: true, currency: "US" })])).toBe("errors.bankAccountIncomplete");
  });

  it("parses the form JSON: spaces removed, upper case, empty rows dropped", () => {
    const raw = JSON.stringify([
      { bankName: " Demo Bank ", iban: "az00 demo 0001", swift: "demo az22", currency: "usd", isMain: true },
      { bankName: "", iban: "", swift: "", currency: "AZN", isMain: false },
    ]);
    expect(parseBankAccounts(raw)).toEqual([
      { bankName: "Demo Bank", iban: "AZ00DEMO0001", swift: "DEMOAZ22", currency: "USD", isMain: true },
    ]);
    expect(parseBankAccounts("not json")).toEqual([]);
  });
});

describe("Calculation Rules (backlog worked examples)", () => {
  it("questionnaire score: weights 3 and 2, points 8 of 10 and 7 of 10 -> 76.0", () => {
    expect(
      questionnaireScore([
        { weight: 3, points: 8, maxPoints: 10 },
        { weight: 2, points: 7, maxPoints: 10 },
      ]),
    ).toBe(76);
  });

  it("grade bands: 76.0 -> B, 85.0 -> A, 49.9 -> D, 50.0 -> C", () => {
    expect(gradeFor(76)).toBe("B");
    expect(gradeFor(85)).toBe("A");
    expect(gradeFor(84.9)).toBe("B");
    expect(gradeFor(49.9)).toBe("D");
    expect(gradeFor(50)).toBe("C");
  });

  it("certificate status on 10 Nov 2026: 30 Nov -> EXPIRING, 15 Jan 2027 -> VALID, 09 Nov -> EXPIRED", () => {
    expect(certificateStatus("2026-11-30", TODAY)).toBe("EXPIRING");
    expect(certificateStatus("2027-01-15", TODAY)).toBe("VALID");
    expect(certificateStatus("2026-11-09", TODAY)).toBe("EXPIRED");
    expect(certificateStatus(null, TODAY)).toBe("VALID");
  });

  it("certificate: EXPIRING on the expiry date itself, EXPIRED from the day after (REG-06 AC5 as fixed)", () => {
    expect(certificateStatus("2026-11-10", TODAY)).toBe("EXPIRING");
    expect(certificateStatus("2026-12-10", TODAY)).toBe("EXPIRING"); // exactly 30 days
    expect(certificateStatus("2026-12-11", TODAY)).toBe("VALID");
  });

  it("years in business: founded 15 Mar 2012, today 10 Nov 2026 -> 14", () => {
    expect(yearsInBusiness("2012-03-15", TODAY)).toBe(14);
    expect(yearsInBusiness("2012-11-11", TODAY)).toBe(13);
  });

  it("REG-05 AC8: a new questionnaire may start in the last 30 days of a grade", () => {
    expect(canRetakeEarly("2026-12-10", TODAY)).toBe(true);
    expect(canRetakeEarly("2026-12-11", TODAY)).toBe(false);
  });

  it("today is the Asia/Baku date (UTC+4)", () => {
    expect(bakuToday(new Date("2026-11-10T20:30:00Z"))).toBe("2026-11-11");
    expect(bakuToday(new Date("2026-11-10T19:30:00Z"))).toBe("2026-11-10");
  });
});

describe("NFR-009 file rules", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

  it("accepts a PDF up to 10 MB", () => {
    expect(checkFile("charter.pdf", 1000, pdf)).toEqual({ ok: true, mimeType: "application/pdf" });
    expect(checkFile("charter.pdf", MAX_FILE_BYTES, pdf).ok).toBe(true);
  });

  it("refuses an 11 MB file, an .exe, and an .exe renamed to .pdf", () => {
    expect(checkFile("big.pdf", 11 * 1024 * 1024, pdf)).toEqual({ ok: false, error: "errors.fileType" });
    expect(checkFile("setup.exe", 1000, exe).ok).toBe(false);
    expect(checkFile("setup.pdf", 1000, exe).ok).toBe(false);
  });
});

describe("MDM-02 category tree", () => {
  const rows = [
    { id: "ag", parent_id: null, name: "Agricultural inputs", licence_required: false, is_active: true },
    { id: "fe", parent_id: "ag", name: "Fertilisers", licence_required: true, is_active: true },
    { id: "mi", parent_id: "fe", name: "Mineral fertilisers", licence_required: false, is_active: true },
    { id: "se", parent_id: "ag", name: "Seeds", licence_required: false, is_active: true },
  ];

  it("orders depth-first with paths and inherits the licence flag (REG-03 AC2 for children)", () => {
    const tree = flattenTree(rows);
    expect(tree.map((c) => [c.name, c.depth, c.needsLicence])).toEqual([
      ["Agricultural inputs", 0, false],
      ["Fertilisers", 1, true],
      ["Mineral fertilisers", 2, true],
      ["Seeds", 1, false],
    ]);
    expect(tree[2].path).toBe("Agricultural inputs / Fertilisers / Mineral fertilisers");
  });

  it("a child's ancestors include its parents, not its siblings (MDM-02 AC3)", () => {
    expect(ancestorsOf(rows, "mi")).toEqual(["mi", "fe", "ag"]);
    expect(ancestorsOf(rows, "se")).not.toContain("fe");
  });
});

describe("REG-05 AC1 question rules", () => {
  const base = { section: "", text: "Q", answerType: "SINGLE_CHOICE" as const, weight: 3, evidenceRequired: false };
  it("weight 1-5, at least two options, points 0-10", () => {
    expect(validateQuestion({ ...base, options: [{ label: "a", points: 0 }, { label: "b", points: 10 }] })).toEqual({});
    expect(validateQuestion({ ...base, weight: 6, options: [{ label: "a", points: 0 }, { label: "b", points: 1 }] }).weight).toBe(
      "errors.weightRange",
    );
    expect(validateQuestion({ ...base, options: [{ label: "a", points: 11 }, { label: "b", points: 1 }] }).options).toBe(
      "errors.pointsRange",
    );
    expect(validateQuestion({ ...base, options: [{ label: "a", points: 1 }] }).options).toBe("errors.optionsMin");
  });
});
