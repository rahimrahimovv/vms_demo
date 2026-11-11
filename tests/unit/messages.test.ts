import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { ROLES } from "@/lib/auth/roles";
import { SECTIONS } from "@/lib/auth/sections";

function get(path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

// CLAUDE.md rule 2 / NFR-012: every UI string lives in messages/en.json.
describe("messages/en.json", () => {
  it("has a label for every section and role", () => {
    for (const s of SECTIONS) expect(get(`nav.${s.labelKey}`), s.key).toBeTypeOf("string");
    for (const r of ROLES) expect(get(`roles.${r}`), r).toBeTypeOf("string");
  });

  it("has every message key that the code returns as an error", () => {
    const keys = new Set<string>();
    for (const file of files("src")) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(
        /"((?:users|common|access)\.errors?\.[A-Za-z]+|errors\.[A-Za-z]+|common\.genericError|access\.denied)"/g,
      )) {
        keys.add(m[1]);
      }
    }
    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) expect(get(key), key).toBeTypeOf("string");
  });

  it("has every error key that the database functions raise (app.fail)", () => {
    const keys = new Set<string>();
    for (const name of readdirSync("supabase/migrations")) {
      const sql = readFileSync(join("supabase/migrations", name), "utf8");
      for (const m of sql.matchAll(/'(errors\.[A-Za-z]+)'/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) expect(get(key), key).toBeTypeOf("string");
  });

  it("has a text for every notification event the database sends", () => {
    for (const event of [
      "registration.submitted",
      "registration.approved",
      "registration.returned",
      "registration.rejected",
      "questionnaire.submitted",
      "questionnaire.graded",
      "questionnaire.returned",
      "category.applied",
      "category.qualified",
      "category.rejected",
      "certificate.expiring",
      "certificate.expired",
      "pr.submitted",
      "pr.approved",
      "pr.returned",
      "pr.rejected",
      "pr.readyForSourcing",
    ]) {
      expect(get(`notifications.events.${event}`), event).toBeTypeOf("string");
    }
  });

  it("keeps the backlog's exact texts", () => {
    expect(get("users.errors.emailInUse")).toBe("This e-mail is already in use");
    expect(get("signIn.errors.invalid")).toBe("Incorrect e-mail or password");
    expect(get("signIn.errors.unavailable")).toBe("Sign-in is unavailable, try again");
    expect(get("access.denied")).toBe("You do not have access to this page");
    // Slice 2 (REG-01..REG-06)
    expect(get("errors.phoneFormat")).toBe("Enter the phone with country code, e.g. +994501234567");
    expect(get("errors.voenFormat")).toBe("VÖEN must be 10 digits");
    expect(get("errors.taxNumberTaken")).toBe("A vendor with this tax number is already registered");
    expect(get("errors.uploadVatCertificate")).toBe("Upload the VAT payer certificate");
    expect(get("errors.fileType")).toBe("Use PDF, JPG, PNG, DOCX or XLSX up to 10 MB");
    expect(get("errors.registrationNotApproved")).toBe("Your registration must be approved first");
    expect(get("errors.questionnaireFirst")).toBe("Complete the qualification questionnaire first");
    expect(get("errors.licenceRequired")).toBe("This category requires a licence or certificate file");
    expect(get("errors.sharesOver100")).toBe("Shares cannot exceed 100% in total");
    expect(get("errors.ibanFormat")).toBe("IBAN must be up to 34 letters and digits");
    expect(get("errors.bankAccountRequired")).toBe("Add at least one bank account");
    expect(get("errors.mainAccountOne")).toBe("Mark exactly one account as main");
    expect(get("qualification.applyAgainOn")).toBe("You can apply again on {date}");
    expect(get("vendorCard.sharesOwner")).toBe("Shares an owner with");
    // Slice 3 (MDM-01, MDM-02, PLN-01, PR-01, PR-02)
    expect(get("errors.nameExists")).toBe("This name already exists");
    expect(get("errors.categoryHasChildren")).toBe("Remove or move its child categories first");
    expect(get("errors.deliveryDateFuture")).toBe("Delivery date must be in the future");
    expect(get("errors.lineRequired")).toBe("Add at least one line");
    expect(get("errors.ownRequest")).toBe("You cannot approve your own request");
    expect(get("requisitions.planWarning")).toBe("This PR exceeds the remaining plan amount by {amount}");
  });
});
