import { certificateStatus, daysBetween } from "./rules";

/**
 * "Needs attention" on the vendor card. Built only from data the app already has, and it follows the same rules as the
 * My tasks counts: a SUBMITTED registration, a SUBMITTED change request, a SUBMITTED questionnaire and a PENDING category
 * application are exactly the items those cards count. Shared owners, certificates and a Hold are extra warnings.
 */
export type AttentionItem =
  | { kind: "sharedOwner"; tone: "amber"; vendorId: string; vendorName: string }
  | { kind: "certificateExpiring"; tone: "amber"; certificateType: string; days: number }
  | { kind: "certificateExpired"; tone: "amber"; certificateType: string; days: number }
  | { kind: "hold"; tone: "amber"; until: string | null }
  | { kind: "registration"; tone: "sky" }
  | { kind: "changeRequest"; tone: "sky"; id: string; section: string }
  | { kind: "questionnaire"; tone: "sky" }
  | { kind: "application"; tone: "sky"; id: string; categoryId: string };

export type AttentionInput = {
  today: string;
  vendor: { status: string; standing: string | null; standing_until: string | null };
  sharedWith: { vendor_id: string; legal_name: string }[];
  certificates: { type: string; expires_on: string | null }[];
  /** change requests of the vendor with their status (only SUBMITTED ones count) */
  changeRequests: { id: string; section: string; status: string }[];
  questionnaires: { status: string }[];
  applications: { id: string; category_id: string; status: string }[];
};

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { today, vendor } = input;
  const items: AttentionItem[] = [];

  if (vendor.status === "SUBMITTED") items.push({ kind: "registration", tone: "sky" });
  for (const s of input.sharedWith) items.push({ kind: "sharedOwner", tone: "amber", vendorId: s.vendor_id, vendorName: s.legal_name });
  for (const c of input.certificates) {
    if (!c.expires_on) continue;
    const status = certificateStatus(c.expires_on, today);
    const days = daysBetween(today, c.expires_on);
    if (status === "EXPIRING") items.push({ kind: "certificateExpiring", tone: "amber", certificateType: c.type, days });
    if (status === "EXPIRED") items.push({ kind: "certificateExpired", tone: "amber", certificateType: c.type, days: -days });
  }
  if (vendor.standing === "HOLD") items.push({ kind: "hold", tone: "amber", until: vendor.standing_until });
  for (const r of input.changeRequests) {
    if (r.status === "SUBMITTED") items.push({ kind: "changeRequest", tone: "sky", id: r.id, section: r.section });
  }
  if (input.questionnaires.some((q) => q.status === "SUBMITTED")) items.push({ kind: "questionnaire", tone: "sky" });
  for (const a of input.applications) {
    if (a.status === "PENDING") items.push({ kind: "application", tone: "sky", id: a.id, categoryId: a.category_id });
  }
  return items;
}

/** Initials of the avatar: the first letters of the first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Share of the grade ring that is filled: the score on a 0 to 100 scale, never outside it. */
export function ringShare(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score / 100));
}
