import { describe, expect, it } from "vitest";
import {
  awardedValue,
  barPercent,
  bidsPerSourcing,
  compactAmount,
  cycleDays,
  donutArcs,
  gradeCounts,
  inPeriod,
  parsePeriod,
  participation,
  periodStart,
  stageOf,
} from "@/lib/dashboard/calc";
import { computeSaving } from "@/lib/sourcing/saving";

describe("PLT-04 dashboard calculations", () => {
  it("awarded value: the winners' own prices excluding VAT, per line rounded to two decimals", () => {
    // 33.04 with 18% VAT is 28.00 excluding VAT (Calculation Rules); 2,000 x 28.00 = 56,000.00
    expect(awardedValue([{ quantity: 2000, unitExclVat: 28 }])).toBe(56000);
    expect(awardedValue([{ quantity: 3, unitExclVat: 10.005 }, { quantity: 2, unitExclVat: 15 }])).toBe(60.02);
    expect(awardedValue([])).toBe(0);
  });

  it("saving uses the RFQ-10 rule: 80,000.00 estimated, 74,500.00 awarded gives 5,500.00 = 6.9%", () => {
    const s = computeSaving([{ lineId: "a", estimateUnit: 800, winnerUnit: 745, quantity: 100 }]);
    expect([s.estimated, s.awarded, s.saving, s.percent]).toEqual([80000, 74500, 5500, 6.9]);
  });

  it("cycle time: average days from requisition approval to the order being FULLY_APPROVED, one decimal", () => {
    expect(cycleDays([])).toBeNull();
    expect(cycleDays([{ approvedAt: "2026-11-01T08:00:00Z", releasedAt: "2026-11-10T08:00:00Z" }])).toBe(9);
    expect(
      cycleDays([
        { approvedAt: "2026-11-01T08:00:00Z", releasedAt: "2026-11-05T08:00:00Z" }, // 4 days
        { approvedAt: "2026-11-01T08:00:00Z", releasedAt: "2026-11-12T20:00:00Z" }, // 11.5 days
      ]),
    ).toBe(7.8); // 7.75 rounds half-up
  });

  it("bids per sourcing: submitted proposals (not draft, not withdrawn) per sourcing that is not a draft", () => {
    const r = bidsPerSourcing([
      { status: "DRAFT", proposals: [] },
      { status: "COMPARISON", proposals: ["SUBMITTED", "SUBMITTED", "DRAFT", "WITHDRAWN"] },
      { status: "COMPLETED", proposals: ["AWARDED", "NOT_AWARDED", "DISQUALIFIED"] },
      { status: "OPEN", proposals: [] },
    ]);
    expect(r).toEqual({ proposals: 5, sourcings: 3, average: 1.7 });
    expect(bidsPerSourcing([{ status: "DRAFT", proposals: [] }])).toEqual({ proposals: 0, sourcings: 0, average: null });
  });

  it("grade counts include the vendors without a valid grade", () => {
    expect(gradeCounts(["A", "A", "B", "C", "D", null, null, null])).toEqual({ a: 2, b: 1, c: 1, d: 1, notGraded: 3, total: 8 });
  });

  it("stages group the sourcing statuses", () => {
    expect(["DRAFT", "OPEN", "CLOSED", "AWAITING_OPENING", "TECHNICAL_EVALUATION", "COMPARISON", "FINAL_OFFER_ROUND", "IN_COMMITTEE", "WINNER_APPROVED", "COMPLETED", "CANCELLED"].map(stageOf)).toEqual([
      "draft", "open", "evaluation", "evaluation", "evaluation", "evaluation", "evaluation", "committee", "awarded", "completed", "cancelled",
    ]);
    expect(stageOf("NOPE")).toBeNull();
  });

  it("participation is the share of eligible votes cast", () => {
    expect(participation({ eligible: 21, cast: 18 })).toBe(86);
    expect(participation({ eligible: 0, cast: 0 })).toBeNull();
  });

  it("period boundaries: 30 and 90 days back, 1 January in Asia/Baku for the year, nothing for all time", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    expect(periodStart("30d", now)?.toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(periodStart("90d", now)?.toISOString()).toBe("2026-08-18T10:00:00.000Z");
    expect(periodStart("year", now)?.toISOString()).toBe("2025-12-31T20:00:00.000Z"); // 01 Jan 2026 00:00 in Baku
    expect(periodStart("all", now)).toBeNull();
    // the boundary itself is inside, one millisecond earlier is outside
    expect(inPeriod("2026-10-17T10:00:00.000Z", "30d", now)).toBe(true);
    expect(inPeriod("2026-10-17T09:59:59.999Z", "30d", now)).toBe(false);
    expect(inPeriod("2025-12-31T20:00:00.000Z", "year", now)).toBe(true);
    expect(inPeriod("2025-12-31T19:59:59.999Z", "year", now)).toBe(false);
    expect(inPeriod("1999-01-01T00:00:00Z", "all", now)).toBe(true);
    // just after midnight in Baku on 1 January the year has already turned (still 31 Dec in UTC)
    expect(periodStart("year", new Date("2026-12-31T20:30:00Z"))?.toISOString()).toBe("2026-12-31T20:00:00.000Z");
  });

  it("the period comes from the query string; anything unknown means the last 90 days", () => {
    expect(parsePeriod("30d")).toBe("30d");
    expect(parsePeriod(["year", "all"])).toBe("year");
    expect(parsePeriod("forever")).toBe("90d");
    expect(parsePeriod(undefined)).toBe("90d");
  });

  it("helpers for the screen: bar widths, compact amounts, donut arcs", () => {
    expect(barPercent(0, 5)).toBe(0);
    expect(barPercent(5, 5)).toBe(100);
    expect(barPercent(1, 100)).toBe(4);
    expect(compactAmount(68200)).toBe("68.2k");
    expect(compactAmount(40000)).toBe("40.0k");
    expect(compactAmount(1_400_000)).toBe("1.4m");
    expect(compactAmount(0)).toBe("0");
    const arcs = donutArcs([2, 3, 2, 1, 7], 42);
    expect(arcs).toHaveLength(5);
    expect(arcs.reduce((s, a) => s + a.dash, 0)).toBeCloseTo(2 * Math.PI * 42, 6);
    expect(arcs[1].offset).toBeCloseTo(-arcs[0].dash, 6);
    expect(donutArcs([0, 0], 42).every((a) => a.dash === 0)).toBe(true);
  });
});
