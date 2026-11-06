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
