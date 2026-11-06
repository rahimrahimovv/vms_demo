import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Secret-key client. Bypasses RLS, so use it ONLY for what the user's own session cannot do
 * (creating Auth users). Never import from client components (enforced by "server-only").
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
