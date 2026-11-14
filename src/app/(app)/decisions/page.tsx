import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";

type MinutesRef = { number: string } | { number: string }[] | null;
type DecisionRow = {
  id: string;
  type: string;
  status: string;
  opened_at: string;
  deadline: string;
  closed_at: string | null;
  sourcing: { number: string } | null;
  minutes: MinutesRef;
};

const minutesNumber = (m: MinutesRef) => (Array.isArray(m) ? m[0]?.number : m?.number) ?? null;

/** Committee decisions (CMT-02, CMT-04): the ones waiting for my vote first, then every decision. */
export default async function DecisionsPage() {
  const { user, allowed } = await checkSection("decisions");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase
      .from("decision")
      .select("id, type, status, opened_at, deadline, closed_at, sourcing:sourcing(number), minutes(number)")
      .order("opened_at", { ascending: false })
      .returns<DecisionRow[]>(),
    supabase.from("decision_voter").select("decision_id, vote").eq("user_id", user.id),
  ]);
  const decisions = data ?? [];
  const myVote = new Map((mine ?? []).map((v) => [v.decision_id, v.vote as string]));
  const stateOf = (d: DecisionRow) => {
    const vote = myVote.get(d.id);
    if (!vote) return "NONE";
    return vote === "NONE" ? "WAITING" : vote === "CONFLICT" ? "CONFLICT" : "VOTED";
  };
  const waiting = decisions.filter((d) => d.status === "VOTING" && stateOf(d) === "WAITING");

  const toRow = (d: DecisionRow): Row => ({
    id: d.id,
    cells: {
      sourcing: {
        sort: d.sourcing?.number ?? "",
        node: (
          <Link href={`/decisions/${d.id}`} className="font-medium text-primary hover:underline" data-testid="decision-link">
            {d.sourcing?.number}
          </Link>
        ),
      },
      type: { sort: d.type, node: t(`decisions.types.${d.type}`) },
      status: { sort: d.status, node: <StatusBadge status={d.status} /> },
      yourVote: { sort: stateOf(d), node: t(`decisions.yourVote.${stateOf(d)}`) },
      opened: { sort: d.opened_at, node: formatDateTime(d.opened_at) },
      deadline: { sort: d.deadline, node: formatDateTime(d.deadline) },
      minutes: { sort: minutesNumber(d.minutes) ?? "", node: minutesNumber(d.minutes) ?? t("common.none") },
    },
  });

  const columns = [
    { key: "sourcing", label: t("decisions.columns.sourcing") },
    { key: "type", label: t("decisions.columns.type") },
    { key: "status", label: t("decisions.columns.status") },
    ...(user.roles.includes("COMMITTEE_MEMBER") ? [{ key: "yourVote", label: t("decisions.columns.yourVote") }] : []),
    { key: "opened", label: t("decisions.columns.opened") },
    { key: "deadline", label: t("decisions.columns.deadline") },
    { key: "minutes", label: t("decisions.columns.minutes") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="px-2 text-2xl font-bold">{t("decisions.title")}</h2>
      {decisions.length === 0 ? (
        <EmptyState
          message={t("decisions.empty")}
          action={
            <Button asChild>
              <Link href="/sourcing">{t("decisions.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          {waiting.length > 0 && (
            <section className="flex flex-col gap-3" data-testid="waiting-decisions">
              <h3 className="text-base font-semibold">{t("decisions.waitingTitle")}</h3>
              <SortableTable columns={columns} rows={waiting.map(toRow)} initialSort={{ key: "deadline", dir: "asc" }} />
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{t("decisions.allTitle")}</h3>
            <SortableTable columns={columns} rows={decisions.map(toRow)} initialSort={{ key: "opened", dir: "desc" }} />
          </section>
        </>
      )}
    </div>
  );
}
