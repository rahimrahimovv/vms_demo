import type { SupabaseClient } from "@supabase/supabase-js";
import type { VendorType } from "./constants";
import { COMPANY_FIELDS } from "./change-requests";
import type { ChangeFormInitial } from "@/components/vendor/change-request-form";
import { loadBankAccounts, toBankAccounts } from "./queries";

type Values = Record<string, unknown>;

/** Company details as form text: the keys of the vendor type, VAT as yes / no, dates as YYYY-MM-DD. */
export function companyFormValues(vendorType: VendorType, values: Values): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COMPANY_FIELDS[vendorType]) {
    const v = values[key];
    out[key] = key === "is_vat_payer" ? (v === true ? "yes" : v === false ? "no" : "") : v === null || v === undefined ? "" : String(v);
  }
  return out;
}

/** The form starts from the data in force: the vendor row, its owners and its bank accounts. */
export async function loadChangeFormInitial(supabase: SupabaseClient, vendorId: string, vendorType: VendorType): Promise<ChangeFormInitial> {
  const [{ data: vendor }, { data: owners }, accounts] = await Promise.all([
    supabase.from("vendor").select("legal_name, voen, foreign_tax_number, id_card_number, legal_address, director_name, is_vat_payer, founded_on").eq("id", vendorId).single(),
    supabase.from("vendor_owner").select("full_name, id_number, share_percent, role").eq("vendor_id", vendorId).order("full_name"),
    loadBankAccounts(supabase, vendorId),
  ]);
  return {
    company: companyFormValues(vendorType, (vendor ?? {}) as Values),
    owners: (owners ?? []).map((o) => ({
      fullName: o.full_name,
      idNumber: o.id_number,
      sharePercent: o.share_percent === null ? "" : String(Number(o.share_percent)),
      role: o.role,
    })),
    accounts: toBankAccounts(accounts),
  };
}
