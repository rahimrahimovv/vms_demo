"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import type { VendorFormState } from "@/app/(app)/vendor/invitations/actions";
import { FileField } from "@/components/file-field";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type VendorQaItem = {
  id: string;
  question: string | null;
  answer: string | null;
  status: "UNANSWERED" | "PUBLISHED";
  own: boolean;
  asked_at: string;
  published_at: string | null;
};

/**
 * RFQ-03 for the vendor: published questions and answers without any asker's name, own questions "Awaiting answer",
 * and the ask form while the sourcing is OPEN (AC5: otherwise "Questions are closed"). Q&A is the only channel (AC6).
 */
export function VendorQa({
  items,
  canAsk,
  action,
}: {
  items: VendorQaItem[];
  canAsk: boolean;
  action: (prev: VendorFormState, formData: FormData) => Promise<VendorFormState>;
}) {
  const t = useTranslations();
  const [state, setState] = useState<VendorFormState>({ errors: {} });
  const [pending, start] = useTransition();
  // a plain submit handler, not a form action: React would reset the typed question after a refused save
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setState(await action(state, fd)));
  };
  const err =(k: string) => (state.errors[k] ? t(state.errors[k]) : undefined);

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" data-testid="vendor-qa">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{t("sourcing.qa.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("sourcing.qa.channelNote")}</p>
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("sourcing.qa.empty")}</p>}
      {items.map((q) => (
        <article key={q.id} className="flex flex-col gap-1.5 border-t pt-3" data-testid="vendor-qa-item">
          <div className="text-xs text-muted-foreground">
            {q.status === "PUBLISHED"
              ? t("sourcing.qa.publishedOn", { date: formatDateTime(q.published_at ?? q.asked_at) })
              : t("sourcing.qa.askedOn", { date: formatDateTime(q.asked_at) })}
          </div>
          {q.question && <p className="font-medium whitespace-pre-wrap">{q.question}</p>}
          {q.status === "PUBLISHED" ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">{q.answer}</p>
          ) : (
            <p className="text-xs font-semibold text-amber-800">{t("sourcing.qa.awaiting")}</p>
          )}
        </article>
      ))}

      {canAsk ? (
        <form key={state.saved ? state.attempt : "ask"} onSubmit={onSubmit} className="flex flex-col gap-3 border-t pt-4" data-testid="ask-form">
          <FormField id="qa-question" label={t("sourcing.qa.ask")} required error={err("question")}>
            <Textarea id="qa-question" name="question" rows={3} maxLength={2000} required aria-invalid={Boolean(err("question"))} />
          </FormField>
          <FileField id="qa-file" name="file" label={t("sourcing.qa.attachment")} error={err("file")} />
          {state.errors.form && <p role="alert" className="text-xs font-medium text-destructive">{t(state.errors.form)}</p>}
          {state.saved && <p className="text-xs text-emerald-700" data-testid="question-sent">{t("sourcing.qa.sent")}</p>}
          <div>
            <Button type="submit" disabled={pending} data-testid="ask-question">
              {pending ? t("common.saving") : t("sourcing.qa.send")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t pt-3 text-sm text-muted-foreground" data-testid="questions-closed">{t("errors.questionsClosed")}</p>
      )}
    </section>
  );
}
