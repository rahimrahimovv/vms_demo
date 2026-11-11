import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/files/server";

/**
 * Download: the file row is read as the user, so RLS (app.can_read_file) decides; only then the
 * server signs a 60-second link to the private bucket.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: file } = await supabase.from("file").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return NextResponse.json({ error: "Not available" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
