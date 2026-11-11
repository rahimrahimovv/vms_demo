"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { QuestionnaireFormState } from "@/app/(app)/vendor/qualification/actions";
import { FileField } from "@/components/file-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type VendorQuestion = {
  answerId: string;
  questionId: string;
  section: string | null;
  text: string;
  evidenceRequired: boolean;
  optionId: string | null;
  options: { id: string; label: string }[];
  files: { id: string; file_name: string }[];
};

/** REG-05 AC2: one choice per question, evidence where required, Save as draft or Submit. */
export function QuestionnaireForm({
  questions,
  action,
  readOnly,
}: {
  questions: VendorQuestion[];
  action: (prev: QuestionnaireFormState, formData: FormData) => Promise<QuestionnaireFormState>;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const initial: QuestionnaireFormState = {
    error: null,
    fileErrors: {},
    answers: Object.fromEntries(questions.filter((q) => q.optionId).map((q) => [q.questionId, q.optionId!])),
  };
  const [state, formAction, pending] = useActionState(action, initial);
  const [complete, setComplete] = useState(() =>
    questions.every((q) => q.optionId && (!q.evidenceRequired || q.files.length > 0)),
  );

  // Submit is enabled only when every question is answered and required evidence is attached.
  function recheck(form: HTMLFormElement) {
    setComplete(
      questions.every((q) => {
        const answered = form.querySelector(`input[name="answer-${q.questionId}"]:checked`) !== null;
        const input = form.querySelector<HTMLInputElement>(`input[name="evidence-${q.answerId}"]`);
        const evidence = !q.evidenceRequired || q.files.length > 0 || (input?.files?.length ?? 0) > 0;
        return answered && evidence;
      }),
    );
  }

  return (
    <form
      action={formAction}
      onChange={(e) => recheck(e.currentTarget)}
      className="flex flex-col gap-4"
      data-testid="questionnaire-form"
    >
      {state.error && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      )}
      {state.saved && !state.error && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("qualification.saved")}</AlertDescription>
        </Alert>
      )}
      <div key={state.attempt ?? 0} className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <Card key={q.answerId} data-testid="question">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium">
                  {i + 1}. {q.text}
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                </p>
                {q.section && <span className="shrink-0 text-xs text-muted-foreground">{q.section}</span>}
              </div>
              <div role="radiogroup" aria-label={q.text} className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                    <input
                      type="radio"
                      name={`answer-${q.questionId}`}
                      value={o.id}
                      defaultChecked={state.answers[q.questionId] === o.id}
                      disabled={readOnly}
                      className="accent-primary"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {q.evidenceRequired && (
                <FileField
                  id={`evidence-${q.answerId}`}
                  name={`evidence-${q.answerId}`}
                  label={t("qualification.evidence")}
                  required
                  error={state.fileErrors[q.answerId] ? t(state.fileErrors[q.answerId]) : undefined}
                  current={q.files}
                  disabled={readOnly}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending} data-testid="save">
            {pending ? t("common.saving") : t("qualification.saveDraft")}
          </Button>
          <Button type="submit" name="intent" value="submit" disabled={pending || !complete} data-testid="submit">
            {t("qualification.submit")}
          </Button>
        </div>
      )}
    </form>
  );
}
