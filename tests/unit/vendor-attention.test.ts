import { describe, expect, it } from "vitest";
import { buildAttention, initials, ringShare, type AttentionInput } from "@/lib/vendors/attention";

const base: AttentionInput = {
  today: "2026-11-15",
  vendor: { status: "APPROVED", standing: "ACTIVE", standing_until: null },
  sharedWith: [],
  certificates: [],
  changeRequests: [],
  questionnaires: [],
  applications: [],
};

describe("vendor card: needs attention", () => {
  it("is empty when nothing needs attention", () => {
    expect(buildAttention(base)).toEqual([]);
  });

  it("names the shared owner's other vendor", () => {
    const items = buildAttention({ ...base, sharedWith: [{ vendor_id: "v2", legal_name: "Ege Tarim Kimya A.S." }] });
    expect(items).toEqual([{ kind: "sharedOwner", tone: "amber", vendorId: "v2", vendorName: "Ege Tarim Kimya A.S." }]);
  });

  it("flags EXPIRING and EXPIRED certificates with their days, and ignores valid ones", () => {
    const items = buildAttention({
      ...base,
      certificates: [
        { type: "ISO_9001", expires_on: "2026-11-27" }, // 12 days left: EXPIRING
        { type: "ISO_14001", expires_on: "2026-11-10" }, // 5 days ago: EXPIRED
        { type: "PRODUCT", expires_on: "2028-03-03" }, // VALID
        { type: "LICENCE", expires_on: null }, // no expiry
      ],
    });
    expect(items).toEqual([
      { kind: "certificateExpiring", tone: "amber", certificateType: "ISO_9001", days: 12 },
      { kind: "certificateExpired", tone: "amber", certificateType: "ISO_14001", days: 5 },
    ]);
  });

  it("counts only what My tasks counts: SUBMITTED change request, SUBMITTED questionnaire, PENDING application, SUBMITTED registration", () => {
    const items = buildAttention({
      ...base,
      vendor: { status: "SUBMITTED", standing: null, standing_until: null },
      changeRequests: [
        { id: "c1", section: "BANK_ACCOUNTS", status: "SUBMITTED" },
        { id: "c2", section: "OWNERS", status: "RETURNED" },
        { id: "c3", section: "DOCUMENTS", status: "APPROVED" },
      ],
      questionnaires: [{ status: "GRADED" }, { status: "SUBMITTED" }],
      applications: [
        { id: "a1", category_id: "k1", status: "PENDING" },
        { id: "a2", category_id: "k2", status: "QUALIFIED" },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["registration", "changeRequest", "questionnaire", "application"]);
  });

  it("shows a Hold with its end date", () => {
    const items = buildAttention({ ...base, vendor: { status: "APPROVED", standing: "HOLD", standing_until: "2027-01-05" } });
    expect(items).toEqual([{ kind: "hold", tone: "amber", until: "2027-01-05" }]);
  });
});

describe("vendor card: avatar and ring", () => {
  it("takes the initials of the first two words", () => {
    expect(initials("Caspian Agrochem MMC")).toBe("CA");
    expect(initials("  baku  ")).toBe("B");
  });
  it("clamps the ring to 0..1", () => {
    expect(ringShare(58.5)).toBeCloseTo(0.585);
    expect(ringShare(140)).toBe(1);
    expect(ringShare(-3)).toBe(0);
  });
});
