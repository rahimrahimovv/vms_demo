import { guardApi } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

/** NFR-003: the Users section's API. 401 without a session, 403 without the Admin role. */
export async function GET() {
  const { response } = await guardApi("adminUsers");
  if (response) return response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_user")
    .select("id, full_name, email, is_active, created_at, user_role(role)")
    .order("full_name");
  if (error) return Response.json({ error: "Could not load users" }, { status: 500 });
  return Response.json({ users: data });
}
