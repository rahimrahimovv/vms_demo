"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, Info, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { SavingTable } from "@/components/sourcing/saving-panel";

type Action = (prev: DecisionState, formData: FormData) => Promise<DecisionState>;

export type ComparisonActions = {
  chooseWinner: Action;
  cancelLine: Action;
  saveCost: Action;
  deleteCost: Action;
  disqualify: Action;
};

const chip = "inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-xs leading-4 font-medium";
const dot = "before:size-1.5 before:shrink-0 before:rounded-full before:content-['']";
const CHIP = {
  neutral: `${chip} border-border bg-background text-foreground`,
  blue: `${chip} border-transparent bg-secondary text-secondary-foreground`,
  green: `${chip} ${dot} border-border bg-background text-foreground before:bg-(--dot-green)`,
  amber: `${chip} ${dot} border-border bg-background text-foreground before:bg-(--dot-amber)`,
  brand: `${chip} border-transparent bg-primary text-primary-foreground`,
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
  serverNow,
}: {
  data: Comparison;
  actions?: ComparisonActions;
  /** Form id of Send to committee: the low-competition reason textarea belongs to that form. */
  sendFormId?: string;
  linkVendors?: boolean;
  /** Server clock for the running final-offer round countdown (RFQ-11). */
  serverNow?: string;
}) {
  const t = useTranslations("sourcing.comparison");
  const s = data.sourcing;
  const roundOpen = s.status === "FINAL_OFFER_ROUND";
  const roundUsed = s.finalOfferRoundsUsed > 0;
  const editable = Boolean(actions) && s.status === "COMPARISON";
  const termName = (k: string) => t(`termNames.${k}`);

  return (
    <div className="flex flex-col gap-5" data-testid="comparison">
      <section aria-label={t("requiredTerms")} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 surface-card px-5 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground">{t("requiredTerms")}</span>
        {[s.requiredIncoterm && `Incoterm ${s.requiredIncoterm}`, s.requiredPlace, s.requiredMode, s.requiredPaymentTerm]
          .filter(Boolean)
          .map((x) => (
            <span key={x as string} className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">
              {x}
            </span>
          ))}
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">{t("minimumChip", { minimum: s.minimum })}</span>
        {roundUsed && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">{t("finalOfferUsedChip")}</span>}
      </section>

      {s.status === "COMPARISON" && data.committeeComments.length > 0 && (
        <Alert data-testid="committee-comments">
          <AlertTriangle aria-hidden />
          <AlertTitle>{t("committeeRejected")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {data.committeeComments.map((c) => (
                <li key={`${c.name}-${c.comment}`}>{t("committeeComment", { name: c.name, comment: c.comment })}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {roundOpen && s.finalOfferDeadline && (
        <Alert data-testid="round-open">
          <Info aria-hidden />
          <AlertDescription className="text-foreground">
            {serverNow ? (
              <DeadlineCountdown deadline={s.finalOfferDeadline} serverNow={serverNow} kind="finalOffer" className="font-medium" />
            ) : (
              formatDateTime(s.finalOfferDeadline)
            )}{" "}
            {t("roundOpen")}
          </AlertDescription>
        </Alert>
      )}

      {s.needsLowCompetitionReason && (
        <Alert aria-label={t("lowCompetitionStored")} data-testid="low-competition">
          <AlertCircle aria-hidden />
          <AlertTitle>{t("lowCompetitionTitle", { count: fewestEligible(data), total: proposalsReceived(data), minimum: s.minimum })}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-foreground">
            {editable && sendFormId ? (
              <>
                <Label htmlFor="low-competition-reason" className="font-normal">
                  {t("lowCompetitionLabel", { minimum: s.minimum })}
                </Label>
                <Textarea id="low-competition-reason" name="lowCompetitionReason" form={sendFormId} rows={2} defaultValue={s.lowCompetitionReason ?? ""} />
              </>
            ) : (
              s.lowCompetitionReason && <p className="whitespace-pre-wrap">{s.lowCompetitionReason}</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <section aria-label={t("title")} className="surface-solid overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5">
          <h3 className="text-base font-semibold">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-(length:--density-table-text)" data-testid="comparison-table">
            <thead>
              <tr>
                <th scope="col" className="w-[26%] bg-muted px-(--density-cell-x) py-3 text-left align-top font-semibold">
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

      {data.saving && data.saving.lines.length > 0 && (
        <SavingTable saving={data.saving} names={new Map(data.lines.map((l) => [l.id, l.item]))} />
      )}

      <div className="flex flex-wrap gap-4">
        <section aria-label={t("poTitle", { count: data.purchaseOrders.length })} className="flex min-w-[420px] flex-1 flex-col gap-2 surface-card px-5 py-4" data-testid="po-preview">
          <h3 className="text-base font-semibold">{t("poTitle", { count: data.purchaseOrders.length })}</h3>
          {data.purchaseOrders.length === 0 && <p className="text-sm text-muted-foreground">{t("poNone")}</p>}
          {data.purchaseOrders.map((po) => (
            <div key={po.proposalId} className="flex flex-wrap justify-between gap-2 surface-inner px-3 py-2">
              <div>
                <div className="font-semibold">{po.name}</div>
                <div className="text-xs text-muted-foreground">{t("poLine", { count: po.lines, incoterm: po.incoterm, place: po.namedPlace ?? "" })}</div>
              </div>
              <div className="font-semibold tabular-nums">{formatAmount(po.total)}</div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("poNote")}</p>
        </section>

        <section aria-label={t("disqualifiedTitle", { count: data.disqualified.length })} className="flex min-w-[420px] flex-1 flex-col gap-2 surface-card px-5 py-4" data-testid="disqualified">
          <h3 className="text-base font-semibold">{t("disqualifiedTitle", { count: data.disqualified.length })}</h3>
          {data.disqualified.length === 0 && <p className="text-sm text-muted-foreground">{t("disqualifiedNone")}</p>}
          {data.disqualified.map((d) => (
            <div key={d.proposalId} className="flex items-start gap-3 surface-inner px-3 py-2">
              <Lock className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <div className="font-semibold">
                  {d.name}
                  {d.grade ? ` · ${t("grade", { grade: d.grade })}` : ""}
                </div>
                <div className="text-muted-foreground">{t("disqualifiedReason", { reason: d.reason })}</div>
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
    <th scope="col" className="bg-muted px-(--density-cell-x) py-3 text-left align-top font-normal" data-testid="vendor-header">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {link ? (
            <Link href={`/vendors/${v.vendorId}`} className="text-sm font-semibold text-primary hover:underline">
              {v.name}
            </Link>
          ) : (
            <span className="text-sm font-semibold">{v.name}</span>
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
          <div className="text-xs font-medium text-foreground" data-testid="shared-owner">
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
      <th scope="row" className="border-t px-(--density-cell-x) py-3 text-left align-top font-normal">
        <div className="font-semibold">{line.item}</div>
        <div className="text-xs text-muted-foreground">
          {t("lineMeta", { quantity: quantity(line.quantity), unit: line.unit, place: line.place ?? "", date: formatDate(line.deliveryDate) })}
        </div>
        <div className="text-xs text-muted-foreground">{t("estimate", { price: price(line.estimate), unit: line.unit })}</div>
        {!active && <div className="mt-1 text-xs font-medium text-destructive">{t("lineCancelled", { reason: line.cancelReason ?? "" })}</div>}
        {active && line.eligibleCount === 0 && <div className="mt-1 text-xs font-medium text-foreground">{t("noEligibleOffer")}</div>}
        {active && line.manual && line.justification && (
          <div className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{t("justification", { text: line.justification })}</div>
        )}
        {active && line.notLowest && <div className="mt-1 text-xs font-semibold text-foreground">{t("notLowest")}</div>}
        {active && line.locked && line.poNumber && (
          <div className="mt-1 text-xs font-semibold text-foreground" data-testid="line-on-po">{t("lockedLine", { number: line.poNumber })}</div>
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
          <td key={v.proposalId} className="border-t px-(--density-cell-x) py-3 align-top text-xs text-muted-foreground">
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
    <td className={cn("border-t px-(--density-cell-x) py-3 align-top", lowest && "bg-accent")} data-testid="price-cell" data-lowest={lowest || undefined}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {lowest && <span className={CHIP.brand}>{t("lowestEvaluated")}</span>}
        </div>
        <div className="text-(length:--density-price) font-semibold tabular-nums" data-testid="unit-price">
          {price(cell.unitExclVat)}
        </div>
        <PriceBar line={line} cell={cell} chosen={chosen} />
        {cell.firstExclVat !== null && <div className="text-xs text-muted-foreground">{t("firstOffer", { price: price(cell.firstExclVat) })}</div>}
        {cell.round === 1 && asked && roundClosed && vendor.finalOffer?.respondedAt && (
          <div className="text-xs text-muted-foreground">{t("noChange")}</div>
        )}
        <div className="text-xs text-muted-foreground" data-testid="extra-costs">
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
        {cell.excluded && <div className="text-xs font-semibold text-destructive">{t("rejected")}</div>}
        {editable && actions && !cell.excluded ? (
          <WinnerRadio line={line} cell={cell} vendor={vendor} chosen={chosen} action={actions.chooseWinner} />
        ) : (
          chosen && <span className={cn(CHIP.brand, "self-start")} data-testid="proposed-winner">{t("proposedWinner")}</span>
        )}
      </div>
    </td>
  );
}

/**
 * A price bar, scaled to the highest offer or the estimate of the line: the proposed winner is #155DFC, the others #8EC5FF, and the
 * estimate is a dashed line. Decoration: the numbers above and below carry the same facts.
 */
function PriceBar({ line, cell, chosen }: { line: ComparisonLine; cell: ComparisonCell; chosen: boolean }) {
  if (cell.excluded) return null;
  const scale = Math.max(line.estimate, ...line.cells.filter((c) => !c.excluded).map((c) => c.unitExclVat));
  if (!(scale > 0)) return null;
  const width = Math.min(100, (cell.unitExclVat / scale) * 100);
  const estimateAt = Math.min(100, (line.estimate / scale) * 100);
  return (
    <div aria-hidden className="relative h-2 rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: chosen ? "#155DFC" : "#8EC5FF" }} />
      <div className="absolute -top-0.5 h-3 border-l border-dashed border-foreground" style={{ left: `${estimateAt}%` }} />
    </div>
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
                <li key={c.id} className="flex items-center justify-between gap-3 surface-inner px-3 py-2 text-sm" data-testid="cost-row">
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
        <select id={`${id}-type`} name="type" defaultValue="DELIVERY" className="h-8 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs">
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
