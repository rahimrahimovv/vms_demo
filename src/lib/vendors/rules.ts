/**
 * Calculation Rules from the backlog (the database applies the same formulas; tests use the
 * backlog's worked examples). Dates are Asia/Baku calendar dates "YYYY-MM-DD".
 */

export type CertificateStatus = "VALID" | "EXPIRING" | "EXPIRED";

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** VALID: no expiry or more than 30 days away; EXPIRING: within 30 days; EXPIRED from the day after. */
export function certificateStatus(expiresOn: string | null, today: string): CertificateStatus {
  if (!expiresOn) return "VALID";
  const days = daysBetween(today, expiresOn);
  if (days > 30) return "VALID";
  if (days < 0) return "EXPIRED";
  return "EXPIRING";
}

/** Full years between the founding date and today. */
export function yearsInBusiness(foundedOn: string, today: string): number {
  const [fy, fm, fd] = foundedOn.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
}

export type ScoredAnswer = { weight: number; points: number; maxPoints: number };

/** Sum(weight × points ÷ max) ÷ sum(weight) × 100, rounded to 1 decimal. */
export function questionnaireScore(answers: ScoredAnswer[]): number {
  const totalWeight = answers.reduce((s, a) => s + a.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = answers.reduce((s, a) => s + (a.maxPoints > 0 ? (a.weight * a.points) / a.maxPoints : 0), 0);
  return Math.round((weighted / totalWeight) * 1000) / 10;
}

export type GradeBands = { A: number; B: number; C: number };
export const DEFAULT_GRADE_BANDS: GradeBands = { A: 85, B: 70, C: 50 };

export function gradeFor(score: number, bands: GradeBands = DEFAULT_GRADE_BANDS): "A" | "B" | "C" | "D" {
  if (score >= bands.A) return "A";
  if (score >= bands.B) return "B";
  if (score >= bands.C) return "C";
  return "D";
}

/** "Today" as an Asia/Baku calendar date. */
export function bakuToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(now);
}

/** A new questionnaire may start in the last 30 days of a valid grade (REG-05 AC8). */
export function canRetakeEarly(validUntil: string, today: string): boolean {
  return daysBetween(today, validUntil) <= 30;
}
