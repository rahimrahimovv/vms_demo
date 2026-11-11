"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { bakuToday } from "@/lib/vendors/rules";
import { hasErrors, parseLines, toRpcLines, validateRequisition, type PrErrors, type PrLine } from "@/lib/requisitions/validate";
import type { DecisionState } from "@/components/decision-panel";

export type RequisitionFormState = {
  errors: PrErrors;
  saved?: boolean;
  attempt?: number;
  values?: { planLineId: string; lines: PrLine[] };
};

/**
 * PR-01 AC1-AC7: Save keeps the PR as DRAFT (number on the first save, lines may be incomplete in
 * number but each existing line must be valid); Submit sends it to PENDING_APPROVAL.
 */
export async function saveRequisition(
  id: string | null,
  _prev: RequisitionFormState,
  formData: FormData,
): Promise<RequisitionFormState> {
  const user = await requireUser();
  const submit = formData.get("intent") === "submit";
  const values = { planLineId: String(formData.get("planLineId") ?? ""), lines: parseLines(formData.get("lines")) };
  const fail = (errors: PrErrors) => ({ errors, attempt: Date.now(), values });
  if (!user.roles.includes("REQUESTER")) return fail({ form: "access.denied" });

  const errors = validateRequisition(values, bakuToday(), submit);
  if (hasErrors(errors)) return fail(errors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("requisition_save", {
    p_id: id,
    p_plan_line_id: values.planLineId,
    p_lines: toRpcLines(values.lines),
    p_submit: submit,
  });
  if (error) {
    const key = errorKey(error) ?? "common.genericError";
    return fail(key === "errors.planLineClosed" ? { planLineId: key } : { form: key });
  }
  revalidatePath("/requisitions");
  revalidatePath("/plan");
  revalidatePath("/");
  const prId = String(data);
  if (submit) redirect(`/requisitions/${prId}?submitted=1`);
  if (!id) redirect(`/requisitions/${prId}?saved=1`);
  revalidatePath(`/requisitions/${prId}`);
  return { errors: {}, saved: true, attempt: Date.now(), values };
}

/** PR-02 AC1-AC4: Approve, Return (comment) or Reject (reason); never on one's own PR. */
export async function decideRequisition(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("APPROVER")) return { error: "access.denied", attempt: Date.now() };
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (decision === "RETURN" && !comment) return { error: "errors.commentRequired", attempt: Date.now() };
  if (decision === "REJECT" && !comment) return { error: "errors.reasonRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("requisition_decide", { p_id: id, p_decision: decision, p_comment: comment || null });
  revalidatePath(`/requisitions/${id}`);
  revalidatePath("/requisitions");
  revalidatePath("/plan");
  revalidatePath("/");
  return { error: errorKey(error), attempt: Date.now() };
}
