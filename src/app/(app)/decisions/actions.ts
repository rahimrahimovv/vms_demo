"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

function refresh(id: string, sourcingId?: string) {
  revalidatePath("/decisions");
  revalidatePath("/minutes");
  revalidatePath("/sourcing");
  revalidatePath("/");
  revalidatePath(`/decisions/${id}`);
  if (sourcingId) revalidatePath(`/sourcing/${sourcingId}`);
}

/**
 * CMT-02 AC4, AC5, AC8: vote For (no comment), vote Against (comment required), declare a conflict of interest
 * (comment required) or Reopen vote (the owner; a reason is required after a REJECTED opening decision).
 * The database functions check role, voter list, status and comment again.
 */
export async function decideVote(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  const choice = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const supabase = await createClient();

  if (choice === "FOR" || choice === "AGAINST") {
    if (!user.roles.includes("COMMITTEE_MEMBER")) return fail("access.denied");
    if (choice === "AGAINST" && !comment) return fail("errors.commentRequired");
    const { error } = await supabase.rpc("decision_vote", { p_decision: id, p_vote: choice, p_comment: comment });
    refresh(id);
    return { error: errorKey(error), attempt: Date.now() };
  }
  if (choice === "CONFLICT") {
    if (!user.roles.includes("COMMITTEE_MEMBER")) return fail("access.denied");
    if (!comment) return fail("errors.commentRequired");
    const { error } = await supabase.rpc("decision_declare_conflict", { p_decision: id, p_comment: comment });
    refresh(id);
    return { error: errorKey(error), attempt: Date.now() };
  }
  if (choice === "REOPEN") {
    if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return fail("access.denied");
    const { data, error } = await supabase.rpc("decision_reopen", { p_decision: id, p_reason: comment });
    if (error || !data) return fail(errorKey(error) ?? "common.genericError");
    refresh(id);
    redirect(`/decisions/${data}`);
  }
  return fail("common.genericError");
}
