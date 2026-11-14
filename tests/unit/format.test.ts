import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";

// NFR-005: Asia/Baku (UTC+4), "06 Nov 2026", "60,000.00 AZN".
describe("formatDate / formatDateTime (Asia/Baku)", () => {
  it("formats like 06 Nov 2026", () => {
    expect(formatDate("2026-11-06T08:00:00Z")).toBe("06 Nov 2026");
  });

  it("uses Baku time, not UTC: 20:30 UTC is already the next day in Baku", () => {
    expect(formatDate("2026-11-06T20:30:00Z")).toBe("07 Nov 2026");
    expect(formatDateTime("2026-11-06T20:30:00Z")).toBe("07 Nov 2026, 00:30");
  });

  it("prints Sep, never Sept", () => {
    expect(formatDate("2026-09-15T10:00:00Z")).toBe("15 Sep 2026");
  });

  it("matches the backlog voting example time", () => {
    expect(formatDateTime("2026-11-12T06:00:00Z")).toBe("12 Nov 2026, 10:00");
  });
});

describe("formatAmount", () => {
  it.each([
    [60000, "60,000.00 AZN"],
    ["60000.00", "60,000.00 AZN"],
    ["49999.99", "49,999.99 AZN"],
    [440000, "440,000.00 AZN"],
    [0.5, "0.50 AZN"],
  ])("%s -> %s", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
});

import { formatAge } from "@/lib/format";

describe("formatAge", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("uses days, hours and minutes", () => {
    expect(formatAge("2026-11-13T12:00:00Z", now)).toBe("1 day ago");
    expect(formatAge("2026-11-14T07:00:00Z", now)).toBe("5 hours ago");
    expect(formatAge("2026-11-14T11:30:00Z", now)).toBe("30 minutes ago");
  });
  it("never goes below one minute", () => {
    expect(formatAge("2026-11-14T12:00:00Z", now)).toBe("1 minute ago");
  });
});
