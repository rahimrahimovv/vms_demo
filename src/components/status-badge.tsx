import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/status";

const TONE_CLASSES: Record<StatusTone, string> = {
  grey: "bg-(--tone-grey-bg) text-(--tone-grey-fg)",
  sky: "bg-(--tone-sky-bg) text-(--tone-sky-fg)",
  amber: "bg-(--tone-amber-bg) text-(--tone-amber-fg)",
  green: "bg-(--tone-green-bg) text-(--tone-green-fg)",
  red: "bg-(--tone-red-bg) text-(--tone-red-fg)",
};

/** Status badge; colour by CLAUDE.md Design, label from messages "status.<STATUS>". */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const label = t.has(status) ? t(status) : status;
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[statusTone(status)],
        className,
      )}
    >
      {label}
    </span>
  );
}
