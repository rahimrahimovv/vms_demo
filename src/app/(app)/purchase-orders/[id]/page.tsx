import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { canDecidePo, type PoView } from "@/lib/purchase-orders/types";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { DownloadPdf } from "@/components/download-pdf";
import { DecisionPanel, type DecisionOption } from "@/components/decision-panel";
import { PoBodyView } from "@/components/po/po-body";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decidePo } from "../actions";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Purchase order record (PO-01, PO-02): header with number, status and the Approver's actions; tabs Details and
 * History. There is no edit action (PO-01 AC4). An Approver who is the PR's Requester or the sourcing owner gets
 * no decision buttons (PO-02 AC3, #83).
 */
export default async function PurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const { user, allowed } = await checkSection("purchaseOrders");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.rpc("po_view", { p_id: id });
  const po = data as PoView | null;
  if (!po) return <NoAccess />;

  const canDecide = canDecidePo(po, user);
  const ownPo = user.roles.includes("APPROVER") && po.status === "PENDING_APPROVAL" && !canDecide;
  const options: DecisionOption[] = canDecide
    ? [
        { value: "APPROVE", label: t("purchaseOrders.actions.approve"), comment: "none" },
        {
          value: "REJECT",
          label: t("purchaseOrders.actions.reject"),
          variant: "destructive",
          comment: "required",
          commentLabel: t("purchaseOrders.reasons.reject"),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={po.number}
        subtitle={po.vendor.name}
        status={po.status}
        actions={
          <div className="flex items-start gap-3">
            {options.length > 0 && <DecisionPanel action={decidePo.bind(null, po.id)} options={options} />}
            <DownloadPdf href={`/api/purchase-orders/${po.id}/pdf`} fileName={`${po.number}.pdf`} />
          </div>
        }
      />

      {ownPo && (
        <Alert data-testid="own-po-note">
          <AlertDescription>{t("purchaseOrders.ownNote")}</AlertDescription>
        </Alert>
      )}
      {po.status === "PENDING_COMMITTEE" && po.decision && (
        <Alert data-testid="po-decision-note">
          <AlertDescription className="flex items-center gap-3">
            {t("purchaseOrders.waitingForCommittee")}
            <Link href={`/decisions/${po.decision.id}`} className="text-primary hover:underline">
              {t("purchaseOrders.openDecision")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {po.status === "FULLY_APPROVED" && (
        <Alert data-testid="po-vendor-note">
          <AlertDescription>{t("purchaseOrders.waitingForVendor")}</AlertDescription>
        </Alert>
      )}
      {po.reason && (po.status === "REJECTED" || po.status === "DECLINED_BY_VENDOR") && (
        <Alert variant="destructive" data-testid="po-reason">
          <AlertDescription>
            {t("purchaseOrders.fields.reason")}: {po.reason}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <PoBodyView
            body={po}
            fields={
              <>
                <Field label={t("purchaseOrders.fields.vendor")}>{po.vendor.name}</Field>
                <Field label={t("purchaseOrders.fields.sourcing")}>
                  {po.sourcing.id ? (
                    <Link href={`/sourcing/${po.sourcing.id}`} className="text-primary hover:underline" data-testid="po-sourcing-link">
                      {po.sourcing.number}
                    </Link>
                  ) : (
                    po.sourcing.number
                  )}
                </Field>
                {po.winnerMinutes && (
                  <Field label={t("purchaseOrders.fields.winnerMinutes")}>
                    <Link href={`/minutes/${po.winnerMinutes.id}`} className="text-primary hover:underline" data-testid="po-minutes-link">
                      {po.winnerMinutes.number}
                    </Link>
                  </Field>
                )}
                {po.decision && (
                  <Field label={t("purchaseOrders.fields.decision")}>
                    <Link href={`/decisions/${po.decision.id}`} className="text-primary hover:underline" data-testid="po-decision-link">
                      {t(`status.${po.decision.status}`)}
                    </Link>
                  </Field>
                )}
                <Field label={t("purchaseOrders.fields.created")}>{formatDateTime(po.createdAt)}</Field>
              </>
            }
          />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="purchase_order" recordId={po.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
