/**
 * Browser → Storage uploads with a signed upload URL (Slice 4 retrofit of the Slice 2 uploads), against vms-dev.
 * The browser side uses the publishable key without a session, as the registration page does; the server side
 * (createStagedUpload, validateUpload, storeFile) is the real code with `server-only` stubbed.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
const ownerId = randomUUID(); // no foreign key on file.owner_id; removed afterwards

const MB = 1024 * 1024;
function pdf(bytes: number) {
  const body = new Uint8Array(bytes);
  body.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  return body;
}

async function stage(name: string, body: Uint8Array, contentType: string) {
  const { createStagedUpload } = await import("@/lib/files/server");
  const prepared = await createStagedUpload(name, body.byteLength);
  if ("error" in prepared) return { prepared, upload: null, token: "" };
  const upload = await browser.storage.from("files").uploadToSignedUrl(prepared.path, prepared.token, body, { contentType });
  return { prepared, upload, token: JSON.stringify({ path: prepared.path, name }) };
}

afterAll(async () => {
  const { data } = await service.from("file").select("storage_path").eq("owner_id", ownerId);
  if (data?.length) await service.storage.from("files").remove(data.map((f) => f.storage_path));
  await service.from("file").delete().eq("owner_id", ownerId);
});

describe("signed-URL upload", () => {
  it("accepts a 9 MB PDF sent straight to Storage, then keeps it with its row", async () => {
    const { upload, token } = await stage("big-charter.pdf", pdf(9 * MB), "application/pdf");
    expect(upload?.error).toBeNull();

    const { validateUpload, storeFile } = await import("@/lib/files/server");
    expect(await validateUpload(token)).toBeNull();

    const { data: user } = await service.from("app_user").select("id").eq("company_id", COMPANY_ID).limit(1).single();
    const result = await storeFile({
      companyId: COMPANY_ID, ownerType: "vendor", ownerId, kind: "charter", file: token, userId: user!.id,
    });
    expect(result.error).toBeNull();

    const { data: row } = await service.from("file").select("*").eq("owner_id", ownerId).single();
    expect(row).toMatchObject({ file_name: "big-charter.pdf", mime_type: "application/pdf", size_bytes: 9 * MB });
    const stored = await service.storage.from("files").download(row!.storage_path);
    expect(stored.data?.size).toBe(9 * MB);
  });

  it("refuses an 11 MB file before a URL is issued, and Storage itself refuses it too", async () => {
    const { createStagedUpload } = await import("@/lib/files/server");
    expect(await createStagedUpload("huge.pdf", 11 * MB)).toEqual({ error: "errors.fileType" });

    const { data } = await service.storage.from("files").createSignedUploadUrl(`staging/${randomUUID()}/huge.pdf`);
    const sent = await browser.storage.from("files").uploadToSignedUrl(`staging/x/huge.pdf`, data!.token, pdf(11 * MB), {
      contentType: "application/pdf",
    });
    expect(sent.error).not.toBeNull();
  });

  it("refuses an .exe renamed to .pdf after it was uploaded (first bytes), and removes it", async () => {
    const body = new Uint8Array(2048);
    body.set([0x4d, 0x5a]); // MZ
    const { token, prepared } = await stage("setup.pdf", body, "application/pdf");
    const { validateUpload } = await import("@/lib/files/server");
    expect(await validateUpload(token)).toBe("errors.fileType");
    const staged = ("path" in prepared ? prepared.path : "") ?? "";
    const { data } = await service.storage.from("files").list(staged.split("/").slice(0, 2).join("/"));
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses a disallowed type and a token that points outside staging/", async () => {
    const { createStagedUpload, validateUpload } = await import("@/lib/files/server");
    expect(await createStagedUpload("setup.exe", 1000)).toEqual({ error: "errors.fileType" });
    const stolen = JSON.stringify({ path: `${COMPANY_ID}/vendor/${ownerId}/other.pdf`, name: "other.pdf" });
    expect(await validateUpload(stolen)).toBe("errors.fileType");
    expect(await validateUpload("not a token")).toBe("errors.fileType");
  });
});
