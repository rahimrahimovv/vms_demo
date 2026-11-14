import { describe, expect, it } from "vitest";
import {
  ageInDays,
  CHANGE_SECTIONS,
  COMPANY_FIELDS,
  documentKinds,
  fieldForError,
  maskIban,
  needsSupportingFile,
  parseCompanyProposal,
  parseProfileEvent,
  sectionFromSlug,
  SECTION_SLUGS,
} from "@/lib/vendors/change-requests";
import { messageValues } from "@/lib/notifications";
import { canAccess } from "@/lib/auth/sections";
import { recordHref } from "@/lib/records";
import en from "../../messages/en.json";

const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);

describe("REG-08 AC1: when a supporting file is required", () => {
  const current = { legal_name: "Alpha LLC", voen: "1234567890", legal_address: "Baku", director_name: "A" };

  it("always for owners and bank accounts", () => {
    expect(needsSupportingFile("OWNERS", {}, {})).toBe(true);
    expect(needsSupportingFile("BANK_ACCOUNTS", {}, {})).toBe(true);
  });

  it("for company details only when the legal name or a tax number changes", () => {
    expect(needsSupportingFile("COMPANY_DETAILS", current, { ...current, legal_address: "Sumgait" })).toBe(false);
    expect(needsSupportingFile("COMPANY_DETAILS", current, { ...current, legal_name: "Alpha Group LLC" })).toBe(true);
    expect(needsSupportingFile("COMPANY_DETAILS", current, { ...current, voen: "0987654321" })).toBe(true);
    expect(needsSupportingFile("COMPANY_DETAILS", current, { ...current, legal_name: " Alpha LLC " })).toBe(false);
  });

  it("never for documents (the files are the change)", () => {
    expect(needsSupportingFile("DOCUMENTS", {}, {})).toBe(false);
  });
});

describe("REG-08: the proposal of the company form", () => {
  it("takes only the keys of the vendor type", () => {
    const fd = new FormData();
    fd.set("legal_name", " Alpha LLC ");
    fd.set("voen", "1234567890");
    fd.set("legal_address", "Baku");
    fd.set("director_name", "A");
    fd.set("is_vat_payer", "yes");
    fd.set("founded_on", "2010-01-01");
    fd.set("foreign_tax_number", "SHOULD-NOT-BE-HERE");
    const local = parseCompanyProposal("LOCAL_COMPANY", fd);
    expect(Object.keys(local)).toEqual([...COMPANY_FIELDS.LOCAL_COMPANY]);
    expect(local).toMatchObject({ legal_name: "Alpha LLC", is_vat_payer: true });
    expect(Object.keys(parseCompanyProposal("FOREIGN_COMPANY", fd))).not.toContain("voen");
  });

  it("documents: the registration documents of the type, with the VAT certificate for a VAT payer", () => {
    expect(documentKinds("LOCAL_COMPANY", false)).toEqual(["charter"]);
    expect(documentKinds("LOCAL_COMPANY", true)).toEqual(["charter", "vat_certificate"]);
    expect(documentKinds("INDIVIDUAL", null)).toEqual(["id_card"]);
    expect(documentKinds("FOREIGN_COMPANY", false)).toEqual(["registration_certificate"]);
  });
});

describe("REG-08: errors and display helpers", () => {
  it("puts a database message under its field", () => {
    expect(fieldForError("errors.voenFormat", "LOCAL_COMPANY")).toBe("voen");
    expect(fieldForError("errors.taxNumberTaken", "LOCAL_COMPANY")).toBe("voen");
    expect(fieldForError("errors.taxNumberTaken", "FOREIGN_COMPANY")).toBe("foreign_tax_number");
    expect(fieldForError("errors.reasonRequired", "LOCAL_COMPANY")).toBe("reason");
    expect(fieldForError("errors.supportRequired", "LOCAL_COMPANY")).toBe("support");
    expect(fieldForError("errors.sharesOver100", "LOCAL_COMPANY")).toBe("owners");
    expect(fieldForError("errors.mainAccountOne", "LOCAL_COMPANY")).toBe("bankAccounts");
    expect(fieldForError("errors.changeRequestOpen", "LOCAL_COMPANY")).toBe("form");
  });

  it("the backlog's messages are in messages/en.json", () => {
    expect(get("errors.changeRequestOpen")).toBe("A request for this section is already open");
    expect(get("errors.voenFormat")).toBe("VÖEN must be 10 digits");
    expect(get("errors.taxNumberTaken")).toBe("A vendor with this tax number is already registered");
    expect(get("errors.supportRequired")).toBe("Attach a supporting document");
    expect(get("changeRequest.pending")).toBe("Change pending approval");
    expect(get("rejected.title")).toBe("Registration rejected");
    expect(get("rejected.contact")).toBe("Contact your buyer");
    expect(get("history.profileUpdated")).toBe("Profile updated: {section}");
  });

  it("AC10: an IBAN shows only its last 4 characters", () => {
    expect(maskIban("AZ21NABZ00000000137010001944")).toBe("****1944");
    expect(maskIban("AZ21 NABZ 0000 0000 1370 1000 1944")).toBe("****1944");
  });

  it("AC5: the age of a request in whole days", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(ageInDays("2026-11-17T08:00:00Z", now)).toBe(0);
    expect(ageInDays("2026-11-14T08:00:00Z", now)).toBe(3);
    expect(ageInDays("2026-11-20T08:00:00Z", now)).toBe(0);
  });

  it("AC11: the history reason of a profile entry is a section code with an optional masked detail", () => {
    expect(parseProfileEvent("BRANDS")).toEqual({ code: "BRANDS", detail: null });
    expect(parseProfileEvent("BANK_ACCOUNTS: ****1234 AZN main, ****5678 USD")).toEqual({
      code: "BANK_ACCOUNTS",
      detail: "****1234 AZN main, ****5678 USD",
    });
    expect(parseProfileEvent("Some free text")).toBeNull();
    expect(parseProfileEvent(null)).toBeNull();
    for (const code of ["ACTIVITY", "MAIN_GOODS", "BANK_GUARANTEE", "BRANDS", "CERTIFICATES", "CONTACT_PERSONS", ...CHANGE_SECTIONS]) {
      expect(get(`history.sections.${code}`)).toBeTruthy();
    }
  });

  it("sections have a URL slug and come back from it", () => {
    for (const section of CHANGE_SECTIONS) expect(sectionFromSlug(SECTION_SLUGS[section])).toBe(section);
    expect(sectionFromSlug("nope")).toBeNull();
  });
});

describe("REG-08: access, links and notification texts", () => {
  it("only a Procurement Specialist has the Change requests section", () => {
    expect(canAccess(["PROCUREMENT_SPECIALIST"], "changeRequests")).toBe(true);
    for (const role of ["ADMIN", "COMMITTEE_MEMBER", "APPROVER", "REQUESTER", "VENDOR"] as const) {
      expect(canAccess([role], "changeRequests")).toBe(false);
    }
  });

  it("a request opens on the specialist's page and on the vendor's page", () => {
    expect(recordHref("vendor_change_request", "abc", "internal")).toBe("/change-requests/abc");
    expect(recordHref("vendor_change_request", "abc", "vendor")).toBe("/vendor/profile/requests/abc");
  });

  it("the section and the decision of a notification are shown as words", () => {
    const label = {
      has: (key: string) => typeof get(key) === "string",
      translate: (key: string) => String(get(key)),
    };
    const values = messageValues({ section: "BANK_ACCOUNTS", decision: "APPROVED", comment: "" }, null, label, (d) => d);
    expect(values).toMatchObject({ section: "Bank accounts", decision: "Approved" });
    expect(get("notifications.events.changeRequest.submitted")).toBe("{number} asks to change {section}");
    expect(get("notifications.events.registration.reopened")).toBe("Your registration was reopened: {comment}");
  });
});
