import { isDemoUnlocked } from "@/lib/demo/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { DemoBarControls, type DemoUser } from "@/components/layout/demo-bar-controls";

/**
 * Slot above the top bar for the demo bar. Rendered only when demo mode is on AND this browser has entered the
 * demo code (DEMO-01 AC1, AC5, D-022); otherwise nothing at all. `floating` pins it to the top of the page for
 * screens without the app shell (sign-in, register).
 */
export async function DemoBarSlot({ currentUserId, floating = false }: { currentUserId?: string; floating?: boolean }) {
  if (!(await isDemoUnlocked())) return null;

  const { data } = await createAdminClient()
    .from("app_user")
    .select("id, full_name, email, vendor_id, user_role(role)")
    .eq("is_active", true)
    .order("full_name");
  const users: DemoUser[] = (data ?? []).map((u) => ({
    id: u.id,
    name: u.full_name,
    email: u.email,
    role: (u.user_role ?? []).map((r: { role: string }) => r.role).join(", "),
    isVendor: Boolean(u.vendor_id),
  }));

  const bar = <DemoBarControls users={users} currentUserId={currentUserId} />;
  return floating ? <div className="fixed inset-x-4 top-4 z-40 mx-auto max-w-5xl">{bar}</div> : bar;
}
