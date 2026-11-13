"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorKey } from "@/lib/db-errors";
import { formatAmount } from "@/lib/format";
import { bakuLocalToIso } from "@/lib/sourcing/dates";
import { isUpload } from "@/lib/files/rules";
import { storeFile, validateUpload } from "@/lib/files/server";
import type { DecisionState } from "@/components/decision-panel";

export type SourcingFormState = {
  errors: Record<string, string>;
  params?: Record<string, string>;
  saved?: boolean;
  attempt?: number;
};

async function singleSourceLimit(): Promise<string> {
  const { data } = await createAdminClient().from("setting").select("value").eq("key", "single_source_limit").limit(1).maybeSingle();
  return formatAmount(Number(data?.value ?? 0)).replace(" AZN", "");
}

function refresh(id?: string) {
  revalidatePath("/sourcing");
  revalidatePath("/requisitions");
  revalidatePath("/");
  if (id) revalidatePath(`/sourcing/${id}`);
}

/** RFQ-01 AC1, RFQ-06 AC1: Start sourcing on an APPROVED PR; Competitive or Single Source with one AVL vendor. */
export async function startSourcing(requisitionId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const method = formData.get("method") === "SINGLE_SOURCE" ? "SINGLE_SOURCE" : "COMPETITIVE";
  const vendor = String(formData.get("sspVendor") ?? "");
  if (method === "SINGLE_SOURCE" && !vendor) return { error: "errors.sspVendorRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sourcing_start", {
    p_requisition: requisitionId,
    p_method: method,
    p_ssp_vendor: method === "SINGLE_SOURCE" ? vendor : undefined,
  });
  if (error || !data) return { error: errorKey(error) ?? "common.genericError", attempt: Date.now() };
  refresh();
  revalidatePath(`/requisitions/${requisitionId}`);
  redirect(`/sourcing/${data}`);
}

/**
 * RFQ-01 AC4-AC7, RFQ-06 AC2-AC3: Save keeps the DRAFT; Publish saves, then opens the sourcing. A justification
 * file is attached only when the database says the user may (file_attach_allowed), after the checks of NFR-009.
 */
export async function saveSourcing(id: string, _prev: SourcingFormState, formData: FormData): Promise<SourcingFormState> {
  const user = await requireUser();
  const publish = formData.get("intent") === "publish";
  const fail = (errors: Record<string, string>, params?: Record<string, string>) => ({ errors, params, attempt: Date.now() });
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return fail({ form: "access.denied" });

  const deadlineRaw = String(formData.get("deadline") ?? "");
  const deadline = bakuLocalToIso(deadlineRaw);
  if (deadlineRaw && !deadline) return fail({ deadline: "errors.deadlinePast" });

  const upload = formData.get("justificationFile");
  if (isUpload(upload)) {
    const fileError = await validateUpload(upload);
    if (fileError) return fail({ justificationFile: fileError });
  }

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("sourcing_save", {
    p_id: id,
    p_deadline: deadline ?? undefined,
    p_incoterm: String(formData.get("incoterm") ?? ""),
    p_named_place: (formData.get("namedPlace") as string) || undefined,
    p_delivery_mode: (formData.get("deliveryMode") as string) || undefined,
    p_payment_term: (formData.get("paymentTerm") as string) || undefined,
    p_tech_doc: formData.get("techDoc") === "yes",
    p_justification: String(formData.get("justification") ?? ""),
    p_excluded: formData.getAll("excluded").map(String),
  });
  if (saveError) {
    const key = errorKey(saveError) ?? "common.genericError";
    return fail(key === "errors.deadlinePast" ? { deadline: key } : { form: key });
  }

  if (isUpload(upload)) {
    const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "sourcing", p_owner_id: id });
    if (!allowed) return fail({ form: "errors.noAccess" });
    const { error } = await storeFile({
      companyId: user.companyId, ownerType: "sourcing", ownerId: id, kind: "justification", file: upload, userId: user.id,
    });
    if (error) return fail({ justificationFile: error });
  }

  if (publish) {
    const { error } = await supabase.rpc("sourcing_publish", { p_id: id });
    if (error) {
      const key = errorKey(error) ?? "common.genericError";
      refresh(id);
      if (key === "errors.deadlinePast") return fail({ deadline: key });
      return fail({ form: key }, key === "errors.sspJustification" ? { limit: await singleSourceLimit() } : undefined);
    }
  }
  refresh(id);
  return { errors: {}, saved: true, attempt: Date.now() };
}

/** RFQ-01 AC5: a justification file attached by mistake can be removed while the sourcing is a DRAFT. */
export async function removeJustificationFile(sourcingId: string, fileId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "sourcing", p_owner_id: sourcingId });
  if (!allowed || !user.roles.includes("PROCUREMENT_SPECIALIST")) return;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("file").select("id, storage_path").eq("id", fileId).eq("owner_type", "sourcing").eq("owner_id", sourcingId).maybeSingle();
  if (!row) return;
  await admin.storage.from("files").remove([row.storage_path]);
  await admin.from("file").delete().eq("id", row.id);
  revalidatePath(`/sourcing/${sourcingId}`);
}

const done = (error: { message?: string } | null): DecisionState => ({ error: errorKey(error), attempt: Date.now() });
const failed = (error: string): DecisionState => ({ error, attempt: Date.now() });
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const AMOUNT = /^\d+(\.\d{1,2})?$/;

async function specialist() {
  const user = await requireUser();
  return user.roles.includes("PROCUREMENT_SPECIALIST") ? user : null;
}

/** RFQ-05 AC1-AC2: PASSED, or DISQUALIFIED with a reason (decision PASSED / DISQUALIFIED, comment = reason). */
export async function evaluateProposal(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const result = text(formData, "decision");
  const reason = text(formData, "reason");
  if (result === "DISQUALIFIED" && !reason) return failed("errors.reasonRequired");
  const supabase = await createClient();
  const { error } = await supabase.rpc("proposal_evaluate", { p_proposal: text(formData, "proposal"), p_result: result, p_reason: reason || null });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-05 AC4: the proposed winner of a line; an empty proposal goes back to the default winner. */
export async function chooseWinner(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const supabase = await createClient();
  const { error } = await supabase.rpc("award_choose", {
    p_line: text(formData, "line"),
    p_proposal: text(formData, "proposal") || null,
    p_justification: text(formData, "justification") || null,
  });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-05 AC4, AC7: cancel one line with a reason. */
export async function cancelLine(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const reason = text(formData, "reason");
  if (!reason) return failed("errors.reasonRequired");
  const supabase = await createClient();
  const { error } = await supabase.rpc("sourcing_line_cancel", { p_line: text(formData, "line"), p_reason: reason });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-07 AC1: add an extra cost per unit (type, amount in AZN, note) to a vendor's line. */
export async function saveCost(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const amount = text(formData, "amount").replace(",", ".");
  if (!AMOUNT.test(amount)) return failed("errors.amountInvalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("comparison_cost_save", {
    p_id: text(formData, "cost") || null,
    p_line: text(formData, "line"),
    p_proposal: text(formData, "proposal"),
    p_type: text(formData, "type"),
    p_amount: Number(amount),
    p_note: text(formData, "note"),
  });
  refresh(sourcingId);
  return done(error);
}

export async function deleteCost(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const supabase = await createClient();
  const { error } = await supabase.rpc("comparison_cost_delete", { p_id: text(formData, "cost") });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-08 AC1: chosen vendors (default all), a deadline and an optional message. */
export async function requestFinalOffer(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const vendors = formData.getAll("vendors").map(String).filter(Boolean);
  if (vendors.length === 0) return failed("errors.pickVendors");
  const deadline = bakuLocalToIso(text(formData, "deadline"));
  if (!deadline || new Date(deadline) <= new Date()) return failed("errors.deadlinePast");
  const supabase = await createClient();
  const { error } = await supabase.rpc("final_offer_request", {
    p_id: sourcingId, p_vendors: vendors, p_deadline: deadline, p_message: text(formData, "message"),
  });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-05 AC5-AC6: Send to committee, with the low-competition reason when one is needed. */
export async function sendToCommittee(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sourcing_send_to_committee", { p_id: sourcingId, p_reason: text(formData, "lowCompetitionReason") });
  refresh(sourcingId);
  revalidatePath("/decisions");
  if (error || !data) return done(error ?? { message: "common.genericError" });
  redirect(`/decisions/${data}`);
}

/** RFQ-03 AC2-AC4: publish an answer (question id) or a clarification without a question (no id). */
export async function publishAnswer(sourcingId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  if (!(await specialist())) return failed("access.denied");
  const answer = text(formData, "answer");
  if (!answer) return failed("errors.required");
  const supabase = await createClient();
  const { error } = await supabase.rpc("question_publish", {
    p_sourcing: sourcingId,
    p_question: text(formData, "question") || null,
    p_question_text: text(formData, "questionText"),
    p_answer: answer,
  });
  refresh(sourcingId);
  return done(error);
}

/** RFQ-04 AC4-AC6: Extend (new deadline + reason), Continue (reason) and Cancel (reason). */
export async function decideSourcing(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return fail("access.denied");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("comment") ?? "").trim();
  if (!reason) return fail("errors.reasonRequired");

  const supabase = await createClient();
  let error;
  if (decision === "EXTEND") {
    const deadline = bakuLocalToIso(String(formData.get("deadline") ?? ""));
    if (!deadline || new Date(deadline) <= new Date()) return fail("errors.deadlinePast");
    ({ error } = await supabase.rpc("sourcing_extend", { p_id: id, p_deadline: deadline, p_reason: reason }));
  } else if (decision === "CONTINUE") {
    ({ error } = await supabase.rpc("sourcing_continue", { p_id: id, p_reason: reason }));
  } else if (decision === "CANCEL") {
    ({ error } = await supabase.rpc("sourcing_cancel", { p_id: id, p_reason: reason }));
  } else {
    return fail("common.genericError");
  }
  refresh(id);
  return { error: errorKey(error), attempt: Date.now() };
}
