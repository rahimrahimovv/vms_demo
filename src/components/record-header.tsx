import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";

/** Record page header: number/title, status badge, main actions on the right (CLAUDE.md Design). */
export function RecordHeader({
  title,
  subtitle,
  status,
  actions,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b pb-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {status && <StatusBadge status={status} />}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
