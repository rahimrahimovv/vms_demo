"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import {
  placeError,
  validateCurrency,
  validateDeliveryPlace,
  validateName,
  validatePaymentTerm,
  type Errors,
} from "@/lib/master-data/validate";
import type { EntryState } from "@/components/admin/entry-dialog";

export type DictionaryKind = "incoterms" | "paymentTerms" | "deliveryPlaces" | "deliveryModes" | "currencies";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const done = (errors: Errors, saved = false): EntryState => ({ errors, saved, attempt: Date.now() });

async function admin() {
  const user = await requireUser();
  return user.roles.includes("ADMIN");
}

/** MDM-01 AC1-AC6: add or edit an entry; key = code or id, null for a new entry. */
export async function saveDictionaryEntry(
  kind: DictionaryKind,
  key: string | null,
  _prev: EntryState,
  formData: FormData,
): Promise<EntryState> {
  if (!(await admin())) return done({ form: "access.denied" });
  const name = str(formData, "name");
  const active = formData.get("isActive") === "yes";
  const supabase = await createClient();

  let errors: Errors;
  let call: PromiseLike<{ error: { message?: string; code?: string } | null }>;
  switch (kind) {
    case "currencies": {
      const code = (key ?? str(formData, "code")).toUpperCase();
      errors = validateCurrency({ code, name });
      call = supabase.rpc("currency_save", { p_code: code, p_name: name, p_is_active: active, p_is_new: key === null });
      break;
    }
    case "incoterms":
      errors = validateName({ name });
      call = supabase.rpc("incoterm_save", { p_code: key, p_name: name, p_is_active: active });
      break;
    case "paymentTerms": {
      const advancePercent = str(formData, "advancePercent");
      const daysAfterDelivery = str(formData, "daysAfterDelivery");
      errors = validatePaymentTerm({ name, advancePercent, daysAfterDelivery });
      call = supabase.rpc("payment_term_save", {
        p_id: key,
        p_name: name,
        p_advance_percent: Number(advancePercent),
        p_days_after_delivery: Number(daysAfterDelivery),
        p_is_active: active,
      });
      break;
    }
    case "deliveryPlaces": {
      const type = str(formData, "type");
      const address = str(formData, "address");
      errors = validateDeliveryPlace({ name, type, address });
      call = supabase.rpc("delivery_place_save", { p_id: key, p_name: name, p_type: type, p_address: address, p_is_active: active });
      break;
    }
    case "deliveryModes":
      errors = validateName({ name });
      call = supabase.rpc("delivery_mode_save", { p_id: key, p_name: name, p_is_active: active });
      break;
    default:
      return done({ form: "access.denied" });
  }
  if (Object.keys(errors).length > 0) return done(errors);

  const { error } = await call;
  if (error) return done(placeError(errorKey(error) ?? "common.genericError"));
  revalidatePath("/admin/dictionaries");
  return done({}, true);
}

const DELETE_KIND: Partial<Record<DictionaryKind, string>> = {
  currencies: "currency",
  paymentTerms: "payment_term",
  deliveryPlaces: "delivery_place",
  deliveryModes: "delivery_mode",
};

/** MDM-01 AC5: delete an unused entry; an entry in use is refused (deactivate it instead). */
export async function deleteDictionaryEntry(kind: DictionaryKind, key: string): Promise<EntryState> {
  if (!(await admin()) || !DELETE_KIND[kind]) return done({ form: "access.denied" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("dictionary_delete", { p_kind: DELETE_KIND[kind], p_key: key });
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  revalidatePath("/admin/dictionaries");
  return done({}, true);
}
