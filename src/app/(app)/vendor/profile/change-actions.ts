"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { isUpload } from "@/lib/files/rules";
import { removeFiles, storeFile, validateUpload, type FileKind } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";
import type { VendorType } from "@/lib/vendors/constants";
import { parseBankAccounts, parseOwners, toBankAccountRows, toOwnerRows } from "@/lib/vendors/validate";
import {
  documentKinds,
  fieldForError,
  isChangeSection,
  needsSupportingFile,
  parseCompanyProposal,
} from "@/lib/vendors/change-requests";

export type ChangeState = { errors: Record<string, string>; attempt?: number };

const fail = (errors: Record<string, string>): ChangeState => ({ errors, attempt: Date.now() });

/**
 * REG-08 AC1-AC4, AC7: an APPROVED vendor starts a change request (requestId null) or resubmits a RETURNED one.
 * The database validates the proposal (tax number, owner shares, bank rules ...) and keeps the data in force; the
 * server checks the staged files, then keeps them for the request. Bound as submitChange.bind(null, section, requestId).
 */
export async function submitChange(section: string, requestId: string | null, _prev: ChangeState, formData: FormData): Promise<ChangeState> {
  const user = await requireUser();
  if (!user.vendorId || !canAccess(user.roles, "vendorProfile") || !isChangeSection(section)) return fail({ form: "access.denied" });

  const supabase = await createClient();
  const { data: vendor } = await supabase
    .from("vendor")
    .select("vendor_type, status, is_vat_payer, legal_name, voen, foreign_tax_number, id_card_number, legal_address, director_name, founded_on")
    .eq("id", user.vendorId)
    .single();
  if (!vendor || vendor.status !== "APPROVED") return fail({ form: "errors.noAccess" });
  const type = vendor.vendor_type as VendorType;

  const errors: Record<string, string> = {};
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) errors.reason = "errors.reasonRequired";

  const { data: ownFiles } = requestId
    ? await supabase.from("file").select("kind").eq("owner_type", "vendor_change_request").eq("owner_id", requestId)
    : { data: [] as { kind: string | null }[] };
  const haveKinds = new Set((ownFiles ?? []).map((f) => f.kind));

  // the proposal, by section
  let proposed: unknown;
  const docTokens: Record<string, string> = {};
  if (section === "COMPANY_DETAILS") {
    proposed = parseCompanyProposal(type, formData);
  } else if (section === "OWNERS") {
    proposed = { owners: toOwnerRows(parseOwners(formData.get("owners"))) };
  } else if (section === "BANK_ACCOUNTS") {
    proposed = { accounts: toBankAccountRows(parseBankAccounts(formData.get("bankAccounts"))) };
  } else {
    const kinds = documentKinds(type, vendor.is_vat_payer);
    for (const kind of kinds) {
      const token = formData.get(`file_${kind}`);
      if (isUpload(token)) docTokens[kind] = token;
    }
    proposed = { documents: kinds.filter((k) => docTokens[k] || haveKinds.has(k)) };
  }

  // the files: type and size are checked on the server (NFR-009)
  const support = formData.get("support");
  if (isUpload(support)) {
    const problem = await validateUpload(support);
    if (problem) errors.support = problem;
  } else if (needsSupportingFile(section, vendor as Record<string, unknown>, (proposed ?? {}) as Record<string, unknown>) && !haveKinds.has("change_support")) {
    errors.support = "errors.supportRequired";
  }
  for (const [kind, token] of Object.entries(docTokens)) {
    const problem = await validateUpload(token);
    if (problem) errors[`file_${kind}`] = problem;
  }
  if (Object.keys(errors).length > 0) return fail(errors);

  const { data: id, error } = requestId
    ? await supabase.rpc("change_request_resubmit", { p_id: requestId, p_reason: reason, p_proposed: proposed }).then((r) => ({ data: requestId, error: r.error }))
    : await supabase.rpc("change_request_submit", { p_section: section, p_reason: reason, p_proposed: proposed });
  if (error || !id) {
    const key = errorKey(error) ?? "common.genericError";
    return fail({ [fieldForError(key, type)]: key });
  }
  const savedId = id as string;

  // keep the files for the request; a failure here takes a new request back (the vendor can try again)
  const toStore: { kind: FileKind; token: string }[] = [
    ...(isUpload(support) ? [{ kind: "change_support" as FileKind, token: support }] : []),
    ...Object.entries(docTokens).map(([kind, token]) => ({ kind: kind as FileKind, token })),
  ];
  for (const item of toStore) {
    if (requestId) await removeFiles("vendor_change_request", savedId, item.kind);
    const stored = await storeFile({
      companyId: user.companyId,
      ownerType: "vendor_change_request",
      ownerId: savedId,
      kind: item.kind,
      file: item.token,
      userId: user.id,
    });
    if (stored.error) {
      if (!requestId) await supabase.rpc("change_request_withdraw", { p_id: savedId });
      return fail({ [item.kind === "change_support" ? "support" : `file_${item.kind}`]: stored.error });
    }
  }

  revalidatePath("/vendor/profile");
  revalidatePath("/");
  redirect(`/vendor/profile/requests/${savedId}`);
}

/** REG-08 AC8: Withdraw a SUBMITTED or RETURNED request; the section is free again. */
export async function withdrawChange(requestId: string): Promise<void> {
  const user = await requireUser();
  if (!user.vendorId) return;
  const supabase = await createClient();
  await supabase.rpc("change_request_withdraw", { p_id: requestId });
  revalidatePath("/vendor/profile");
  revalidatePath("/");
  redirect("/vendor/profile");
}
