/**
 * Field checks for the Admin's master data (MDM-01, MDM-02) and plan lines (PLN-01). The screens
 * show the message under the field; the database functions check the same rules again.
 */
export type Errors = Record<string, string>;

export const PLACE_TYPES = ["WAREHOUSE", "PORT", "CITY"] as const;
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

/** A decimal typed by a person: "1 000,50" is not accepted, "1000.50" is. Empty = null. */
export function parseDecimal(value: string): number | null {
  const v = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/** Up to 2 decimals (prices and amounts in AZN). */
export function hasTwoDecimalsAtMost(value: string): boolean {
  return /^-?\d+(\.\d{1,2})?$/.test(value.trim());
}

const blank = (v: string) => v.trim() === "";

export function validateCurrency(v: { code: string; name: string }): Errors {
  const e: Errors = {};
  if (!/^[A-Z]{3}$/.test(v.code.trim().toUpperCase())) e.code = "errors.currencyCodeFormat";
  if (blank(v.name)) e.name = "errors.required";
  return e;
}

export function validateName(v: { name: string }): Errors {
  return blank(v.name) ? { name: "errors.required" } : {};
}

/** MDM-01 AC2: advance 0 to 100 %, days after delivery 0 or more. */
export function validatePaymentTerm(v: { name: string; advancePercent: string; daysAfterDelivery: string }): Errors {
  const e = validateName(v);
  const advance = parseDecimal(v.advancePercent);
  if (advance === null || advance < 0 || advance > 100 || !hasTwoDecimalsAtMost(v.advancePercent)) {
    e.advancePercent = "errors.advancePercentRange";
  }
  if (!/^\d+$/.test(v.daysAfterDelivery.trim())) e.daysAfterDelivery = "errors.daysNotNegative";
  return e;
}

/** MDM-01 AC3: name, type (Warehouse, Port, City) and address. */
export function validateDeliveryPlace(v: { name: string; type: string; address: string }): Errors {
  const e = validateName(v);
  if (!(PLACE_TYPES as readonly string[]).includes(v.type)) e.type = "errors.required";
  if (blank(v.address)) e.address = "errors.required";
  return e;
}

/** MDM-02 AC4: unique code, name, unit and category. */
export function validateItem(v: { code: string; name: string; unit: string; categoryId: string }): Errors {
  const e: Errors = {};
  if (blank(v.code)) e.code = "errors.required";
  if (blank(v.name)) e.name = "errors.required";
  if (blank(v.unit)) e.unit = "errors.required";
  if (blank(v.categoryId)) e.categoryId = "errors.required";
  return e;
}

/** PLN-01 AC1: year, category, description, planned amount in AZN > 0, quarter Q1 to Q4. */
export function validatePlanLine(v: {
  year: string;
  categoryId: string;
  description: string;
  plannedAmount: string;
  quarter: string;
}): Errors {
  const e: Errors = {};
  const year = Number(v.year);
  if (!/^\d{4}$/.test(v.year.trim()) || year < 2000 || year > 2100) e.year = "errors.yearInvalid";
  if (blank(v.categoryId)) e.categoryId = "errors.required";
  if (blank(v.description)) e.description = "errors.required";
  const amount = parseDecimal(v.plannedAmount);
  if (amount === null || amount <= 0 || !hasTwoDecimalsAtMost(v.plannedAmount)) e.plannedAmount = "errors.amountPositive";
  if (!(QUARTERS as readonly string[]).includes(v.quarter)) e.quarter = "errors.required";
  return e;
}

/** Where a database refusal belongs on the form; anything else shows above the form. */
const FIELD_OF: Record<string, string> = {
  "errors.nameExists": "name",
  "errors.codeExists": "code",
  "errors.currencyCodeFormat": "code",
  "errors.advancePercentRange": "advancePercent",
  "errors.daysNotNegative": "daysAfterDelivery",
  "errors.yearInvalid": "year",
  "errors.amountPositive": "plannedAmount",
};

export function placeError(key: string): Errors {
  return { [FIELD_OF[key] ?? "form"]: key };
}
