import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { formatAmount, formatDate } from "@/lib/format";
import type { PoBody } from "@/lib/purchase-orders/types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The commercial part of a PO (PO-01 AC2): terms, lines, total excluding VAT, VAT amount at the vendor's rate and
 * total including VAT. Shared by the PO record, the vendor's PO page and the PO decision package.
 * `fields` adds the record's own fields (vendor, sourcing, minutes links) in front of the terms.
 */
export async function PoBodyView({ body, fields }: { body: PoBody; fields?: ReactNode }) {
  const t = await getTranslations("purchaseOrders");
  const none = (await getTranslations("common"))("none");
  return (
    <div className="flex flex-col gap-5" data-testid="po-body">
      <Card>
        <CardContent>
          <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="po-details">
            {fields}
            <Field label={t("fields.incoterm")}>{body.incoterm ?? none}</Field>
            <Field label={t("fields.namedPlace")}>{body.namedPlace ?? none}</Field>
            <Field label={t("fields.deliveryMode")}>{body.deliveryMode ?? none}</Field>
            <Field label={t("fields.paymentTerm")}>{body.paymentTerm ?? none}</Field>
          </dl>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{t("lines.title")}</h3>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>{t("lines.item")}</TableHead>
                <TableHead className="text-right">{t("lines.quantity")}</TableHead>
                <TableHead>{t("lines.unit")}</TableHead>
                <TableHead className="text-right">{t("lines.unitPrice")}</TableHead>
                <TableHead className="text-right">{t("lines.lineTotal")}</TableHead>
                <TableHead>{t("lines.deliveryDate")}</TableHead>
                <TableHead>{t("lines.place")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {body.lines.map((line, i) => (
                <TableRow key={`${line.item}-${i}`} data-testid="po-line">
                  <TableCell className="font-medium">{line.item}</TableCell>
                  <TableCell className="text-right tabular-nums">{quantityFormat.format(line.quantity)}</TableCell>
                  <TableCell>{line.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(line.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(line.lineTotal)}</TableCell>
                  <TableCell>{formatDate(line.deliveryDate)}</TableCell>
                  <TableCell>{line.place ?? none}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <dl className="ml-auto flex w-80 flex-col gap-1.5 text-sm" data-testid="po-totals">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{t("totals.excl")}</dt>
            <dd className="tabular-nums" data-testid="po-total">{formatAmount(body.total)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{t("totals.vat", { rate: body.vatRate })}</dt>
            <dd className="tabular-nums" data-testid="po-vat">{formatAmount(body.vatAmount)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t pt-1.5 font-semibold">
            <dt>{t("totals.incl")}</dt>
            <dd className="tabular-nums" data-testid="po-total-incl">{formatAmount(body.totalInclVat)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{t("priceNote")}</p>
      </section>
    </div>
  );
}
