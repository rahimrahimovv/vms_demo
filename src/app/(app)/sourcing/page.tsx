import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";

type SourcingRow = {
  id: string;
  number: string;
  type: string;
  status: string;
  value: string;
  min_proposals: number;
  deadline: string | null;
  owner: { full_name: string } | null;
};

/**
 * Sourcing list (RFQ-01, RFQ-04, RFQ-06). Sealed proposals (NFR-002): only the number of submitted
 * proposals is shown, from public.sourcing_proposal_count, never names, prices or files.
 */
export default async function SourcingListPage() {
  const { allowed } = await checkSection("sourcing");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sourcing")
    .select("id, number, type, status, value, min_proposals, deadline, owner:app_user!sourcing_owner_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .returns<SourcingRow[]>();
  const sourcings = data ?? [];
  const counts = await Promise.all(
    sourcings.map(async (s) =>
      s.status === "DRAFT" ? null : ((await supabase.rpc("sourcing_proposal_count", { p_id: s.id })).data as number | null),
    ),
  );

  const rows: Row[] = sourcings.map((s, i) => ({
    id: s.id,
    cells: {
      number: {
        sort: s.number,
        node: (
          <Link href={`/sourcing/${s.id}`} className="font-medium text-primary hover:underline" data-testid="sourcing-link">
            {s.number}
          </Link>
        ),
      },
      type: { sort: s.type, node: t(`sourcing.types.${s.type}`) },
      value: { sort: Number(s.value), node: <span className="tabular-nums">{formatAmount(s.value)}</span> },
      deadline: { sort: s.deadline ?? "", node: s.deadline ? formatDateTime(s.deadline) : t("common.none") },
      owner: { sort: s.owner?.full_name ?? "", node: s.owner?.full_name ?? t("common.none") },
      proposals: {
        sort: counts[i] ?? -1,
        node: counts[i] === null ? t("common.none") : t("sourcing.proposalsOf", { count: counts[i] ?? 0, minimum: s.min_proposals }),
      },
      status: { sort: s.status, node: <StatusBadge status={s.status} /> },
    },
  }));

  const startButton = (
    <Button asChild>
      <Link href="/requisitions?tab=all">{t("sourcing.startFromPr")}</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">{t("sourcing.title")}</h2>
      {rows.length === 0 ? (
        <EmptyState message={t("sourcing.empty")} action={startButton} />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("sourcing.columns.number") },
            { key: "type", label: t("sourcing.columns.type") },
            { key: "value", label: t("sourcing.columns.value"), align: "right" },
            { key: "deadline", label: t("sourcing.columns.deadline") },
            { key: "owner", label: t("sourcing.columns.owner") },
            { key: "proposals", label: t("sourcing.columns.proposals") },
            { key: "status", label: t("sourcing.columns.status") },
          ]}
          rows={rows}
          initialSort={{ key: "number", dir: "desc" }}
        />
      )}
    </div>
  );
}
