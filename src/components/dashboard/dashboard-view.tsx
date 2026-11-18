import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { price } from "@/lib/sourcing/comparison";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
  PERIODS,
  barPercent,
  compactAmount,
  donutArcs,
  needsActionHref,
  participation,
  type DashboardSummary,
  type Period,
  type StageKey,
} from "@/lib/dashboard/calc";
import { formatPercent } from "@/lib/sourcing/saving";
import { ToneChip } from "@/components/status-badge";

/** A card of the dashboard: the white card surface, a title row, then the content. */
function Panel({ title, aside, className, testId, children }: { title: string; aside?: ReactNode; className?: string; testId: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-h-0 flex-col surface-card px-4 py-3.5", className)} data-testid={testId} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base leading-5 font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NoData({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground" data-testid="no-data">
      {text}
    </p>
  );
}

function Tile({ label, value, sub, tone, testId }: { label: string; value: ReactNode; sub: ReactNode; tone?: "good"; testId: string }) {
  return (
    <section className="col-span-3 surface-card px-4 py-3.5" data-testid={testId} aria-label={label}>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={cn("py-1 text-3xl leading-9 font-semibold tabular-nums", tone === "good" && "text-foreground")} data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </section>
  );
}

const STAGE_COLOURS: Record<StageKey, string> = {
  draft: "#A3A3A3",
  open: "#8EC5FF",
  evaluation: "#3080FF",
  committee: "#155DFC",
  awarded: "#1447E6",
  completed: "#193CB8",
  cancelled: "#D4D4D4",
};

const GRADE_COLOURS = ["#193CB8", "#155DFC", "#3080FF", "#8EC5FF", "#D4D4D4"];

export function PeriodControl({ period }: { period: Period }) {
  const t = useTranslations("dashboard");
  return (
    <nav aria-label={t("periodLabel")} className="inline-flex gap-0.5 rounded-[10px] bg-muted p-[3px]" data-testid="period-control">
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`/dashboard?period=${p}`}
          aria-current={p === period ? "true" : undefined}
          data-testid={`period-${p}`}
          className={cn(
            "rounded-lg px-3 py-1 text-sm font-medium text-muted-on-muted hover:text-foreground",
            p === period && "bg-background text-foreground shadow-sm",
          )}
        >
          {t(`periods.${p}`)}
        </Link>
      ))}
    </nav>
  );
}

/** Four tiles and six cards. Bars are CSS, the donut is SVG; every chart prints its numbers and carries an aria-label. */
export function DashboardView({ data, roles }: { data: DashboardSummary; roles: readonly Role[] }) {
  const t = useTranslations("dashboard");
  const noData = t("noData");
  const dash = "–";

  const { awarded, saving, cycle, bids, stages, categories, grades, topVendors, needsAction, committee } = data;
  const stageMax = Math.max(0, ...stages.rows.map((r) => r.count));
  const categoryMax = Math.max(0, ...categories.map((c) => c.awarded + c.inProgress));
  const gradeValues = [grades.a, grades.b, grades.c, grades.d, grades.notGraded];
  const gradeNames = [t("grades.a"), t("grades.b"), t("grades.c"), t("grades.d"), t("grades.notGraded")];
  const arcs = donutArcs(gradeValues, 42);
  const circumference = 2 * Math.PI * 42;
  const decisions = committee.approved + committee.rejected + committee.noDecision;
  const share = participation(committee);

  return (
    <div className="grid grid-cols-12 gap-(--density-gap)" data-testid="dashboard">
      <Tile
        testId="tile-awarded"
        label={t("tiles.awarded")}
        value={awarded.sourcings > 0 ? price(awarded.value) : dash}
        sub={awarded.sourcings > 0 ? t("tiles.awardedSub", { count: awarded.sourcings }) : noData}
      />
      <Tile
        testId="tile-saving"
        label={t("tiles.saving")}
        tone={saving.estimated > 0 && !saving.over ? "good" : undefined}
        value={
          saving.estimated > 0 ? (
            <span className="inline-flex items-center gap-2">
              {formatPercent(saving.percent)}
              {saving.over && <ToneChip tone="amber">{t("tiles.over")}</ToneChip>}
            </span>
          ) : (
            dash
          )
        }
        sub={
          saving.estimated > 0
            ? t(saving.over ? "tiles.overSub" : "tiles.savingSub", { amount: price(Math.abs(saving.saving)), estimated: price(saving.estimated) })
            : noData
        }
      />
      <Tile
        testId="tile-cycle"
        label={t("tiles.cycle")}
        value={cycle.days !== null ? t("tiles.cycleValue", { days: cycle.days }) : dash}
        sub={cycle.days !== null ? t("tiles.cycleSub") : noData}
      />
      <Tile
        testId="tile-bids"
        label={t("tiles.bids")}
        value={bids.average !== null ? bids.average.toFixed(1) : dash}
        sub={bids.average !== null ? t("tiles.bidsSub", { proposals: bids.proposals, sourcings: bids.sourcings }) : noData}
      />

      <Panel testId="card-stages" className="col-span-4" title={t("stages.title")} aside={<span className="text-xs text-muted-foreground">{t("stages.total", { count: stages.total })}</span>}>
        {stages.total === 0 ? (
          <NoData text={noData} />
        ) : (
          <ul className="flex flex-col">
            {stages.rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2.5 py-1 text-[13px]" data-testid="stage-row">
                <span className="w-[130px] shrink-0">{t(`stages.${r.key}`)}</span>
                <div
                  role="img"
                  aria-label={t("stages.aria", { stage: t(`stages.${r.key}`), count: r.count, total: stages.total })}
                  className="h-3 flex-1 overflow-hidden rounded-md bg-muted"
                >
                  <div className="h-full rounded-md" style={{ width: `${barPercent(r.count, stageMax)}%`, background: STAGE_COLOURS[r.key] }} />
                </div>
                <b className="w-6 text-right tabular-nums">{r.count}</b>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel testId="card-categories" className="col-span-5" title={t("categories.title")} aside={<span className="text-xs text-muted-foreground">{t("categories.unit")}</span>}>
        {categories.length === 0 ? (
          <NoData text={noData} />
        ) : (
          <>
            <ul className="flex flex-col">
              {categories.map((c) => (
                <li key={c.name} className="py-1 text-[13px]" data-testid="category-row">
                  <div className="flex justify-between gap-3">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {t("categories.row", { awarded: compactAmount(c.awarded), progress: compactAmount(c.inProgress) })}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={t("categories.aria", { name: c.name, awarded: price(c.awarded), progress: price(c.inProgress) })}
                    className="mt-1 flex h-[9px] overflow-hidden rounded-[5px] bg-muted"
                  >
                    <div style={{ width: `${barPercent(c.awarded, categoryMax)}%`, background: "#155DFC" }} />
                    <div style={{ width: `${barPercent(c.inProgress, categoryMax)}%`, background: "#8EC5FF" }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-4 pt-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-[3px] bg-[#155DFC]" />{t("categories.legendAwarded")}</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-[3px] bg-[#8EC5FF]" />{t("categories.legendProgress")}</span>
            </div>
          </>
        )}
      </Panel>

      <Panel testId="card-grades" className="col-span-3" title={t("grades.title")}>
        {grades.total === 0 ? (
          <NoData text={noData} />
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={t("grades.aria", { a: grades.a, b: grades.b, c: grades.c, d: grades.d, notGraded: grades.notGraded })} className="shrink-0">
                <g fill="none" strokeWidth="22" transform="rotate(-90 60 60)">
                  {arcs.map((arc, i) =>
                    gradeValues[i] > 0 ? (
                      <circle key={i} cx="60" cy="60" r="42" stroke={GRADE_COLOURS[i]} strokeDasharray={`${arc.dash.toFixed(2)} ${circumference.toFixed(2)}`} strokeDashoffset={arc.offset.toFixed(2)} />
                    ) : null,
                  )}
                </g>
                <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0A0A0A">{grades.total}</text>
                <text x="60" y="76" textAnchor="middle" fontSize="11" fill="#666666">{t("grades.centre")}</text>
              </svg>
              <ul className="flex flex-1 flex-col gap-1">
                {gradeNames.map((name, i) => (
                  <li key={name} className="flex items-center gap-2 text-[13px]" data-testid="grade-row">
                    <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: GRADE_COLOURS[i] }} />
                    <span className="flex-1">{name}</span>
                    <b className="tabular-nums">{gradeValues[i]}</b>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-2" data-testid="expiring">
              {grades.expiringCertificates > 0 ? (
                <ToneChip tone="amber">{t("grades.expiring", { count: grades.expiringCertificates })}</ToneChip>
              ) : (
                <span className="text-xs text-muted-foreground">{t("grades.noneExpiring")}</span>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel
        testId="card-top-vendors"
        className="col-span-5"
        title={t("topVendors.title")}
        aside={<Link href="/vendors" className="text-sm font-medium underline-offset-4 hover:underline">{t("topVendors.viewAll")}</Link>}
      >
        {topVendors.length === 0 ? (
          <NoData text={noData} />
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-muted text-left text-xs font-medium text-muted-on-muted">
                <th scope="col" className="w-[52%] rounded-l-[8px] px-2 py-1.5 font-medium">{t("topVendors.vendor")}</th>
                <th scope="col" className="px-2 py-1.5 font-medium">{t("topVendors.awards")}</th>
                <th scope="col" className="rounded-r-[8px] px-2 py-1.5 text-right font-medium">{t("topVendors.awarded")}</th>
              </tr>
            </thead>
            <tbody>
              {topVendors.map((v) => (
                <tr key={v.name} className="border-t border-border" data-testid="top-vendor-row">
                  <td className="px-2 py-1.5 font-medium">{v.name}</td>
                  <td className="px-2 py-1.5 tabular-nums">{v.awards}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{price(v.awarded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel testId="card-needs-action" className="col-span-4" title={t("needsAction.title")}>
        {needsAction.every((n) => n.count === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="needs-action-none">{t("needsAction.none")}</p>
        ) : (
          <ul className="flex flex-col">
            {needsAction.map((n) => (
              <li key={n.key} className="flex items-center gap-3 border-t border-border py-1 text-[13px]" data-testid="needs-action-row" data-key={n.key}>
                <span className="flex h-7 min-w-[34px] items-center justify-center rounded-full bg-secondary font-medium tabular-nums" data-testid="needs-action-count">
                  {n.count}
                </span>
                <span className="flex-1 font-medium">{t(`needsAction.labels.${n.key}`)}</span>
                {needsActionHref(n.key, roles) && (
                  <Link href={needsActionHref(n.key, roles)!} className="text-sm font-medium underline underline-offset-4" aria-label={`${t("needsAction.open")}: ${t(`needsAction.labels.${n.key}`)}`}>
                    {t("needsAction.open")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel testId="card-committee" className="col-span-3" title={t("committee.title")}>
        {decisions === 0 ? (
          <NoData text={noData} />
        ) : (
          <>
            <div className="flex gap-2" role="img" aria-label={t("committee.aria", { approved: committee.approved, rejected: committee.rejected, noDecision: committee.noDecision })}>
              {[
                { key: "approved", value: committee.approved, colour: "text-foreground" },
                { key: "rejected", value: committee.rejected, colour: "text-destructive" },
                { key: "noDecision", value: committee.noDecision, colour: "text-foreground" },
              ].map((c) => (
                <div key={c.key} className="flex-1 rounded-[10px] border bg-card px-1 py-2 text-center">
                  <div className={cn("text-[26px] leading-[1.1] font-semibold tabular-nums", c.colour)} data-testid={`committee-${c.key}`}>{c.value}</div>
                  <div className="text-xs text-muted-foreground">{t(`committee.${c.key}`)}</div>
                </div>
              ))}
            </div>
            {share !== null && (
              <p className="pt-2.5 text-[13px] text-muted-foreground" data-testid="participation">
                {t("committee.participation", { percent: share, cast: committee.cast, eligible: committee.eligible })}
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
