"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { parseQuestion, validateQuestion } from "@/lib/questionnaire/validate";

export type QuestionFormState = { errors: Record<string, string>; attempt?: number; saved?: boolean };

/**
 * REG-05 AC1: a question with text, answer type, options with points 0-10, weight 1-5 and
 * "Evidence file required". It applies to questionnaires started after the save (answers keep
 * the weight and maximum points of the moment their attempt started).
 */
export async function addQuestion(_prev: QuestionFormState, formData: FormData): Promise<QuestionFormState> {
  const done = (errors: Record<string, string> = {}, saved = false) => ({ errors, attempt: Date.now(), saved });
  const user = await requireUser();
  if (!canAccess(user.roles, "adminQuestionnaire")) return done({ form: "access.denied" });

  const values = parseQuestion(formData);
  const errors = validateQuestion(values);
  if (Object.keys(errors).length > 0) return done(errors);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("questionnaire_question")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: question, error } = await supabase
    .from("questionnaire_question")
    .insert({
      company_id: user.companyId,
      section: values.section || null,
      text: values.text,
      answer_type: values.answerType,
      weight: values.weight,
      evidence_required: values.evidenceRequired,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return done({ form: errorKey(error) ?? "common.genericError" });

  const { error: optionError } = await supabase.from("questionnaire_option").insert(
    values.options.map((o, i) => ({ question_id: question.id, label: o.label, points: o.points, sort_order: i + 1 })),
  );
  if (optionError) {
    await supabase.from("questionnaire_question").delete().eq("id", question.id);
    return done({ form: errorKey(optionError) ?? "common.genericError" });
  }
  revalidatePath("/admin/questionnaire");
  return done({}, true);
}

/** Inactive questions are not used by questionnaires started afterwards. */
export async function setQuestionActive(id: string, active: boolean): Promise<void> {
  const user = await requireUser();
  if (!canAccess(user.roles, "adminQuestionnaire")) return;
  const supabase = await createClient();
  await supabase.from("questionnaire_question").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/questionnaire");
}
