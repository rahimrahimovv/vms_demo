/**
 * Deadlines are typed and shown in Asia/Baku (CLAUDE.md rule 12). Baku has no daylight saving time
 * (UTC+4 all year), so the form value "2026-11-30T10:00" converts with a fixed offset.
 */
const BAKU_OFFSET = "+04:00";

/** "2026-11-30T10:00" (datetime-local, Baku time) to an ISO timestamp, or null when empty or invalid. */
export function bakuLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${BAKU_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An ISO timestamp as the value of a datetime-local input in Baku time. */
export function isoToBakuLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

/** Whole hours and minutes left, for "time remaining" (vendor invitation page). */
export function timeRemaining(deadlineIso: string, now: Date = new Date()): { days: number; hours: number; minutes: number } | null {
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}
