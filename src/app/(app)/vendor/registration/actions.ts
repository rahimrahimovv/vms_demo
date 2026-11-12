"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUpload } from "@/lib/files/rules";
import { removeFiles, storeFile, validateUpload, type FileKind } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";
import { bakuToday } from "@/lib/vendors/rules";
import { loadSnapshot } from "@/lib/vendors/queries";
import { neighbourStep, requiredKinds, type StepKey } from "@/lib/vendors/steps";
import {
  isStorableAccount,
  parseBankAccounts,
  parseCompany,
  parseContact,
  parseOwners,
  toBankAccountRows,
  toOwnerRows,
  validateCompany,
  validateContact,
  validateOwners,
  type BankAccount,
  type CompanyValues,
  type ContactValues,
  type Owner,
} from "@/lib/vendors/validate";

/** What every step action returns to its form (REG-07 AC8: the messages of that step's fields). */
export type StepState = {
  errors: Record<string, string>;
  attempt?: number;
  saved?: boolean;
  company?: CompanyValues;
  owners?: Owner[];
  bankAccounts?: BankAccount[];
  contact?: ContactValues;
};

const state = (patch: Partial<StepState> = {}): StepState => ({ errors: {}, attempt: Date.now(), ...patch });

/** The signed-in vendor, with its own session (RLS); null when the user is not a vendor. */
async function vendorContext() {
  const user = await requireUser();
  if (!user.vendorId || !canAccess(user.roles, "vendorRegistration")) return null;
  const supabase = await createClient();
  const loaded = await loadSnapshot(supabase, user.vendorId);
  if (!loaded) return null;
  return { user: user as typeof user & { vendorId: string }, supabase, ...loaded };
}

const EDITABLE = ["DRAFT", "RETURNED"];

function leave(step: StepKey, intent: FormDataEntryValue | null, vendorType: Parameters<typeof neighbourStep>[0]): never {
  revalidatePath("/vendor/registration", "layout");
  revalidatePath("/");
  const target = neighbourStep(vendorType, step, intent === "back" ? -1 : 1);
  redirect(target ? `/vendor/registration/${target}` : "/");
}

/** Company details (REG-07 AC2). Valid values are saved even when others are empty. */
export async function saveCompany(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  const values = parseCompany(formData);
  if (!ctx) return state({ errors: { form: "access.denied" }, company: values });
  if (!EDITABLE.includes(ctx.vendor.status)) return state({ errors: { form: "errors.registrationReadOnly" }, company: values });

  const type = ctx.vendor.vendor_type;
  const errors: Record<string, string> = { ...validateCompany(type, values, bakuToday()) };
  const individual = type === "INDIVIDUAL";

  if (individual && values.voen && !errors.voen) {
    const { data: taken } = await createAdminClient().rpc("vendor_tax_number_taken", {
      p_voen: values.voen,
      p_foreign_tax_number: null,
      p_except: ctx.vendor.id,
    });
    if (taken) errors.voen = "errors.taxNumberTaken"; // REG-07 AC2, #91
  }

  const update = individual
    ? { voen: values.voen && !errors.voen ? values.voen : null }
    : {
        legal_address: values.legalAddress || null,
        director_name: type === "LOCAL_COMPANY" ? values.directorName || null : null,
        is_vat_payer: type === "LOCAL_COMPANY" && values.isVatPayer ? values.isVatPayer === "yes" : null,
        founded_on: values.foundedOn && !errors.foundedOn ? values.foundedOn : null,
      };
  const { error } = await ctx.supabase.from("vendor").update(update).eq("id", ctx.vendor.id);
  if (error) return state({ errors: { form: errorKey(error) ?? "common.genericError" }, company: values });

  return leave("company", formData.get("intent"), type);
}

/** Owners (REG-06 AC1, AC2). Complete rows are saved; the others keep their message. */
export async function saveOwners(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  const owners = parseOwners(formData.get("owners"));
  if (!ctx) return state({ errors: { form: "access.denied" }, owners });
  if (!EDITABLE.includes(ctx.vendor.status)) return state({ errors: { form: "errors.registrationReadOnly" }, owners });
  const type = ctx.vendor.vendor_type;
  if (type === "INDIVIDUAL") return leave("owners", formData.get("intent"), type);

  const errors: Record<string, string> = {};
  const problem = validateOwners(owners);
  if (problem) errors.owners = problem;

  const storable = owners.filter((o) => o.fullName && o.idNumber && (o.sharePercent === "" || (Number(o.sharePercent) > 0 && Number(o.sharePercent) <= 100)));
  const { error: deleteError } = await ctx.supabase.from("vendor_owner").delete().eq("vendor_id", ctx.vendor.id);
  if (deleteError) return state({ errors: { owners: errorKey(deleteError) ?? "common.genericError" }, owners });
  if (storable.length > 0) {
    const rows = toOwnerRows(storable).map((o) => ({ ...o, vendor_id: ctx.vendor.id }));
    const { error } = await ctx.supabase.from("vendor_owner").insert(rows);
    if (error) errors.owners = errorKey(error) ?? "common.genericError"; // the 100% rule is also checked by the database
  }

  return leave("owners", formData.get("intent"), type);
}

/** Bank accounts (REG-07 AC5). Complete accounts are saved; the messages show what is still missing. */
export async function saveBank(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  const accounts = parseBankAccounts(formData.get("bankAccounts"));
  if (!ctx) return state({ errors: { form: "access.denied" }, bankAccounts: accounts });
  if (!EDITABLE.includes(ctx.vendor.status)) return state({ errors: { form: "errors.registrationReadOnly" }, bankAccounts: accounts });

  const errors: Record<string, string> = {};
  const storable = accounts.filter(isStorableAccount);
  const rows = toBankAccountRows(storable);
  // several accounts marked main: keep the first one as main so the rest can still be saved
  let seenMain = false;
  for (const r of rows) {
    if (r.is_main && seenMain) r.is_main = false;
    seenMain ||= r.is_main;
  }
  const { error } = await ctx.supabase.rpc("registration_bank_save", { p_accounts: rows });
  if (error) errors.bankAccounts = errorKey(error) ?? "common.genericError";

  // incomplete rows were confirmed in the browser; only a database failure keeps the vendor on the step
  if (error) return state({ errors, bankAccounts: accounts, saved: true });
  return leave("bank", formData.get("intent"), ctx.vendor.vendor_type);
}

/** Documents (REG-07 AC6, AC7): files go straight to Storage; the server checks them again. */
export async function saveDocuments(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  if (!ctx) return state({ errors: { form: "access.denied" } });
  if (!EDITABLE.includes(ctx.vendor.status)) return state({ errors: { form: "errors.registrationReadOnly" } });

  const kinds = requiredKinds(ctx.vendor.vendor_type, ctx.vendor.is_vat_payer === true);
  const have = new Set(ctx.files.map((f) => f.kind));
  const errors: Record<string, string> = {};
  for (const kind of kinds) {
    const token = formData.get(`file_${kind}`);
    if (isUpload(token)) {
      const problem = await validateUpload(token);
      if (problem) {
        errors[`file_${kind}`] = problem;
        continue;
      }
      await removeFiles("vendor", ctx.vendor.id, kind as FileKind);
      const { error } = await storeFile({
        companyId: ctx.vendor.company_id,
        ownerType: "vendor",
        ownerId: ctx.vendor.id,
        kind: kind as FileKind,
        file: token,
        userId: ctx.user.id,
      });
      if (error) errors[`file_${kind}`] = error;
      else have.add(kind);
    }
  }
  revalidatePath("/vendor/registration", "layout");
  // a rejected file stays on the step; a missing file only keeps the step In progress
  if (Object.entries(errors).some(([k, v]) => k.startsWith("file_") && v === "errors.fileType")) return state({ errors, saved: true });
  return leave("documents", formData.get("intent"), ctx.vendor.vendor_type);
}

/**
 * Contact persons (REG-07 AC4, REG-06 AC3): add or edit one person. Ticking "Legal representative" needs a
 * proof-of-authority file (a new one, or the one already stored). Works during the registration and, for an
 * approved vendor, on the Profile page.
 */
export async function saveContact(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  const values = parseContact(formData);
  if (!ctx) return state({ errors: { form: "access.denied" }, contact: values });
  const id = String(formData.get("contactId") ?? "") || null;
  const individual = ctx.vendor.vendor_type === "INDIVIDUAL";

  const errors: Record<string, string> = { ...validateContact(values) };
  const proof = formData.get("file_proof");
  const existing = id ? ctx.contacts.find((c) => c.id === id) : undefined;
  const legal = values.isLegal && !individual;
  if (legal && !isUpload(proof) && !(existing && existing.proof.length > 0)) errors.proof = "errors.proofRequired";
  if (isUpload(proof)) {
    const problem = await validateUpload(proof);
    if (problem) errors.proof = problem;
  }
  if (Object.keys(errors).length > 0) return state({ errors, contact: values });

  const incoming = legal && isUpload(proof);
  const { data: savedId, error } = await ctx.supabase.rpc("contact_save", {
    p_id: id,
    p_full_name: values.fullName,
    p_position: values.position,
    p_phone: values.phone,
    p_email: values.email,
    p_legal: legal,
    p_proof_incoming: incoming,
  });
  if (error || !savedId) return state({ errors: { form: errorKey(error) ?? "common.genericError" }, contact: values });

  if (isUpload(proof) && legal) {
    await removeFiles("vendor_contact", savedId, "proof_of_authority");
    const { error: fileError } = await storeFile({
      companyId: ctx.vendor.company_id,
      ownerType: "vendor_contact",
      ownerId: savedId,
      kind: "proof_of_authority",
      file: proof,
      userId: ctx.user.id,
    });
    if (fileError) return state({ errors: { proof: fileError }, contact: values });
  } else if (!legal && existing && existing.proof.length > 0) {
    await removeFiles("vendor_contact", savedId, "proof_of_authority"); // no longer a legal representative
  }
  const { error: checkError } = await ctx.supabase.rpc("contact_check");
  if (checkError) return state({ errors: { form: errorKey(checkError) ?? "common.genericError" }, contact: values });

  revalidatePath("/vendor/registration", "layout");
  revalidatePath("/vendor/profile");
  return state({ saved: true });
}

export async function deleteContact(id: string): Promise<{ error: string | null }> {
  const ctx = await vendorContext();
  if (!ctx) return { error: "access.denied" };
  const { error } = await ctx.supabase.rpc("contact_delete", { p_id: id });
  if (error) return { error: errorKey(error) ?? "common.genericError" };
  await removeFiles("vendor_contact", id);
  revalidatePath("/vendor/registration", "layout");
  revalidatePath("/vendor/profile");
  return { error: null };
}

/** Save and continue / Back on the Contact persons step: a company needs a legal representative with a proof file. */
export async function continueContacts(_prev: StepState, formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  if (!ctx) return state({ errors: { form: "access.denied" } });
  return leave("contacts", formData.get("intent"), ctx.vendor.vendor_type);
}

/** REG-07 AC9: Submit. The database checks every step again. */
export async function submitRegistration(_prev: StepState, _formData: FormData): Promise<StepState> {
  const ctx = await vendorContext();
  if (!ctx) return state({ errors: { form: "access.denied" } });
  const { error } = await ctx.supabase.rpc("registration_submit");
  if (error) return state({ errors: { form: errorKey(error) ?? "common.genericError" } });
  revalidatePath("/vendor/registration", "layout");
  revalidatePath("/");
  redirect("/vendor/registration");
}
