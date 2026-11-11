import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ancestorsOf, flattenTree, type CategoryRow } from "@/lib/categories";

export type PlanLineSummary = {
  id: string;
  year: number;
  category_id: string;
  category_name: string;
  description: string;
  planned_amount: string;
  quarter: string;
  status: string;
  committed_amount: string;
  remaining_amount: string;
};

export const PLAN_LINE_COLUMNS =
  "id, year, category_id, category_name, description, planned_amount, quarter, status, committed_amount, remaining_amount";

export type PlanLineOption = { id: string; year: number; categoryId: string; category: string; description: string; remaining: number };
export type ItemOption = { id: string; code: string; name: string; unit: string; category: string; ancestors: string[] };
export type PlaceOption = { id: string; name: string };

export type RequisitionLineRow = {
  id: string;
  item_id: string;
  quantity: string;
  estimated_unit_price: string;
  delivery_date: string;
  delivery_place_id: string;
  specification: string | null;
};

/**
 * Dropdowns of the PR form: ACTIVE plan lines, active items and delivery places, plus whatever
 * the PR already uses (a deactivated item or a closed line stays on the PR that has it).
 */
export async function loadFormOptions(
  supabase: SupabaseClient,
  keep: { planLineId?: string; itemIds?: string[]; placeIds?: string[] } = {},
) {
  const [{ data: plan }, { data: categories }, { data: items }, { data: places }] = await Promise.all([
    supabase.from("plan_line_summary").select(PLAN_LINE_COLUMNS).order("year", { ascending: false }).returns<PlanLineSummary[]>(),
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
    supabase.from("item").select("id, code, name, unit, category_id, is_active").order("code"),
    supabase.from("delivery_place").select("id, name, is_active").order("name"),
  ]);
  const keepItems = new Set(keep.itemIds ?? []);
  const keepPlaces = new Set(keep.placeIds ?? []);
  const cats = categories ?? [];
  const paths = new Map(flattenTree(cats).map((n) => [n.id, n.path]));

  const planLines: PlanLineOption[] = (plan ?? [])
    .filter((p) => p.status === "ACTIVE" || p.id === keep.planLineId)
    .map((p) => ({
      id: p.id,
      year: p.year,
      categoryId: p.category_id,
      category: p.category_name,
      description: p.description,
      remaining: Number(p.remaining_amount),
    }));
  const itemOptions: ItemOption[] = (items ?? [])
    .filter((i) => i.is_active || keepItems.has(i.id))
    .map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      category: paths.get(i.category_id) ?? "",
      ancestors: ancestorsOf(cats, i.category_id),
    }));
  const placeOptions: PlaceOption[] = (places ?? [])
    .filter((p) => p.is_active || keepPlaces.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  return { planLines, items: itemOptions, places: placeOptions };
}
