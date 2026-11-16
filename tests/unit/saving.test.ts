import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSaving, formatPercent, roundHalfUp } from "@/lib/sourcing/saving";

describe("RFQ-10 saving against the estimate", () => {
  it("backlog example: 80,000.00 estimated, 74,500.00 awarded, 5,500.00 = 6.9%", () => {
    const s = computeSaving([{ lineId: "a", estimateUnit: 800, winnerUnit: 745, quantity: 100 }]);
    expect(s.estimated).toBe(80000);
    expect(s.awarded).toBe(74500);
    expect(s.saving).toBe(5500);
    expect(s.percent).toBe(6.9); // 6.875 rounds half-up to 6.9
    expect(s.over).toBe(false);
    expect(formatPercent(s.percent)).toBe("6.9%");
  });

  it("per line: estimated unit price, winner unit price and the difference in percent with one decimal, sign after rounding", () => {
    const s = computeSaving([
      { lineId: "a", estimateUnit: 800, winnerUnit: 745, quantity: 100 },
      { lineId: "b", estimateUnit: 100, winnerUnit: 103.25, quantity: 1 },
      { lineId: "c", estimateUnit: 100, winnerUnit: 96.75, quantity: 1 },
    ]);
    expect(s.lines.map((l) => [l.estimateUnit, l.winnerUnit, l.percent])).toEqual([[800, 745, 6.9], [100, 103.25, -3.3], [100, 96.75, 3.3]]);
    expect(formatPercent(s.lines[1].percent!)).toBe("+3.3%");
  });

  it("sums several lines, each rounded to two decimals first", () => {
    const s = computeSaving([
      { lineId: "a", estimateUnit: 10.005, winnerUnit: 9.999, quantity: 3 },
      { lineId: "b", estimateUnit: 20, winnerUnit: 15, quantity: 2 },
    ]);
    expect(s.lines[0]).toMatchObject({ lineId: "a", estimated: 30.02, awarded: 30, saving: 0.02 });
    expect(s.estimated).toBe(70.02);
    expect(s.awarded).toBe(60);
    expect(s.saving).toBe(10.02);
  });

  it("over-estimate: a winner above the estimate gives a negative saving and the over flag", () => {
    const s = computeSaving([{ lineId: "a", estimateUnit: 100, winnerUnit: 103, quantity: 10 }]);
    expect(s.estimated).toBe(1000);
    expect(s.awarded).toBe(1030);
    expect(s.saving).toBe(-30);
    expect(s.percent).toBe(-3);
    expect(s.over).toBe(true);
    expect(formatPercent(s.percent)).toBe("+3.0%");
  });

  it("no lines with a winner: zeros, no division by zero", () => {
    const s = computeSaving([]);
    expect(s).toMatchObject({ estimated: 0, awarded: 0, saving: 0, percent: 0, over: false });
  });

  it("rounds half-up", () => {
    expect(roundHalfUp(6.875, 1)).toBe(6.9);
    expect(roundHalfUp(0.125, 2)).toBe(0.13);
    expect(roundHalfUp(-3.25, 1)).toBe(-3.3);
  });

  it("rounds the absolute value, so both signs and every 0.05 step agree", () => {
    for (let i = 0; i <= 200; i++) {
      const v = i * 0.05; // 0.00, 0.05, ... 10.00
      const expected = Math.floor(Math.round(v * 100) / 10 + 0.5) / 10; // exact on integers of hundredths
      expect(roundHalfUp(v, 1), String(v)).toBe(expected);
      expect(roundHalfUp(-v, 1), String(-v)).toBe(expected === 0 ? 0 : -expected);
    }
    expect(roundHalfUp(3.25, 1)).toBe(3.3);
    expect(roundHalfUp(-3.25, 1)).toBe(-3.3);
    expect(roundHalfUp(0.05, 1)).toBe(0.1);
    expect(roundHalfUp(-0.05, 1)).toBe(-0.1);
    const over = computeSaving([{ lineId: "a", estimateUnit: 100, winnerUnit: 103.25, quantity: 1 }]);
    expect(over.percent).toBe(-3.3);
    expect(formatPercent(over.percent)).toBe("+3.3%");
    const under = computeSaving([{ lineId: "a", estimateUnit: 100, winnerUnit: 96.75, quantity: 1 }]);
    expect(under.percent).toBe(3.3);
  });

  it("vendor-facing code never reads the estimate or the saving (PO PDF, PO vendor page, invitation and proposal screens)", () => {
    const files = [
      "src/lib/purchase-orders/pdf.ts",
      "src/app/api/purchase-orders/[id]/pdf/route.ts",
      "src/app/(app)/vendor/purchase-orders/[id]/page.tsx",
      "src/app/(app)/vendor/invitations/[id]/page.tsx",
      "src/app/(app)/vendor/invitations/page.tsx",
      "src/components/vendor/proposal-form.tsx",
      "src/components/vendor/final-offer-form.tsx",
    ];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/saving|estimat/i);
  });
});
