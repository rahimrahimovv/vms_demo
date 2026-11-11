import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "toApprove" | "mine" | "all";

type PrRow = {
  id: string;
  number: string;
  status: string;
  estimated_value: string;
  submitted_at: string | null;
  created_at: string;
  requester_id: string;
  requester: { full_name: string } | null;
  plan_line: { year: number; description: string } | null;
};

/**
 * PR list. The Requester sees own PRs in any status; others see PRs once submitted (RLS). The
 * Approver's "To approve" tab holds PENDING_APPROVAL PRs of other requesters (PR-02, #83).
 */
export default async function RequisitionsPage({ searchParams }: PageProps<"/requisitions">) {
  const { user, allowed } = await checkSection("requisitions");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const isRequester = user.roles.includes("REQUESTER");
  const isApprover = user.roles.includes("APPROVER");
  const tabs: Tab[] = [...(isApprover ? (["toApprove"] as Tab[]) : []), ...(isRequester ? (["mine"] as Tab[]) : []), "all"];
  const tab: Tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : tabs[0];

  let query = supabase
    .from("requisition")
    .select(
      "id, number, status, estimated_value, submitted_at, created_at, requester_id, requester:app_user!requisition_requester_id_fkey(full_name), plan_line(year, description)",
    )
    .order("created_at", { ascending: false });
  if (tab === "toApprove") query = query.eq("status", "PENDING_APPROVAL").neq("requester_id", user.id);
  if (tab === "mine") query = query.eq("requester_id", user.id);
  // "All" leaves out other users' drafts by RLS; own drafts stay on "My PRs" only
  if (tab === "all") query = query.neq("status", "DRAFT");
  const { data } = await query.returns<PrRow[]>();
  const prs = data ?? [];

  const newButton = isRequester ? (
    <Button asChild>
      <Link href="/requisitions/new" data-testid="new-pr">
        <Plus className="size-4" aria-hidden />
        {t("requisitions.new")}
      </Link>
    </Button>
  ) : undefined;

  const rows: Row[] = prs.map((r) => ({
    id: r.id,
    cells: {
      number: {
        sort: r.number,
        node: (
          <Link href={`/requisitions/${r.id}`} className="font-medium text-primary hover:underline">
            {r.number}
          </Link>
        ),
      },
      planLine: { sort: r.plan_line?.description ?? "", node: r.plan_line ? `${r.plan_line.year} · ${r.plan_line.description}` : "" },
      requester: { sort: r.requester?.full_name ?? "", node: r.requester?.full_name ?? "" },
      value: { sort: Number(r.estimated_value), node: formatAmount(r.estimated_value) },
      submitted: { sort: r.submitted_at ?? "", node: r.submitted_at ? formatDate(r.submitted_at) : t("common.none") },
      status: { sort: r.status, node: <StatusBadge status={r.status} /> },
    },
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 border-b">
        <nav className="flex gap-1" aria-label={t("requisitions.tabsLabel")}>
          {tabs.map((key) => (
            <Link
              key={key}
              href={`/requisitions?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              data-testid={`tab-${key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`requisitions.tabs.${key}`)}
            </Link>
          ))}
        </nav>
        {prs.length > 0 && <div className="pb-2">{newButton}</div>}
      </div>
      {prs.length === 0 ? (
        <EmptyState message={t(`requisitions.empty.${tab}`)} action={newButton} />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("requisitions.columns.number") },
            { key: "planLine", label: t("requisitions.columns.planLine") },
            { key: "requester", label: t("requisitions.columns.requester") },
            { key: "value", label: t("requisitions.columns.value"), align: "right" },
            { key: "submitted", label: t("requisitions.columns.submitted") },
            { key: "status", label: t("requisitions.columns.status") },
          ]}
          rows={rows}
          initialSort={{ key: "number", dir: "desc" }}
        />
      )}
    </div>
  );
}
