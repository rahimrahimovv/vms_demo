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

export type VendorFormState = { errors: Record<string, string>; saved?: boolean; attempt?: number };


/**
 * RFQ-03 AC1: a question of up to 2,000 characters with an optional file. The file goes only to the specialist
 * (RFQ-03 AC2); it is attached after the question exists, when the database says the vendor may.
 */
export async function askQuestion(sourcingId: string, _prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const user = await requireUser();
  const fail = (errors: Record<string, string>) => ({ errors, attempt: Date.now() });
  if (!user.vendorId) return fail({ form: "access.denied" });
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return fail({ question: "errors.required" });
  if (question.length > 2000) return fail({ question: "errors.questionTooLong" });
  const upload = formData.get("file");
  if (isUpload(upload)) {
    const fileError = await validateUpload(upload);
    if (fileError) return fail({ file: fileError });
  }
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("question_ask", { p_sourcing: sourcingId, p_text: question });
  if (error || !id) return fail({ form: errorKey(error) ?? "common.genericError" });
  if (isUpload(upload)) {
    const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "question", p_owner_id: id });
    if (allowed) {
      const stored = await storeFile({ companyId: user.companyId, ownerType: "question", ownerId: id, kind: "attachment", file: upload, userId: user.id });
      if (stored.error) return fail({ file: stored.error });
    }
  }
  refresh(sourcingId);
  return { errors: {}, saved: true, attempt: Date.now() };
}

/**
 * RFQ-08 AC2-AC3: a new unit price per line (never above the previous one), or keep the previous prices.
 * Empty fields keep the previous price of that line.
 */
export async function submitFinalOffer(sourcingId: string, _prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const user = await requireUser();
  const fail = (errors: Record<string, string>) => ({ errors, attempt: Date.now() });
  if (!user.vendorId) return fail({ form: "access.denied" });
  const keep = formData.get("intent") === "keep";
  const errors: Record<string, string> = {};
  const lines: { sourcing_line_id: string; unit_price: number }[] = [];
  if (!keep) {
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith("final-") || typeof raw !== "string" || raw.trim() === "") continue;
      const value = raw.trim().replace(",", ".");
      const previous = Number(formData.get(`previous-${key.slice("final-".length)}`));
      if (!PRICE.test(value) || Number(value) <= 0) errors[key] = "errors.priceInvalid";
      else if (Number(value) > previous) errors[key] = "errors.finalOfferHigher";
      else lines.push({ sourcing_line_id: key.slice("final-".length), unit_price: Number(value) });
    }
  }
  // Submit needs at least one price; keeping every previous price is its own button (RFQ-08 AC2)
  if (!keep && lines.length === 0 && Object.keys(errors).length === 0) errors.form = "errors.priceRequired";
  if (Object.keys(errors).length > 0) return fail(errors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("final_offer_submit", { p_sourcing: sourcingId, p_lines: lines, p_keep: keep });
  refresh(sourcingId);
  if (error) return fail({ form: errorKey(error) ?? "common.genericError" });
  return { errors: {}, saved: true, attempt: Date.now() };
}

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
