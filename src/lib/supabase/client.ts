import { createBrowserClient } from "@supabase/ssr";

/** Browser client (publishable key, RLS applies). Used for the live notification bell. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
