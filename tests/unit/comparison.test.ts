import { describe, expect, it } from "vitest";
import { cellFor, fewestEligible, needsJustification, price, proposalsReceived, type Comparison, type ComparisonCell, type ComparisonLine } from "@/lib/sourcing/comparison";
import { bakuLocalInDays } from "@/lib/sourcing/dates";

// Backlog Calculation Rules: Alpha Agro 33.04 with 18% VAT -> 28.00 (final offer 27.50), Beta Trade 29.50 + delivery 1.00 = 30.50.
const cell = (proposalId: string, unitExclVat: number, extra = 0): ComparisonCell => ({
  proposalId, proposalLineId: `${proposalId}-l`, round: 1, entered: unitExclVat, unitExclVat, firstExclVat: null,
  extra, evaluated: unitExclVat + extra, lineTotal: unitExclVat * 2000, excluded: false, costs: [],
});
const line = (cells: ComparisonCell[], over: Partial<ComparisonLine> = {}): ComparisonLine => ({
  id: "l1", status: "ACTIVE", cancelReason: null, item: "Ammonium nitrate 34.4%, 50 kg bag", unit: "bag", quantity: 2000,
  deliveryDate: "2026-12-14", place: "Central warehouse", estimate: 30, eligibleCount: cells.length,
  lowest: Math.min(...cells.map((c) => c.evaluated)), defaultProposalId: "A", chosenProposalId: "A", manual: false,
  justification: null, notLowest: false, cells, ...over,
});

describe("comparison helpers (RFQ-05, RFQ-07)", () => {
  const a = cell("A", 27.5);
  const b = cell("B", 29.5, 1);
  const l = line([a, b]);

  it("formats prices like 55,000.00 without the currency", () => {
    expect(price(27.5)).toBe("27.50");
    expect(price(55000)).toBe("55,000.00");
    expect(price(null)).toBe("");
  });

  it("evaluated price is the unit price excluding VAT plus extra costs: 29.50 + 1.00 = 30.50", () => {
    expect(b.evaluated).toBe(30.5);
    expect(cellFor(l, "B")).toBe(b);
    expect(cellFor(l, "C")).toBeUndefined();
  });

  it("RFQ-05 AC4: a vendor that is not the lowest needs a justification; a tied vendor does not", () => {
    expect(needsJustification(l, b)).toBe(true);
    expect(needsJustification(l, a)).toBe(false);
    const tie = line([cell("A", 28), cell("B", 28)]);
    expect(needsJustification(tie, tie.cells[1])).toBe(false);
  });

  it("RFQ-05 AC5: the low-competition box reports the fewest eligible offers on an active line", () => {
    const c = {
      vendors: [{}, {}], disqualified: [{}],
      lines: [line([a, b]), line([a], { id: "l2" }), line([], { id: "l3", status: "CANCELLED", eligibleCount: 0 })],
    } as unknown as Comparison;
    expect(fewestEligible(c)).toBe(1);
    expect(proposalsReceived(c)).toBe(3);
  });

  it("RFQ-08 AC1: the default final-offer deadline is 2 days later, in Asia/Baku", () => {
    expect(bakuLocalInDays(2, new Date("2026-11-13T06:00:00Z"))).toBe("2026-11-15T10:00");
  });
});
