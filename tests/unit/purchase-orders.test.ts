import { describe, expect, it } from "vitest";
import { buildPoPdf } from "@/lib/purchase-orders/pdf";
import { canDecidePo, type PoView } from "@/lib/purchase-orders/types";
import { messageValues } from "@/lib/notifications";
import { formatAmount, formatDate } from "@/lib/format";

const po: PoView = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "PO-2026-0001",
  status: "FULLY_APPROVED",
  createdAt: "2026-11-16T08:30:00Z",
  reason: null,
  vendor: { id: "22222222-2222-4222-8222-222222222222", name: "Alpha Agro (Ə İ ş)" },
  sourcing: { id: "33333333-3333-4333-8333-333333333333", number: "SRC-2026-0001" },
  ownerId: "owner",
  requesterId: "requester",
  incoterm: "DDP",
  namedPlace: "Central warehouse",
  deliveryMode: "Truck",
  paymentTerm: "30 days after delivery",
  vatRate: 18,
  total: 56000,
  vatAmount: 10080,
  totalInclVat: 66080,
  lines: [
    { item: "Ammonium nitrate 34.4%, 50 kg bag", unit: "bag", quantity: 2000, unitPrice: 28, lineTotal: 56000, deliveryDate: "2026-12-15", place: "Central warehouse" },
  ],
  winnerMinutes: { id: "44444444-4444-4444-8444-444444444444", number: "MIN-2026-002" },
  decision: { id: "55555555-5555-4555-8555-555555555555", status: "APPROVED" },
};

// PO-01 AC2: total excluding VAT, VAT at the vendor's rate, total including VAT (Calculation Rules: 2,000 x 28.00 at 18%)
describe("PO totals as shown", () => {
  it("formats 56,000.00 + 10,080.00 = 66,080.00 AZN", () => {
    expect(po.total + po.vatAmount).toBe(po.totalInclVat);
    expect(formatAmount(po.total)).toBe("56,000.00 AZN");
    expect(formatAmount(po.vatAmount)).toBe("10,080.00 AZN");
    expect(formatAmount(po.totalInclVat)).toBe("66,080.00 AZN");
    expect(formatDate(po.lines[0].deliveryDate)).toBe("15 Dec 2026");
  });

  it("shows the PO total in notifications as AZN", () => {
    const values = messageValues({ vendor: "Alpha Agro", total: 56000 }, po.number, { has: () => false, translate: (k) => k }, formatDate);
    expect(values).toMatchObject({ number: "PO-2026-0001", vendor: "Alpha Agro", total: "56,000.00 AZN" });
  });
});

// PO-02 AC3 (#83, amended 13 Nov 2026): not for the PR's Requester and not for the owner of the sourcing
describe("PO decision buttons", () => {
  const pending = { status: "PENDING_APPROVAL" as const, requesterId: "requester", ownerId: "owner" };
  it("an Approver who is neither Requester nor owner may decide", () => {
    expect(canDecidePo(pending, { id: "approver", roles: ["APPROVER"] })).toBe(true);
  });
  it("no buttons for the Requester or the owner, even with the Approver role", () => {
    expect(canDecidePo(pending, { id: "requester", roles: ["APPROVER", "REQUESTER"] })).toBe(false);
    expect(canDecidePo(pending, { id: "owner", roles: ["APPROVER", "PROCUREMENT_SPECIALIST"] })).toBe(false);
  });
  it("no buttons without the Approver role or once the PO is not PENDING_APPROVAL", () => {
    expect(canDecidePo(pending, { id: "someone", roles: ["PROCUREMENT_SPECIALIST"] })).toBe(false);
    expect(canDecidePo({ ...pending, status: "PENDING_COMMITTEE" as never }, { id: "approver", roles: ["APPROVER"] })).toBe(false);
  });
});

// PO-03 AC1: English PDF with the product name in the header
describe("PO PDF", () => {
  it("builds a PDF, also with Azerbaijani letters in the vendor name and many lines", async () => {
    const bytes = await buildPoPdf(po);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
    const many = await buildPoPdf({ ...po, lines: Array.from({ length: 60 }, (_, i) => ({ ...po.lines[0], item: `Item ${i} `.repeat(8) })) });
    expect(many.length).toBeGreaterThan(bytes.length);
  });
});
