import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkFile, contentTypeFor, MAX_FILE_BYTES, parseStaged, STAGING_PREFIX } from "./rules";

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

export const BUCKET = "files";

const safe = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-120);

/**
 * Step 1 of an upload: a signed upload URL for a new object under staging/. The browser sends the file
 * straight to Storage with it, so the file body never passes through a Vercel function. Type and size
 * are checked again on the server in {@link inspectStaged} before anything is kept.
 */
export async function createStagedUpload(name: string, size: number) {
  if (!contentTypeFor(name) || size <= 0 || size > MAX_FILE_BYTES) return { error: "errors.fileType" as const };
  const path = `${STAGING_PREFIX}${randomUUID()}/${safe(name)}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "common.genericError" as const };
  return { path, token: data.token, contentType: contentTypeFor(name)! };
}

type Inspected =
  | { ok: true; path: string; name: string; size: number; mimeType: string }
  | { ok: false; error: "errors.fileType" };

/** Step 2: size from Storage, first bytes by a ranged read, then the same rules as before (NFR-009). */
async function inspectStaged(token: string): Promise<Inspected> {
  const bad = { ok: false, error: "errors.fileType" } as const;
  const staged = parseStaged(token);
  if (!staged) return bad;
  const storage = createAdminClient().storage.from(BUCKET);
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

/** Type and size check on the server (NFR-009). Returns a message key or null. */
export async function validateUpload(token: string): Promise<string | null> {
  const result = await inspectStaged(token);
  return result.ok ? null : result.error;
}

/**
 * Keeps a staged upload: checks it again, moves it to its final place in the private bucket and writes its
 * row in public.file. Uses the secret key, so the caller must already have checked that the user may attach
 * a file to `ownerId` (users cannot write public.file).
 */
export async function storeFile(params: {
  companyId: string;
  ownerType: FileOwnerType;
  ownerId: string;
  kind: FileKind;
  file: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const checked = await inspectStaged(params.file);
  if (!checked.ok) return { error: checked.error };

  const admin = createAdminClient();
  const path = `${params.companyId}/${params.ownerType}/${params.ownerId}/${randomUUID()}-${safe(checked.name)}`;
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

/** Removes files (row and object) of one owner, e.g. when replacing a registration document. */
export async function removeFiles(ownerType: FileOwnerType, ownerId: string, kind?: FileKind) {
  const admin = createAdminClient();
  let query = admin.from("file").select("id, storage_path").eq("owner_type", ownerType).eq("owner_id", ownerId);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  if (!data || data.length === 0) return;
  await admin.storage.from(BUCKET).remove(data.map((f) => f.storage_path));
  await admin.from("file").delete().in("id", data.map((f) => f.id));
}
