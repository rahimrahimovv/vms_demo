import { describe, expect, it } from "vitest";
import {
  placeError,
  validateCurrency,
  validateDeliveryPlace,
  validateItem,
  validatePaymentTerm,
  validatePlanLine,
} from "@/lib/master-data/validate";
import {
  EMPTY_LINE,
  estimatedValue,
  hasErrors,
  nextDay,
  parseLines,
  planExcess,
  toRpcLines,
  validateRequisition,
  type PrLine,
} from "@/lib/requisitions/validate";

const TODAY = "2026-11-11";
const line = (patch: Partial<PrLine> = {}): PrLine => ({
  itemId: "item-1",
  quantity: "500",
  price: "100.00",
  deliveryDate: "2026-12-01",
  deliveryPlaceId: "place-1",
  specification: "",
  ...patch,
});

// MDM-01
describe("dictionaries", () => {
  it("AC4 currency: ISO code of 3 letters and a name", () => {
    expect(validateCurrency({ code: "KZT", name: "Kazakh tenge" })).toEqual({});
    expect(validateCurrency({ code: "kzt", name: "Kazakh tenge" })).toEqual({});
    expect(validateCurrency({ code: "KZ", name: "Kazakh tenge" })).toEqual({ code: "errors.currencyCodeFormat" });
    expect(validateCurrency({ code: "KZT1", name: "" })).toEqual({ code: "errors.currencyCodeFormat", name: "errors.required" });
  });

  it("AC2 payment term: advance 0 to 100 %, days 0 or more", () => {
    expect(validatePaymentTerm({ name: "45 days after delivery", advancePercent: "0", daysAfterDelivery: "45" })).toEqual({});
    expect(validatePaymentTerm({ name: "Full", advancePercent: "100", daysAfterDelivery: "0" })).toEqual({});
    expect(validatePaymentTerm({ name: "x", advancePercent: "101", daysAfterDelivery: "0" }).advancePercent).toBe(
      "errors.advancePercentRange",
    );
    expect(validatePaymentTerm({ name: "x", advancePercent: "-1", daysAfterDelivery: "0" }).advancePercent).toBe(
      "errors.advancePercentRange",
    );
    expect(validatePaymentTerm({ name: "x", advancePercent: "10", daysAfterDelivery: "-5" }).daysAfterDelivery).toBe(
      "errors.daysNotNegative",
    );
  });

  it("AC3 delivery place: name, type and address", () => {
    expect(validateDeliveryPlace({ name: "Ganja depot", type: "WAREHOUSE", address: "Ganja" })).toEqual({});
    expect(validateDeliveryPlace({ name: "Ganja depot", type: "SHOP", address: "" })).toEqual({
      type: "errors.required",
      address: "errors.required",
    });
  });

  it("AC6 'This name already exists' lands under the name field", () => {
    expect(placeError("errors.nameExists")).toEqual({ name: "errors.nameExists" });
    expect(placeError("errors.inUse")).toEqual({ form: "errors.inUse" });
  });
});

// MDM-02 AC4, PLN-01 AC1
describe("items and plan lines", () => {
  it("item needs code, name, unit and category", () => {
    expect(validateItem({ code: "FRT-009", name: "Potash, 50 kg bag", unit: "bag", categoryId: "c" })).toEqual({});
    expect(validateItem({ code: "", name: "", unit: "", categoryId: "" })).toEqual({
      code: "errors.required",
      name: "errors.required",
      unit: "errors.required",
      categoryId: "errors.required",
    });
  });

  it("plan line: year, category, description, amount > 0 with 2 decimals, quarter Q1-Q4", () => {
    const ok = { year: "2026", categoryId: "c", description: "Spring fertiliser programme", plannedAmount: "500000.00", quarter: "Q1" };
    expect(validatePlanLine(ok)).toEqual({});
    expect(validatePlanLine({ ...ok, plannedAmount: "0" }).plannedAmount).toBe("errors.amountPositive");
    expect(validatePlanLine({ ...ok, plannedAmount: "10.555" }).plannedAmount).toBe("errors.amountPositive");
    expect(validatePlanLine({ ...ok, year: "26" }).year).toBe("errors.yearInvalid");
    expect(validatePlanLine({ ...ok, quarter: "Q5" }).quarter).toBe("errors.required");
  });
});

// PR-01, PLN-01 AC4
describe("purchase requisition", () => {
  it("AC5: a draft may be saved without lines; AC6: Submit needs one", () => {
    expect(validateRequisition({ planLineId: "p", lines: [] }, TODAY, false)).toEqual({});
    expect(validateRequisition({ planLineId: "p", lines: [] }, TODAY, true)).toEqual({ form: "errors.lineRequired" });
    expect(validateRequisition({ planLineId: "", lines: [] }, TODAY, false)).toEqual({ planLineId: "errors.required" });
  });

  it("every existing line is checked on Save too, with the message on that line", () => {
    const errors = validateRequisition({ planLineId: "p", lines: [line(), line({ quantity: "0", price: "1.234" })] }, TODAY, false);
    expect(hasErrors(errors)).toBe(true);
    expect(errors.lines?.[0]).toEqual({});
    expect(errors.lines?.[1]).toEqual({ quantity: "errors.quantityPositive", price: "errors.pricePositive" });
  });

  it("AC3: delivery date earlier than tomorrow -> 'Delivery date must be in the future'", () => {
    expect(nextDay(TODAY)).toBe("2026-11-12");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    const check = (deliveryDate: string) =>
      validateRequisition({ planLineId: "p", lines: [line({ deliveryDate })] }, TODAY, true).lines?.[0]?.deliveryDate;
    expect(check(TODAY)).toBe("errors.deliveryDateFuture");
    expect(check("2026-11-12")).toBeUndefined();
    expect(check("")).toBe("errors.required");
  });

  it("AC2: specification up to 2,000 characters, item and place required", () => {
    const errors = validateRequisition(
      { planLineId: "p", lines: [line({ specification: "x".repeat(2001), itemId: "", deliveryPlaceId: "" })] },
      TODAY,
      true,
    );
    expect(errors.lines?.[0]).toEqual({
      itemId: "errors.required",
      deliveryPlaceId: "errors.required",
      specification: "errors.specificationTooLong",
    });
  });

  it("AC4: estimated value = sum of quantity × unit price (demo: 500 bags × 100.00 + 100 L × 40.00)", () => {
    expect(estimatedValue([line(), line({ quantity: "100", price: "40.00" })])).toBe(54000);
    expect(estimatedValue([line({ quantity: "", price: "5" })])).toBe(0);
    expect(estimatedValue([line({ quantity: "3", price: "0.10" })])).toBe(0.3);
  });

  it("PLN-01 AC4: plan excess is value minus remaining, never below 0", () => {
    expect(planExcess(54000, 500000)).toBe(0);
    expect(planExcess(510000, 500000)).toBe(10000);
    expect(planExcess(1000.1, 1000)).toBe(0.1);
  });

  it("parses the hidden lines field defensively and maps to the database rows", () => {
    expect(parseLines("not json")).toEqual([]);
    expect(parseLines(JSON.stringify([{ itemId: " a ", quantity: 2 }]))[0]).toEqual({ ...EMPTY_LINE, itemId: "a", quantity: "2" });
    expect(toRpcLines([line({ specification: "  " })])[0]).toEqual({
      item_id: "item-1",
      quantity: 500,
      estimated_unit_price: 100,
      delivery_date: "2026-12-01",
      delivery_place_id: "place-1",
      specification: null,
    });
  });
});
