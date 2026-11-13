"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

/**
 * PO-02 AC1-AC3: the Approver approves (the PO decision opens) or rejects (a reason is required). The database
 * function checks the role, the status and #83 again: not for the PR's Requester, not for the sourcing owner.
 */
export async function decidePo(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  const choice = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!user.roles.includes("APPROVER")) return fail("access.denied");
  if (choice !== "APPROVE" && choice !== "REJECT") return fail("common.genericError");
  if (choice === "REJECT" && !comment) return fail("errors.reasonRequired");

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_decide", { p_po: id, p_decision: choice, p_reason: comment });
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/decisions");
  revalidatePath("/sourcing");
  revalidatePath("/");
  return { error: errorKey(error), attempt: Date.now() };
}
