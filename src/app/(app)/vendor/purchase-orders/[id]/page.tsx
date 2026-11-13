import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { PoView } from "@/lib/purchase-orders/types";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { DownloadPdf } from "@/components/download-pdf";
import { DecisionPanel, type DecisionOption } from "@/components/decision-panel";
import { PoBodyView } from "@/components/po/po-body";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { respondToPo } from "../actions";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * PO-03: the vendor's own fully approved PO: lines, totals, PDF download, Accept, or Decline with a reason.
 * public.po_view returns nothing for another vendor's PO or one that is not released yet.
 */
export default async function VendorPurchaseOrderPage({ params }: PageProps<"/vendor/purchase-orders/[id]">) {
  const { allowed } = await checkSection("vendorPurchaseOrders");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.rpc("po_view", { p_id: id });
  const po = data as PoView | null;
  if (!po) return <NoAccess />;

  const options: DecisionOption[] =
    po.status === "FULLY_APPROVED"
      ? [
          { value: "ACCEPT", label: t("purchaseOrders.actions.accept"), comment: "none" },
          {
            value: "DECLINE",
            label: t("purchaseOrders.actions.decline"),
            variant: "destructive",
            comment: "required",
            commentLabel: t("purchaseOrders.reasons.decline"),
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={po.number}
        subtitle={po.sourcing.number}
        status={po.status}
        actions={
          <div className="flex items-start gap-3">
            {options.length > 0 && <DecisionPanel action={respondToPo.bind(null, po.id)} options={options} />}
            <DownloadPdf href={`/api/purchase-orders/${po.id}/pdf`} fileName={`${po.number}.pdf`} />
          </div>
        }
      />
      {options.length > 0 && (
        <Alert data-testid="po-accept-note">
          <AlertDescription>{t("vendorPurchaseOrders.acceptNote")}</AlertDescription>
        </Alert>
      )}
      {po.status === "DECLINED_BY_VENDOR" && po.reason && (
        <Alert variant="destructive" data-testid="po-reason">
          <AlertDescription>
            {t("purchaseOrders.fields.reason")}: {po.reason}
          </AlertDescription>
        </Alert>
      )}

      <PoBodyView
        body={po}
        fields={
          <>
            <Field label={t("purchaseOrders.fields.sourcing")}>{po.sourcing.number}</Field>
            <Field label={t("purchaseOrders.fields.created")}>{formatDateTime(po.createdAt)}</Field>
          </>
        }
      />
    </div>
  );
}
