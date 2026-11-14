"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { QuestionFormState } from "@/app/(app)/admin/questionnaire/actions";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT_CLASS = "h-9 w-full rounded-[14px] border border-input bg-(--field-bg) px-3 text-sm";
type Option = { label: string; points: string };

/** REG-05 AC1: add a question with its options, points, weight and evidence flag. */
export function QuestionForm({ action }: { action: (prev: QuestionFormState, formData: FormData) => Promise<QuestionFormState> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [type, setType] = useState<"SINGLE_CHOICE" | "YES_NO">("SINGLE_CHOICE");
  const [options, setOptions] = useState<Option[]>([
    { label: "", points: "" },
    { label: "", points: "" },
  ]);
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const shown: Option[] =
    type === "YES_NO"
      ? [
          { label: t("common.yes"), points: options[0]?.points ?? "" },
          { label: t("common.no"), points: options[1]?.points ?? "" },
        ]
      : options;

  return (
    <form action={formAction} className="flex flex-col gap-5" data-testid="question-form">
      {state.errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert>
          <AlertDescription>{t("adminQuestionnaire.added")}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <FormField id="text" label={t("adminQuestionnaire.fields.text")} required error={err("text")} className="col-span-2">
          <Input id="text" name="text" />
        </FormField>
        <FormField id="section" label={t("adminQuestionnaire.fields.section")}>
          <Input id="section" name="section" />
        </FormField>
        <FormField id="answerType" label={t("adminQuestionnaire.fields.answerType")} required>
          <select
            id="answerType"
            name="answerType"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className={SELECT_CLASS}
          >
            <option value="SINGLE_CHOICE">{t("adminQuestionnaire.types.SINGLE_CHOICE")}</option>
            <option value="YES_NO">{t("adminQuestionnaire.types.YES_NO")}</option>
          </select>
        </FormField>
        <FormField id="weight" label={t("adminQuestionnaire.fields.weight")} required hint={t("adminQuestionnaire.hints.weight")} error={err("weight")}>
          <Input id="weight" name="weight" type="number" min={1} max={5} defaultValue={1} />
        </FormField>
        <FormField id="evidenceRequired" label={t("adminQuestionnaire.fields.evidence")}>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input id="evidenceRequired" type="checkbox" name="evidenceRequired" className="size-4 accent-primary" />
            {t("common.yes")}
          </label>
        </FormField>
        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("adminQuestionnaire.fields.options")}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </legend>
          {shown.map((o, i) => (
            <div key={i} className="grid grid-cols-[3fr_1fr_auto] gap-3">
              <Input
                name="optionLabel"
                aria-label={t("adminQuestionnaire.fields.optionLabel")}
                placeholder={t("adminQuestionnaire.fields.optionLabel")}
                value={o.label}
                readOnly={type === "YES_NO"}
                onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <Input
                name="optionPoints"
                type="number"
                min={0}
                max={10}
                aria-label={t("adminQuestionnaire.fields.points")}
                placeholder={t("adminQuestionnaire.fields.points")}
                value={o.points}
                onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("common.delete")}
                disabled={type === "YES_NO" || options.length <= 2}
                onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {state.errors.options && (
            <p id="options-error" role="alert" className="text-xs font-medium text-destructive">
              {t(state.errors.options)}
            </p>
          )}
          {type === "SINGLE_CHOICE" && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOptions((list) => [...list, { label: "", points: "" }])}>
                <Plus className="size-4" aria-hidden />
                {t("adminQuestionnaire.addOption")}
              </Button>
            </div>
          )}
        </fieldset>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("adminQuestionnaire.addQuestion")}
        </Button>
      </div>
    </form>
  );
}
