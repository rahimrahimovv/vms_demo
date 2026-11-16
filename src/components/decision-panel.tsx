"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type DecisionState = { error: string | null; errorParams?: Record<string, string>; attempt?: number };

export type DecisionOption = {
  /** Sent as "decision" */
  value: string;
  label: string;
  variant?: "default" | "outline" | "destructive";
  /** Comment or reason required (dialog), optional (dialog), or none (direct). */
  comment: "required" | "optional" | "none";
  commentLabel?: string;
  confirmTitle?: string;
  /** An extra input in the dialog, sent under `name` (e.g. the new deadline when extending). */
  field?: { name: string; label: string; type: "datetime-local" };
};

/**
 * Decision buttons on a record header. Each decision with a comment opens a dialog; the server
 * action re-checks role, status and the comment. NFR-006: buttons are disabled while saving.
 */
export function DecisionPanel({
  action,
  options,
}: {
  action: (prev: DecisionState, formData: FormData) => Promise<DecisionState>;
  options: DecisionOption[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  // The dialog closes by itself once the server answers without an error (attempt changes).
  const [opened, setOpened] = useState<{ option: DecisionOption; since: number } | null>(null);
  const open =
    opened && (opened.since === (state.attempt ?? 0) || Boolean(state.error)) ? opened.option : null;
  const setOpen = (option: DecisionOption | null) =>
    setOpened(option ? { option, since: state.attempt ?? 0 } : null);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {options.map((o) =>
          o.comment === "none" ? (
            <form key={o.value} action={formAction}>
              <input type="hidden" name="decision" value={o.value} />
              <Button type="submit" variant={o.variant ?? "default"} disabled={pending} data-testid={`decision-${o.value}`}>
                {o.label}
              </Button>
            </form>
          ) : (
            <Button
              key={o.value}
              variant={o.variant ?? "default"}
              disabled={pending}
              onClick={() => setOpen(o)}
              data-testid={`decision-${o.value}`}
            >
              {o.label}
            </Button>
          ),
        )}
      </div>
      {state.error && !open && (
        <p role="alert" className="text-xs font-medium text-destructive" data-testid="decision-error">
          {t(state.error, state.errorParams)}
        </p>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          {open && (
            <form action={formAction} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{open.confirmTitle ?? open.label}</DialogTitle>
                <DialogDescription className="sr-only">{open.label}</DialogDescription>
              </DialogHeader>
              <input type="hidden" name="decision" value={open.value} />
              {open.field && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="decision-field">
                    {open.field.label}
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <Input id="decision-field" name={open.field.name} type={open.field.type} required />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-comment">
                  {open.commentLabel ?? t("decision.comment")}
                  {open.comment === "required" && (
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  )}
                </Label>
                <Textarea id="decision-comment" name="comment" rows={4} required={open.comment === "required"} />
                {state.error && (
                  <p role="alert" className="text-xs font-medium text-destructive" data-testid="decision-error">
                    {t(state.error, state.errorParams)}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" variant={open.variant ?? "default"} disabled={pending} data-testid="decision-confirm">
                  {pending ? t("common.saving") : t("decision.confirm")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
