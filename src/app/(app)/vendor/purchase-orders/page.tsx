import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDateTime } from "@/lib/format";
import type { PoListRow } from "@/lib/purchase-orders/types";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";

/**
 * PO-03 AC1, AC5: the vendor's own purchase orders. public.po_list returns only this vendor's POs that the committee
 * has fully approved (and the ones it already accepted or declined), never another company's (NFR-001).
 */
export default async function VendorPurchaseOrdersPage() {
  const { allowed } = await checkSection("vendorPurchaseOrders");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.rpc("po_list");
  const list = (data ?? []) as PoListRow[];

  const rows: Row[] = list.map((po) => ({
    id: po.id,
    cells: {
      number: {
        sort: po.number,
        node: (
          <Link href={`/vendor/purchase-orders/${po.id}`} className="font-medium text-primary hover:underline" data-testid="po-row-link">
            {po.number}
          </Link>
        ),
      },
      sourcing: { sort: po.sourcing_number, node: po.sourcing_number },
      total: { sort: Number(po.total), node: formatAmount(po.total) },
      totalInclVat: { sort: Number(po.total_incl_vat), node: formatAmount(po.total_incl_vat) },
      status: { sort: po.status, node: <StatusBadge status={po.status} /> },
      created: { sort: po.created_at, node: formatDateTime(po.created_at) },
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">{t("vendorPurchaseOrders.title")}</h2>
      {rows.length === 0 ? (
        <EmptyState message={t("vendorPurchaseOrders.empty")} />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("purchaseOrders.columns.number") },
            { key: "sourcing", label: t("purchaseOrders.columns.sourcing") },
            { key: "total", label: t("purchaseOrders.columns.total"), align: "right" },
            { key: "totalInclVat", label: t("purchaseOrders.columns.totalInclVat"), align: "right" },
            { key: "status", label: t("purchaseOrders.columns.status") },
            { key: "created", label: t("purchaseOrders.columns.created") },
          ]}
          rows={rows}
          initialSort={{ key: "created", dir: "desc" }}
        />
      )}
    </div>
  );
}
