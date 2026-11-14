import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A publishable-key client that keeps no session and touches no cookies. It is used to check a password
 * (PLT-03: "the current password is incorrect") without replacing the signed-in user's session.
 */
export function createStatelessClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
