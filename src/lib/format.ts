// NFR-005 locale: Asia/Baku, dates like "06 Nov 2026", amounts like "60,000.00 AZN".
// Month names are fixed here so the output never depends on the runtime's ICU data
// (some ICU versions print "Sept" for en-GB).

export const TIME_ZONE = "Asia/Baku";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bakuParts(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: Number(get("month")), year: get("year"), hour: get("hour"), minute: get("minute") };
}

/** "06 Nov 2026" in Asia/Baku. */
export function formatDate(value: Date | string): string {
  const p = bakuParts(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "06 Nov 2026, 14:05" in Asia/Baku. */
export function formatDateTime(value: Date | string): string {
  const p = bakuParts(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "60,000.00 AZN". Accepts Postgres numeric strings. AZN is the only currency (CLAUDE.md rule 12). */
export function formatAmount(value: number | string): string {
  return `${amountFormat.format(Number(value))} AZN`;
}
