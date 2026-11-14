"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, FileText, Trash2 } from "lucide-react";
import { SELECT_CLASS } from "@/components/admin/entry-dialog";
import { StagedFileInput } from "@/components/file-field";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SourcingFormState } from "@/app/(app)/sourcing/actions";

type Option = { value: string; label: string };
type Invitee = { vendorId: string; name: string; grade: string | null; excluded: boolean };

export type SourcingFormValues = {
  deadline: string; // datetime-local, Baku time
  incoterm: string;
  namedPlace: string;
  deliveryMode: string;
  paymentTerm: string;
  techDoc: boolean;
  justification: string;
};

/**
 * DRAFT sourcing (RFQ-01 AC4-AC7, RFQ-06 AC2-AC3): deadline, required terms from the dictionaries, Tender
 * technical document flag, SSP justification, and the invitation list the specialist may trim.
 */
export function SourcingForm({
  action,
  type,
  minimum,
  initial,
  incoterms,
  places,
  modes,
  paymentTerms,
  invitees,
  justificationFiles,
  removeFile,
}: {
  action: (prev: SourcingFormState, formData: FormData) => Promise<SourcingFormState>;
  type: "RFQ" | "TENDER" | "SSP";
  minimum: number;
  initial: SourcingFormValues;
  incoterms: Option[];
  places: Option[];
  modes: Option[];
  paymentTerms: Option[];
  invitees: Invitee[];
  justificationFiles: { id: string; file_name: string }[];
  removeFile: (fileId: string) => Promise<void>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [excluded, setExcluded] = useState(() => new Set(invitees.filter((i) => i.excluded).map((i) => i.vendorId)));
  const remaining = invitees.length - excluded.size;
  const err = (key: string) => (state.errors[key] ? t(state.errors[key], state.params) : undefined);

  const toggle = (id: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (id: string, name: string, value: string, options: Option[]) => (
    <FormField id={id} label={t(`sourcing.fields.${name}`)} required error={err(name)}>
      <select id={id} name={name} defaultValue={value} required className={SELECT_CLASS} aria-invalid={Boolean(err(name))}>
        <option value="">{t("common.select")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="sourcing-form">
      {state.errors.form && (
        <Alert variant="destructive" data-testid="sourcing-form-error">
          <AlertDescription>{t(state.errors.form, state.params)}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert data-testid="sourcing-saved">
          <AlertDescription>{t("sourcing.saved")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-5">
          <FormField id="deadline" label={t("sourcing.fields.deadline")} required error={err("deadline")} hint={t("sourcing.deadlineHint")}>
            <Input id="deadline" name="deadline" type="datetime-local" defaultValue={initial.deadline} required />
          </FormField>
          {select("incoterm", "incoterm", initial.incoterm, incoterms)}
          {select("namedPlace", "namedPlace", initial.namedPlace, places)}
          {select("deliveryMode", "deliveryMode", initial.deliveryMode, modes)}
          {select("paymentTerm", "paymentTerm", initial.paymentTerm, paymentTerms)}
          {type === "TENDER" && (
            <FormField id="techDoc" label={t("sourcing.fields.techDoc")}>
              <select id="techDoc" name="techDoc" defaultValue={initial.techDoc ? "yes" : "no"} className={SELECT_CLASS}>
                <option value="yes">{t("common.yes")}</option>
                <option value="no">{t("common.no")}</option>
              </select>
            </FormField>
          )}
        </CardContent>
      </Card>

      {type === "SSP" && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField id="justification" label={t("sourcing.fields.justification")} hint={t("sourcing.justificationHint")}>
              <Textarea id="justification" name="justification" rows={4} defaultValue={initial.justification} />
            </FormField>
            <FormField id="justificationFile" label={t("sourcing.fields.justificationFile")} error={err("justificationFile")} hint={t("files.hint")}>
              <StagedFileInput id="justificationFile" name="justificationFile" invalid={Boolean(err("justificationFile"))} />
              {justificationFiles.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {justificationFiles.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-xs">
                      <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                      <a href={`/api/files/${f.id}`} className="text-primary hover:underline">
                        {f.file_name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3" data-testid="invitee-list">
        <h3 className="text-base font-semibold">{t("sourcing.invitees.title")}</h3>
        {type !== "SSP" && remaining < minimum && (
          <Alert className="surface-warning" data-testid="below-minimum-warning">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertDescription>{t("sourcing.invitees.belowMinimum", { count: remaining, minimum })}</AlertDescription>
          </Alert>
        )}
        {invitees.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("errors.noQualifiedVendors")}</p>
        ) : (
          <ul className="surface-solid divide-y">
            {invitees.map((i) => (
              <li key={i.vendorId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {type !== "SSP" && (
                  <>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={!excluded.has(i.vendorId)}
                      onChange={() => toggle(i.vendorId)}
                      aria-label={t("sourcing.invitees.invite", { name: i.name })}
                    />
                    {excluded.has(i.vendorId) && <input type="hidden" name="excluded" value={i.vendorId} />}
                  </>
                )}
                <span className="font-medium">{i.name}</span>
                {i.grade && <span className="text-xs text-muted-foreground">{t("sourcing.invitees.grade", { grade: i.grade })}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" name="intent" value="save" variant="outline" disabled={pending} data-testid="sourcing-save">
          {pending ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="submit" name="intent" value="publish" disabled={pending} data-testid="sourcing-publish">
          {t("sourcing.publish")}
        </Button>
      </div>
    </form>
  );
}
