"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { placeError, validateItem, validateName, type Errors } from "@/lib/master-data/validate";
import type { EntryState } from "@/components/admin/entry-dialog";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const done = (errors: Errors, saved = false): EntryState => ({ errors, saved, attempt: Date.now() });

async function admin() {
  const user = await requireUser();
  return user.roles.includes("ADMIN");
}

function refresh() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/items");
}

/** MDM-02 AC1, AC2, AC5: add (optionally under a parent) or edit a category. */
export async function saveCategory(id: string | null, _prev: EntryState, formData: FormData): Promise<EntryState> {
  if (!(await admin())) return done({ form: "access.denied" });
  const name = str(formData, "name");
  const errors = validateName({ name });
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("category_save", {
    p_id: id,
    p_parent_id: str(formData, "parentId") || null,
    p_name: name,
    p_licence_required: formData.get("licenceRequired") === "yes",
    p_is_active: formData.get("isActive") === "yes",
  });
  if (error) {
    const key = errorKey(error) ?? "common.genericError";
    return done(key === "errors.categoryParentInvalid" ? { parentId: key } : placeError(key));
  }
  refresh();
  return done({}, true);
}

/** MDM-02 AC5, AC6: children first; an unused category only. */
export async function deleteCategory(id: string): Promise<EntryState> {
  if (!(await admin())) return done({ form: "access.denied" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("category_delete", { p_id: id });
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  refresh();
  return done({}, true);
}

/** MDM-02 AC4, AC5: add or edit an item of the catalogue. */
export async function saveItem(id: string | null, _prev: EntryState, formData: FormData): Promise<EntryState> {
  if (!(await admin())) return done({ form: "access.denied" });
  const values = {
    code: str(formData, "code"),
    name: str(formData, "name"),
    unit: str(formData, "unit"),
    categoryId: str(formData, "categoryId"),
  };
  const errors = validateItem(values);
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("item_save", {
    p_id: id,
    p_category_id: values.categoryId,
    p_code: values.code,
    p_name: values.name,
    p_unit: values.unit,
    p_is_active: formData.get("isActive") === "yes",
  });
  if (error) {
    const key = errorKey(error) ?? "common.genericError";
    return done(key === "errors.required" ? { categoryId: key } : placeError(key));
  }
  refresh();
  return done({}, true);
}

export async function deleteItem(id: string): Promise<EntryState> {
  if (!(await admin())) return done({ form: "access.denied" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("item_delete", { p_id: id });
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  refresh();
  return done({}, true);
}
