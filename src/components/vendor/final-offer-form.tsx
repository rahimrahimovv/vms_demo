"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { price } from "@/lib/sourcing/comparison";
import type { VendorFormState } from "@/app/(app)/vendor/invitations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FinalOfferLine = { id: string; item: string; unit: string; quantity: number; previous: number; final: number | null };

/**
 * RFQ-08 AC2-AC3 for a chosen vendor: its previous prices, a new price per line (never higher), or keep them all.
 * Other proposal fields stay as submitted. Prices are entered as in the proposal (with or without VAT).
 */
export function FinalOfferForm({
  lines,
  deadline,
  message,
  respondedAt,
  action,
}: {
  lines: FinalOfferLine[];
  deadline: string;
  message: string | null;
  respondedAt: string | null;
  action: (prev: VendorFormState, formData: FormData) => Promise<VendorFormState>;
}) {
  const t = useTranslations();
  const [state, setState] = useState<VendorFormState>({ errors: {} });
  const [pending, start] = useTransition();
  // a plain submit handler, not a form action: React would reset the typed prices after a refused save
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    start(async () => setState(await action(state, fd)));
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-card p-5" data-testid="final-offer-form">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{t("proposal.finalOffer.title")}</h3>
        <p className="text-sm">{t("proposal.finalOffer.intro", { deadline: formatDateTime(deadline) })}</p>
        {message && <p className="text-sm text-muted-foreground">{t("proposal.finalOffer.message", { message })}</p>}
        {respondedAt && <p className="text-xs text-emerald-700" data-testid="final-offer-responded">{t("proposal.finalOffer.responded", { date: formatDateTime(respondedAt) })}</p>}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">{t("items.columns.name")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("requisitions.fields.quantity")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("proposal.finalOffer.previous")}</th>
            <th className="w-44 px-3 py-2 text-right font-medium">{t("proposal.finalOffer.newPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t" data-testid="final-offer-line">
              <td className="px-3 py-2">{l.item}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {l.quantity} {l.unit}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{price(l.previous)}</td>
              <td className="px-3 py-2">
                <input type="hidden" name={`previous-${l.id}`} value={l.previous} />
                <Input
                  name={`final-${l.id}`}
                  inputMode="decimal"
                  defaultValue={l.final !== null ? l.final.toFixed(2) : ""}
                  aria-label={`${t("proposal.finalOffer.newPrice")} ${l.item}`}
                  aria-invalid={Boolean(state.errors[`final-${l.id}`])}
                  className="text-right tabular-nums"
                />
                {state.errors[`final-${l.id}`] && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">{t(state.errors[`final-${l.id}`])}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">{t("proposal.finalOffer.hint")}</p>
      {state.errors.form && <p role="alert" className="text-xs font-medium text-destructive">{t(state.errors.form)}</p>}
      {state.saved && <p className="text-xs text-emerald-700">{t("proposal.finalOffer.saved")}</p>}
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="submit" disabled={pending} data-testid="submit-final-offer">
          {t("proposal.finalOffer.submit")}
        </Button>
        <Button type="submit" name="intent" value="keep" variant="outline" disabled={pending} data-testid="keep-prices">
          {t("proposal.finalOffer.keep")}
        </Button>
      </div>
    </form>
  );
}
