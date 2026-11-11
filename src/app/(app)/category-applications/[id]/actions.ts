"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

/** REG-04 AC1, AC2: Qualify, or Reject with a reason. */
export async function decideApplication(applicationId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("comment") ?? "").trim();
  if (decision === "REJECT" && !reason) return { error: "errors.reasonRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("category_decide", {
    p_application: applicationId,
    p_decision: decision,
    p_reason: reason || null,
  });
  revalidatePath(`/category-applications/${applicationId}`);
  revalidatePath("/category-applications");
  return { error: errorKey(error), attempt: Date.now() };
}
