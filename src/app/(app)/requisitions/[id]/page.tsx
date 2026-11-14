import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { bakuToday } from "@/lib/vendors/rules";
import { loadFormOptions, type RequisitionLineRow } from "@/lib/requisitions/queries";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { DecisionPanel } from "@/components/decision-panel";
import { RequisitionForm } from "@/components/requisition-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StartSourcing } from "@/components/start-sourcing";
import { startSourcing } from "../../sourcing/actions";
import { decideRequisition, saveRequisition } from "../actions";

type PrRecord = {
  id: string;
  number: string;
  status: string;
  estimated_value: string;
  decision_comment: string | null;
  submitted_at: string | null;
  created_at: string;
  requester_id: string;
  plan_line_id: string;
  requester: { full_name: string } | null;
  plan_line: { year: number; description: string; quarter: string; category_id: string; category: { name: string } | null } | null;
};

type LineView = RequisitionLineRow & {
  item: { code: string; name: string; unit: string; category: { name: string } | null } | null;
  place: { name: string } | null;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * PR record: number, status badge and the Approver's decision on the right (PR-02); Details and
 * History tabs. The Requester edits own DRAFT or RETURNED PRs here (PR-01 AC5, AC7).
 */
export default async function RequisitionPage({ params, searchParams }: PageProps<"/requisitions/[id]">) {
  const { user, allowed } = await checkSection("requisitions");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: pr } = await supabase
    .from("requisition")
    .select(
      "id, number, status, estimated_value, decision_comment, submitted_at, created_at, requester_id, plan_line_id, requester:app_user!requisition_requester_id_fkey(full_name), plan_line(year, description, quarter, category_id, category(name))",
    )
    .eq("id", id)
    .returns<PrRecord[]>()
    .maybeSingle();
  if (!pr) return <NoAccess />;

  const [{ data: lineData }, { data: excess }] = await Promise.all([
    supabase
      .from("requisition_line")
      .select(
        "id, item_id, quantity, estimated_unit_price, delivery_date, delivery_place_id, specification, item(code, name, unit, category(name)), place:delivery_place(name)",
      )
      .eq("requisition_id", id)
      .order("id")
      .returns<LineView[]>(),
    supabase.rpc("requisition_plan_excess", { p_id: id }),
  ]);
  const lines = lineData ?? [];
  const own = pr.requester_id === user.id;
  const editable = own && user.roles.includes("REQUESTER") && (pr.status === "DRAFT" || pr.status === "RETURNED");
  // PR-02 AC4: no decision buttons on one's own PR (#83)
  const canDecide = user.roles.includes("APPROVER") && !own && pr.status === "PENDING_APPROVAL";
  const overPlan = Number(excess ?? 0);

  const planWarning =
    overPlan > 0 && pr.status !== "REJECTED" ? (
      <Alert className="surface-warning" data-testid="plan-warning">
        <AlertTriangle className="size-4" aria-hidden />
        <AlertDescription>{t("requisitions.planWarning", { amount: formatAmount(overPlan) })}</AlertDescription>
      </Alert>
    ) : null;

  // RFQ-01 AC1, RFQ-06 AC1: the Procurement Specialist starts sourcing on an APPROVED PR
  const canStart = user.roles.includes("PROCUREMENT_SPECIALIST") && pr.status === "APPROVED" && pr.plan_line;
  const avl = canStart ? ((await supabase.rpc("avl_list", { p_category: pr.plan_line!.category_id })).data ?? []) : [];

  const actions = canStart ? (
    <StartSourcing
      action={startSourcing.bind(null, pr.id)}
      vendors={(avl as { vendor_id: string; legal_name: string }[]).map((v) => ({ id: v.vendor_id, name: v.legal_name }))}
    />
  ) : canDecide ? (
    <div className="flex flex-col items-end gap-3">
      {planWarning}
      <DecisionPanel
        action={decideRequisition.bind(null, pr.id)}
        options={[
          { value: "APPROVE", label: t("decision.approve"), comment: "none" },
          { value: "RETURN", label: t("decision.return"), variant: "outline", comment: "required", commentLabel: t("decision.comment") },
          { value: "REJECT", label: t("decision.reject"), variant: "destructive", comment: "required", commentLabel: t("decision.reason") },
        ]}
      />
    </div>
  ) : undefined;

  const options = editable
    ? await loadFormOptions(supabase, {
        planLineId: pr.plan_line_id,
        itemIds: lines.map((l) => l.item_id),
        placeIds: lines.map((l) => l.delivery_place_id),
      })
    : null;
  const plan = pr.plan_line;

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={pr.number}
        subtitle={plan ? `${plan.year} · ${plan.category?.name ?? ""} · ${plan.description}` : undefined}
        status={pr.status}
        actions={actions}
      />

      {query.submitted === "1" && (
        <Alert data-testid="submitted-note">
          <AlertDescription>{t("requisitions.submittedNote")}</AlertDescription>
        </Alert>
      )}
      {query.saved === "1" && pr.status === "DRAFT" && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("requisitions.saved")}</AlertDescription>
        </Alert>
      )}
      {pr.status === "RETURNED" && pr.decision_comment && (
        <Alert className="surface-warning" data-testid="returned-comment">
          <AlertTitle>{t("requisitions.returnedTitle")}</AlertTitle>
          <AlertDescription>{pr.decision_comment}</AlertDescription>
        </Alert>
      )}
      {pr.status === "REJECTED" && pr.decision_comment && (
        <Alert variant="destructive" data-testid="rejected-reason">
          <AlertTitle>{t("requisitions.rejectedTitle")}</AlertTitle>
          <AlertDescription>{pr.decision_comment}</AlertDescription>
        </Alert>
      )}
      {pr.status === "PENDING_APPROVAL" && !canDecide && (
        <Alert data-testid="pending-note">
          <AlertDescription>
            {t(own && user.roles.includes("APPROVER") ? "requisitions.ownRequestNote" : "requisitions.pendingNote")}
          </AlertDescription>
        </Alert>
      )}
      {!canDecide && pr.status === "PENDING_APPROVAL" && planWarning}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="flex flex-col gap-5 pt-4">
          {editable && options ? (
            <RequisitionForm
              action={saveRequisition.bind(null, pr.id)}
              initial={{
                planLineId: pr.plan_line_id,
                lines: lines.map((l) => ({
                  itemId: l.item_id,
                  quantity: String(Number(l.quantity)),
                  price: Number(l.estimated_unit_price).toFixed(2),
                  deliveryDate: l.delivery_date,
                  deliveryPlaceId: l.delivery_place_id,
                  specification: l.specification ?? "",
                })),
              }}
              {...options}
              today={bakuToday()}
            />
          ) : (
            <>
              <Card>
                <CardContent>
                  <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="pr-details">
                    <Field label={t("requisitions.details.requester")}>{pr.requester?.full_name ?? ""}</Field>
                    <Field label={t("requisitions.details.created")}>{formatDateTime(pr.created_at)}</Field>
                    <Field label={t("requisitions.details.submitted")}>
                      {pr.submitted_at ? formatDateTime(pr.submitted_at) : t("common.none")}
                    </Field>
                    <Field label={t("requisitions.details.value")}>
                      <span className="font-semibold tabular-nums" data-testid="estimated-value">
                        {formatAmount(pr.estimated_value)}
                      </span>
                    </Field>
                  </dl>
                </CardContent>
              </Card>
              <div className="surface-solid overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t("items.columns.code")}</TableHead>
                      <TableHead>{t("items.columns.name")}</TableHead>
                      <TableHead>{t("requisitions.fields.category")}</TableHead>
                      <TableHead className="text-right">{t("requisitions.fields.quantity")}</TableHead>
                      <TableHead>{t("requisitions.fields.unit")}</TableHead>
                      <TableHead className="text-right">{t("requisitions.columns.unitPrice")}</TableHead>
                      <TableHead className="text-right">{t("requisitions.fields.lineValue")}</TableHead>
                      <TableHead>{t("requisitions.fields.deliveryDate")}</TableHead>
                      <TableHead>{t("requisitions.fields.deliveryPlace")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <TableRow key={l.id} data-testid="pr-line-row">
                        <TableCell className="tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-medium">{l.item?.code}</TableCell>
                        <TableCell>
                          {l.item?.name}
                          {l.specification && (
                            <p className="max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">{l.specification}</p>
                          )}
                        </TableCell>
                        <TableCell>{l.item?.category?.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(l.quantity)}</TableCell>
                        <TableCell>{l.item?.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatAmount(l.estimated_unit_price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(Number(l.quantity) * Number(l.estimated_unit_price))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(l.delivery_date)}</TableCell>
                        <TableCell>{l.place?.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="requisition" recordId={pr.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
