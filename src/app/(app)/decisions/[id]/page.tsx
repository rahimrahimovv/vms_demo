import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { DecisionPanel, type DecisionOption } from "@/components/decision-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComparisonView } from "@/components/sourcing/comparison-view";
import type { Comparison } from "@/lib/sourcing/comparison";
import type { PoDifference, PoPackage } from "@/lib/purchase-orders/types";
import { PoBodyView } from "@/components/po/po-body";
import { decideVote } from "../actions";

type DecisionRecord = {
  id: string;
  type: "OPENING" | "WINNER" | "PO";
  status: "VOTING" | "APPROVED" | "REJECTED" | "NO_DECISION";
  result_rule: string | null;
  opened_at: string;
  deadline: string;
  closed_at: string | null;
  reopen_reason: string | null;
  close_reason: string | null;
  sourcing: { id: string; number: string; owner_id: string; status: string; owner: { full_name: string } | null } | null;
  po: { number: string } | null;
};

type Voter = {
  user_id: string;
  full_name: string;
  is_chair: boolean;
  state: "WAITING" | "VOTED" | "CONFLICT";
  vote: string | null;
  comment: string | null;
};

type Pkg = {
  sourcingId: string;
  sourcingNumber: string;
  sourcingType: string;
  minimum: number;
  lowCompetitionReason: string | null;
  proposalCount: number;
  bidders: string[] | null;
  /** WINNER: the comparison frozen at Send to committee (CMT-02 AC2); null for readers who may not see bids. */
  comparison: Comparison | null;
  /** PO: the PO and every difference from the approved winner decision (CMT-02 AC3). */
  po: PoPackage | null;
};

/** Amounts as "60,000.00 AZN", everything else as written. */
function differenceValue(diff: PoDifference, value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  return diff.field === "unitPrice" || diff.field === "total" ? formatAmount(value) : String(value);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Committee decision record (CMT-02, CMT-04): status and the member's actions on the right, tabs Details and
 * History. While VOTING only who has voted is shown, not how (AC6); the owner of the sourcing never votes (#83).
 */
export default async function DecisionPage({ params }: PageProps<"/decisions/[id]">) {
  const { user, allowed } = await checkSection("decisions");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("decision")
    .select(
      "id, type, status, result_rule, opened_at, deadline, closed_at, reopen_reason, close_reason, sourcing:sourcing(id, number, owner_id, status, owner:app_user!sourcing_owner_id_fkey(full_name)), po:purchase_order(number)",
    )
    .eq("id", id)
    .returns<DecisionRecord[]>()
    .maybeSingle();
  if (!d || !d.sourcing) return <NoAccess />;

  const [votersResult, packageResult, minutesResult, newerResult] = await Promise.all([
    supabase.rpc("decision_voters", { p_decision: id }),
    supabase.rpc("decision_package", { p_decision: id }),
    supabase.from("minutes").select("id, number").eq("decision_id", id).maybeSingle(),
    supabase
      .from("decision")
      .select("id", { count: "exact", head: true })
      .eq("sourcing_id", d.sourcing.id)
      .eq("type", d.type)
      .gt("opened_at", d.opened_at),
  ]);
  const voters = (votersResult.data ?? []) as Voter[];
  const pkg = packageResult.data as Pkg | null;
  const minutes = minutesResult.data as { id: string; number: string } | null;
  const latest = (newerResult.count ?? 0) === 0;

  const voting = d.status === "VOTING";
  const mine = voters.find((v) => v.user_id === user.id);
  const owner = d.sourcing.owner_id === user.id && user.roles.includes("PROCUREMENT_SPECIALIST");
  const canVote = voting && mine?.state === "WAITING" && new Date(d.deadline) > new Date();
  const canReopen =
    owner &&
    latest &&
    ((d.status === "NO_DECISION" && d.result_rule !== "SOURCING_CANCELLED") || (d.status === "REJECTED" && d.type === "OPENING")) &&
    (d.type !== "OPENING" || d.sourcing.status === "AWAITING_OPENING");

  const options: DecisionOption[] = [];
  if (canVote) {
    options.push(
      { value: "FOR", label: t("decisions.actions.voteFor"), comment: "none" },
      { value: "AGAINST", label: t("decisions.actions.voteAgainst"), variant: "destructive", comment: "required", commentLabel: t("decisions.comments.against") },
      { value: "CONFLICT", label: t("decisions.actions.conflict"), variant: "outline", comment: "required", commentLabel: t("decisions.comments.conflict") },
    );
  }
  if (canReopen) {
    options.push({
      value: "REOPEN",
      label: t("decisions.actions.reopen"),
      comment: d.status === "REJECTED" ? "required" : "optional",
      commentLabel: t("decisions.comments.reopenReason"),
    });
  }

  const typeTitle = t(`decisions.typeTitle.${d.type}`);
  const voteLabel = (v: string | null) => (v ? t(`decisions.votes.${v}`) : t("common.none"));

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={`${typeTitle} · ${d.sourcing.number}`}
        subtitle={d.po ? d.po.number : undefined}
        status={d.status}
        actions={options.length > 0 ? <DecisionPanel action={decideVote.bind(null, d.id)} options={options} /> : undefined}
      />

      {d.reopen_reason && (
        <Alert data-testid="reopen-reason">
          <AlertDescription>{t("decisions.reopenedBecause", { reason: d.reopen_reason })}</AlertDescription>
        </Alert>
      )}
      {d.result_rule === "SOURCING_CANCELLED" && d.close_reason && (
        <Alert variant="destructive" data-testid="cancel-reason">
          <AlertDescription>{t("decisions.cancelledBecause", { reason: d.close_reason })}</AlertDescription>
        </Alert>
      )}
      {voting && mine && (
        <Alert data-testid="vote-note">
          <AlertTitle>{t(`decisions.voters.${mine.state}`)}</AlertTitle>
          <AlertDescription>
            {mine.state === "VOTED" ? `${t("decisions.yourVoteIs", { vote: voteLabel(mine.vote) })} ` : ""}
            {t("decisions.hidden")}
          </AlertDescription>
        </Alert>
      )}
      {voting && !mine && owner && (
        <Alert data-testid="owner-note">
          <AlertDescription>{t("decisions.ownerNote")}</AlertDescription>
        </Alert>
      )}
      {voting && !mine && !owner && user.roles.includes("COMMITTEE_MEMBER") && (
        <Alert data-testid="not-voter-note">
          <AlertDescription>{t("decisions.notVoter")}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="flex flex-col gap-5 pt-4">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="decision-details">
                <Field label={t("decisions.fields.sourcing")}>
                  <Link href={`/sourcing/${d.sourcing.id}`} className="text-primary hover:underline">
                    {d.sourcing.number}
                  </Link>
                </Field>
                <Field label={t("decisions.fields.type")}>{t(`decisions.types.${d.type}`)}</Field>
                <Field label={t("decisions.fields.owner")}>{d.sourcing.owner?.full_name}</Field>
                <Field label={t("decisions.fields.opened")}>{formatDateTime(d.opened_at)}</Field>
                <Field label={t("decisions.fields.deadline")}>{formatDateTime(d.deadline)}</Field>
                {d.closed_at && <Field label={t("decisions.fields.closed")}>{formatDateTime(d.closed_at)}</Field>}
                {d.result_rule && <Field label={t("decisions.fields.rule")}>{t(`decisions.rules.${d.result_rule}`)}</Field>}
                {minutes && (
                  <Field label={t("decisions.fields.minutes")}>
                    <Link href={`/minutes/${minutes.id}`} className="text-primary hover:underline" data-testid="minutes-link">
                      {minutes.number}
                    </Link>
                  </Field>
                )}
              </dl>
            </CardContent>
          </Card>

          {pkg && d.type === "WINNER" && (
            <section className="flex flex-col gap-4" data-testid="winner-package">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">{t("decisions.package.comparisonTitle")}</h3>
                {pkg.comparison?.frozenAt && (
                  <p className="text-xs text-muted-foreground">{t("decisions.package.frozenAt", { date: formatDateTime(pkg.comparison.frozenAt) })}</p>
                )}
              </div>
              {pkg.comparison?.sourcing.type === "SSP" && (
                <Card className="border-sky-200" data-testid="ssp-label">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>{t("decisions.package.sspLabel")}</Badge>
                      <span className="text-sm text-muted-foreground">{t("decisions.package.sspNote")}</span>
                    </div>
                    {pkg.comparison.sourcing.sspJustification && (
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs text-muted-foreground">{t("decisions.package.sspJustification")}</p>
                        <p className="text-sm whitespace-pre-wrap">{pkg.comparison.sourcing.sspJustification}</p>
                      </div>
                    )}
                    {pkg.comparison.sourcing.sspFiles.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs text-muted-foreground">{t("decisions.package.sspFiles")}</p>
                        {pkg.comparison.sourcing.sspFiles.map((f) => (
                          <a key={f.id} href={`/api/files/${f.id}`} className="text-sm text-primary hover:underline">
                            {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {pkg.comparison ? (
                <ComparisonView data={pkg.comparison} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("decisions.package.noComparison")}</p>
              )}
            </section>
          )}

          {pkg && d.type === "PO" && (
            <section className="flex flex-col gap-4" data-testid="po-package">
              <h3 className="text-base font-semibold">{t("decisions.package.poTitle")}</h3>
              {pkg.po ? (
                <>
                  {pkg.po.same ? (
                    <Alert data-testid="po-same">
                      <AlertDescription>{t("decisions.package.samePackage")}</AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="border-amber-300 bg-amber-50" data-testid="po-differences">
                      <AlertTitle>{t("decisions.package.differencesTitle")}</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5">
                          {pkg.po.differences.map((diff, i) => (
                            <li key={i}>
                              {t("decisions.package.diffLine", {
                                field: t(`decisions.package.diffFields.${diff.field}`),
                                item: diff.item ? ` (${diff.item})` : "",
                                winner: differenceValue(diff, diff.winner),
                                po: differenceValue(diff, diff.po),
                              })}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  <PoBodyView
                    body={pkg.po.po}
                    fields={<Field label={t("purchaseOrders.fields.vendor")}>{pkg.po.po.vendor}</Field>}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("decisions.package.noPo")}</p>
              )}
            </section>
          )}

          {pkg && d.type === "OPENING" && (
            <Card>
              <CardContent className="flex flex-col gap-3" data-testid="decision-package">
                <h3 className="text-sm font-semibold">{t("decisions.package.title")}</h3>
                <p className="text-sm" data-testid="package-proposals">
                  {t("decisions.package.proposals", { count: pkg.proposalCount })} · {t("decisions.package.minimum", { minimum: pkg.minimum })}
                </p>
                {pkg.bidders && pkg.bidders.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">{t("decisions.package.bidders")}</p>
                    <ul className="list-disc pl-5 text-sm" data-testid="package-bidders">
                      {pkg.bidders.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.type === "OPENING" && <p className="text-xs text-muted-foreground">{t("decisions.package.sealed")}</p>}
                {pkg.lowCompetitionReason && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">{t("decisions.package.lowCompetition")}</p>
                    <p className="text-sm">{pkg.lowCompetitionReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{t("decisions.voters.title")}</h3>
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>{t("decisions.voters.member")}</TableHead>
                    <TableHead>{t("decisions.voters.state")}</TableHead>
                    <TableHead>{t("decisions.voters.vote")}</TableHead>
                    <TableHead>{t("decisions.voters.comment")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voters.map((v) => (
                    <TableRow key={v.user_id} data-testid="voter-row" data-state={v.state}>
                      <TableCell className="font-medium">
                        {v.full_name} {v.is_chair && <Badge variant="secondary">{t("decisions.voters.chair")}</Badge>}
                      </TableCell>
                      <TableCell>{t(`decisions.voters.${v.state}`)}</TableCell>
                      <TableCell data-testid="voter-vote">{v.vote ? voteLabel(v.vote) : t("common.none")}</TableCell>
                      <TableCell className="whitespace-pre-wrap">{v.comment ?? t("common.none")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="decision" recordId={d.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
