"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemoUnlocked, lockDemo, unlockDemo } from "@/lib/demo/gate";

export type DemoState = { error: string | null };

/** "Demo access" form: the demo code unlocks the demo tools for this browser for 8 hours (D-022). */
export async function unlockAction(_prev: DemoState, formData: FormData): Promise<DemoState> {
  const result = await unlockDemo(String(formData.get("code") ?? ""));
  if (result !== "ok") return { error: `demo.access.errors.${result}` };
  redirect("/sign-in");
}

/** Lock button: ends the unlock; the demo bar disappears. */
export async function lockAction(): Promise<void> {
  await lockDemo();
  redirect("/sign-in");
}

/**
 * Switch user (DEMO-01 AC2): any active seeded user, no password. The server makes a one-time sign-in token for
 * the user (no e-mail is sent) and redeems it at once for this browser's session.
 */
export async function switchUserAction(_prev: DemoState, formData: FormData): Promise<DemoState> {
  if (!(await isDemoUnlocked())) return { error: "errors.notAvailable" };

  const userId = String(formData.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: "common.genericError" };

  const admin = createAdminClient();
  const { data: user } = await admin.from("app_user").select("email, is_active").eq("id", userId).maybeSingle();
  if (!user?.is_active) return { error: "common.genericError" };

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: "common.genericError" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) return { error: "common.genericError" };

  redirect("/");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which deadline "End deadline now" could end on this sourcing: an OPEN sourcing or a running final-offer round. */
export async function deadlineInfoAction(sourcingId: string): Promise<"OPEN" | "FINAL_OFFER_ROUND" | null> {
  if (!(await isDemoUnlocked()) || !UUID.test(sourcingId)) return null;
  const { data } = await createAdminClient().rpc("demo_deadline_info", { p_sourcing: sourcingId });
  return data === "OPEN" || data === "FINAL_OFFER_ROUND" ? data : null;
}

/**
 * End deadline now (DEMO-01 AC4): the deadline becomes the current time and the deadline job runs at once, so the
 * sourcing closes (or the final-offer round ends) right away.
 */
export async function endDeadlineAction(_prev: DemoState, formData: FormData): Promise<DemoState> {
  if (!(await isDemoUnlocked())) return { error: "errors.notAvailable" };
  const sourcingId = String(formData.get("sourcingId") ?? "");
  if (!UUID.test(sourcingId)) return { error: "common.genericError" };
  const { data, error } = await createAdminClient().rpc("demo_end_deadline", { p_sourcing: sourcingId });
  if (error || !data) return { error: "demo.bar.nothingToEnd" };
  return { error: null };
}
