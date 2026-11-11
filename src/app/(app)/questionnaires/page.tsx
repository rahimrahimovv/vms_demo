import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { cn } from "@/lib/utils";

type ResponseRow = {
  id: string;
  attempt_no: number;
  status: string;
  grade: string | null;
  score: string | null;
  submitted_at: string | null;
  vendor: { legal_name: string } | null;
};

/** REG-05 AC3-AC4: submitted questionnaires to review (oldest first), and all attempts. */
export default async function QuestionnairesPage({ searchParams }: PageProps<"/questionnaires">) {
  const { allowed } = await checkSection("questionnaires");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const tab = params.tab === "all" ? "all" : "review";

  let query = supabase
    .from("questionnaire_response")
    .select("id, attempt_no, status, grade, score, submitted_at, vendor(legal_name)");
  query = tab === "review" ? query.eq("status", "SUBMITTED") : query.neq("status", "DRAFT");
  const { data } = await query.order("submitted_at", { ascending: true }).returns<ResponseRow[]>();
  const responses = data ?? [];

  const rows: Row[] = responses.map((r) => ({
    id: r.id,
    cells: {
      vendor: {
        sort: r.vendor?.legal_name ?? "",
        node: (
          <Link href={`/questionnaires/${r.id}`} className="font-medium text-primary hover:underline">
            {r.vendor?.legal_name}
          </Link>
        ),
      },
      attempt: { sort: r.attempt_no, node: r.attempt_no },
      submitted: { sort: r.submitted_at ?? "", node: r.submitted_at ? formatDate(r.submitted_at) : t("common.none") },
      status: { sort: r.status, node: <StatusBadge status={r.status} /> },
      grade: { sort: r.grade ?? "", node: r.grade ? `${r.grade} (${Number(r.score).toFixed(1)})` : t("common.none") },
    },
  }));

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 border-b">
        {(["review", "all"] as const).map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/questionnaires" : "/questionnaires?tab=all"}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`questionnaires.tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {responses.length === 0 ? (
        <EmptyState message={t(tab === "review" ? "questionnaires.emptyReview" : "questionnaires.emptyAll")} />
      ) : (
        <SortableTable
          initialSort={{ key: "submitted", dir: "asc" }}
          columns={[
            { key: "vendor", label: t("questionnaires.columns.vendor") },
            { key: "attempt", label: t("questionnaires.columns.attempt"), align: "right" },
            { key: "submitted", label: t("questionnaires.columns.submitted") },
            { key: "status", label: t("questionnaires.columns.status") },
            { key: "grade", label: t("questionnaires.columns.grade") },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
