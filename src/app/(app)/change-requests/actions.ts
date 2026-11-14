"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

/**
 * REG-08 AC6, AC7: Approve, Return for correction (comment) or Reject (reason). Approval replaces the data in one
 * transaction (a failed check refuses it with its message); the storage objects of replaced documents are removed
 * afterwards, best effort.
 */
export async function decideChangeRequest(requestId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (decision === "RETURN" && !comment) return { error: "errors.commentRequired", attempt: Date.now() };
  if (decision === "REJECT" && !comment) return { error: "errors.reasonRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_request_decide", {
    p_id: requestId,
    p_decision: decision,
    p_comment: comment || null,
  });
  if (!error) {
    const removed = ((data as { removed?: string[] } | null)?.removed ?? []).filter(Boolean);
    if (removed.length > 0) await createAdminClient().storage.from(BUCKET).remove(removed);
  }
  revalidatePath(`/change-requests/${requestId}`);
  revalidatePath("/change-requests");
  revalidatePath("/");
  return { error: errorKey(error), attempt: Date.now() };
}
