/**
 * Purchase requisition lines (PR-01) and the plan warning (PLN-01 AC4). The form checks every
 * line and shows the message on that line; public.requisition_save checks the same rules again.
 */
export type PrLine = {
  itemId: string;
  quantity: string;
  price: string;
  deliveryDate: string;
  deliveryPlaceId: string;
  specification: string;
};

export type LineErrors = Partial<Record<keyof PrLine, string>>;

export type PrErrors = { form?: string; planLineId?: string; lines?: LineErrors[] };

export const EMPTY_LINE: PrLine = { itemId: "", quantity: "", price: "", deliveryDate: "", deliveryPlaceId: "", specification: "" };
export const MAX_SPECIFICATION = 2000;

const QUANTITY = /^\d+(\.\d{1,3})?$/; // numeric(14,3)
const PRICE = /^\d+(\.\d{1,2})?$/; // AZN, 2 decimals

/** "2026-11-11" -> "2026-11-12" (dates are plain calendar days in Asia/Baku). */
export function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The hidden "lines" field of the form, never trusted: unknown shapes become empty strings. */
export function parseLines(raw: FormDataEntryValue | null): PrLine[] {
  try {
    const data = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(data)) return [];
    return data.map((l) => ({
      itemId: String(l?.itemId ?? "").trim(),
      quantity: String(l?.quantity ?? "").trim(),
      price: String(l?.price ?? "").trim(),
      deliveryDate: String(l?.deliveryDate ?? "").trim(),
      deliveryPlaceId: String(l?.deliveryPlaceId ?? "").trim(),
      specification: String(l?.specification ?? ""),
    }));
  } catch {
    return [];
  }
}

/**
 * PR-01 AC2, AC3, AC5, AC6: every existing line is checked on Save and on Submit; a draft may
 * have no lines, Submit needs at least one ("Add at least one line").
 */
export function validateRequisition(
  input: { planLineId: string; lines: PrLine[] },
  today: string,
  submit: boolean,
): PrErrors {
  const errors: PrErrors = {};
  if (!input.planLineId) errors.planLineId = "errors.required";
  if (submit && input.lines.length === 0) errors.form = "errors.lineRequired";
  const tomorrow = nextDay(today);
  const lineErrors = input.lines.map((l) => {
    const e: LineErrors = {};
    if (!l.itemId) e.itemId = "errors.required";
    if (!QUANTITY.test(l.quantity) || Number(l.quantity) <= 0) e.quantity = "errors.quantityPositive";
    if (!PRICE.test(l.price) || Number(l.price) <= 0) e.price = "errors.pricePositive";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.deliveryDate)) e.deliveryDate = "errors.required";
    else if (l.deliveryDate < tomorrow) e.deliveryDate = "errors.deliveryDateFuture";
    if (!l.deliveryPlaceId) e.deliveryPlaceId = "errors.required";
    if (l.specification.trim().length > MAX_SPECIFICATION) e.specification = "errors.specificationTooLong";
    return e;
  });
  if (lineErrors.some((e) => Object.keys(e).length > 0)) errors.lines = lineErrors;
  return errors;
}

export function hasErrors(errors: PrErrors): boolean {
  return Boolean(errors.form || errors.planLineId || errors.lines);
}

/** Quantity × estimated unit price; 0 while either is not a number yet. */
export function lineValue(line: Pick<PrLine, "quantity" | "price">): number {
  const q = Number(line.quantity);
  const p = Number(line.price);
  return Number.isFinite(q) && Number.isFinite(p) && line.quantity !== "" && line.price !== "" ? q * p : 0;
}

/** PR-01 AC4: estimated value = sum of quantity × estimated unit price, rounded to 2 decimals. */
export function estimatedValue(lines: Pick<PrLine, "quantity" | "price">[]): number {
  return Math.round(lines.reduce((sum, l) => sum + lineValue(l), 0) * 100) / 100;
}

/** PLN-01 AC4: by how much the PR exceeds what is left on its plan line; 0 when it fits. */
export function planExcess(value: number, remaining: number): number {
  return Math.max(Math.round((value - remaining) * 100) / 100, 0);
}

/** Rows for public.requisition_save. */
export function toRpcLines(lines: PrLine[]) {
  return lines.map((l) => ({
    item_id: l.itemId,
    quantity: Number(l.quantity),
    estimated_unit_price: Number(l.price),
    delivery_date: l.deliveryDate,
    delivery_place_id: l.deliveryPlaceId,
    specification: l.specification.trim() || null,
  }));
}
