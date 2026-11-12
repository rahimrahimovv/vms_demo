"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SELECT_CLASS } from "@/components/admin/entry-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DecisionState } from "@/components/decision-panel";

/**
 * "Start sourcing" on an APPROVED PR (RFQ-01 AC1, RFQ-06 AC1): Competitive bidding (type by value) or Single
 * Source Purchase with exactly one vendor from the category's AVL.
 */
export function StartSourcing({
  action,
  vendors,
}: {
  action: (prev: DecisionState, formData: FormData) => Promise<DecisionState>;
  vendors: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"COMPETITIVE" | "SINGLE_SOURCE">("COMPETITIVE");
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="start-sourcing">
        {t("sourcing.start")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={formAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("sourcing.start")}</DialogTitle>
              <DialogDescription>{t("sourcing.startHint")}</DialogDescription>
            </DialogHeader>
            <FormField id="method" label={t("sourcing.fields.method")} required>
              <select
                id="method"
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                className={SELECT_CLASS}
              >
                <option value="COMPETITIVE">{t("sourcing.methods.COMPETITIVE")}</option>
                <option value="SINGLE_SOURCE">{t("sourcing.methods.SINGLE_SOURCE")}</option>
              </select>
            </FormField>
            {method === "SINGLE_SOURCE" && (
              <FormField id="sspVendor" label={t("sourcing.fields.sspVendor")} required>
                <select id="sspVendor" name="sspVendor" defaultValue="" className={SELECT_CLASS} data-testid="ssp-vendor">
                  <option value="">{t("common.select")}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {state.error && (
              <p role="alert" className="text-xs font-medium text-destructive" data-testid="start-sourcing-error">
                {t(state.error, state.errorParams)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending} data-testid="start-sourcing-confirm">
                {pending ? t("common.saving") : t("sourcing.start")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
