// DEMO-03 (A3): the loader mirrors the short account form of the app (src/app/register/actions.ts) when it registers a vendor.
// This proves the loader sends to register_vendor exactly what the app's own helpers build from the same form values, and
// that the invented catalogue values pass the app's own validation and the database formats.
import { describe, expect, it } from "vitest";
import { VENDORS, SEED_VENDORS, accountColumns } from "../../scripts/lib/populate/vendors";
import { parseAccount, toAccountColumns, validateAccount } from "@/lib/vendors/validate";
import { requiredKinds } from "@/lib/vendors/steps";

function formFor(s: (typeof VENDORS)[number]): FormData {
  const f = new FormData();
  f.set("vendorType", s.type);
  f.set("legalName", s.legalName);
  if (s.type === "LOCAL_COMPANY") f.set("voen", s.tax);
  if (s.type === "FOREIGN_COMPANY") {
    f.set("foreignTaxNumber", s.tax);
    f.set("countryCode", s.country);
  }
  if (s.type === "INDIVIDUAL") f.set("idCardNumber", s.tax);
  f.set("contactPerson", s.contact);
  f.set("contactEmail", s.email);
  f.set("phone", s.phone);
  f.set("password", "Demo-Passw0rd!");
  return f;
}

describe("the loader registers a vendor the way the app's account form does", () => {
  it.each(VENDORS.map((s) => [s.legalName, s] as const))("%s: same register_vendor payload as the app, no validation error", (_name, s) => {
    const values = parseAccount(formFor(s));
    expect(validateAccount(values)).toEqual({});
    expect(accountColumns(s)).toEqual({ ...toAccountColumns(values), contact_email: values.contactEmail });
  });
});

describe("the invented catalogue values", () => {
  it("fifteen vendors with the realistic display names of the catalogue (two come from the base seed)", () => {
    const names = VENDORS.map((v) => v.legalName).sort();
    expect(names).toEqual([
      "Absheron Agro Trade MMC", "Baku Pack Industry MMC", "Bursa Alet Makina Ltd. Sti.", "Elvin Mammadov (sole trader)", "Ganja Fertilizer Trading MMC",
      "Gobustan Plant Protection MMC", "Lankaran Trade Group MMC", "Mingachevir Components MMC", "Mugan Irrigation Systems MMC",
      "Rheinland Landtechnik GmbH", "Shirvan Seeds MMC", "Sumgait Technical Services MMC", "Zaqatala Supply MMC",
    ]);
    expect(VENDORS.length + SEED_VENDORS.length).toBe(15);
  });

  it("tax numbers, e-mails and phones are unique and in the database formats; owner shares add up to 100", () => {
    const taxes = VENDORS.map((v) => v.tax);
    expect(new Set(taxes).size).toBe(taxes.length);
    expect(new Set(VENDORS.map((v) => v.email)).size).toBe(VENDORS.length);
    for (const v of VENDORS) {
      expect(v.phone, v.legalName).toMatch(/^\+[0-9]{8,15}$/);
      if (v.type === "LOCAL_COMPANY") expect(v.tax, v.legalName).toMatch(/^[0-9]{10}$/);
      if (v.type === "INDIVIDUAL") expect(v.voen, v.legalName).toMatch(/^[0-9]{10}$/);
      for (const b of v.bank) expect(b.iban, v.legalName).toMatch(/^[A-Z0-9]{1,34}$/);
      if (v.type !== "INDIVIDUAL") expect(v.owners.reduce((sum, o) => sum + o.share, 0), v.legalName).toBe(100);
      expect(requiredKinds(v.type, v.vat === true).length).toBeGreaterThan(0);
    }
  });

  it("Kappa shares an owner ID with the seed vendor Caspian Agrochem (AZE-DEMO-0001); Kura Agro Supply is not in the list", () => {
    const kappa = VENDORS.find((v) => v.key === "kappa")!;
    expect(kappa.owners.some((o) => o.id === "AZE-DEMO-0001")).toBe(true);
    expect(VENDORS.some((v) => /Kura/i.test(v.legalName))).toBe(false);
  });

  it("every category used by a sourcing has at least three vendors qualified in it", () => {
    const qualified: Record<string, number> = {};
    for (const v of [...VENDORS, ...SEED_VENDORS]) for (const c of v.qualified ?? []) qualified[c] = (qualified[c] ?? 0) + 1;
    qualified.fertilisers = (qualified.fertilisers ?? 0) + 2; // Ege Tarim Kimya and Caspian Agrochem from the base seed
    for (const c of ["fertilisers", "seeds", "plantProtection", "irrigation", "spareParts"]) expect(qualified[c], c).toBeGreaterThanOrEqual(3);
    // Mugan's Irrigation qualification lapses, so it does not count there
    expect(qualified.irrigation - 1).toBeGreaterThanOrEqual(3);
  });
});
