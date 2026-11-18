import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/format";
import { formatPercent, type Saving } from "@/lib/sourcing/saving";
import { ToneChip } from "@/components/status-badge";

/** "5,500.00 AZN", or "+3,000.00 AZN" when the winners are above the estimate (RFQ-10). */
function signed(saving: number): string {
  return saving < 0 ? `+${formatAmount(Math.abs(saving))}` : formatAmount(saving);
}

/** The four figures: estimated value, awarded value, saving amount and percent (RFQ-10). Internal users only. */
export function SavingSummary({ saving, className }: { saving: Saving; className?: string }) {
  const t = useTranslations("saving");
  return (
    <dl className={className ?? "grid grid-cols-4 gap-x-8 gap-y-2"} data-testid="saving-summary">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{t("estimated")}</dt>
        <dd className="text-sm tabular-nums" data-testid="saving-estimated">{formatAmount(saving.estimated)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{t("awarded")}</dt>
        <dd className="text-sm tabular-nums" data-testid="saving-awarded">{formatAmount(saving.awarded)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{saving.over ? t("overAmount") : t("amount")}</dt>
        <dd className="text-sm font-semibold tabular-nums" data-testid="saving-amount">{signed(saving.saving)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{t("percent")}</dt>
        <dd className="flex items-center gap-2 text-sm font-semibold tabular-nums" data-testid="saving-percent">
          {formatPercent(saving.percent)}
          {saving.over && <ToneChip tone="amber">{t("over")}</ToneChip>}
        </dd>
      </div>
    </dl>
  );
}

/** The comparison's saving block: per line the estimate, the winner's price and the difference, then the footer. */
export function SavingTable({ saving, names }: { saving: Saving; names: Map<string, string> }) {
  const t = useTranslations("saving");
  return (
    <section aria-label={t("title")} className="surface-solid overflow-hidden" data-testid="saving-section">
      <div className="border-b border-border px-5 py-2.5">
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <table className="w-full border-collapse text-(length:--density-table-text)" data-testid="saving-table">
        <thead>
          <tr className="bg-muted/50">
            <th scope="col" className="px-(--density-cell-x) py-3 text-left font-semibold">{t("line")}</th>
            <th scope="col" className="px-(--density-cell-x) py-3 text-right font-semibold">{t("estimateCol")}</th>
            <th scope="col" className="px-(--density-cell-x) py-3 text-right font-semibold">{t("winnerCol")}</th>
            <th scope="col" className="px-(--density-cell-x) py-3 text-right font-semibold">{t("differenceCol")}</th>
          </tr>
        </thead>
        <tbody>
          {saving.lines.map((l) => (
            <tr key={l.lineId} data-testid="saving-line">
              <th scope="row" className="border-t px-(--density-cell-x) py-3 text-left font-normal">{names.get(l.lineId) ?? ""}</th>
              <td className="border-t px-(--density-cell-x) py-3 text-right tabular-nums">{l.estimateUnit !== undefined ? formatAmount(l.estimateUnit) : "–"}</td>
              <td className="border-t px-(--density-cell-x) py-3 text-right tabular-nums">{l.winnerUnit !== undefined ? formatAmount(l.winnerUnit) : "–"}</td>
              <td className="border-t px-(--density-cell-x) py-3 text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-2">
                  {(l.percent ?? 0) < 0 && <ToneChip tone="amber">{t("over")}</ToneChip>}
                  {l.percent === null || l.percent === undefined ? "–" : formatPercent(l.percent)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t bg-muted/50 px-5 py-3">
        <SavingSummary saving={saving} />
      </div>
    </section>
  );
}
