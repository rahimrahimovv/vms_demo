"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, Lock } from "lucide-react";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import {
  cellFor,
  fewestEligible,
  needsJustification,
  price,
  proposalsReceived,
  type Comparison,
  type ComparisonCell,
  type ComparisonLine,
  type ComparisonVendor,
} from "@/lib/sourcing/comparison";
import { ActionButton, ActionDialog } from "@/components/action-dialog";
import type { DecisionState } from "@/components/decision-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Action = (prev: DecisionState, formData: FormData) => Promise<DecisionState>;

export type ComparisonActions = {
  chooseWinner: Action;
  cancelLine: Action;
  saveCost: Action;
  deleteCost: Action;
  disqualify: Action;
};

const chip = "rounded-full px-2 py-px text-xs font-semibold";
const CHIP = {
  neutral: `${chip} bg-zinc-100 font-normal text-zinc-700`,
  blue: `${chip} bg-sky-50 text-sky-800`,
  green: `${chip} bg-emerald-50 text-emerald-800`,
  amber: `${chip} bg-amber-50 text-amber-800`,
  brand: `${chip} bg-primary text-primary-foreground`,
};

const quantity = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * The comparison (RFQ-05 AC3, RFQ-07 AC2, RFQ-08 AC5), as in the BA's mockup: required terms, the low-competition
 * reason, one row per line and one column per eligible vendor, the purchase orders the approval would create and the
 * disqualified proposals (never with prices). `actions` makes it the owner's working screen in COMPARISON; without
 * it the table is read-only (committee members, the Admin, and the frozen package of a WINNER decision).
 */
export function ComparisonView({
  data,
  actions,
  sendFormId,
  linkVendors = true,
}: {
  data: Comparison;
  actions?: ComparisonActions;
  /** Form id of Send to committee: the low-competition reason textarea belongs to that form. */
  sendFormId?: string;
  linkVendors?: boolean;
}) {
  const t = useTranslations("sourcing.comparison");
  const s = data.sourcing;
  const roundOpen = s.status === "FINAL_OFFER_ROUND";
  const roundUsed = s.finalOfferRoundsUsed > 0;
  const editable = Boolean(actions) && s.status === "COMPARISON";
  const termName = (k: string) => t(`termNames.${k}`);

  return (
    <div className="flex flex-col gap-5" data-testid="comparison">
      <section aria-label={t("requiredTerms")} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-5 py-4">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("requiredTerms")}</span>
        {[s.requiredIncoterm && `Incoterm ${s.requiredIncoterm}`, s.requiredPlace, s.requiredMode, s.requiredPaymentTerm]
          .filter(Boolean)
          .map((x) => (
            <span key={x as string} className="rounded-lg bg-muted px-2.5 py-1 text-sm">
              {x}
            </span>
          ))}
        <span className="rounded-lg bg-muted px-2.5 py-1 text-sm">{t("minimumChip", { minimum: s.minimum })}</span>
        {roundUsed && <span className="rounded-lg bg-muted px-2.5 py-1 text-sm">{t("finalOfferUsedChip")}</span>}
      </section>

      {s.status === "COMPARISON" && data.committeeComments.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900" data-testid="committee-comments">
          <p className="font-semibold">{t("committeeRejected")}</p>
          <ul className="list-disc pl-5 text-sm">
            {data.committeeComments.map((c) => (
              <li key={`${c.name}-${c.comment}`}>{t("committeeComment", { name: c.name, comment: c.comment })}</li>
            ))}
          </ul>
        </section>
      )}

      {roundOpen && s.finalOfferDeadline && (
        <section className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900" data-testid="round-open">
          {t("roundOpen", { deadline: formatDateTime(s.finalOfferDeadline) })}
        </section>
      )}

      {s.needsLowCompetitionReason && (
        <section aria-label={t("lowCompetitionStored")} className="flex flex-col gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4" data-testid="low-competition">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertCircle className="size-4.5" aria-hidden />
            {t("lowCompetitionTitle", { count: fewestEligible(data), total: proposalsReceived(data), minimum: s.minimum })}
          </div>
          {editable && sendFormId ? (
            <>
              <Label htmlFor="low-competition-reason" className="font-normal text-amber-900">
                {t("lowCompetitionLabel", { minimum: s.minimum })}
              </Label>
              <Textarea
                id="low-competition-reason"
                name="lowCompetitionReason"
                form={sendFormId}
                rows={2}
                defaultValue={s.lowCompetitionReason ?? ""}
                className="border-amber-400 bg-white"
              />
            </>
          ) : (
            s.lowCompetitionReason && <p className="text-sm whitespace-pre-wrap text-amber-950">{s.lowCompetitionReason}</p>
          )}
        </section>
      )}

      <section aria-label={t("title")} className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <h3 className="text-base font-semibold">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-sm" data-testid="comparison-table">
            <thead>
              <tr>
                <th scope="col" className="w-[26%] bg-muted/50 px-5 py-3.5 text-left align-top font-semibold">
                  {t("line")}
                </th>
                {data.vendors.map((v) => (
                  <VendorHeader key={v.proposalId} vendor={v} roundOpen={roundOpen} link={linkVendors} editable={editable && s.type !== "SSP"} disqualify={actions?.disqualify} termName={termName} />
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <LineRow key={line.id} line={line} vendors={data.vendors} comparison={data} editable={editable} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t bg-muted/50 px-5 py-3 text-xs text-muted-foreground">{t("footer")}</p>
      </section>

      <div className="flex flex-wrap gap-5">
        <section aria-label={t("poTitle", { count: data.purchaseOrders.length })} className="flex min-w-[420px] flex-1 flex-col gap-3 rounded-xl border bg-card p-5" data-testid="po-preview">
          <h3 className="text-base font-semibold">{t("poTitle", { count: data.purchaseOrders.length })}</h3>
          {data.purchaseOrders.length === 0 && <p className="text-sm text-muted-foreground">{t("poNone")}</p>}
          {data.purchaseOrders.map((po) => (
            <div key={po.proposalId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/60 px-3.5 py-3">
              <div>
                <div className="font-semibold">{po.name}</div>
                <div className="text-xs text-muted-foreground">{t("poLine", { count: po.lines, incoterm: po.incoterm, place: po.namedPlace ?? "" })}</div>
              </div>
              <div className="font-semibold tabular-nums">{formatAmount(po.total)}</div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("poNote")}</p>
        </section>

        <section aria-label={t("disqualifiedTitle", { count: data.disqualified.length })} className="flex min-w-[420px] flex-1 flex-col gap-3 rounded-xl border bg-card p-5" data-testid="disqualified">
          <h3 className="text-base font-semibold">{t("disqualifiedTitle", { count: data.disqualified.length })}</h3>
          {data.disqualified.length === 0 && <p className="text-sm text-muted-foreground">{t("disqualifiedNone")}</p>}
          {data.disqualified.map((d) => (
            <div key={d.proposalId} className="flex items-start gap-3 rounded-lg bg-muted/60 px-3.5 py-3">
              <Lock className="mt-0.5 size-4.5 shrink-0 text-zinc-600" aria-hidden />
              <div>
                <div className="font-semibold">
                  {d.name}
                  {d.grade ? ` · ${t("grade", { grade: d.grade })}` : ""}
                </div>
                <div className="text-zinc-700">{t("disqualifiedReason", { reason: d.reason })}</div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("disqualifiedNote")}</p>
        </section>
      </div>
    </div>
  );
}

function VendorHeader({
  vendor: v,
  roundOpen,
  link,
  editable,
  disqualify,
  termName,
}: {
  vendor: ComparisonVendor;
  roundOpen: boolean;
  link: boolean;
  editable: boolean;
  disqualify?: Action;
  termName: (k: string) => string;
}) {
  const t = useTranslations("sourcing.comparison");
  const ts = useTranslations("status");
  const terms = [v.incoterm, v.namedPlace].filter(Boolean).join(" · ");
  return (
    <th scope="col" className="bg-muted/50 px-5 py-3.5 text-left align-top font-normal" data-testid="vendor-header">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {link ? (
            <Link href={`/vendors/${v.vendorId}`} className="text-[15px] font-semibold text-primary hover:underline">
              {v.name}
            </Link>
          ) : (
            <span className="text-[15px] font-semibold">{v.name}</span>
          )}
          {editable && disqualify && (
            <ActionDialog
              action={disqualify}
              trigger={t("disqualify")}
              triggerVariant="ghost"
              triggerSize="xs"
              title={`${t("disqualify")}: ${v.name}`}
              hidden={{ proposal: v.proposalId, decision: "DISQUALIFIED" }}
              submitVariant="destructive"
              testId="disqualify"
            >
              <Label htmlFor={`dq-${v.proposalId}`}>
                {t("disqualifyReason")}
                <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea id={`dq-${v.proposalId}`} name="reason" rows={3} required />
            </ActionDialog>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {v.grade && <span className={CHIP.blue}>{t("grade", { grade: v.grade })}</span>}
          <span className={v.standing === "ACTIVE" ? CHIP.green : CHIP.amber}>{ts.has(v.standing) ? ts(v.standing) : v.standing}</span>
          <span className={CHIP.neutral}>{terms}</span>
          {v.differentTerms.length > 0 && (
            <span className={CHIP.amber} data-testid="different-terms">
              {t("differentTerms", { terms: v.differentTerms.map(termName).join(", ") })}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("vendorMeta", { days: v.deliveryDays ?? "–", validity: v.validityDays ?? "–" })}
          {v.includesVat && ` · ${t("vatNote", { rate: Number(v.vatRate) })}`}
        </div>
        {v.sharedOwners.length > 0 && (
          <div className="text-xs font-medium text-amber-800" data-testid="shared-owner">
            {t("sharesOwner", { names: v.sharedOwners.join(", ") })}
          </div>
        )}
        {roundOpen && v.finalOffer && (
          <div className="text-xs text-muted-foreground" data-testid="final-offer-state">
            {v.finalOffer.respondedAt ? t("responded") : t("waiting")}
          </div>
        )}
      </div>
    </th>
  );
}

function LineRow({
  line,
  vendors,
  comparison,
  editable,
  actions,
}: {
  line: ComparisonLine;
  vendors: ComparisonVendor[];
  comparison: Comparison;
  editable: boolean;
  actions?: ComparisonActions;
}) {
  const t = useTranslations("sourcing.comparison");
  const active = line.status === "ACTIVE";
  // a line already on a live PO is locked: its winner, its cost and its cancellation no longer change here
  const lineEditable = editable && !line.locked;
  return (
    <tr data-testid="comparison-line">
      <th scope="row" className="border-t px-5 py-4 text-left align-top font-normal">
        <div className="font-semibold">{line.item}</div>
        <div className="text-xs text-muted-foreground">
          {t("lineMeta", { quantity: quantity(line.quantity), unit: line.unit, place: line.place ?? "", date: formatDate(line.deliveryDate) })}
        </div>
        <div className="text-xs text-muted-foreground">{t("estimate", { price: price(line.estimate), unit: line.unit })}</div>
        {!active && <div className="mt-1 text-xs font-medium text-red-700">{t("lineCancelled", { reason: line.cancelReason ?? "" })}</div>}
        {active && line.eligibleCount === 0 && <div className="mt-1 text-xs font-medium text-amber-800">{t("noEligibleOffer")}</div>}
        {active && line.manual && line.justification && (
          <div className="mt-1 text-xs whitespace-pre-wrap text-zinc-700">{t("justification", { text: line.justification })}</div>
        )}
        {active && line.notLowest && <div className="mt-1 text-xs font-semibold text-amber-800">{t("notLowest")}</div>}
        {active && line.locked && line.poNumber && (
          <div className="mt-1 text-xs font-semibold text-emerald-800" data-testid="line-on-po">{t("lockedLine", { number: line.poNumber })}</div>
        )}
        {lineEditable && active && actions && (
          <div className="mt-2">
            <ActionDialog
              action={actions.cancelLine}
              trigger={t("cancelLine")}
              triggerVariant="outline"
              triggerSize="xs"
              title={`${t("cancelLine")}: ${line.item}`}
              hidden={{ line: line.id }}
              submitVariant="destructive"
              testId="cancel-line"
            >
              <Label htmlFor={`cl-${line.id}`}>
                {t("cancelLineReason")}
                <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea id={`cl-${line.id}`} name="reason" rows={3} required />
            </ActionDialog>
          </div>
        )}
      </th>
      {vendors.map((v) => {
        const cell = active ? cellFor(line, v.proposalId) : undefined;
        return cell ? (
          <PriceCell key={v.proposalId} line={line} cell={cell} vendor={v} comparison={comparison} editable={lineEditable} actions={actions} />
        ) : (
          <td key={v.proposalId} className="border-t px-5 py-4 align-top text-xs text-muted-foreground">
            {active ? t("noOffer") : ""}
          </td>
        );
      })}
    </tr>
  );
}

function PriceCell({
  line,
  cell,
  vendor,
  comparison,
  editable,
  actions,
}: {
  line: ComparisonLine;
  cell: ComparisonCell;
  vendor: ComparisonVendor;
  comparison: Comparison;
  editable: boolean;
  actions?: ComparisonActions;
}) {
  const t = useTranslations("sourcing.comparison");
  const lowest = !cell.excluded && line.lowest !== null && cell.evaluated === line.lowest;
  const chosen = line.chosenProposalId === cell.proposalId;
  const roundClosed = comparison.sourcing.status !== "FINAL_OFFER_ROUND";
  const asked = Boolean(vendor.finalOffer) && comparison.sourcing.finalOfferRoundsUsed > 0;
  const label = cell.round === 2 ? t("finalOffer") : asked && roundClosed ? t("keptInRound") : t("offer");
  const costText =
    cell.costs.length === 0
      ? t("extraNone")
      : t("extraList", {
          list: cell.costs
            .map((c) => `${t("costs.item", { type: t(`costs.types.${c.type}`), amount: price(c.amount), unit: line.unit })}${c.note ? ` (${c.note})` : ""}`)
            .join("; "),
        });

  return (
    <td className={cn("border-t px-5 py-4 align-top", lowest && "bg-primary/10")} data-testid="price-cell" data-lowest={lowest || undefined}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-600">{label}</span>
          {lowest && <span className={CHIP.brand}>{t("lowestEvaluated")}</span>}
        </div>
        <div className={cn("text-[22px] font-bold tabular-nums", lowest && "text-primary")} data-testid="unit-price">
          {price(cell.unitExclVat)}
        </div>
        {cell.firstExclVat !== null && <div className="text-xs text-zinc-600">{t("firstOffer", { price: price(cell.firstExclVat) })}</div>}
        {cell.round === 1 && asked && roundClosed && vendor.finalOffer?.respondedAt && (
          <div className="text-xs text-muted-foreground">{t("noChange")}</div>
        )}
        <div className="text-xs text-zinc-600" data-testid="extra-costs">
          {costText}
          {editable && actions && (
            <>
              {" · "}
              <CostsDialog line={line} cell={cell} vendor={vendor} actions={actions} label={cell.costs.length === 0 ? t("add") : t("edit")} />
            </>
          )}
        </div>
        <div className="font-semibold tabular-nums" data-testid="evaluated">
          {t("evaluated", { price: price(cell.evaluated), total: price(cell.lineTotal) })}
        </div>
        {cell.excluded && <div className="text-xs font-semibold text-red-700">{t("rejected")}</div>}
        {editable && actions && !cell.excluded ? (
          <WinnerRadio line={line} cell={cell} vendor={vendor} chosen={chosen} action={actions.chooseWinner} />
        ) : (
          chosen && <span className={cn(CHIP.brand, "self-start")} data-testid="proposed-winner">{t("proposedWinner")}</span>
        )}
      </div>
    </td>
  );
}

/** RFQ-05 AC4: picking the default or a tied vendor saves at once; any other vendor asks for a justification. */
function WinnerRadio({
  line,
  cell,
  vendor,
  chosen,
  action,
}: {
  line: ComparisonLine;
  cell: ComparisonCell;
  vendor: ComparisonVendor;
  chosen: boolean;
  action: Action;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = `w-${line.id}-${cell.proposalId}`;

  const saveNow = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("line", line.id);
      // back to the default winner = no own choice stored
      if (cell.proposalId !== line.defaultProposalId) fd.set("proposal", cell.proposalId);
      const result = await action({ error: null }, fd);
      setError(result.error);
    });

  const radio = (onPick: () => void) => (
    <div className="flex min-h-7 items-center gap-2">
      <input
        type="radio"
        id={id}
        name={`winner-${line.id}`}
        checked={chosen}
        disabled={pending}
        onChange={onPick}
        className="size-4.5 accent-primary"
        data-testid="propose-winner"
      />
      <label htmlFor={id} className="font-medium">
        {t("sourcing.comparison.proposeWinner")}
      </label>
    </div>
  );

  if (!needsJustification(line, cell)) {
    return (
      <>
        {radio(saveNow)}
        {error && <p role="alert" className="text-xs font-medium text-destructive">{t(error)}</p>}
      </>
    );
  }
  return (
    <ActionDialog
      action={action}
      renderTrigger={(open) => radio(open)}
      title={t("sourcing.comparison.justificationTitle", { name: vendor.name })}
      hidden={{ line: line.id, proposal: cell.proposalId }}
    >
      <Label htmlFor={`${id}-j`}>
        {t("sourcing.comparison.justificationLabel")}
        <span className="text-destructive" aria-hidden>*</span>
      </Label>
      <Textarea id={`${id}-j`} name="justification" rows={3} required defaultValue={chosen ? (line.justification ?? "") : ""} />
    </ActionDialog>
  );
}

/** RFQ-07 AC1: the extra costs of one vendor's line: list with Remove, and a form to add one. */
function CostsDialog({
  line,
  cell,
  vendor,
  actions,
  label,
}: {
  line: ComparisonLine;
  cell: ComparisonCell;
  vendor: ComparisonVendor;
  actions: ComparisonActions;
  label: string;
}) {
  const t = useTranslations("sourcing.comparison");
  const [open, setOpen] = useState(false);
  const id = `c-${line.id}-${cell.proposalId}`;
  return (
    <>
      <Button type="button" variant="link" size="xs" className="h-auto p-0 text-xs" onClick={() => setOpen(true)} data-testid="edit-costs">
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("costs.title", { vendor: vendor.name })}</DialogTitle>
            <DialogDescription>{line.item}</DialogDescription>
          </DialogHeader>
          {cell.costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("costs.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cell.costs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm" data-testid="cost-row">
                  <span>
                    {t("costs.item", { type: t(`costs.types.${c.type}`), amount: price(c.amount), unit: line.unit })}
                    {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
                  </span>
                  <ActionButton action={actions.deleteCost} label={t("costs.remove")} hidden={{ cost: c.id }} size="xs" />
                </li>
              ))}
            </ul>
          )}
          <AddCostForm id={id} line={line} cell={cell} action={actions.saveCost} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddCostForm({ id, line, cell, action }: { id: string; line: ComparisonLine; cell: ComparisonCell; action: Action }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  return (
    <form
      key={formKey}
      className="grid grid-cols-2 gap-3 border-t pt-4"
      onSubmit={(e) => {
        // not a form action: React would reset the fields even when the save is refused
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const result = await action({ error: null }, fd);
          setError(result.error);
          if (!result.error) setFormKey((k) => k + 1);
        });
      }}
      data-testid="add-cost"
    >
      <input type="hidden" name="line" value={line.id} />
      <input type="hidden" name="proposal" value={cell.proposalId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-type`}>{t("sourcing.comparison.costs.type")}</Label>
        <select id={`${id}-type`} name="type" defaultValue="DELIVERY" className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          {(["CUSTOMS", "DELIVERY", "INSURANCE", "OTHER"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`sourcing.comparison.costs.types.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-amount`}>
          {t("sourcing.comparison.costs.amount")}
          <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <Input id={`${id}-amount`} name="amount" inputMode="decimal" required className="text-right tabular-nums" />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>{t("sourcing.comparison.costs.note")}</Label>
        <Input id={`${id}-note`} name="note" />
      </div>
      {error && (
        <p role="alert" className="col-span-2 text-xs font-medium text-destructive">
          {t(error)}
        </p>
      )}
      <div className="col-span-2 flex justify-end">
        <Button type="submit" disabled={pending} data-testid="add-cost-submit">
          {t("sourcing.comparison.costs.add")}
        </Button>
      </div>
    </form>
  );
}
