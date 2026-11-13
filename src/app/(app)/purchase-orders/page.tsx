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
import { Button } from "@/components/ui/button";

/**
 * Purchase orders (PO-01): one per winning vendor, created when a winner decision is approved. The list comes from
 * public.po_list, which returns only what this user may read (Role Matrix; the Requester sees the POs of own PRs).
 */
export default async function PurchaseOrdersPage() {
  const { allowed } = await checkSection("purchaseOrders");
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
          <Link href={`/purchase-orders/${po.id}`} className="font-medium text-primary hover:underline" data-testid="po-row-link">
            {po.number}
          </Link>
        ),
      },
      vendor: { sort: po.vendor_name, node: po.vendor_name },
      sourcing: { sort: po.sourcing_number, node: po.sourcing_number },
      total: { sort: Number(po.total), node: formatAmount(po.total) },
      totalInclVat: { sort: Number(po.total_incl_vat), node: formatAmount(po.total_incl_vat) },
      status: { sort: po.status, node: <StatusBadge status={po.status} /> },
      created: { sort: po.created_at, node: formatDateTime(po.created_at) },
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">{t("purchaseOrders.title")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          message={t("purchaseOrders.empty")}
          action={
            <Button asChild>
              <Link href="/sourcing">{t("purchaseOrders.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("purchaseOrders.columns.number") },
            { key: "vendor", label: t("purchaseOrders.columns.vendor") },
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
