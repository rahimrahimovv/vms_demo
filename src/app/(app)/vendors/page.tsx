import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { bakuToday } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { cn } from "@/lib/utils";

type VendorListRow = {
  id: string;
  legal_name: string;
  vendor_type: string;
  voen: string | null;
  foreign_tax_number: string | null;
  country_code: string;
  status: string;
  standing: string | null;
  submitted_at: string | null;
  created_at: string;
  questionnaire_response: { grade: string | null; status: string; valid_until: string | null }[];
};

/**
 * REG-02 AC1: registrations to review (SUBMITTED, oldest first, with name, type, tax number and
 * submitted date); "All vendors" lists every vendor with standing and grade.
 */
export default async function VendorsPage({ searchParams }: PageProps<"/vendors">) {
  const { allowed } = await checkSection("vendors");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const tab = params.tab === "all" ? "all" : params.tab === "incomplete" ? "incomplete" : params.tab === "rejected" ? "rejected" : "review";
  const today = bakuToday();

  let query = supabase
    .from("vendor")
    .select(
      "id, legal_name, vendor_type, voen, foreign_tax_number, country_code, status, standing, submitted_at, created_at, questionnaire_response(grade, status, valid_until)",
    );
  // REG-01 AC8: DRAFT accounts only appear under "Incomplete registrations", never in the review queue
  query =
    tab === "review"
      ? query.eq("status", "SUBMITTED").order("submitted_at", { ascending: true })
      : tab === "incomplete"
        ? query.eq("status", "DRAFT").order("created_at", { ascending: true })
        : tab === "rejected"
          ? query.eq("status", "REJECTED").order("created_at", { ascending: false })
          : query.order("legal_name");
  const { data } = await query.returns<VendorListRow[]>();
  const vendors = data ?? [];

  const link = (v: VendorListRow) =>
    tab === "incomplete" ? (
      <span className="font-medium">{v.legal_name}</span>
    ) : (
    <Link href={`/vendors/${v.id}`} className="font-medium text-primary hover:underline">
      {v.legal_name}
    </Link>
    );
  const grade = (v: VendorListRow) =>
    v.questionnaire_response.find((r) => r.status === "GRADED" && r.valid_until && r.valid_until >= today)?.grade ?? "";

  const rows: Row[] = vendors.map((v) => ({
    id: v.id,
    cells: {
      name: { sort: v.legal_name, node: link(v) },
      type: { sort: v.vendor_type, node: t(`vendorTypes.${v.vendor_type}`) },
      tax: { sort: v.voen ?? v.foreign_tax_number ?? "", node: v.voen ?? v.foreign_tax_number ?? t("common.none") },
      country: { sort: v.country_code, node: t(`countries.${v.country_code}`) },
      submitted: { sort: v.submitted_at ?? "", node: v.submitted_at ? formatDate(v.submitted_at) : t("common.none") },
      status: { sort: v.status, node: <StatusBadge status={v.status} /> },
      standing: { sort: v.standing ?? "", node: v.standing ? <StatusBadge status={v.standing} /> : t("common.none") },
      grade: { sort: grade(v), node: grade(v) || t("common.none") },
      created: { sort: v.created_at, node: formatDate(v.created_at) },
    },
  }));

  const columns =
    tab === "incomplete"
      ? [
          { key: "name", label: t("vendors.columns.name") },
          { key: "type", label: t("vendors.columns.type") },
          { key: "tax", label: t("vendors.columns.taxNumber") },
          { key: "created", label: t("vendors.columns.created") },
        ]
      : tab === "rejected"
      ? [
          { key: "name", label: t("vendors.columns.name") },
          { key: "type", label: t("vendors.columns.type") },
          { key: "tax", label: t("vendors.columns.taxNumber") },
          { key: "created", label: t("vendors.columns.created") },
        ]
      : tab === "review"
      ? [
          { key: "name", label: t("vendors.columns.name") },
          { key: "type", label: t("vendors.columns.type") },
          { key: "tax", label: t("vendors.columns.taxNumber") },
          { key: "submitted", label: t("vendors.columns.submitted") },
        ]
      : [
          { key: "name", label: t("vendors.columns.name") },
          { key: "type", label: t("vendors.columns.type") },
          { key: "country", label: t("vendors.columns.country") },
          { key: "status", label: t("vendors.columns.status") },
          { key: "standing", label: t("vendors.columns.standing") },
          { key: "grade", label: t("vendors.columns.grade") },
        ];

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex w-fit gap-1 rounded-[18px] border border-(--glass-tabs-border) bg-(--glass-tabs-bg) p-1 backdrop-blur-md" aria-label={t("vendors.tabsLabel")}>
        {(["review", "incomplete", "rejected", "all"] as const).map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/vendors" : "/vendors?tab=" + key}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "rounded-[14px] px-3.5 py-1.5 text-sm",
              tab === key ? "bg-(--glass-tab-active-bg) font-semibold text-brand-ink shadow-[0_2px_8px_rgba(23,38,43,0.1)]" : "text-[#3d4a50] hover:text-foreground",
            )}
          >
            {t(`vendors.tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {vendors.length === 0 ? (
        <EmptyState message={t(tab === "review" ? "vendors.emptyReview" : tab === "incomplete" ? "vendors.emptyIncomplete" : tab === "rejected" ? "vendors.emptyRejected" : "vendors.emptyAll")} />
      ) : (
        <SortableTable
          columns={columns}
          rows={rows}
          initialSort={tab === "review" ? { key: "submitted", dir: "asc" } : tab === "incomplete" ? { key: "created", dir: "asc" } : tab === "rejected" ? { key: "created", dir: "desc" } : { key: "name", dir: "asc" }}
        />
      )}
    </div>
  );
}
