"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * A right side panel (glass, 440 px) that opens from a trigger. Built on the shared dialog: Esc and the close button close it,
 * focus stays inside while it is open and returns to the trigger.
 */
export function SidePanel({
  title,
  trigger,
  asButton = false,
  testId,
  children,
}: {
  title: string;
  trigger: ReactNode;
  /** a 36 px pill button (the header) instead of a small text link (a card's "Show all") */
  asButton?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {asButton ? (
          <Button type="button" variant="outline" data-testid={testId}>
            {trigger}
          </Button>
        ) : (
          <button
            type="button"
            className="rounded-md px-1 py-0.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            data-testid={testId}
          >
            {trigger}
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        className="top-3 right-3 bottom-3 left-auto h-auto w-[440px] max-w-[440px] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-[440px]"
        data-testid="side-panel"
      >
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export type ActivityEntry = { id: string; at: string; node: ReactNode };

const FIRST = 6;

/** The history inside the panel: the latest entries, "Show all" for the rest. */
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  const t = useTranslations("vendorCard");
  const [all, setAll] = useState(false);
  if (entries.length === 0) return <p className="text-[13px] text-muted-foreground">{t("empty.activity")}</p>;
  const shown = all ? entries : entries.slice(0, FIRST);
  return (
    <div className="flex flex-col gap-2">
      <ul data-testid="activity-list">
        {shown.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 border-t border-[rgba(23,38,43,0.08)] py-2 text-[13px]">
            <span className="text-xs text-muted-foreground tabular-nums">{e.at}</span>
            {e.node}
          </li>
        ))}
      </ul>
      {entries.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="self-start rounded-md px-1 py-0.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-testid="activity-toggle"
        >
          {all ? t("showLess") : t("showAll")}
        </button>
      )}
    </div>
  );
}
