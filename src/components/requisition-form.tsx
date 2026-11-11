"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { formatAmount } from "@/lib/format";
import {
  EMPTY_LINE,
  MAX_SPECIFICATION,
  estimatedValue,
  lineValue,
  nextDay,
  planExcess,
  type PrLine,
} from "@/lib/requisitions/validate";
import type { ItemOption, PlaceOption, PlanLineOption } from "@/lib/requisitions/queries";
import type { RequisitionFormState } from "@/app/(app)/requisitions/actions";
import { FormField } from "@/components/form-field";
import { SELECT_CLASS } from "@/components/admin/entry-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * PR-01: the Requester picks an ACTIVE plan line, then adds catalogue items of its category
 * (or a child) with quantity, estimated unit price excl. VAT, delivery date and place, and an
 * optional specification. The estimated value updates live (AC4); when it is larger than what is
 * left on the plan line, the PLN-01 AC4 warning shows and Submit still works.
 */
export function RequisitionForm({
  action,
  initial,
  planLines,
  items,
  places,
  today,
}: {
  action: (prev: RequisitionFormState, formData: FormData) => Promise<RequisitionFormState>;
  initial: { planLineId: string; lines: PrLine[] };
  planLines: PlanLineOption[];
  items: ItemOption[];
  places: PlaceOption[];
  today: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [planLineId, setPlanLineId] = useState(initial.planLineId);
  const [lines, setLines] = useState<PrLine[]>(initial.lines);

  const plan = planLines.find((p) => p.id === planLineId);
  // MDM-02 AC4: an item fits when the plan line's category is the item's category or one of its parents
  const fitting = useMemo(() => (plan ? items.filter((i) => i.ancestors.includes(plan.categoryId)) : []), [items, plan]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const total = estimatedValue(lines);
  const excess = plan ? planExcess(total, plan.remaining) : 0;
  const err = (key?: string) => (key ? t(key) : undefined);
  const lineErr = (i: number, field: keyof PrLine) => err(state.errors.lines?.[i]?.[field]);

  const update = (i: number, patch: Partial<PrLine>) => setLines((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickPlanLine = (id: string) => {
    setPlanLineId(id);
    const next = planLines.find((p) => p.id === id);
    // items that do not fit the new plan line are cleared, the rest of the line stays
    setLines((list) => list.map((l) => (l.itemId && !byId.get(l.itemId)?.ancestors.includes(next?.categoryId ?? "") ? { ...l, itemId: "" } : l)));
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="requisition-form">
      <input type="hidden" name="planLineId" value={planLineId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {state.errors.form && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("requisitions.saved")}</AlertDescription>
        </Alert>
      )}

      <FormField id="planLineId" label={t("requisitions.fields.planLine")} required error={err(state.errors.planLineId)} className="max-w-3xl">
        <select
          id="planLineId"
          value={planLineId}
          onChange={(e) => pickPlanLine(e.target.value)}
          className={SELECT_CLASS}
          aria-invalid={Boolean(state.errors.planLineId)}
        >
          <option value="">{t("common.select")}</option>
          {planLines.map((p) => (
            <option key={p.id} value={p.id}>
              {t("requisitions.planLineOption", {
                year: p.year,
                category: p.category,
                description: p.description,
                remaining: formatAmount(p.remaining),
              })}
            </option>
          ))}
        </select>
      </FormField>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{t("requisitions.lines")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { ...EMPTY_LINE }])} data-testid="add-line">
            <Plus className="size-4" aria-hidden />
            {t("requisitions.addLine")}
          </Button>
        </div>
        {!plan && <p className="text-sm text-muted-foreground">{t("requisitions.pickPlanLineFirst")}</p>}
        {lines.length === 0 && (
          <p className="rounded-lg border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {t("requisitions.noLines")}
          </p>
        )}
        {lines.map((line, i) => {
          const item = byId.get(line.itemId);
          const id = (field: string) => `line-${i}-${field}`;
          return (
            <Card key={i} data-testid="pr-line">
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("requisitions.line", { n: i + 1 })}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("requisitions.removeLine", { n: i + 1 })}
                    onClick={() => setLines((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-x-5 gap-y-4">
                  <FormField id={id("item")} label={t("requisitions.fields.item")} required error={lineErr(i, "itemId")} className="col-span-2">
                    <select
                      id={id("item")}
                      value={line.itemId}
                      onChange={(e) => update(i, { itemId: e.target.value })}
                      className={SELECT_CLASS}
                      disabled={!plan}
                    >
                      <option value="">{t("common.select")}</option>
                      {fitting.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code} · {o.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id={id("category")} label={t("requisitions.fields.category")}>
                    <Input id={id("category")} value={item?.category ?? ""} readOnly tabIndex={-1} className="bg-muted/50" />
                  </FormField>
                  <FormField id={id("unit")} label={t("requisitions.fields.unit")}>
                    <Input id={id("unit")} value={item?.unit ?? ""} readOnly tabIndex={-1} className="bg-muted/50" />
                  </FormField>
                  <FormField id={id("quantity")} label={t("requisitions.fields.quantity")} required error={lineErr(i, "quantity")}>
                    <Input
                      id={id("quantity")}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                    />
                  </FormField>
                  <FormField id={id("price")} label={t("requisitions.fields.price")} required error={lineErr(i, "price")}>
                    <Input
                      id={id("price")}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={line.price}
                      onChange={(e) => update(i, { price: e.target.value })}
                    />
                  </FormField>
                  <FormField id={id("deliveryDate")} label={t("requisitions.fields.deliveryDate")} required error={lineErr(i, "deliveryDate")}>
                    <Input
                      id={id("deliveryDate")}
                      type="date"
                      min={nextDay(today)}
                      value={line.deliveryDate}
                      onChange={(e) => update(i, { deliveryDate: e.target.value })}
                    />
                  </FormField>
                  <FormField id={id("deliveryPlace")} label={t("requisitions.fields.deliveryPlace")} required error={lineErr(i, "deliveryPlaceId")}>
                    <select
                      id={id("deliveryPlace")}
                      value={line.deliveryPlaceId}
                      onChange={(e) => update(i, { deliveryPlaceId: e.target.value })}
                      className={SELECT_CLASS}
                    >
                      <option value="">{t("common.select")}</option>
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    id={id("specification")}
                    label={t("requisitions.fields.specification")}
                    hint={t("requisitions.specificationHint")}
                    error={lineErr(i, "specification")}
                    className="col-span-3"
                  >
                    <Textarea
                      id={id("specification")}
                      rows={2}
                      maxLength={MAX_SPECIFICATION}
                      value={line.specification}
                      onChange={(e) => update(i, { specification: e.target.value })}
                    />
                  </FormField>
                  <div className="flex flex-col items-end justify-end gap-1">
                    <span className="text-xs text-muted-foreground">{t("requisitions.fields.lineValue")}</span>
                    <span className="text-sm font-medium tabular-nums" data-testid="line-value">
                      {formatAmount(lineValue(line))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="flex flex-col items-end gap-3 border-t pt-4">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-muted-foreground">{t("requisitions.total")}</span>
          <span className="text-lg font-semibold tabular-nums" data-testid="estimated-value">
            {formatAmount(total)}
          </span>
        </div>
        {excess > 0 && (
          <Alert className="max-w-xl border-amber-300 bg-amber-50" data-testid="plan-warning">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertDescription>{t("requisitions.planWarning", { amount: formatAmount(excess) })}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending} data-testid="save">
            {pending ? t("common.saving") : t("requisitions.save")}
          </Button>
          <Button type="submit" name="intent" value="submit" disabled={pending} data-testid="submit">
            {t("requisitions.submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}
