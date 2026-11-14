import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { ActionDialog } from "@/components/action-dialog";
import type { DecisionState } from "@/components/decision-panel";
import { StatusBadge } from "@/components/status-badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type QaItem = {
  id: string;
  vendorName: string | null;
  questionText: string | null;
  publishedText: string | null;
  answer: string | null;
  status: "UNANSWERED" | "PUBLISHED";
  askedAt: string;
  publishedAt: string | null;
  files: { id: string; file_name: string }[];
};

/**
 * RFQ-03 for the specialist: every question with the asker (only the specialist sees it), the original text when it
 * was edited, the attachment, Publish with an editable question text, and a clarification without a question.
 */
export async function QaPanel({
  items,
  publish,
  canAnswer,
  canClarify,
}: {
  items: QaItem[];
  publish: (prev: DecisionState, formData: FormData) => Promise<DecisionState>;
  canAnswer: boolean;
  canClarify: boolean;
}) {
  const t = await getTranslations("sourcing.qa");
  return (
    <div className="flex flex-col gap-4" data-testid="qa-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{t("title")}</h3>
        {canClarify && (
          <ActionDialog action={publish} trigger={t("clarification")} title={t("clarification")} submitLabel={t("publish")} testId="publish-clarification">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-subject">{t("clarificationTitle")}</Label>
              <Textarea id="qa-subject" name="questionText" rows={2} maxLength={2000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-clarification">
                {t("clarificationText")}
                <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea id="qa-clarification" name="answer" rows={4} required />
            </div>
          </ActionDialog>
        )}
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {items.map((q) => {
        const shown = q.status === "PUBLISHED" ? q.publishedText : q.questionText;
        const edited = q.status === "PUBLISHED" && q.questionText && q.publishedText !== q.questionText;
        return (
          <article key={q.id} className="flex flex-col gap-2 surface-glass p-4" data-testid="qa-item" data-status={q.status}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {q.vendorName ? t("askedBy", { vendor: q.vendorName, date: formatDateTime(q.askedAt) }) : t("publishedOn", { date: formatDateTime(q.publishedAt ?? q.askedAt) })}
              </span>
              <StatusBadge status={q.status} />
            </div>
            {shown && <p className="font-medium whitespace-pre-wrap">{shown}</p>}
            {edited && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{t("original", { text: q.questionText! })}</p>}
            {q.files.map((f) => (
              <a key={f.id} href={`/api/files/${f.id}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <FileText className="size-3.5" aria-hidden />
                {f.file_name}
              </a>
            ))}
            {q.answer && <p className="surface-inner px-3 py-2 text-sm whitespace-pre-wrap">{q.answer}</p>}
            {q.status === "UNANSWERED" && canAnswer && (
              <div>
                <ActionDialog action={publish} trigger={t("publish")} triggerSize="sm" title={t("publish")} description={t("editHint")} hidden={{ question: q.id }} submitLabel={t("publish")} testId="publish-answer">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`qa-q-${q.id}`}>{t("question")}</Label>
                    <Textarea id={`qa-q-${q.id}`} name="questionText" rows={3} maxLength={2000} defaultValue={q.questionText ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`qa-a-${q.id}`}>
                      {t("answer")}
                      <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Textarea id={`qa-a-${q.id}`} name="answer" rows={4} required />
                  </div>
                </ActionDialog>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
