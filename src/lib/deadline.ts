/**
 * RFQ-11 time left on a deadline. Pure functions, tested at the boundaries (24 h, 1 h, 0, negative).
 * The clock of the device is never trusted: the server sends its own time and the client works with the offset.
 */
export type TimeLeft =
  | { kind: "days"; days: number; hours: number }
  | { kind: "hours"; hours: number; minutes: number }
  | { kind: "minutes"; minutes: number }
  | { kind: "passed" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 24 hours or more: days and hours ("2 days 4 hours"); under 24 hours: hours and minutes ("5 h 12 min");
 * under 1 hour: minutes ("42 min", at least 1 while the deadline has not passed); 0 or negative: passed.
 */
export function timeLeft(deadline: Date | string | number, now: Date | number): TimeLeft {
  const ms = new Date(deadline).getTime() - new Date(now).getTime();
  if (!(ms > 0)) return { kind: "passed" };
  if (ms >= DAY) return { kind: "days", days: Math.floor(ms / DAY), hours: Math.floor((ms % DAY) / HOUR) };
  if (ms >= HOUR) return { kind: "hours", hours: Math.floor(ms / HOUR), minutes: Math.floor((ms % HOUR) / MINUTE) };
  return { kind: "minutes", minutes: Math.max(1, Math.floor(ms / MINUTE)) };
}

/** Server time minus device time, computed once when the component mounts. */
export function clockOffset(serverNow: Date | string | number, deviceNow: number): number {
  return new Date(serverNow).getTime() - deviceNow;
}

/** The current time on the server's clock, whatever the device clock says. */
export function serverTime(offset: number, deviceNow: number): number {
  return deviceNow + offset;
}

/** Under 24 hours the chip turns amber (RFQ-11). */
export function isUrgent(left: TimeLeft): boolean {
  return left.kind === "hours" || left.kind === "minutes";
}
