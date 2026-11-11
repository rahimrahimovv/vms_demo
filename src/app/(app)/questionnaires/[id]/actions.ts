"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

export type AdjustState = { error: string | null; attempt?: number };

/** REG-05 AC4: change an answer's points, only with a comment. */
export async function adjustPoints(responseId: string, answerId: string, _prev: AdjustState, formData: FormData): Promise<AdjustState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const comment = String(formData.get("comment") ?? "").trim();
  const points = Number(String(formData.get("points") ?? "").trim());
  if (!comment) return { error: "errors.commentRequired", attempt: Date.now() };
  if (!Number.isInteger(points)) return { error: "errors.pointsOutOfRange", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("questionnaire_adjust", { p_answer: answerId, p_points: points, p_comment: comment });
  revalidatePath(`/questionnaires/${responseId}`);
  return { error: errorKey(error), attempt: Date.now() };
}

/** REG-05 AC5, AC6: Confirm grade (optional comment) or Return for correction (comment). */
export async function decideQuestionnaire(responseId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (decision === "RETURN" && !comment) return { error: "errors.commentRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("questionnaire_decide", {
    p_response: responseId,
    p_decision: decision,
    p_comment: comment || null,
  });
  revalidatePath(`/questionnaires/${responseId}`);
  revalidatePath("/questionnaires");
  return { error: errorKey(error), attempt: Date.now() };
}
