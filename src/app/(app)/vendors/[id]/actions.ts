"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

/** REG-02 AC2, AC3, AC5: Approve, Return for correction (comment) or Reject (reason). */
export async function decideRegistration(vendorId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (decision === "RETURN" && !comment) return { error: "errors.commentRequired", attempt: Date.now() };
  if (decision === "REJECT" && !comment) return { error: "errors.reasonRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registration_decide", {
    p_vendor: vendorId,
    p_decision: decision,
    p_comment: comment || null,
  });
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  return { error: errorKey(error), attempt: Date.now() };
}

/** REG-02 AC5, REG-08 AC14: reopen a rejected registration with a comment; it becomes RETURNED. */
export async function reopenRegistration(vendorId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) return { error: "errors.commentRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registration_reopen", { p_vendor: vendorId, p_comment: comment });
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  return { error: errorKey(error), attempt: Date.now() };
}
