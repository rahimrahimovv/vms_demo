import { Lock, Pencil, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { QUARTERS } from "@/lib/master-data/validate";
import { PLAN_LINE_COLUMNS, type PlanLineSummary } from "@/lib/requisitions/queries";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { EntryDialog, type EntryField } from "@/components/admin/entry-dialog";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { closePlanLine, savePlanLine } from "./actions";

/**
 * PLN-01: the annual plan. Everyone with "View the plan" reads planned, committed and remaining
 * per line (AC3, AC5); only the Admin adds, edits and closes lines (AC1, AC2).
 */
export default async function PlanPage() {
  const { user, allowed } = await checkSection("plan");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const isAdmin = user.roles.includes("ADMIN");
  const [{ data }, { data: categories }, { data: linked }] = await Promise.all([
    supabase
      .from("plan_line_summary")
      .select(PLAN_LINE_COLUMNS)
      .order("year", { ascending: false })
      .order("quarter")
      .returns<PlanLineSummary[]>(),
    isAdmin
      ? supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>()
      : Promise.resolve({ data: [] as CategoryRow[] }),
    isAdmin ? supabase.from("requisition").select("plan_line_id") : Promise.resolve({ data: [] as { plan_line_id: string }[] }),
  ]);
  const lines = data ?? [];
  const nodes = flattenTree(categories ?? []);
  const used = new Set((linked ?? []).map((r) => r.plan_line_id));

  const fields = (line?: PlanLineSummary): EntryField[] => [
    { name: "year", label: t("plan.fields.year"), type: "number", step: "1", required: true },
    {
      name: "quarter",
      label: t("plan.fields.quarter"),
      type: "select",
      required: true,
      options: QUARTERS.map((q) => ({ value: q, label: q })),
    },
    {
      name: "categoryId",
      label: t("plan.fields.category"),
      type: "select",
      required: true,
      wide: true,
      readOnly: line ? used.has(line.id) : false,
      hint: line && used.has(line.id) ? t("plan.hints.categoryFixed") : undefined,
      options: nodes.filter((n) => n.is_active || n.id === line?.category_id).map((n) => ({ value: n.id, label: n.path })),
    },
    { name: "description", label: t("plan.fields.description"), type: "text", required: true, wide: true },
    { name: "plannedAmount", label: t("plan.fields.plannedAmount"), type: "number", step: "0.01", required: true },
  ];

  const addButton = isAdmin ? (
    <EntryDialog
      title={t("plan.addTitle")}
      trigger={
        <>
          <Plus className="size-4" aria-hidden />
          {t("plan.add")}
        </>
      }
      testId="add-plan-line"
      fields={fields()}
      values={{ year: new Date().getFullYear().toString() }}
      action={savePlanLine.bind(null, null)}
    />
  ) : undefined;

  const amount = (v: string) => ({ sort: Number(v), node: formatAmount(v) });
  const rows: Row[] = lines.map((l) => ({
    id: l.id,
    cells: {
      year: { sort: l.year, node: l.year },
      category: { sort: l.category_name, node: l.category_name },
      description: { sort: l.description, node: <span className="font-medium">{l.description}</span> },
      quarter: { sort: l.quarter, node: l.quarter },
      planned: amount(l.planned_amount),
      committed: amount(l.committed_amount),
      remaining: {
        sort: Number(l.remaining_amount),
        node: <span className={Number(l.remaining_amount) < 0 ? "font-medium text-destructive" : undefined}>{formatAmount(l.remaining_amount)}</span>,
      },
      status: { sort: l.status, node: <StatusBadge status={l.status} /> },
      actions: {
        sort: "",
        node:
          isAdmin && l.status === "ACTIVE" ? (
            <div className="flex justify-end gap-1" data-testid="plan-actions" data-line={l.description}>
              <EntryDialog
                title={t("plan.editTitle")}
                trigger={
                  <>
                    <Pencil className="size-3.5" aria-hidden />
                    {t("common.edit")}
                  </>
                }
                triggerVariant="ghost"
                triggerSize="sm"
                testId="edit-plan-line"
                fields={fields(l)}
                values={{
                  year: String(l.year),
                  quarter: l.quarter,
                  categoryId: l.category_id,
                  description: l.description,
                  plannedAmount: Number(l.planned_amount).toFixed(2),
                }}
                action={savePlanLine.bind(null, l.id)}
              />
              <ConfirmAction
                trigger={
                  <>
                    <Lock className="size-3.5" aria-hidden />
                    {t("plan.close")}
                  </>
                }
                title={t("plan.closeTitle", { description: l.description })}
                description={t("plan.closeConfirm")}
                confirmLabel={t("plan.close")}
                testId="close-plan-line"
                destructive={false}
                action={closePlanLine.bind(null, l.id)}
              />
            </div>
          ) : null,
      },
    },
  }));

  const columns = [
    { key: "year", label: t("plan.columns.year") },
    { key: "quarter", label: t("plan.columns.quarter") },
    { key: "category", label: t("plan.columns.category") },
    { key: "description", label: t("plan.columns.description") },
    { key: "planned", label: t("plan.columns.planned"), align: "right" as const },
    { key: "committed", label: t("plan.columns.committed"), align: "right" as const },
    { key: "remaining", label: t("plan.columns.remaining"), align: "right" as const },
    { key: "status", label: t("plan.columns.status") },
    ...(isAdmin ? [{ key: "actions", label: t("common.actions"), sortable: false, align: "right" as const }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t("plan.hints.committed")}</p>
        {lines.length > 0 && addButton}
      </div>
      {lines.length === 0 ? (
        <EmptyState message={t(isAdmin ? "plan.empty" : "plan.emptyReader")} action={addButton} />
      ) : (
        <SortableTable columns={columns} rows={rows} initialSort={{ key: "year", dir: "desc" }} />
      )}
    </div>
  );
}
