/** CLAUDE.md rule 11 / NFR-009: PDF, JPG, PNG, DOCX, XLSX only, at most 10 MB, checked on the server. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Checks the name extension and the first bytes, so a renamed .exe is refused. */
function signatureMatches(ext: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (ext) {
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "docx":
    case "xlsx":
      return starts(0x50, 0x4b, 0x03, 0x04); // ZIP container
    default:
      return false;
  }
}

export type FileCheck = { ok: true; mimeType: string } | { ok: false; error: "errors.fileType" };

export function checkFile(name: string, size: number, head: Uint8Array): FileCheck {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const mimeType = FILE_TYPES[ext];
  if (!mimeType || size <= 0 || size > MAX_FILE_BYTES || !signatureMatches(ext, head)) {
    return { ok: false, error: "errors.fileType" };
  }
  return { ok: true, mimeType };
}

/** Where a browser upload waits until a server action claims it (signed upload URL, no file body through the server). */
export const STAGING_PREFIX = "staging/";

/** What the form carries instead of the file: the staged object and the name the user picked. */
export type StagedUpload = { path: string; name: string };

export function contentTypeFor(name: string): string | null {
  return FILE_TYPES[name.toLowerCase().split(".").pop() ?? ""] ?? null;
}

/** Reads the token that FileField puts in the form. Anything else (including a real File) is no upload. */
export function parseStaged(value: FormDataEntryValue | null): StagedUpload | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    const parsed = JSON.parse(value) as Partial<StagedUpload>;
    if (
      typeof parsed.path === "string" &&
      typeof parsed.name === "string" &&
      parsed.name.trim() !== "" &&
      parsed.path.startsWith(STAGING_PREFIX) &&
      !parsed.path.includes("..") &&
      parsed.path.split("/").length === 3
    ) {
      return { path: parsed.path, name: parsed.name };
    }
  } catch {
    // not a token
  }
  return null;
}

/** True when the form entry is a staged upload token. */
export function isUpload(value: FormDataEntryValue | null): value is string {
  return parseStaged(value) !== null;
}

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
