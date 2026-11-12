import { NextResponse } from "next/server";
import { createStagedUpload } from "@/lib/files/server";

/**
 * Upload step 1: a signed upload URL (token) for an object under staging/. Open to signed-out visitors
 * because the registration form uploads documents before the account exists; the object is useless until
 * a server action claims it, and the server re-checks type, size and first bytes there (NFR-009).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown; size?: unknown } | null;
  if (!body || typeof body.name !== "string" || typeof body.size !== "number") {
    return NextResponse.json({ error: "errors.fileType" }, { status: 400 });
  }
  const result = await createStagedUpload(body.name, body.size);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
