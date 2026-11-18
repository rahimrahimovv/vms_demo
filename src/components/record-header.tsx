import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";

/** Record page header: number/title, status badge, main actions on the right (CLAUDE.md Design). */
export function RecordHeader({
  title,
  subtitle,
  tag,
  status,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Type pill shown before the status badge (e.g. the sourcing type), as in the boards. */
  tag?: string;
  status?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl leading-8 font-semibold">{title}</h2>
          {tag && (
            <Badge variant="secondary">{tag}</Badge>
          )}
          {status && <StatusBadge status={status} />}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
