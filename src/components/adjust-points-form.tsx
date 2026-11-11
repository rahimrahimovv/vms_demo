"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdjustState } from "@/app/(app)/questionnaires/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** REG-05 AC4: points (0 to the question's maximum) and a required comment. */
export function AdjustPointsForm({
  action,
  points,
  maxPoints,
}: {
  action: (prev: AdjustState, formData: FormData) => Promise<AdjustState>;
  points: number;
  maxPoints: number;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  // Closes by itself once the server answers without an error.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt !== null && (openedAt === (state.attempt ?? 0) || Boolean(state.error));

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpenedAt(state.attempt ?? 0)} data-testid="adjust-open">
        {t("questionnaires.adjust")}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2" data-testid="adjust-form">
      <div className="flex items-center gap-2">
        <Input
          name="points"
          type="number"
          min={0}
          max={maxPoints}
          defaultValue={points}
          className="w-20"
          aria-label={t("questionnaires.columns.points")}
        />
        <Input name="comment" placeholder={t("decision.comment")} aria-label={t("decision.comment")} required />
        <Button type="submit" size="sm" disabled={pending}>
          {t("common.save")}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}
