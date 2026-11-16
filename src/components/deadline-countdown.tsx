"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { clockOffset, isUrgent, serverTime, timeLeft, type TimeLeft } from "@/lib/deadline";
import { ToneChip } from "@/components/status-badge";

export type CountdownKind = "closes" | "finalOffer" | "voting";

/** The "Closes in ..." text for a state, from messages "deadline.*". */
function useTimeLeftText(left: TimeLeft, kind: CountdownKind): string {
  const t = useTranslations("deadline");
  if (left.kind === "passed") return t("passed");
  const value =
    left.kind === "days"
      ? t("valueDays", { days: left.days, hours: left.hours })
      : left.kind === "hours"
        ? t("valueHours", { hours: left.hours, minutes: left.minutes })
        : t("valueMinutes", { minutes: left.minutes });
  return t(`${kind}`, { value });
}

/**
 * RFQ-11: the absolute deadline (Asia/Baku, inside a time element with the full datetime) followed by the time left.
 * `serverNow` is the server's clock when the page was rendered: the first render uses it and the component computes
 * the offset to the device clock once, so a wrong device clock does not matter. It updates every minute without
 * announcing itself (no aria-live). When the deadline passes it refreshes the page data once, so that a vendor's form
 * turns read-only and a status that follows the deadline is shown.
 */
export function DeadlineCountdown({
  deadline,
  serverNow,
  kind = "closes",
  className,
}: {
  deadline: string;
  serverNow: string;
  kind?: CountdownKind;
  className?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const offset = useRef<number | null>(null);
  const wasOpen = useRef(timeLeft(deadline, new Date(serverNow)).kind !== "passed");

  useEffect(() => {
    offset.current = clockOffset(serverNow, Date.now());
    const tick = () => setNow(serverTime(offset.current ?? 0, Date.now()));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [serverNow]);

  const left = timeLeft(deadline, now);
  useEffect(() => {
    if (left.kind === "passed" && wasOpen.current) {
      wasOpen.current = false;
      router.refresh();
    }
  }, [left.kind, router]);

  const text = useTimeLeftText(left, kind);
  return (
    <span className={className} data-testid="deadline-countdown">
      <time dateTime={deadline}>{formatDateTime(deadline)}</time>
      <span aria-hidden="true"> · </span>
      {isUrgent(left) ? (
        <ToneChip tone="amber" className="ml-1.5">
          {text}
        </ToneChip>
      ) : (
        <span className="ml-1.5 text-muted-foreground">{text}</span>
      )}
    </span>
  );
}
