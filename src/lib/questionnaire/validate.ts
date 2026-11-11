/** REG-05 AC1 question rules: weight 1-5, options with points 0-10 (Yes / No for YES_NO). */
export type QuestionValues = {
  section: string;
  text: string;
  answerType: "SINGLE_CHOICE" | "YES_NO";
  weight: number;
  evidenceRequired: boolean;
  options: { label: string; points: number }[];
};

export function parseQuestion(formData: FormData): QuestionValues {
  const answerType = formData.get("answerType") === "YES_NO" ? "YES_NO" : "SINGLE_CHOICE";
  const labels = formData.getAll("optionLabel").map((v) => String(v).trim());
  const points = formData.getAll("optionPoints").map((v) => String(v).trim());
  const options = labels
    .map((label, i) => ({ label, points: points[i] === "" ? Number.NaN : Number(points[i]) }))
    .filter((o) => o.label || !Number.isNaN(o.points));
  return {
    section: String(formData.get("section") ?? "").trim(),
    text: String(formData.get("text") ?? "").trim(),
    answerType,
    weight: Number(String(formData.get("weight") ?? "")),
    evidenceRequired: formData.get("evidenceRequired") === "on",
    options,
  };
}

export function validateQuestion(v: QuestionValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.text) e.text = "errors.required";
  if (!Number.isInteger(v.weight) || v.weight < 1 || v.weight > 5) e.weight = "errors.weightRange";
  if (v.options.length < 2) e.options = "errors.optionsMin";
  else if (v.options.some((o) => !o.label)) e.options = "errors.optionLabel";
  else if (v.options.some((o) => !Number.isInteger(o.points) || o.points < 0 || o.points > 10)) e.options = "errors.pointsRange";
  return e;
}
