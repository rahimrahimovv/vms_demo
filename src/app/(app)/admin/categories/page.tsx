import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { flattenTree, type CategoryNode, type CategoryRow } from "@/lib/categories";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { EntryDialog, type EntryField } from "@/components/admin/entry-dialog";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCategory, saveCategory } from "./actions";

/** The category and everything below it (a category cannot move under itself). */
function subtree(nodes: CategoryNode[], id: string): Set<string> {
  const out = new Set([id]);
  for (const n of nodes) if (n.parent_id && out.has(n.parent_id)) out.add(n.id);
  return out;
}

/**
 * MDM-02 AC1, AC2, AC5, AC6: the category tree, nested to any depth, with the licence flag;
 * add a top-level or child category, edit, deactivate, delete.
 */
export default async function CategoriesPage() {
  const { allowed } = await checkSection("adminCategories");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const [{ data: rows }, { data: items }] = await Promise.all([
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
    supabase.from("item").select("category_id"),
  ]);
  const nodes = flattenTree(rows ?? []);
  const itemCount = new Map<string, number>();
  for (const i of items ?? []) itemCount.set(i.category_id, (itemCount.get(i.category_id) ?? 0) + 1);

  const parentOptions = (exclude: Set<string>) =>
    nodes
      .filter((n) => !exclude.has(n.id) && n.is_active)
      .map((n) => ({ value: n.id, label: `${"  ".repeat(n.depth)}${n.name}` }));
  const fields = (exclude: Set<string>, keepParent?: string | null): EntryField[] => {
    const options = parentOptions(exclude);
    const current = keepParent ? nodes.find((n) => n.id === keepParent) : undefined;
    if (current && !options.some((o) => o.value === current.id)) options.push({ value: current.id, label: current.name });
    return [
      { name: "name", label: t("categoryAdmin.fields.name"), type: "text", required: true },
      { name: "parentId", label: t("categoryAdmin.fields.parent"), type: "select", options },
      { name: "licenceRequired", label: t("categoryAdmin.fields.licence"), type: "checkbox", hint: t("categoryAdmin.hints.licence"), wide: true },
      { name: "isActive", label: t("common.active"), type: "checkbox", hint: t("dictionaries.hints.inactive"), wide: true },
    ];
  };

  const addButton = (
    <EntryDialog
      title={t("categoryAdmin.addTitle")}
      trigger={
        <>
          <Plus className="size-4" aria-hidden />
          {t("categoryAdmin.add")}
        </>
      }
      testId="add-category"
      fields={fields(new Set())}
      values={{ licenceRequired: false }}
      action={saveCategory.bind(null, null)}
    />
  );

  if (nodes.length === 0) return <EmptyState message={t("categoryAdmin.empty")} action={addButton} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">{addButton}</div>
      <div className="surface-solid overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>{t("categoryAdmin.columns.name")}</TableHead>
              <TableHead>{t("categoryAdmin.columns.licence")}</TableHead>
              <TableHead className="text-right">{t("categoryAdmin.columns.items")}</TableHead>
              <TableHead>{t("categoryAdmin.columns.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((n) => (
              <TableRow key={n.id} data-testid="category-row" data-category={n.name}>
                <TableCell>
                  <span style={{ paddingLeft: `${n.depth * 1.5}rem` }} className="font-medium">
                    {n.name}
                  </span>
                </TableCell>
                <TableCell>
                  {n.licence_required ? (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="size-3" aria-hidden />
                      {t("categoryAdmin.licence")}
                    </Badge>
                  ) : n.needsLicence ? (
                    <span className="text-xs text-muted-foreground">{t("categoryAdmin.licenceInherited")}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{itemCount.get(n.id) ?? 0}</TableCell>
                <TableCell>
                  <StatusBadge status={n.is_active ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EntryDialog
                      title={t("categoryAdmin.addChildTitle", { parent: n.name })}
                      trigger={
                        <>
                          <Plus className="size-3.5" aria-hidden />
                          {t("categoryAdmin.addChild")}
                        </>
                      }
                      triggerVariant="ghost"
                      triggerSize="sm"
                      testId="add-child"
                      fields={fields(new Set())}
                      values={{ parentId: n.id, licenceRequired: false }}
                      action={saveCategory.bind(null, null)}
                    />
                    <EntryDialog
                      title={t("categoryAdmin.editTitle")}
                      trigger={
                        <>
                          <Pencil className="size-3.5" aria-hidden />
                          {t("common.edit")}
                        </>
                      }
                      triggerVariant="ghost"
                      triggerSize="sm"
                      testId="edit-category"
                      fields={fields(subtree(nodes, n.id), n.parent_id)}
                      values={{ name: n.name, parentId: n.parent_id, licenceRequired: n.licence_required, isActive: n.is_active }}
                      action={saveCategory.bind(null, n.id)}
                    />
                    <ConfirmAction
                      trigger={
                        <>
                          <Trash2 className="size-3.5" aria-hidden />
                          {t("common.delete")}
                        </>
                      }
                      title={t("common.deleteTitle", { name: n.name })}
                      description={t("common.deleteConfirm")}
                      confirmLabel={t("common.delete")}
                      testId="delete-category"
                      action={deleteCategory.bind(null, n.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
