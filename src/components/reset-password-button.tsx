"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { resetPassword, type ResetState } from "@/app/actions/password";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const INITIAL: ResetState = { error: null };

/**
 * PLT-03 AC4, AC5: "Reset password" with a confirmation, then the temporary password once, with a Copy button.
 * The dialog is remounted when it closes, so the password leaves the browser's memory with it.
 */
export function ResetPasswordButton({ userId, vendorId, name }: { userId?: string; vendorId?: string; name: string }) {
  const [round, setRound] = useState(0);
  return <ResetDialog key={round} userId={userId} vendorId={vendorId} name={name} onClosed={() => setRound((r) => r + 1)} />;
}

function ResetDialog({ userId, vendorId, name, onClosed }: { userId?: string; vendorId?: string; name: string; onClosed: () => void }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(resetPassword, INITIAL);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const revealed = Boolean(state.tempPassword);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.tempPassword ?? "");
      setCopied(true);
    } catch {
      // the password stays selectable on screen
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="reset-password">
        <KeyRound className="size-4" aria-hidden />
        {t("password.reset.button")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !v && (revealed ? onClosed() : setOpen(false))}>
        <DialogContent>
          {revealed ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("password.reset.revealTitle")}</DialogTitle>
                <DialogDescription>{t("password.reset.reveal")}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-3">
                <code className="surface-solid flex-1 px-3 py-2 font-mono text-base tracking-wide select-all" data-testid="temp-password">
                  {state.tempPassword}
                </code>
                <Button type="button" variant="outline" onClick={copy} data-testid="copy-password">
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? t("password.reset.copied") : t("password.reset.copy")}
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={onClosed} data-testid="reset-done">
                  {t("password.reset.done")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("password.reset.title", { name })}</DialogTitle>
                <DialogDescription>{t("password.reset.description")}</DialogDescription>
              </DialogHeader>
              {userId && <input type="hidden" name="userId" value={userId} />}
              {vendorId && <input type="hidden" name="vendorId" value={vendorId} />}
              {state.error && (
                <p role="alert" className="text-xs font-medium text-destructive" data-testid="reset-error">
                  {t(state.error)}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending} data-testid="reset-confirm">
                  {pending ? t("common.saving") : t("password.reset.confirm")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
