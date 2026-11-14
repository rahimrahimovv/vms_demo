import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentTypeFor, MAX_FILE_BYTES, STAGING_PREFIX } from "./rules";
import { BUCKET as STORE_BUCKET, inspectStaged, safeName, storeStagedFile, type FileKind, type FileOwnerType } from "./store";

export type { FileOwnerType, FileKind } from "./store";

export const BUCKET = STORE_BUCKET;

const safe = safeName;

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

/** Type and size check on the server (NFR-009). Returns a message key or null. */
export async function validateUpload(token: string): Promise<string | null> {
  const result = await inspectStaged(createAdminClient(), token);
  return result.ok ? null : result.error;
}

/**
 * Keeps a staged upload: checks it again, moves it to its final place in the private bucket and writes its
 * row in public.file. Uses the secret key, so the caller must already have checked that the user may attach
 * a file to `ownerId` (users cannot write public.file). The work is in ./store, shared with `npm run demo:load`.
 */
export async function storeFile(params: {
  companyId: string;
  ownerType: FileOwnerType;
  ownerId: string;
  kind: FileKind;
  file: string;
  userId: string;
}): Promise<{ error: string | null }> {
  return storeStagedFile(createAdminClient(), params);
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
