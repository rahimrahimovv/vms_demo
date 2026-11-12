"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { isUpload } from "@/lib/files/rules";
import { removeFiles, storeFile, validateUpload } from "@/lib/files/server";
import type { DecisionState } from "@/components/decision-panel";

export type ProposalFormState = {
  errors: Record<string, string>;
  saved?: "save" | "submit" | "withdraw";
  attempt?: number;
};

function refresh(id: string) {
  revalidatePath("/vendor/invitations");
  revalidatePath(`/vendor/invitations/${id}`);
  revalidatePath("/");
}

/** RFQ-02 AC2-AC3: Accept, or Decline with a reason (DecisionPanel: decision ACCEPT / DECLINE). */
export async function answerInvitation(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  if (!user.vendorId) return fail("access.denied");
  const decision = String(formData.get("decision") ?? "");
  const supabase = await createClient();
  let error;
  if (decision === "ACCEPT") {
    ({ error } = await supabase.rpc("invitation_accept", { p_sourcing: sourcingId }));
  } else if (decision === "DECLINE") {
    const reason = String(formData.get("comment") ?? "").trim();
    if (!reason) return fail("errors.reasonRequired");
    ({ error } = await supabase.rpc("invitation_decline", { p_sourcing: sourcingId, p_reason: reason }));
  } else {
    return fail("common.genericError");
  }
  refresh(sourcingId);
  return { error: errorKey(error), attempt: Date.now() };
}

const PRICE = /^\d+(\.\d{1,2})?$/;

/**
 * RFQ-02 AC3-AC7: save a draft, submit (or resubmit) before the deadline, or withdraw. Prices are checked here
 * for the field messages and again in the database function; the technical document goes through the staged
 * upload and is attached only when the database says the vendor may (file_attach_allowed).
 */
export async function saveProposal(sourcingId: string, _prev: ProposalFormState, formData: FormData): Promise<ProposalFormState> {
  const user = await requireUser();
  const intent = String(formData.get("intent") ?? "save") as "save" | "submit" | "withdraw";
  const fail = (errors: Record<string, string>) => ({ errors, attempt: Date.now() });
  if (!user.vendorId) return fail({ form: "access.denied" });
  const supabase = await createClient();

  if (intent === "withdraw") {
    const { error } = await supabase.rpc("proposal_withdraw", { p_sourcing: sourcingId });
    refresh(sourcingId);
    return error ? fail({ form: errorKey(error) ?? "common.genericError" }) : { errors: {}, saved: "withdraw", attempt: Date.now() };
  }

  const errors: Record<string, string> = {};
  const lines: { sourcing_line_id: string; unit_price: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("price-") || typeof raw !== "string" || raw.trim() === "") continue;
    const value = raw.trim().replace(",", ".");
    if (!PRICE.test(value) || Number(value) <= 0) errors[key] = "errors.priceInvalid";
    else lines.push({ sourcing_line_id: key.slice("price-".length), unit_price: Number(value) });
  }
  const includesVat = formData.get("includesVat") === "yes";
  const vatRate = Number(String(formData.get("vatRate") ?? "").replace(",", "."));
  if (includesVat && !(vatRate > 0)) errors.vatRate = "errors.vatRateRequired";
  if (intent === "submit" && lines.length === 0 && Object.keys(errors).length === 0) errors.form = "errors.priceRequired";

  const upload = formData.get("technicalDocument");
  if (isUpload(upload)) {
    const fileError = await validateUpload(upload);
    if (fileError) errors.technicalDocument = fileError;
  }
  if (Object.keys(errors).length > 0) return fail(errors);

  const { data: proposal } = await supabase.from("proposal").select("id").eq("sourcing_id", sourcingId).maybeSingle();
  if (!proposal) return fail({ form: "errors.noAccess" });
  if (isUpload(upload)) {
    const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "proposal", p_owner_id: proposal.id });
    if (!allowed) return fail({ form: "errors.deadlinePassed" });
    await removeFiles("proposal", proposal.id, "technical_document");
    const { error } = await storeFile({
      companyId: user.companyId, ownerType: "proposal", ownerId: proposal.id, kind: "technical_document", file: upload, userId: user.id,
    });
    if (error) return fail({ technicalDocument: error });
  }

  const num = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const { error } = await supabase.rpc("proposal_save", {
    p_sourcing: sourcingId,
    p_terms: {
      incoterm: String(formData.get("incoterm") ?? "") || null,
      named_place_id: String(formData.get("namedPlace") ?? "") || null,
      delivery_mode_id: String(formData.get("deliveryMode") ?? "") || null,
      payment_term_id: String(formData.get("paymentTerm") ?? "") || null,
      prices_include_vat: includesVat,
      vat_rate: includesVat ? vatRate : 0,
      delivery_days: num("deliveryDays"),
      validity_days: num("validityDays"),
      comment: String(formData.get("comment") ?? ""),
    },
    p_lines: lines,
    p_submit: intent === "submit",
  });
  refresh(sourcingId);
  if (error) {
    const key = errorKey(error) ?? "common.genericError";
    return fail(key === "errors.vatRateRequired" ? { vatRate: key } : key === "errors.techDocRequired" ? { technicalDocument: key } : { form: key });
  }
  return { errors: {}, saved: intent, attempt: Date.now() };
}
