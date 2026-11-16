import { roundHalfUp } from "@/lib/sourcing/saving";

/**
 * PLT-04 dashboard: the shape of public.dashboard_summary and the small calculations behind it. The database is the
 * source of truth (every figure is computed there); the functions below mirror its rules for the unit tests and
 * serve the screen (bar widths, donut arcs, compact amounts).
 */
export const PERIODS = ["30d", "90d", "year", "all"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "90d";

export function parsePeriod(value: string | string[] | undefined): Period {
  const v = Array.isArray(value) ? value[0] : value;
  return (PERIODS as readonly string[]).includes(v ?? "") ? (v as Period) : DEFAULT_PERIOD;
}

export type StageKey = "draft" | "open" | "evaluation" | "committee" | "awarded" | "completed" | "cancelled";

export type DashboardSummary = {
  period: Period;
  awarded: { value: number; sourcings: number };
  saving: { estimated: number; awarded: number; saving: number; percent: number; over: boolean };
  cycle: { days: number | null; orders: number };
  bids: { proposals: number; sourcings: number; average: number | null };
  stages: { total: number; rows: { key: StageKey; count: number }[] };
  categories: { name: string; awarded: number; inProgress: number }[];
  grades: { a: number; b: number; c: number; d: number; notGraded: number; total: number; expiringCertificates: number };
  topVendors: { name: string; awards: number; awarded: number }[];
  needsAction: { key: string; count: number }[];
  committee: { approved: number; rejected: number; noDecision: number; eligible: number; cast: number };
};

/** Sourcing statuses grouped into the stages of the "Sourcings by stage" card. */
export const STAGE_STATUSES: Record<StageKey, string[]> = {
  draft: ["DRAFT"],
  open: ["OPEN"],
  evaluation: ["CLOSED", "AWAITING_OPENING", "TECHNICAL_EVALUATION", "COMPARISON", "FINAL_OFFER_ROUND"],
  committee: ["IN_COMMITTEE"],
  awarded: ["WINNER_APPROVED"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED"],
};

export function stageOf(status: string): StageKey | null {
  return (Object.keys(STAGE_STATUSES) as StageKey[]).find((k) => STAGE_STATUSES[k].includes(status)) ?? null;
}

/** Start of a period: 30 or 90 days back, 1 January (Asia/Baku, UTC+4) for "year", nothing for "all". */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  if (period === "90d") return new Date(now.getTime() - 90 * 86_400_000);
  const baku = new Date(now.getTime() + 4 * 3_600_000);
  return new Date(Date.UTC(baku.getUTCFullYear(), 0, 1) - 4 * 3_600_000);
}

export const inPeriod = (at: Date | string, period: Period, now: Date): boolean => {
  const from = periodStart(period, now);
  return from === null || new Date(at).getTime() >= from.getTime();
};

/** Awarded value: sum of quantity x the winner's unit price excluding VAT, each line rounded to two decimals. */
export function awardedValue(lines: { quantity: number; unitExclVat: number }[]): number {
  return roundHalfUp(lines.reduce((s, l) => s + roundHalfUp(l.quantity * l.unitExclVat, 2), 0), 2);
}

/** Cycle time: the average days from the approval of a requisition to FULLY_APPROVED of its purchase order, one decimal. */
export function cycleDays(pairs: { approvedAt: string; releasedAt: string }[]): number | null {
  if (pairs.length === 0) return null;
  const days = pairs.map((p) => (Date.parse(p.releasedAt) - Date.parse(p.approvedAt)) / 86_400_000);
  return roundHalfUp(days.reduce((a, b) => a + b, 0) / days.length, 1);
}

/** Bids per sourcing: submitted proposals (not DRAFT, not WITHDRAWN) per sourcing that is not a draft, one decimal. */
export function bidsPerSourcing(sourcings: { status: string; proposals: string[] }[]): { proposals: number; sourcings: number; average: number | null } {
  const counted = sourcings.filter((s) => s.status !== "DRAFT");
  const proposals = counted.reduce((n, s) => n + s.proposals.filter((p) => p !== "DRAFT" && p !== "WITHDRAWN").length, 0);
  return { proposals, sourcings: counted.length, average: counted.length ? roundHalfUp(proposals / counted.length, 1) : null };
}

export function gradeCounts(grades: (string | null)[]) {
  const count = (g: string) => grades.filter((x) => x === g).length;
  return { a: count("A"), b: count("B"), c: count("C"), d: count("D"), notGraded: grades.filter((x) => x === null).length, total: grades.length };
}

/** Share of eligible votes that were cast, whole percent (eligible = voters without a declared conflict). */
export function participation(c: { eligible: number; cast: number }): number | null {
  return c.eligible > 0 ? roundHalfUp((c.cast * 100) / c.eligible, 0) : null;
}

/** Width of a bar in percent of the largest value (at least 4 % for a non-zero value so it stays visible). */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}

/** "68.2k" for 68,200; "1.4m" for 1,400,000; plain two-decimal numbers below 1,000. Text next to the bars. */
export function compactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${roundHalfUp(value / 1_000_000, 1).toFixed(1)}m`;
  if (abs >= 1_000) return `${roundHalfUp(value / 1_000, 1).toFixed(1)}k`;
  return roundHalfUp(value, 0).toString();
}

/** Arcs of the grade donut: dash length and offset for a circle of radius r (stroke-dasharray / stroke-dashoffset). */
export function donutArcs(values: number[], r: number): { dash: number; offset: number }[] {
  const circumference = 2 * Math.PI * r;
  const total = values.reduce((a, b) => a + b, 0);
  let offset = 0;
  return values.map((v) => {
    const dash = total > 0 ? (v / total) * circumference : 0;
    const arc = { dash, offset: -offset };
    offset += dash;
    return arc;
  });
}
