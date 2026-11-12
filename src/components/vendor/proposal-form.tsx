"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SELECT_CLASS } from "@/components/admin/entry-dialog";
import { StagedFileInput } from "@/components/file-field";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate } from "@/lib/format";
import type { ProposalFormState } from "@/app/(app)/vendor/invitations/actions";

type Option = { value: string; label: string };
export type ProposalLine = {
  id: string;
  item: string;
  unit: string;
  quantity: number;
  deliveryDate: string;
  deliveryPlace: string;
  specification: string | null;
  price: string; // as entered, "" when no offer
};

/**
 * The vendor's proposal (RFQ-02 AC3-AC6): unit price per line, the four terms preset to the required values,
 * VAT basis, lead time, validity, comment and, for a Tender that asks for it, the technical document.
 */
export function ProposalForm({
  action,
  submitted,
  techDocRequired,
  lines,
  terms,
  options,
  technicalDocuments,
}: {
  action: (prev: ProposalFormState, formData: FormData) => Promise<ProposalFormState>;
  submitted: boolean;
  techDocRequired: boolean;
  lines: ProposalLine[];
  terms: {
    incoterm: string;
    namedPlace: string;
    deliveryMode: string;
    paymentTerm: string;
    includesVat: boolean;
    vatRate: string;
    deliveryDays: string;
    validityDays: string;
    comment: string;
  };
  options: { incoterms: Option[]; places: Option[]; modes: Option[]; paymentTerms: Option[] };
  technicalDocuments: { id: string; file_name: string }[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [includesVat, setIncludesVat] = useState(terms.includesVat);
  const [prices, setPrices] = useState(() => Object.fromEntries(lines.map((l) => [l.id, l.price])));
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const total = lines.reduce((sum, l) => {
    const price = Number(String(prices[l.id] ?? "").replace(",", "."));
    return price > 0 ? sum + price * l.quantity : sum;
  }, 0);

  const select = (name: string, value: string, list: Option[]) => (
    <FormField id={name} label={t(`proposal.fields.${name}`)} required error={err(name)}>
      <select id={name} name={name} defaultValue={value} required className={SELECT_CLASS}>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="proposal-form">
      {state.errors.form && (
        <Alert variant="destructive" data-testid="proposal-form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert data-testid="proposal-saved">
          <AlertDescription>{t(`proposal.saved.${state.saved}`)}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>{t("items.columns.name")}</TableHead>
              <TableHead className="text-right">{t("requisitions.fields.quantity")}</TableHead>
              <TableHead>{t("requisitions.fields.unit")}</TableHead>
              <TableHead>{t("requisitions.fields.deliveryDate")}</TableHead>
              <TableHead>{t("requisitions.fields.deliveryPlace")}</TableHead>
              <TableHead className="w-44 text-right">{t("proposal.fields.unitPrice")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id} data-testid="proposal-line">
                <TableCell>
                  {l.item}
                  {l.specification && <p className="max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">{l.specification}</p>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                <TableCell>{l.unit}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(l.deliveryDate)}</TableCell>
                <TableCell>{l.deliveryPlace}</TableCell>
                <TableCell className="text-right">
                  <Input
                    name={`price-${l.id}`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={prices[l.id] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                    aria-label={t("proposal.priceFor", { item: l.item })}
                    aria-invalid={Boolean(state.errors[`price-${l.id}`])}
                  />
                  {state.errors[`price-${l.id}`] && (
                    <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                      {t(state.errors[`price-${l.id}`])}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-right text-sm" data-testid="proposal-total">
        {t("proposal.total")}: <span className="font-semibold tabular-nums">{formatAmount(total)}</span>
      </p>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-5">
          {select("incoterm", terms.incoterm, options.incoterms)}
          {select("namedPlace", terms.namedPlace, options.places)}
          {select("deliveryMode", terms.deliveryMode, options.modes)}
          {select("paymentTerm", terms.paymentTerm, options.paymentTerms)}
          <FormField id="includesVat" label={t("proposal.fields.includesVat")} required>
            <select
              id="includesVat"
              name="includesVat"
              value={includesVat ? "yes" : "no"}
              onChange={(e) => setIncludesVat(e.target.value === "yes")}
              className={SELECT_CLASS}
            >
              <option value="no">{t("common.no")}</option>
              <option value="yes">{t("common.yes")}</option>
            </select>
          </FormField>
          <FormField id="vatRate" label={t("proposal.fields.vatRate")} required={includesVat} error={err("vatRate")}>
            <Input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={terms.vatRate} disabled={!includesVat} />
          </FormField>
          <FormField id="deliveryDays" label={t("proposal.fields.deliveryDays")}>
            <Input id="deliveryDays" name="deliveryDays" type="number" min={0} defaultValue={terms.deliveryDays} />
          </FormField>
          <FormField id="validityDays" label={t("proposal.fields.validityDays")}>
            <Input id="validityDays" name="validityDays" type="number" min={0} defaultValue={terms.validityDays} />
          </FormField>
          <FormField id="comment" label={t("proposal.fields.comment")} className="col-span-2">
            <Textarea id="comment" name="comment" rows={3} defaultValue={terms.comment} />
          </FormField>
          {techDocRequired && (
            <FormField
              id="technicalDocument"
              label={t("proposal.fields.technicalDocument")}
              required
              error={err("technicalDocument")}
              hint={t("files.hint")}
              className="col-span-2"
            >
              <StagedFileInput id="technicalDocument" name="technicalDocument" invalid={Boolean(err("technicalDocument"))} />
              {technicalDocuments.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} className="text-xs text-primary hover:underline">
                  {f.file_name}
                </a>
              ))}
            </FormField>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {!submitted && (
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending} data-testid="proposal-save">
            {t("common.save")}
          </Button>
        )}
        <Button type="submit" name="intent" value="submit" disabled={pending} data-testid="proposal-submit">
          {submitted ? t("proposal.resubmit") : t("proposal.submit")}
        </Button>
        {submitted && (
          <Button type="submit" name="intent" value="withdraw" variant="destructive" disabled={pending} data-testid="proposal-withdraw">
            {t("proposal.withdraw")}
          </Button>
        )}
      </div>
    </form>
  );
}
