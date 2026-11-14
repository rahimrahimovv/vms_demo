import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { ACTIVITIES, CERTIFICATE_TYPES } from "@/lib/vendors/constants";
import { bakuToday, certificateStatus } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { SortableTable, type Row } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AvlRow = {
  vendor_id: string;
  legal_name: string;
  vendor_type: string;
  country_code: string;
  grade: string;
  grade_valid_until: string;
  valid_until: string;
  main_activity: string | null;
  bank_guarantee_available: boolean;
};

const SELECT_CLASS = "h-9 w-full rounded-[14px] border border-input bg-(--field-bg) px-3 text-sm";
const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/**
 * REG-04 AC4: vendors with standing ACTIVE, a valid grade A-C and a QUALIFIED, unexpired
 * application in the category or a parent (computed in the database, public.avl_list).
 * REG-06 AC9: filters on activity, brand, bank guarantee and a valid certificate of a type.
 */
export default async function AvlPage({ searchParams }: PageProps<"/avl">) {
  const { allowed } = await checkSection("avl");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();
  const params = await searchParams;
  const category = param(params.category);
  const activity = param(params.activity);
  const brand = param(params.brand).trim().toLowerCase();
  const guarantee = params.guarantee === "1";
  const certificate = param(params.certificate);

  const { data: categoryRows } = await supabase
    .from("category")
    .select("id, parent_id, name, licence_required, is_active")
    .eq("is_active", true)
    .returns<CategoryRow[]>();
  const tree = flattenTree(categoryRows ?? []);

  let rows: AvlRow[] = [];
  if (category) {
    const { data } = await supabase.rpc("avl_list", { p_category: category });
    rows = (data ?? []) as AvlRow[];
    const ids = rows.map((r) => r.vendor_id);
    if (ids.length > 0 && (brand || certificate)) {
      const [{ data: brands }, { data: certs }] = await Promise.all([
        supabase.from("vendor_brand").select("vendor_id, brand").in("vendor_id", ids),
        supabase.from("vendor_certificate").select("vendor_id, type, expires_on").in("vendor_id", ids),
      ]);
      if (brand) {
        const match = new Set((brands ?? []).filter((b) => b.brand.toLowerCase().includes(brand)).map((b) => b.vendor_id));
        rows = rows.filter((r) => match.has(r.vendor_id));
      }
      if (certificate) {
        // "Valid certificate of type X": VALID or EXPIRING (not yet expired)
        const match = new Set(
          (certs ?? [])
            .filter((c) => c.type === certificate && certificateStatus(c.expires_on, today) !== "EXPIRED")
            .map((c) => c.vendor_id),
        );
        rows = rows.filter((r) => match.has(r.vendor_id));
      }
    }
    if (activity) rows = rows.filter((r) => r.main_activity === activity);
    if (guarantee) rows = rows.filter((r) => r.bank_guarantee_available);
  }

  const tableRows: Row[] = rows.map((r) => ({
    id: r.vendor_id,
    cells: {
      name: {
        sort: r.legal_name,
        node: (
          <Link href={`/vendors/${r.vendor_id}`} className="font-medium text-primary hover:underline">
            {r.legal_name}
          </Link>
        ),
      },
      type: { sort: r.vendor_type, node: t(`vendorTypes.${r.vendor_type}`) },
      country: { sort: r.country_code, node: t(`countries.${r.country_code}`) },
      grade: { sort: r.grade, node: r.grade },
      validUntil: { sort: r.valid_until, node: formatDate(r.valid_until) },
    },
  }));

  return (
    <div className="flex flex-col gap-5">
      <form className="grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_auto_auto] items-end gap-4 surface-glass p-4" data-testid="avl-filters">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">{t("avl.filters.category")}</Label>
          <select id="category" name="category" defaultValue={category} className={SELECT_CLASS}>
            <option value="">{t("common.select")}</option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {`${"  ".repeat(c.depth)}${c.name}`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="activity">{t("avl.filters.activity")}</Label>
          <select id="activity" name="activity" defaultValue={activity} className={SELECT_CLASS}>
            <option value="">{t("avl.filters.any")}</option>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {t(`activities.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand">{t("avl.filters.brand")}</Label>
          <Input id="brand" name="brand" defaultValue={param(params.brand)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="certificate">{t("avl.filters.certificate")}</Label>
          <select id="certificate" name="certificate" defaultValue={certificate} className={SELECT_CLASS}>
            <option value="">{t("avl.filters.any")}</option>
            {CERTIFICATE_TYPES.map((c) => (
              <option key={c} value={c}>
                {t(`certificateTypes.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="guarantee" value="1" defaultChecked={guarantee} className="size-4 accent-primary" />
          {t("avl.filters.guarantee")}
        </label>
        <Button type="submit" data-testid="avl-apply">
          {t("avl.filters.apply")}
        </Button>
      </form>

      {!category ? (
        <EmptyState message={t("avl.pickCategory")} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("avl.empty")} />
      ) : (
        <SortableTable
          initialSort={{ key: "name", dir: "asc" }}
          columns={[
            { key: "name", label: t("vendors.columns.name") },
            { key: "type", label: t("vendors.columns.type") },
            { key: "country", label: t("vendors.columns.country") },
            { key: "grade", label: t("vendors.columns.grade") },
            { key: "validUntil", label: t("qualification.validUntil") },
          ]}
          rows={tableRows}
        />
      )}
    </div>
  );
}
