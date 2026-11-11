"use client";

import { useActionState, useState, type ReactNode } from "react";
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
import type { EntryState } from "./entry-dialog";

/**
 * A confirmed one-click action (delete an entry, close a plan line). The refusal from the server
 * ("This entry is in use. Deactivate it instead", "Remove or move its child categories first")
 * stays in the dialog.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  testId,
  destructive = true,
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  testId: string;
  destructive?: boolean;
  action: (prev: EntryState, formData: FormData) => Promise<EntryState>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt !== null && (openedAt === (state.attempt ?? 0) || !state.saved);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={destructive ? "text-destructive hover:text-destructive" : undefined}
        onClick={() => setOpenedAt(state.attempt ?? 0)}
        data-testid={testId}
      >
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpenedAt(null)}>
        <DialogContent>
          <form action={formAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {openedAt !== (state.attempt ?? 0) && state.errors.form && (
              <p role="alert" className="text-sm font-medium text-destructive" data-testid="confirm-error">
                {t(state.errors.form)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenedAt(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} data-testid="confirm-submit">
                {pending ? t("common.saving") : confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
