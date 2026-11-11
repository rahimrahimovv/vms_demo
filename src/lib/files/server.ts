import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkFile } from "./rules";

export type FileOwnerType =
  | "vendor"
  | "vendor_brand"
  | "vendor_certificate"
  | "questionnaire_answer"
  | "category_application";

export type FileKind =
  | "charter"
  | "id_card"
  | "registration_certificate"
  | "vat_certificate"
  | "licence"
  | "attachment";

export const BUCKET = "files";

/** Type and size check on the server (NFR-009). Returns a message key or null. */
export async function validateUpload(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const result = checkFile(file.name, file.size, head);
  return result.ok ? null : result.error;
}

/**
 * Stores a file in the private bucket and its row in public.file. Uses the secret key, so the
 * caller must already have checked that the user owns `ownerId` (users cannot write public.file).
 */
export async function storeFile(params: {
  companyId: string;
  ownerType: FileOwnerType;
  ownerId: string;
  kind: FileKind;
  file: File;
  userId: string;
}): Promise<{ error: string | null }> {
  const head = new Uint8Array(await params.file.slice(0, 8).arrayBuffer());
  const check = checkFile(params.file.name, params.file.size, head);
  if (!check.ok) return { error: check.error };

  const admin = createAdminClient();
  const safeName = params.file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${params.companyId}/${params.ownerType}/${params.ownerId}/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, params.file, { contentType: check.mimeType, upsert: false });
  if (uploadError) return { error: "common.genericError" };

  const { error: rowError } = await admin.from("file").insert({
    company_id: params.companyId,
    owner_type: params.ownerType,
    owner_id: params.ownerId,
    kind: params.kind,
    file_name: params.file.name,
    mime_type: check.mimeType,
    size_bytes: params.file.size,
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
