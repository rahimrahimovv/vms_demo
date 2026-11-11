"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ApplyState } from "@/app/(app)/vendor/categories/actions";
import type { CategoryNode } from "@/lib/categories";
import { ACCEPT_ATTRIBUTE } from "@/lib/files/rules";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CategoryChoice = CategoryNode & {
  /** PENDING or QUALIFIED (not expired) in this category: not selectable (REG-03 AC3). */
  blocked: boolean;
  status: string | null;
  validUntil: string | null;
  reason: string | null;
};

/** REG-03: tick categories, attach a licence where the category (or a parent) requires one, Apply. */
export function CategoryApplyForm({
  categories,
  action,
}: {
  categories: CategoryChoice[];
  action: (prev: ApplyState, formData: FormData) => Promise<ApplyState>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null, perCategory: {}, created: 0 });

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="category-form">
      {state.error && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      )}
      {state.created > 0 && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("categories.applied", { count: state.created })}</AlertDescription>
        </Alert>
      )}
      <div key={state.attempt ?? 0} className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-[1fr_16rem_14rem] gap-4 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("categories.columns.category")}</span>
          <span>{t("categories.columns.licence")}</span>
          <span>{t("categories.columns.status")}</span>
        </div>
        <ul className="divide-y">
          {categories.map((c) => (
            <li key={c.id} className="grid grid-cols-[1fr_16rem_14rem] items-center gap-4 px-4 py-2.5" data-testid="category-row" data-category={c.name}>
              <label
                className={cn("flex items-center gap-2 text-sm", c.blocked && "text-muted-foreground")}
                style={{ paddingLeft: `${c.depth * 1.5}rem` }}
              >
                <input type="checkbox" name="category" value={c.id} disabled={c.blocked} className="size-4 accent-primary" />
                <span className={cn(c.depth === 0 && "font-medium")}>{c.name}</span>
              </label>
              <div className="flex flex-col gap-1">
                {c.needsLicence && !c.blocked ? (
                  <>
                    <Input name={`licence-${c.id}`} type="file" accept={ACCEPT_ATTRIBUTE} aria-label={t("categories.licenceFor", { name: c.name })} />
                    <span className="text-xs text-muted-foreground">{t("categories.licenceRequired")}</span>
                  </>
                ) : null}
                {state.perCategory[c.id] && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {t(state.perCategory[c.id])}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-0.5 text-xs">
                {c.status && <StatusBadge status={c.status} className="self-start" />}
                {c.status === "QUALIFIED" && c.validUntil && (
                  <span className="text-muted-foreground">{t("categories.validUntil", { date: c.validUntil })}</span>
                )}
                {c.status === "REJECTED" && c.reason && <span className="text-muted-foreground">{c.reason}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="apply">
          {pending ? t("common.saving") : t("categories.apply")}
        </Button>
      </div>
    </form>
  );
}
