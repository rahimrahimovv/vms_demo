"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import type { DecisionState } from "@/components/decision-panel";

/**
 * PO-03 AC2-AC4: the vendor accepts a FULLY_APPROVED PO, or declines it with a reason (the lines go back to
 * COMPARISON). The database function checks that the PO belongs to this vendor and its status again.
 */
export async function respondToPo(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  const choice = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!user.vendorId) return fail("access.denied");
  if (choice !== "ACCEPT" && choice !== "DECLINE") return fail("common.genericError");
  if (choice === "DECLINE" && !comment) return fail("errors.reasonRequired");

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_respond", { p_po: id, p_decision: choice, p_reason: comment });
  revalidatePath("/vendor/purchase-orders");
  revalidatePath(`/vendor/purchase-orders/${id}`);
  revalidatePath("/vendor/invitations");
  revalidatePath("/");
  return { error: errorKey(error), attempt: Date.now() };
}
