import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { clockOffset, isUrgent, serverTime, timeLeft } from "@/lib/deadline";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const HOUR = 3_600_000;
const MIN = 60_000;
const NOW = Date.parse("2026-11-16T08:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("RFQ-11 timeLeft boundaries", () => {
  it("24 hours or more: days and hours", () => {
    expect(timeLeft(at(24 * HOUR), NOW)).toEqual({ kind: "days", days: 1, hours: 0 });
    expect(timeLeft(at(52 * HOUR + 10 * MIN), NOW)).toEqual({ kind: "days", days: 2, hours: 4 });
  });
  it("just under 24 hours: hours and minutes, urgent (amber)", () => {
    const left = timeLeft(at(24 * HOUR - 1), NOW);
    expect(left).toEqual({ kind: "hours", hours: 23, minutes: 59 });
    expect(isUrgent(left)).toBe(true);
    expect(timeLeft(at(5 * HOUR + 12 * MIN), NOW)).toEqual({ kind: "hours", hours: 5, minutes: 12 });
  });
  it("1 hour is still hours; under 1 hour is minutes", () => {
    expect(timeLeft(at(HOUR), NOW)).toEqual({ kind: "hours", hours: 1, minutes: 0 });
    expect(timeLeft(at(HOUR - 1), NOW)).toEqual({ kind: "minutes", minutes: 59 });
    expect(timeLeft(at(42 * MIN), NOW)).toEqual({ kind: "minutes", minutes: 42 });
    expect(timeLeft(at(5_000), NOW)).toEqual({ kind: "minutes", minutes: 1 });
  });
  it("0 and negative: passed", () => {
    expect(timeLeft(at(0), NOW)).toEqual({ kind: "passed" });
    expect(timeLeft(at(-1), NOW)).toEqual({ kind: "passed" });
    expect(timeLeft(at(-3 * HOUR), NOW)).toEqual({ kind: "passed" });
    expect(isUrgent({ kind: "passed" })).toBe(false);
    expect(isUrgent({ kind: "days", days: 2, hours: 4 })).toBe(false);
  });
});

describe("RFQ-11 uses the server time", () => {
  it("the offset corrects a device clock that is two days ahead", () => {
    const deviceNow = NOW + 48 * HOUR;
    const offset = clockOffset(new Date(NOW), deviceNow);
    expect(offset).toBe(-48 * HOUR);
    // a minute later on the device is a minute later on the server clock
    expect(serverTime(offset, deviceNow + MIN)).toBe(NOW + MIN);
    expect(timeLeft(at(5 * HOUR), serverTime(offset, deviceNow))).toEqual({ kind: "hours", hours: 5, minutes: 0 });
    // the raw device clock would have called the deadline passed
    expect(timeLeft(at(5 * HOUR), deviceNow)).toEqual({ kind: "passed" });
  });

  it("the component renders from the server time passed in, not from the clock of the machine", async () => {
    const { DeadlineCountdown } = await import("@/components/deadline-countdown");
    const html = (deadline: string, kind?: "closes" | "finalOffer" | "voting") =>
      renderToStaticMarkup(
        <NextIntlClientProvider locale="en" messages={messages}>
          <DeadlineCountdown deadline={deadline} serverNow={new Date(NOW).toISOString()} kind={kind} />
        </NextIntlClientProvider>,
      );
    const days = html(at(52 * HOUR + 10 * MIN));
    expect(days).toContain("Closes in 2 days 4 hours");
    expect(days).toContain(`<time dateTime="${at(52 * HOUR + 10 * MIN)}">`);
    expect(days).toContain("18 Nov 2026, 16:10"); // Asia/Baku is UTC+4
    expect(html(at(5 * HOUR + 12 * MIN))).toContain("Closes in 5 h 12 min");
    expect(html(at(42 * MIN))).toContain("Closes in 42 min");
    expect(html(at(-MIN))).toContain("Deadline passed");
    expect(html(at(3 * HOUR), "finalOffer")).toContain("Final offer closes in 3 h 0 min");
    expect(html(at(3 * HOUR), "voting")).toContain("Voting closes in 3 h 0 min");
    expect(html(at(5 * HOUR))).not.toMatch(/aria-live/);
    expect(html(at(30 * HOUR))).not.toMatch(/aria-live/);
  });
});
