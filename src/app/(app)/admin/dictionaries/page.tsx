import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PLACE_TYPES } from "@/lib/master-data/validate";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Column, type Row } from "@/components/sortable-table";
import { EntryDialog, type EntryField } from "@/components/admin/entry-dialog";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { deleteDictionaryEntry, saveDictionaryEntry, type DictionaryKind } from "./actions";

const KINDS: DictionaryKind[] = ["incoterms", "paymentTerms", "deliveryPlaces", "deliveryModes", "currencies"];

type Entry = {
  key: string;
  values: Record<string, string | boolean | null>;
  cells: Record<string, { node: React.ReactNode; sort: string | number }>;
};

/**
 * MDM-01: the Admin keeps the dictionaries behind the Incoterm, payment term, delivery place,
 * delivery mode and currency dropdowns. One tab per dictionary; add, edit, deactivate, delete.
 */
export default async function DictionariesPage({ searchParams }: PageProps<"/admin/dictionaries">) {
  const { allowed } = await checkSection("adminDictionaries");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const params = await searchParams;
  const kind = (KINDS as string[]).includes(String(params.tab)) ? (params.tab as DictionaryKind) : "incoterms";
  const status = (active: boolean) => ({ sort: active ? 0 : 1, node: <StatusBadge status={active ? "ACTIVE" : "INACTIVE"} /> });
  const text = (v: string) => ({ sort: v, node: v });

  const nameField: EntryField = { name: "name", label: t("dictionaries.fields.name"), type: "text", required: true, wide: true };
  const activeField: EntryField = {
    name: "isActive",
    label: t("common.active"),
    type: "checkbox",
    hint: t("dictionaries.hints.inactive"),
    wide: true,
  };

  let entries: Entry[] = [];
  let columns: Column[] = [];
  let fields: (isNew: boolean) => EntryField[] = () => [nameField, activeField];

  if (kind === "incoterms") {
    const { data } = await supabase.from("incoterm").select("code, name, is_active").order("code");
    entries = (data ?? []).map((r) => ({
      key: r.code,
      values: { code: r.code, name: r.name, isActive: r.is_active },
      cells: { code: text(r.code), name: text(r.name), status: status(r.is_active) },
    }));
    columns = [
      { key: "code", label: t("dictionaries.columns.code") },
      { key: "name", label: t("dictionaries.columns.name") },
      { key: "status", label: t("dictionaries.columns.status") },
    ];
    fields = () => [{ name: "code", label: t("dictionaries.fields.code"), type: "text", readOnly: true }, { ...nameField, wide: false }, activeField];
  } else if (kind === "currencies") {
    const { data } = await supabase.from("currency").select("code, name, is_active").order("code");
    entries = (data ?? []).map((r) => ({
      key: r.code,
      values: { code: r.code, name: r.name, isActive: r.is_active },
      cells: { code: text(r.code), name: text(r.name), status: status(r.is_active) },
    }));
    columns = [
      { key: "code", label: t("dictionaries.columns.code") },
      { key: "name", label: t("dictionaries.columns.name") },
      { key: "status", label: t("dictionaries.columns.status") },
    ];
    fields = (isNew) => [
      { name: "code", label: t("dictionaries.fields.isoCode"), type: "text", required: isNew, readOnly: !isNew, hint: t("dictionaries.hints.isoCode") },
      { ...nameField, wide: false },
      activeField,
    ];
  } else if (kind === "paymentTerms") {
    const { data } = await supabase.from("payment_term").select("id, name, advance_percent, days_after_delivery, is_active").order("name");
    entries = (data ?? []).map((r) => ({
      key: r.id,
      values: {
        name: r.name,
        advancePercent: String(Number(r.advance_percent)),
        daysAfterDelivery: String(r.days_after_delivery),
        isActive: r.is_active,
      },
      cells: {
        name: text(r.name),
        advancePercent: { sort: Number(r.advance_percent), node: `${Number(r.advance_percent)}%` },
        daysAfterDelivery: { sort: r.days_after_delivery, node: r.days_after_delivery },
        status: status(r.is_active),
      },
    }));
    columns = [
      { key: "name", label: t("dictionaries.columns.name") },
      { key: "advancePercent", label: t("dictionaries.columns.advancePercent"), align: "right" },
      { key: "daysAfterDelivery", label: t("dictionaries.columns.daysAfterDelivery"), align: "right" },
      { key: "status", label: t("dictionaries.columns.status") },
    ];
    fields = () => [
      nameField,
      { name: "advancePercent", label: t("dictionaries.fields.advancePercent"), type: "number", step: "0.01", required: true },
      { name: "daysAfterDelivery", label: t("dictionaries.fields.daysAfterDelivery"), type: "number", step: "1", required: true },
      activeField,
    ];
  } else if (kind === "deliveryPlaces") {
    const { data } = await supabase.from("delivery_place").select("id, name, type, address, is_active").order("name");
    entries = (data ?? []).map((r) => ({
      key: r.id,
      values: { name: r.name, type: r.type, address: r.address, isActive: r.is_active },
      cells: {
        name: text(r.name),
        type: text(t(`placeTypes.${r.type}`)),
        address: text(r.address),
        status: status(r.is_active),
      },
    }));
    columns = [
      { key: "name", label: t("dictionaries.columns.name") },
      { key: "type", label: t("dictionaries.columns.type") },
      { key: "address", label: t("dictionaries.columns.address") },
      { key: "status", label: t("dictionaries.columns.status") },
    ];
    fields = () => [
      { ...nameField, wide: false },
      {
        name: "type",
        label: t("dictionaries.fields.type"),
        type: "select",
        required: true,
        options: PLACE_TYPES.map((p) => ({ value: p, label: t(`placeTypes.${p}`) })),
      },
      { name: "address", label: t("dictionaries.fields.address"), type: "text", required: true, wide: true },
      activeField,
    ];
  } else {
    const { data } = await supabase.from("delivery_mode").select("id, name, is_active").order("name");
    entries = (data ?? []).map((r) => ({
      key: r.id,
      values: { name: r.name, isActive: r.is_active },
      cells: { name: text(r.name), status: status(r.is_active) },
    }));
    columns = [
      { key: "name", label: t("dictionaries.columns.name") },
      { key: "status", label: t("dictionaries.columns.status") },
    ];
  }

  const canAdd = kind !== "incoterms";
  const addButton = canAdd ? (
    <EntryDialog
      title={t(`dictionaries.add.${kind}`)}
      trigger={
        <>
          <Plus className="size-4" aria-hidden />
          {t(`dictionaries.add.${kind}`)}
        </>
      }
      testId="add-entry"
      fields={fields(true)}
      action={saveDictionaryEntry.bind(null, kind, null)}
    />
  ) : undefined;

  const rows: Row[] = entries.map((e) => {
    const label = String(e.values.name ?? e.key);
    return {
      id: e.key,
      cells: {
        ...e.cells,
        actions: {
          sort: "",
          node: (
            <div className="flex justify-end gap-1" data-testid="entry-actions" data-entry={label}>
              <EntryDialog
                title={t(`dictionaries.edit.${kind}`)}
                trigger={
                  <>
                    <Pencil className="size-3.5" aria-hidden />
                    {t("common.edit")}
                  </>
                }
                triggerVariant="ghost"
                triggerSize="sm"
                testId="edit-entry"
                fields={fields(false)}
                values={e.values}
                action={saveDictionaryEntry.bind(null, kind, e.key)}
              />
              {canAdd && (
                <ConfirmAction
                  trigger={
                    <>
                      <Trash2 className="size-3.5" aria-hidden />
                      {t("common.delete")}
                    </>
                  }
                  title={t("common.deleteTitle", { name: label })}
                  description={t("common.deleteConfirm")}
                  confirmLabel={t("common.delete")}
                  testId="delete-entry"
                  action={deleteDictionaryEntry.bind(null, kind, e.key)}
                />
              )}
            </div>
          ),
        },
      },
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex w-fit gap-1 rounded-[18px] border border-(--glass-tabs-border) bg-(--glass-tabs-bg) p-1 backdrop-blur-md" aria-label={t("dictionaries.tabsLabel")}>
        {KINDS.map((key) => (
          <Link
            key={key}
            href={key === "incoterms" ? "/admin/dictionaries" : `/admin/dictionaries?tab=${key}`}
            aria-current={kind === key ? "page" : undefined}
            data-testid={`tab-${key}`}
            className={cn(
              "rounded-[14px] px-3.5 py-1.5 text-sm",
              kind === key ? "bg-(--glass-tab-active-bg) font-semibold text-brand-ink shadow-[0_2px_8px_rgba(23,38,43,0.1)]" : "text-[#3d4a50] hover:text-foreground",
            )}
          >
            {t(`dictionaries.tabs.${key}`)}
          </Link>
        ))}
      </nav>

      <div className="flex items-start justify-between gap-4">
        {kind === "incoterms" || kind === "currencies" ? (
          <Alert className="max-w-3xl">
            <AlertDescription>{t(kind === "incoterms" ? "dictionaries.incotermNote" : "dictionaries.currencyNote")}</AlertDescription>
          </Alert>
        ) : (
          <span />
        )}
        {entries.length > 0 && addButton}
      </div>

      {entries.length === 0 ? (
        <EmptyState message={t(`dictionaries.empty.${kind}`)} action={addButton} />
      ) : (
        <SortableTable
          columns={[...columns, { key: "actions", label: t("common.actions"), sortable: false, align: "right" }]}
          rows={rows}
          initialSort={{ key: columns[0].key, dir: "asc" }}
        />
      )}
    </div>
  );
}
