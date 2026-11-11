import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { EntryDialog, SELECT_CLASS, type EntryField } from "@/components/admin/entry-dialog";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteItem, saveItem } from "../categories/actions";

type ItemRow = { id: string; code: string; name: string; unit: string; category_id: string; is_active: boolean };

/** MDM-02 AC4, AC5: the item catalogue with code, name, unit and category; search and category filter. */
export default async function ItemsPage({ searchParams }: PageProps<"/admin/items">) {
  const { allowed } = await checkSection("adminItems");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const categoryFilter = typeof params.category === "string" ? params.category : "";

  const [{ data: categories }, { data: itemData }] = await Promise.all([
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
    supabase.from("item").select("id, code, name, unit, category_id, is_active").order("code").returns<ItemRow[]>(),
  ]);
  const nodes = flattenTree(categories ?? []);
  const paths = new Map(nodes.map((n) => [n.id, n.path]));
  // A filter on a category shows its children's items too (the tree, MDM-02 AC4)
  const inFilter = new Set<string>();
  if (categoryFilter) {
    inFilter.add(categoryFilter);
    for (const n of nodes) if (n.parent_id && inFilter.has(n.parent_id)) inFilter.add(n.id);
  }
  const needle = q.toLowerCase();
  const items = (itemData ?? []).filter(
    (i) =>
      (!categoryFilter || inFilter.has(i.category_id)) &&
      (!needle || i.code.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle)),
  );

  const fields = (keepCategory?: string): EntryField[] => [
    { name: "code", label: t("items.fields.code"), type: "text", required: true, hint: t("items.hints.code") },
    { name: "unit", label: t("items.fields.unit"), type: "text", required: true, hint: t("items.hints.unit") },
    { name: "name", label: t("items.fields.name"), type: "text", required: true, wide: true },
    {
      name: "categoryId",
      label: t("items.fields.category"),
      type: "select",
      required: true,
      wide: true,
      options: nodes.filter((n) => n.is_active || n.id === keepCategory).map((n) => ({ value: n.id, label: n.path })),
    },
    { name: "isActive", label: t("common.active"), type: "checkbox", hint: t("dictionaries.hints.inactive"), wide: true },
  ];

  const addButton = (
    <EntryDialog
      title={t("items.addTitle")}
      trigger={
        <>
          <Plus className="size-4" aria-hidden />
          {t("items.add")}
        </>
      }
      testId="add-item"
      fields={fields()}
      values={{ categoryId: categoryFilter }}
      action={saveItem.bind(null, null)}
    />
  );

  const rows: Row[] = items.map((i) => ({
    id: i.id,
    cells: {
      code: { sort: i.code, node: <span className="font-medium">{i.code}</span> },
      name: { sort: i.name, node: i.name },
      unit: { sort: i.unit, node: i.unit },
      category: { sort: paths.get(i.category_id) ?? "", node: paths.get(i.category_id) ?? "" },
      status: { sort: i.is_active ? 0 : 1, node: <StatusBadge status={i.is_active ? "ACTIVE" : "INACTIVE"} /> },
      actions: {
        sort: "",
        node: (
          <div className="flex justify-end gap-1" data-testid="item-actions" data-item={i.code}>
            <EntryDialog
              title={t("items.editTitle")}
              trigger={
                <>
                  <Pencil className="size-3.5" aria-hidden />
                  {t("common.edit")}
                </>
              }
              triggerVariant="ghost"
              triggerSize="sm"
              testId="edit-item"
              fields={fields(i.category_id)}
              values={{ code: i.code, name: i.name, unit: i.unit, categoryId: i.category_id, isActive: i.is_active }}
              action={saveItem.bind(null, i.id)}
            />
            <ConfirmAction
              trigger={
                <>
                  <Trash2 className="size-3.5" aria-hidden />
                  {t("common.delete")}
                </>
              }
              title={t("common.deleteTitle", { name: i.code })}
              description={t("common.deleteConfirm")}
              confirmLabel={t("common.delete")}
              testId="delete-item"
              action={deleteItem.bind(null, i.id)}
            />
          </div>
        ),
      },
    },
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <form className="flex items-end gap-2" method="get">
          <Input name="q" defaultValue={q} placeholder={t("items.search")} aria-label={t("items.search")} className="w-64" />
          <select name="category" defaultValue={categoryFilter} aria-label={t("items.fields.category")} className={`${SELECT_CLASS} w-72`}>
            <option value="">{t("items.allCategories")}</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.path}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            {t("items.filter")}
          </Button>
          {(q || categoryFilter) && (
            <Button asChild variant="ghost">
              <Link href="/admin/items">{t("items.clear")}</Link>
            </Button>
          )}
        </form>
        {addButton}
      </div>
      {items.length === 0 ? (
        <EmptyState message={t("items.empty")} action={addButton} />
      ) : (
        <SortableTable
          columns={[
            { key: "code", label: t("items.columns.code") },
            { key: "name", label: t("items.columns.name") },
            { key: "unit", label: t("items.columns.unit") },
            { key: "category", label: t("items.columns.category") },
            { key: "status", label: t("items.columns.status") },
            { key: "actions", label: t("common.actions"), sortable: false, align: "right" },
          ]}
          rows={rows}
          initialSort={{ key: "code", dir: "asc" }}
        />
      )}
    </div>
  );
}
