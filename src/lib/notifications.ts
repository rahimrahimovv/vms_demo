/** Shared by the server layout (initial bell items) and the client bell (live inserts). */
export type BellItem = {
  id: string;
  event: string;
  params: Record<string, string | number>;
  recordNumber: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationRow = {
  id: string;
  event: string;
  params: Record<string, string | number> | null;
  record_number: string | null;
  is_read: boolean;
  created_at: string;
};

export const BELL_COLUMNS = "id, event, params, record_number, is_read, created_at";
export const BELL_MAX_ITEMS = 10;

import { formatDateTime } from "./format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Values for a notification message: dates as "06 Nov 2026", scores with 1 decimal and coded
 * values (certificate type) through their labels. Stored params hold no wording (ERD).
 */
export function messageValues(
  params: Record<string, string | number>,
  recordNumber: string | null,
  label: { has: (key: string) => boolean; translate: (key: string) => string },
  formatDate: (value: string) => string,
): Record<string, string | number> {
  const out: Record<string, string | number> = { number: recordNumber ?? "" };
  for (const [key, value] of Object.entries(params)) {
    if (key === "deadline" && typeof value === "string") out[key] = formatDateTime(value);
    else if (typeof value === "string" && ISO_DATE.test(value)) out[key] = formatDate(value);
    else if (key === "score" && value !== null && value !== "") out[key] = Number(value).toFixed(1);
    else if (key === "type" && label.has(`certificateTypes.${value}`)) out[key] = label.translate(`certificateTypes.${value}`);
    // committee decisions: the type and result are codes in the database, words on the screen
    else if (key === "decisionType" && label.has(`decisions.types.${value}`)) out[key] = label.translate(`decisions.types.${value}`);
    else if (key === "result" && label.has(`status.${value}`)) out[key] = label.translate(`status.${value}`);
    else out[key] = value ?? "";
  }
  return out;
}

export function toBellItem(row: NotificationRow): BellItem {
  return {
    id: row.id,
    event: row.event,
    params: row.params ?? {},
    recordNumber: row.record_number,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}
