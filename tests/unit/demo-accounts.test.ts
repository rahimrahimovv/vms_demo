import { describe, expect, it } from "vitest";
import { renderAccounts, type AccountRow } from "../../scripts/lib/populate/accounts";

const rows: AccountRow[] = [
  { email: "info@shirvan-seeds.test", name: "Farid Hasanov", role: "VENDOR", company: "Shirvan Seeds MMC", note: "registration APPROVED; grade A." },
  { email: "nigar@demo-agro.test", name: "Nigar Huseynova", role: "PROCUREMENT_SPECIALIST", company: "Agro Holding MMC", note: "Owns 12 sourcings." },
  { email: "leyla@demo-agro.test", name: "Leyla Mammadova", role: "REQUESTER", company: "Agro Holding MMC", note: "Requested 19 PRs." },
];

describe("docs/DEMO-ACCOUNTS.md", () => {
  const text = renderAccounts(rows, "15 Nov 2026, 11:00 (Asia/Baku)");

  it("groups the accounts by role in the fixed order, one table row per account", () => {
    const requester = text.indexOf("## Requester (1)");
    const specialist = text.indexOf("## Procurement Specialist (1)");
    const vendor = text.indexOf("## Vendor (1)");
    expect(requester).toBeGreaterThan(-1);
    expect(requester).toBeLessThan(specialist);
    expect(specialist).toBeLessThan(vendor);
    expect(text).toContain("| info@shirvan-seeds.test | Farid Hasanov | Shirvan Seeds MMC | registration APPROVED; grade A. |");
    expect(text).not.toContain("## Admin"); // empty groups are left out
  });

  it("names the demo password variable but never a password", () => {
    expect(text).toContain("`DEMO_SEED_PASSWORD`");
    expect(text).not.toMatch(/password\s*[:=]\s*\S/i);
  });
});
