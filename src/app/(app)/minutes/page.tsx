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

type MinutesRow = {
  id: string;
  number: string;
  decision: {
    type: string;
    status: string;
    closed_at: string | null;
    sourcing: { number: string } | null;
    po: { number: string } | null;
  } | null;
};

/** Numbered minutes of every closed committee decision (CMT-03). Vendors never see them (Role Matrix). */
export default async function MinutesListPage() {
  const { allowed } = await checkSection("minutes");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("minutes")
    .select("id, number, decision:decision(type, status, closed_at, sourcing:sourcing(number), po:purchase_order(number))")
    .order("number", { ascending: false })
    .returns<MinutesRow[]>();
  const list = data ?? [];

  const rows: Row[] = list.map((m) => ({
    id: m.id,
    cells: {
      number: {
        sort: m.number,
        node: (
          <Link href={`/minutes/${m.id}`} className="font-medium text-primary hover:underline" data-testid="minutes-row-link">
            {m.number}
          </Link>
        ),
      },
      type: { sort: m.decision?.type ?? "", node: m.decision ? t(`decisions.types.${m.decision.type}`) : "" },
      sourcing: { sort: m.decision?.sourcing?.number ?? "", node: m.decision?.sourcing?.number ?? "" },
      po: { sort: m.decision?.po?.number ?? "", node: m.decision?.po?.number ?? t("common.none") },
      result: { sort: m.decision?.status ?? "", node: m.decision ? <StatusBadge status={m.decision.status} /> : null },
      closed: { sort: m.decision?.closed_at ?? "", node: m.decision?.closed_at ? formatDateTime(m.decision.closed_at) : t("common.none") },
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">{t("minutes.title")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          message={t("minutes.empty")}
          action={
            <Button asChild>
              <Link href="/decisions">{t("minutes.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("minutes.columns.number") },
            { key: "type", label: t("minutes.columns.type") },
            { key: "sourcing", label: t("minutes.columns.sourcing") },
            { key: "po", label: t("minutes.columns.po") },
            { key: "result", label: t("minutes.columns.result") },
            { key: "closed", label: t("minutes.columns.closed") },
          ]}
          rows={rows}
          initialSort={{ key: "number", dir: "desc" }}
        />
      )}
    </div>
  );
}
