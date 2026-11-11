"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { isUpload } from "@/lib/files/rules";
import { storeFile, validateUpload } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";

export type QuestionnaireFormState = {
  error: string | null;
  fileErrors: Record<string, string>;
  answers: Record<string, string>;
  attempt?: number;
  saved?: boolean;
};

async function vendorUser() {
  const user = await requireUser();
  return user.vendorId && canAccess(user.roles, "vendorQualification") ? user : null;
}

/** REG-05 AC2, AC7, AC8: start a new attempt (the database checks when that is allowed). */
export async function startQuestionnaire(): Promise<void> {
  const user = await vendorUser();
  if (!user) redirect("/vendor/qualification");
  const supabase = await createClient();
  const { error } = await supabase.rpc("questionnaire_start");
  revalidatePath("/vendor/qualification");
  redirect(error ? `/vendor/qualification?error=${encodeURIComponent(errorKey(error) ?? "")}` : "/vendor/qualification");
}

/** REG-05 AC2, AC3: save answers as DRAFT, or submit a complete questionnaire with its evidence. */
export async function saveQuestionnaire(
  responseId: string,
  _prev: QuestionnaireFormState,
  formData: FormData,
): Promise<QuestionnaireFormState> {
  const submit = formData.get("intent") === "submit";
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer-") && typeof value === "string" && value) answers[key.slice(7)] = value;
  }
  const answer = (error: string | null, fileErrors: Record<string, string> = {}, saved = false) => ({
    error,
    fileErrors,
    answers,
    attempt: Date.now(),
    saved,
  });

  const user = await vendorUser();
  if (!user) return answer("access.denied");
  const supabase = await createClient();

  // Only answers of this vendor's own attempt are returned (security definer, vendor check inside).
  const { data: rows } = await supabase.rpc("vendor_questionnaire", { p_response: responseId });
  const own = (rows ?? []) as { answer_id: string; question_id: string }[];
  if (own.length === 0) return answer("access.denied");

  const fileErrors: Record<string, string> = {};
  const uploads: { answerId: string; file: File }[] = [];
  for (const row of own) {
    const value = formData.get(`evidence-${row.answer_id}`);
    if (!isUpload(value)) continue;
    const error = await validateUpload(value);
    if (error) fileErrors[row.answer_id] = error;
    else uploads.push({ answerId: row.answer_id, file: value });
  }
  if (Object.keys(fileErrors).length > 0) return answer(null, fileErrors);

  const { error: saveError } = await supabase.rpc("questionnaire_save", {
    p_response: responseId,
    p_answers: own.map((r) => ({ questionId: r.question_id, optionId: answers[r.question_id] ?? null })),
  });
  if (saveError) return answer(errorKey(saveError));

  for (const upload of uploads) {
    const { error } = await storeFile({
      companyId: user.companyId,
      ownerType: "questionnaire_answer",
      ownerId: upload.answerId,
      kind: "attachment",
      file: upload.file,
      userId: user.id,
    });
    if (error) return answer(null, { [upload.answerId]: error });
  }

  if (submit) {
    const { error } = await supabase.rpc("questionnaire_submit", { p_response: responseId });
    if (error) return answer(errorKey(error));
  }
  revalidatePath("/vendor/qualification");
  revalidatePath("/");
  return answer(null, {}, true);
}
