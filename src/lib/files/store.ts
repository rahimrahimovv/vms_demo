import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFile, parseStaged } from "./rules";

/**
 * The upload core, free of Next.js: the server actions call it through `./server` and the developer command
 * `npm run demo:load` calls it directly, so a loaded file takes exactly the path of a real upload (type and first
 * bytes checked, moved from staging/ to its place in the private bucket, row in public.file).
 */
export const BUCKET = "files";

export const safeName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-120);

export type FileOwnerType =
  | "vendor"
  | "vendor_brand"
  | "vendor_certificate"
  | "vendor_contact"
  | "vendor_change_request"
  | "questionnaire_answer"
  | "category_application"
  | "sourcing"
  | "proposal"
  | "question";

export type FileKind =
  | "charter"
  | "id_card"
  | "registration_certificate"
  | "vat_certificate"
  | "proof_of_authority"
  | "change_support"
  | "licence"
  | "technical_document"
  | "justification"
  | "attachment";

type Inspected =
  | { ok: true; path: string; name: string; size: number; mimeType: string }
  | { ok: false; error: "errors.fileType" };

/** Size from Storage, first bytes by a ranged read, then the same rules as before (NFR-009). */
export async function inspectStaged(admin: SupabaseClient, token: string): Promise<Inspected> {
  const bad = { ok: false, error: "errors.fileType" } as const;
  const staged = parseStaged(token);
  if (!staged) return bad;
  const storage = admin.storage.from(BUCKET);
  const { data: info } = await storage.info(staged.path);
  const size = typeof info?.size === "number" ? info.size : 0;
  const { data: signed } = await storage.createSignedUrl(staged.path, 30);
  if (!signed) return bad;
  const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-7" } });
  if (!response.ok) return bad;
  const head = new Uint8Array(await response.arrayBuffer()).slice(0, 8);
  const check = checkFile(staged.name, size, head);
  if (!check.ok) {
    await storage.remove([staged.path]);
    return bad;
  }
  return { ok: true, path: staged.path, name: staged.name, size, mimeType: check.mimeType };
}

/** Keeps a staged upload: checks it again, moves it into the private bucket and writes its row in public.file. */
export async function storeStagedFile(
  admin: SupabaseClient,
  params: { companyId: string; ownerType: FileOwnerType; ownerId: string; kind: FileKind; file: string; userId: string },
): Promise<{ error: string | null }> {
  const checked = await inspectStaged(admin, params.file);
  if (!checked.ok) return { error: checked.error };

  const path = `${params.companyId}/${params.ownerType}/${params.ownerId}/${randomUUID()}-${safeName(checked.name)}`;
  const { error: moveError } = await admin.storage.from(BUCKET).move(checked.path, path);
  if (moveError) return { error: "common.genericError" };

  const { error: rowError } = await admin.from("file").insert({
    company_id: params.companyId,
    owner_type: params.ownerType,
    owner_id: params.ownerId,
    kind: params.kind,
    file_name: checked.name,
    mime_type: checked.mimeType,
    size_bytes: checked.size,
    storage_path: path,
    uploaded_by: params.userId,
  });
  if (rowError) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "common.genericError" };
  }
  return { error: null };
}
