"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ActionDialog } from "@/components/action-dialog";
import type { DecisionState } from "@/components/decision-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: DecisionState, formData: FormData) => Promise<DecisionState>;

export const SEND_FORM_ID = "send-to-committee";

/**
 * RFQ-05 AC6: Send to committee. The low-competition reason textarea on the page belongs to this form
 * (form attribute), so the reason travels with the click (RFQ-05 AC5).
 */
export function SendToCommittee({ action }: { action: Action }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form id={SEND_FORM_ID} action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" disabled={pending} data-testid="send-to-committee">
        {pending ? t("common.saving") : t("sourcing.comparison.sendToCommittee")}
      </Button>
      {state.error && (
        <p role="alert" className="max-w-xs text-right text-xs font-medium text-destructive" data-testid="send-error">
          {t(state.error, state.errorParams)}
        </p>
      )}
    </form>
  );
}

/** RFQ-08 AC1, AC6: chosen vendors (all by default), deadline (default from the setting) and a message. */
export function RequestFinalOffer({
  action,
  vendors,
  defaultDeadline,
  used,
}: {
  action: Action;
  vendors: { vendorId: string; name: string }[];
  defaultDeadline: string;
  used: boolean;
}) {
  const t = useTranslations();
  if (used) {
    return (
      <Button type="button" variant="outline" disabled title={t("errors.finalOfferUsed")} data-testid="final-offer-used">
        {t("sourcing.comparison.finalOfferRequest.button")}
      </Button>
    );
  }
  return (
    <ActionDialog
      action={action}
      trigger={t("sourcing.comparison.finalOfferRequest.button")}
      title={t("sourcing.comparison.finalOfferRequest.title")}
      submitLabel={t("sourcing.comparison.finalOfferRequest.send")}
      testId="request-final-offer"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("sourcing.comparison.finalOfferRequest.vendors")}</legend>
        {vendors.map((v) => (
          <label key={v.vendorId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="vendors" value={v.vendorId} defaultChecked className="size-4 accent-primary" />
            {v.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="final-offer-deadline">
          {t("sourcing.comparison.finalOfferRequest.deadline")}
          <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <Input id="final-offer-deadline" name="deadline" type="datetime-local" defaultValue={defaultDeadline} required />
        <p className="text-xs text-muted-foreground">{t("sourcing.deadlineHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="final-offer-message">{t("sourcing.comparison.finalOfferRequest.message")}</Label>
        <Textarea id="final-offer-message" name="message" rows={3} />
      </div>
    </ActionDialog>
  );
}
