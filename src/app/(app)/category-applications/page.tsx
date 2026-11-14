import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { cn } from "@/lib/utils";

type ApplicationRow = {
  id: string;
  category_id: string;
  status: string;
  valid_until: string | null;
  created_at: string;
  vendor: { legal_name: string } | null;
};

/** REG-04: PENDING applications to decide (oldest first), and all applications. */
export default async function CategoryApplicationsPage({ searchParams }: PageProps<"/category-applications">) {
  const { allowed } = await checkSection("categoryApplications");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const tab = params.tab === "all" ? "all" : "review";
  const today = bakuToday();

  let query = supabase.from("category_application").select("id, category_id, status, valid_until, created_at, vendor(legal_name)");
  if (tab === "review") query = query.eq("status", "PENDING");
  const [{ data }, { data: categories }] = await Promise.all([
    query.order("created_at", { ascending: true }).returns<ApplicationRow[]>(),
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
  ]);
  const paths = new Map(flattenTree(categories ?? []).map((c) => [c.id, c.path]));
  const applications = data ?? [];

  const rows: Row[] = applications.map((a) => {
    const status = a.status === "QUALIFIED" && a.valid_until && a.valid_until < today ? "EXPIRED" : a.status;
    return {
      id: a.id,
      cells: {
        vendor: {
          sort: a.vendor?.legal_name ?? "",
          node: (
            <Link href={`/category-applications/${a.id}`} className="font-medium text-primary hover:underline">
              {a.vendor?.legal_name}
            </Link>
          ),
        },
        category: { sort: paths.get(a.category_id) ?? "", node: paths.get(a.category_id) },
        applied: { sort: a.created_at, node: formatDate(a.created_at) },
        status: { sort: status, node: <StatusBadge status={status} /> },
        validUntil: { sort: a.valid_until ?? "", node: a.valid_until ? formatDate(a.valid_until) : t("common.none") },
      },
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex w-fit gap-1 rounded-[18px] border border-(--glass-tabs-border) bg-(--glass-tabs-bg) p-1 backdrop-blur-md">
        {(["review", "all"] as const).map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/category-applications" : "/category-applications?tab=all"}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "rounded-[14px] px-3.5 py-1.5 text-sm",
              tab === key ? "bg-(--glass-tab-active-bg) font-semibold text-brand-ink shadow-[0_2px_8px_rgba(23,38,43,0.1)]" : "text-[#3d4a50] hover:text-foreground",
            )}
          >
            {t(`applications.tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {applications.length === 0 ? (
        <EmptyState message={t(tab === "review" ? "applications.emptyReview" : "applications.emptyAll")} />
      ) : (
        <SortableTable
          initialSort={{ key: "applied", dir: "asc" }}
          columns={[
            { key: "vendor", label: t("applications.columns.vendor") },
            { key: "category", label: t("applications.columns.category") },
            { key: "applied", label: t("applications.columns.applied") },
            { key: "status", label: t("applications.columns.status") },
            { key: "validUntil", label: t("qualification.validUntil") },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
