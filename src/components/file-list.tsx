import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";

export type FileItem = { id: string; file_name: string; kind?: string | null; uploaded_at?: string };

/** Files with download links (/api/files/[id] checks access with RLS before signing a link). */
export function FileList({ files, showKind = true }: { files: FileItem[]; showKind?: boolean }) {
  const t = useTranslations("files");
  if (files.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`/api/files/${f.id}`} className="font-medium text-primary hover:underline" data-testid="file-link">
            {f.file_name}
          </a>
          {showKind && f.kind && <span className="text-xs text-muted-foreground">{t(`kinds.${f.kind}`)}</span>}
          {f.uploaded_at && <span className="text-xs text-muted-foreground">{formatDateTime(f.uploaded_at)}</span>}
        </li>
      ))}
    </ul>
  );
}
