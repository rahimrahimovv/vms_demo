import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MDM-01 AC4: currency dropdowns (vendor bank accounts, bank guarantee) come from the Currencies
 * dictionary: the active codes plus any code the record already uses (a deactivated currency
 * stays on the record that has it). The public registration page passes the admin client.
 */
export async function currencyOptions(client: SupabaseClient, keep: (string | null | undefined)[] = []): Promise<string[]> {
  const { data } = await client.from("currency").select("code, is_active").order("code");
  const rows = (data ?? []) as { code: string; is_active: boolean }[];
  const kept = new Set(keep.filter(Boolean) as string[]);
  const codes = rows.filter((r) => r.is_active || kept.has(r.code)).map((r) => r.code);
  // AZN first: the company's own currency and the default of a new account
  return codes.includes("AZN") ? ["AZN", ...codes.filter((c) => c !== "AZN")] : codes;
}
