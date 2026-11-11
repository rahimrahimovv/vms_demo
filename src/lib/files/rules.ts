/** CLAUDE.md rule 11 / NFR-009: PDF, JPG, PNG, DOCX, XLSX only, at most 10 MB, checked on the server. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TYPES: Record<string, string> = {
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
  const mimeType = TYPES[ext];
  if (!mimeType || size <= 0 || size > MAX_FILE_BYTES || !signatureMatches(ext, head)) {
    return { ok: false, error: "errors.fileType" };
  }
  return { ok: true, mimeType };
}

/** A real file in a FormData entry (an empty file input gives a 0-byte File with no name). */
export function isUpload(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "size" in value && value.size > 0 && Boolean(value.name);
}

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
