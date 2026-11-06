import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/status";

const TONE_CLASSES: Record<StatusTone, string> = {
  grey: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

/** Status badge; colour by CLAUDE.md Design, label from messages "status.<STATUS>". */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const label = t.has(status) ? t(status) : status;
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE_CLASSES[statusTone(status)],
        className,
      )}
    >
      {label}
    </span>
  );
}
