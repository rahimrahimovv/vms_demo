import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { ageInDays } from "@/lib/vendors/change-requests";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";

type RequestRow = {
  id: string;
  section: string;
  status: string;
  submitted_at: string | null;
  vendor: { legal_name: string } | null;
};

/**
 * REG-08 AC5: the change requests waiting for a Procurement Specialist: vendor, section, submitted date and age,
 * oldest first. "All" also lists the decided ones.
 */
export default async function ChangeRequestsPage({ searchParams }: PageProps<"/change-requests">) {
  const { allowed } = await checkSection("changeRequests");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const all = params.tab === "all";

  let query = supabase.from("vendor_change_request").select("id, section, status, submitted_at, vendor:vendor(legal_name)");
  query = all ? query.order("submitted_at", { ascending: false }) : query.eq("status", "SUBMITTED").order("submitted_at", { ascending: true });
  const { data } = await query.returns<RequestRow[]>();
  const requests = data ?? [];

  const rows: Row[] = requests.map((r) => {
    const age = r.submitted_at ? ageInDays(r.submitted_at) : 0;
    return {
      id: r.id,
      cells: {
        vendor: {
          sort: r.vendor?.legal_name ?? "",
          node: (
            <Link href={`/change-requests/${r.id}`} className="font-medium text-primary hover:underline" data-testid="request-link">
              {r.vendor?.legal_name}
            </Link>
          ),
        },
        section: { sort: r.section, node: t(`changeRequest.sections.${r.section}`) },
        submitted: { sort: r.submitted_at ?? "", node: r.submitted_at ? formatDate(r.submitted_at) : t("common.none") },
        age: { sort: String(age).padStart(6, "0"), node: t("changeRequest.age", { days: age }) },
        status: { sort: r.status, node: <StatusBadge status={r.status} /> },
      },
    };
  });

  const columns = [
    { key: "vendor", label: t("changeRequest.columns.vendor") },
    { key: "section", label: t("changeRequest.columns.section") },
    { key: "submitted", label: t("changeRequest.columns.submitted") },
    { key: "age", label: t("changeRequest.columns.age") },
    ...(all ? [{ key: "status", label: t("changeRequest.columns.status") }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex w-fit gap-1 rounded-[18px] border border-(--glass-tabs-border) bg-(--glass-tabs-bg) p-1 backdrop-blur-md" aria-label={t("changeRequest.tabsLabel")}>
        {(["review", "all"] as const).map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/change-requests" : "/change-requests?tab=all"}
            aria-current={(key === "all") === all ? "page" : undefined}
            className={
              "rounded-[14px] px-3.5 py-1.5 text-sm " +
              ((key === "all") === all
                ? "bg-(--glass-tab-active-bg) font-semibold text-brand-ink shadow-[0_2px_8px_rgba(23,38,43,0.1)]"
                : "text-[#3d4a50] hover:text-foreground")
            }
          >
            {t(`changeRequest.tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {requests.length === 0 ? (
        <EmptyState message={t(all ? "changeRequest.emptyAll" : "changeRequest.empty")} />
      ) : (
        <SortableTable columns={columns} rows={rows} initialSort={{ key: all ? "submitted" : "age", dir: all ? "desc" : "desc" }} />
      )}
    </div>
  );
}
