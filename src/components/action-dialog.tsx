"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DecisionState } from "@/components/decision-panel";

/**
 * A button that opens a dialog with a small form (reason, justification, extra cost ...). The server action
 * re-checks everything; the dialog closes by itself once the action answers without an error. NFR-006: the
 * submit button is disabled while the request runs. `renderTrigger` replaces the button (e.g. a radio).
 */
export function ActionDialog({
  action,
  trigger,
  renderTrigger,
  triggerVariant = "outline",
  triggerSize = "default",
  triggerClassName,
  title,
  description,
  hidden,
  submitLabel,
  submitVariant = "default",
  children,
  testId,
}: {
  action: (prev: DecisionState, formData: FormData) => Promise<DecisionState>;
  trigger?: ReactNode;
  renderTrigger?: (open: () => void, pending: boolean) => ReactNode;
  triggerVariant?: "default" | "outline" | "destructive" | "link" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "xs";
  triggerClassName?: string;
  title: string;
  description?: string;
  hidden?: Record<string, string>;
  submitLabel?: string;
  submitVariant?: "default" | "destructive";
  children?: ReactNode;
  testId?: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  // open since a given answer count; closes once a newer answer arrives without an error
  const [since, setSince] = useState<number | null>(null);
  const open = since !== null && (since === (state.attempt ?? 0) || Boolean(state.error));
  const show = () => setSince(state.attempt ?? 0);

  return (
    <>
      {renderTrigger
        ? renderTrigger(show, pending)
        : trigger && (
            <Button
              type="button"
              variant={triggerVariant}
              size={triggerSize}
              className={triggerClassName}
              disabled={pending}
              onClick={show}
              data-testid={testId}
            >
              {trigger}
            </Button>
          )}
      <Dialog open={open} onOpenChange={(v) => (v ? show() : setSince(null))}>
        <DialogContent>
          <form action={formAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
            </DialogHeader>
            {Object.entries(hidden ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {children}
            {state.error && (
              <p role="alert" className="text-xs font-medium text-destructive" data-testid="dialog-error">
                {t(state.error, state.errorParams)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSince(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={submitVariant} disabled={pending} data-testid="dialog-confirm">
                {pending ? t("common.saving") : (submitLabel ?? t("decision.confirm"))}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A form whose single submit button runs a server action directly (no dialog); shows the error below. */
export function ActionButton({
  action,
  label,
  hidden,
  variant = "outline",
  size = "default",
  testId,
  className,
}: {
  action: (prev: DecisionState, formData: FormData) => Promise<DecisionState>;
  label: string;
  hidden?: Record<string, string>;
  variant?: "default" | "outline" | "destructive" | "link";
  size?: "default" | "sm" | "xs";
  testId?: string;
  className?: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={pending} data-testid={testId}>
        {label}
      </Button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          {t(state.error, state.errorParams)}
        </p>
      )}
    </form>
  );
}
