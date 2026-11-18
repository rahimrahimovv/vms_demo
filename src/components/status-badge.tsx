import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/status";

const DOT_CLASSES: Record<StatusTone, string> = {
  green: "bg-(--dot-green)",
  blue: "bg-(--dot-blue)",
  amber: "bg-(--dot-amber)",
  grey: "bg-(--dot-grey)",
  red: "bg-(--dot-red)",
};

/** The 6 px dot of a status badge. Decoration only: the badge always carries the status in words. */
function Dot({ tone }: { tone: StatusTone }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])} />;
}

/** An outline badge with a coloured dot, for texts that are not a status name (it always carries its words). */
export function ToneChip({ tone, className, children }: { tone: StatusTone; className?: string; children: ReactNode }) {
  return (
    <Badge variant={tone === "red" ? "destructive" : "outline"} className={className}>
      {tone === "red" ? null : <Dot tone={tone} />}
      {children}
    </Badge>
  );
}

/** Status badge: an outline badge with a dot (red = the destructive badge); label from messages "status.<STATUS>". */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const label = t.has(status) ? t(status) : status;
  const tone = statusTone(status);
  return (
    <Badge data-status={status} variant={tone === "red" ? "destructive" : "outline"} className={className}>
      {tone === "red" ? null : <Dot tone={tone} />}
      {label}
    </Badge>
  );
}
