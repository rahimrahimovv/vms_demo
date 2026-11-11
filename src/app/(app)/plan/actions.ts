"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { placeError, validatePlanLine, type Errors } from "@/lib/master-data/validate";
import type { EntryState } from "@/components/admin/entry-dialog";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const done = (errors: Errors, saved = false): EntryState => ({ errors, saved, attempt: Date.now() });

/** PLN-01 AC1: the Admin adds a line (ACTIVE) or edits an ACTIVE one. */
export async function savePlanLine(id: string | null, _prev: EntryState, formData: FormData): Promise<EntryState> {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) return done({ form: "access.denied" });
  const values = {
    year: str(formData, "year"),
    categoryId: str(formData, "categoryId"),
    description: str(formData, "description"),
    plannedAmount: str(formData, "plannedAmount"),
    quarter: str(formData, "quarter"),
  };
  const errors = validatePlanLine(values);
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_line_save", {
    p_id: id,
    p_year: Number(values.year),
    p_category_id: values.categoryId,
    p_description: values.description,
    p_planned_amount: Number(values.plannedAmount),
    p_quarter: values.quarter,
  });
  if (error) {
    const key = errorKey(error) ?? "common.genericError";
    if (key === "errors.inUse") return done({ categoryId: "plan.hints.categoryFixed" });
    return done(key === "errors.required" ? { categoryId: key } : placeError(key));
  }
  revalidatePath("/plan");
  return done({}, true);
}

/** PLN-01 AC2: ACTIVE -> CLOSED; PRs already linked keep the link. */
export async function closePlanLine(id: string): Promise<EntryState> {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) return done({ form: "access.denied" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_line_close", { p_id: id });
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  revalidatePath("/plan");
  return done({}, true);
}
