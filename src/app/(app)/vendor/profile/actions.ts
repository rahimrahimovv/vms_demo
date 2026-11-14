"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { isUpload } from "@/lib/files/rules";
import { removeFiles, storeFile, validateUpload } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";
import { parseBankAccounts, toBankAccountRows, validateBankAccounts, type BankAccount } from "@/lib/vendors/validate";
import { ACTIVITIES, CERTIFICATE_TYPES, GUARANTEE_TYPES, MAX_MAIN_GOODS } from "@/lib/vendors/constants";

export type FormState = {
  errors: Record<string, string>;
  attempt?: number;
  saved?: boolean;
  values?: { bankAccounts: BankAccount[] };
};

const done = (errors: Record<string, string> = {}, saved = false): FormState => ({ errors, attempt: Date.now(), saved });
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function vendorUser() {
  const user = await requireUser();
  return user.vendorId && canAccess(user.roles, "vendorProfile") ? (user as typeof user & { vendorId: string }) : null;
}

/** REG-08 AC11: "Profile updated: <section>" in the Registration history (the database logs it for an APPROVED vendor only). */
async function logProfile(supabase: Awaited<ReturnType<typeof createClient>>, section: string) {
  await supabase.rpc("profile_log", { p_section: section });
}

function refresh() {
  revalidatePath("/vendor/profile");
  revalidatePath("/");
}

/** REG-06 AC3: main activity, up to 20 main goods, bank guarantee capacity. */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await vendorUser();
  if (!user) return done({ form: "access.denied" });

  const activity = str(formData, "mainActivity");
  const goods = str(formData, "mainGoods")
    .split(/\r?\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  const available = formData.get("bankGuaranteeAvailable") === "yes";
  const types = formData.getAll("bankGuaranteeTypes").map(String).filter((x) => (GUARANTEE_TYPES as readonly string[]).includes(x));
  const max = str(formData, "bankGuaranteeMax");
  const currency = str(formData, "bankGuaranteeCurrency");

  const errors: Record<string, string> = {};
  if (activity && !(ACTIVITIES as readonly string[]).includes(activity)) errors.mainActivity = "errors.required";
  if (goods.length > MAX_MAIN_GOODS) errors.mainGoods = "errors.goodsMax";
  if (available) {
    if (max && !(Number(max) > 0)) errors.bankGuaranteeMax = "errors.amountPositive";
    if (max && !/^[A-Z]{3}$/.test(currency)) errors.bankGuaranteeCurrency = "errors.required";
  }
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("vendor")
    .select("main_activity, main_goods, bank_guarantee_available, bank_guarantee_types, bank_guarantee_max, bank_guarantee_currency")
    .eq("id", user.vendorId)
    .single();
  const { error } = await supabase
    .from("vendor")
    .update({
      main_activity: activity || null,
      main_goods: goods,
      bank_guarantee_available: available,
      bank_guarantee_types: available ? types : [],
      bank_guarantee_max: available && max ? Number(max) : null,
      bank_guarantee_currency: available && max ? currency : null,
    })
    .eq("id", user.vendorId);
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  // one entry per section that really changed
  if (before) {
    const guarantee = (g: { bank_guarantee_available: boolean; bank_guarantee_types: string[] | null; bank_guarantee_max: string | number | null; bank_guarantee_currency: string | null }) =>
      JSON.stringify([g.bank_guarantee_available, [...(g.bank_guarantee_types ?? [])].sort(), g.bank_guarantee_max === null ? null : Number(g.bank_guarantee_max), g.bank_guarantee_currency]);
    if ((before.main_activity ?? "") !== activity) await logProfile(supabase, "ACTIVITY");
    if (JSON.stringify(before.main_goods ?? []) !== JSON.stringify(goods)) await logProfile(supabase, "MAIN_GOODS");
    if (
      guarantee(before) !==
      guarantee({
        bank_guarantee_available: available,
        bank_guarantee_types: available ? types : [],
        bank_guarantee_max: available && max ? Number(max) : null,
        bank_guarantee_currency: available && max ? currency : null,
      })
    ) {
      await logProfile(supabase, "BANK_GUARANTEE");
    }
  }
  refresh();
  return done({}, true);
}

/** REG-06 AC3: the vendor replaces its bank accounts at any time (at least one, exactly one main). */
export async function saveBankAccounts(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await vendorUser();
  if (!user) return done({ form: "access.denied" });
  const accounts = parseBankAccounts(formData.get("bankAccounts"));
  const keep = (errors: Record<string, string>) => ({ ...done(errors), values: { bankAccounts: accounts } });
  const invalid = validateBankAccounts(accounts);
  if (invalid) return keep({ bankAccounts: invalid });

  const supabase = await createClient();
  const { error } = await supabase.rpc("bank_accounts_save", { p_accounts: toBankAccountRows(accounts) });
  if (error) return keep({ bankAccounts: errorKey(error) ?? "common.genericError" });
  refresh();
  return done({}, true);
}

/** REG-06 AC3: a brand with "Official dealer: Yes / No" and an optional dealer letter. */
export async function addBrand(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await vendorUser();
  if (!user) return done({ form: "access.denied" });
  const brand = str(formData, "brand");
  const letter = formData.get("dealerLetter");
  if (!brand) return done({ brand: "errors.required" });
  if (isUpload(letter)) {
    const fileError = await validateUpload(letter);
    if (fileError) return done({ dealerLetter: fileError });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_brand")
    .insert({ vendor_id: user.vendorId, brand, is_official_dealer: formData.get("isOfficialDealer") === "on" })
    .select("id")
    .single();
  if (error) return done({ brand: error.code === "23505" ? "errors.brandExists" : (errorKey(error) ?? "common.genericError") });
  if (isUpload(letter)) {
    await storeFile({ companyId: user.companyId, ownerType: "vendor_brand", ownerId: data.id, kind: "attachment", file: letter, userId: user.id });
  }
  await logProfile(supabase, "BRANDS");
  refresh();
  return done({}, true);
}

export async function deleteBrand(id: string): Promise<void> {
  const user = await vendorUser();
  if (!user) return;
  const supabase = await createClient();
  const { data } = await supabase.from("vendor_brand").delete().eq("id", id).eq("vendor_id", user.vendorId).select("id");
  if (data && data.length > 0) {
    await removeFiles("vendor_brand", id);
    await logProfile(supabase, "BRANDS");
  }
  refresh();
}

/** REG-06 AC4: certificate with type, number, issuer, issue date, optional expiry date and a file. */
export async function addCertificate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await vendorUser();
  if (!user) return done({ form: "access.denied" });
  const type = str(formData, "type");
  const issuedOn = str(formData, "issuedOn");
  const expiresOn = str(formData, "expiresOn");
  const file = formData.get("file");

  const errors: Record<string, string> = {};
  if (!(CERTIFICATE_TYPES as readonly string[]).includes(type)) errors.type = "errors.required";
  if (!DATE.test(issuedOn)) errors.issuedOn = "errors.required";
  if (expiresOn && (!DATE.test(expiresOn) || (DATE.test(issuedOn) && expiresOn < issuedOn))) errors.expiresOn = "errors.expiryBeforeIssue";
  if (!isUpload(file)) errors.file = "errors.fileRequired";
  else {
    const fileError = await validateUpload(file);
    if (fileError) errors.file = fileError;
  }
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_certificate")
    .insert({
      vendor_id: user.vendorId,
      type,
      number: str(formData, "number") || null,
      issuer: str(formData, "issuer") || null,
      issued_on: issuedOn,
      expires_on: expiresOn || null,
    })
    .select("id")
    .single();
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  await storeFile({ companyId: user.companyId, ownerType: "vendor_certificate", ownerId: data.id, kind: "attachment", file: file as string, userId: user.id });
  await logProfile(supabase, "CERTIFICATES");
  refresh();
  return done({}, true);
}

/** Certificate transition EXPIRING / EXPIRED -> VALID: renewed file with a later expiry date. */
export async function renewCertificate(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await vendorUser();
  if (!user) return done({ form: "access.denied" });
  const expiresOn = str(formData, "expiresOn");
  const file = formData.get("file");
  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("vendor_certificate")
    .select("id, expires_on")
    .eq("id", id)
    .eq("vendor_id", user.vendorId)
    .maybeSingle();
  if (!cert) return done({ form: "access.denied" });

  const errors: Record<string, string> = {};
  if (!DATE.test(expiresOn) || (cert.expires_on && expiresOn <= cert.expires_on)) errors.expiresOn = "errors.laterExpiry";
  if (!isUpload(file)) errors.file = "errors.fileRequired";
  else {
    const fileError = await validateUpload(file);
    if (fileError) errors.file = fileError;
  }
  if (Object.keys(errors).length > 0) return done(errors);

  const { error } = await supabase.from("vendor_certificate").update({ expires_on: expiresOn }).eq("id", id);
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });
  await storeFile({ companyId: user.companyId, ownerType: "vendor_certificate", ownerId: id, kind: "attachment", file: file as string, userId: user.id });
  await logProfile(supabase, "CERTIFICATES");
  refresh();
  return done({}, true);
}

export async function deleteCertificate(id: string): Promise<void> {
  const user = await vendorUser();
  if (!user) return;
  const supabase = await createClient();
  const { data } = await supabase.from("vendor_certificate").delete().eq("id", id).eq("vendor_id", user.vendorId).select("id");
  if (data && data.length > 0) {
    await removeFiles("vendor_certificate", id);
    await logProfile(supabase, "CERTIFICATES");
  }
  refresh();
}
