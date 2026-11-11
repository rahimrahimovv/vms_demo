import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { bakuToday, canRetakeEarly } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { StatusBadge } from "@/components/status-badge";
import { QuestionnaireForm, type VendorQuestion } from "@/components/vendor/questionnaire-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saveQuestionnaire, startQuestionnaire } from "./actions";

type Response = {
  id: string;
  attempt_no: number;
  status: string;
  score: string | null;
  grade: string | null;
  valid_until: string | null;
  review_comment: string | null;
  submitted_at: string | null;
};

type QuestionRow = {
  answer_id: string;
  question_id: string;
  section: string | null;
  question_text: string;
  evidence_required: boolean;
  option_id: string | null;
  options: { id: string; label: string }[];
};

/** REG-05: the vendor's qualification questionnaire and its A–D grade. */
export default async function VendorQualificationPage({ searchParams }: PageProps<"/vendor/qualification">) {
  const { user, allowed } = await checkSection("vendorQualification");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();
  const params = await searchParams;
  const startError = typeof params.error === "string" && /^errors\.[A-Za-z]+$/.test(params.error) ? params.error : null;

  const [{ data: vendor }, { data: responseRows }] = await Promise.all([
    supabase.from("vendor").select("status, standing, standing_until").eq("id", user.vendorId).single(),
    supabase
      .from("questionnaire_response")
      .select("id, attempt_no, status, score, grade, valid_until, review_comment, submitted_at")
      .eq("vendor_id", user.vendorId)
      .order("attempt_no", { ascending: false })
      .returns<Response[]>(),
  ]);
  const responses = responseRows ?? [];

  if (vendor?.status !== "APPROVED") {
    return <EmptyState message={t("errors.registrationNotApproved")} />;
  }

  const open = responses.find((r) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(r.status));
  const graded = responses.find((r) => r.status === "GRADED" && r.valid_until && r.valid_until >= today);
  const onHold = vendor.standing === "HOLD" && vendor.standing_until && today < vendor.standing_until;
  const canStart =
    !open && !onHold && (!graded || graded.grade === "D" || canRetakeEarly(graded.valid_until!, today));

  let questions: VendorQuestion[] = [];
  if (open) {
    const { data } = await supabase.rpc("vendor_questionnaire", { p_response: open.id });
    const rows = (data ?? []) as QuestionRow[];
    const { data: files } = await supabase
      .from("file")
      .select("id, file_name, owner_id")
      .eq("owner_type", "questionnaire_answer")
      .in("owner_id", rows.map((r) => r.answer_id));
    questions = rows.map((r) => ({
      answerId: r.answer_id,
      questionId: r.question_id,
      section: r.section,
      text: r.question_text,
      evidenceRequired: r.evidence_required,
      optionId: r.option_id,
      options: r.options,
      files: (files ?? []).filter((f) => f.owner_id === r.answer_id),
    }));
  }

  const startButton = canStart ? (
    <form action={startQuestionnaire}>
      <Button type="submit" data-testid="start-questionnaire">
        {t(graded ? "qualification.startNew" : "qualification.start")}
      </Button>
    </form>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={t("nav.vendorQualification")}
        subtitle={open ? t("qualification.attempt", { number: open.attempt_no }) : undefined}
        status={open?.status ?? graded?.status}
        actions={open ? undefined : startButton}
      />

      {startError && (
        <Alert variant="destructive">
          <AlertDescription>{t(startError)}</AlertDescription>
        </Alert>
      )}

      {graded && (
        <Card data-testid="grade-card">
          <CardContent className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t("qualification.grade")}</span>
              <span className="text-3xl font-semibold" data-testid="grade">
                {graded.grade}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t("qualification.score")}</span>
              <span className="text-lg font-medium tabular-nums">{Number(graded.score).toFixed(1)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t("qualification.validUntil")}</span>
              <span className="text-lg font-medium">{formatDate(graded.valid_until!)}</span>
            </div>
            {graded.grade === "D" && !onHold && (
              <p className="text-sm text-muted-foreground">{t("qualification.dRetry")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {onHold && (
        <Alert variant="destructive" data-testid="hold-note">
          <AlertDescription>{t("qualification.applyAgainOn", { date: formatDate(vendor.standing_until!) })}</AlertDescription>
        </Alert>
      )}

      {open?.status === "RETURNED" && open.review_comment && (
        <Alert className="border-amber-300 bg-amber-50" data-testid="returned-comment">
          <AlertTitle>{t("qualification.returnedTitle")}</AlertTitle>
          <AlertDescription>{open.review_comment}</AlertDescription>
        </Alert>
      )}
      {open?.status === "SUBMITTED" && (
        <Alert>
          <AlertDescription>{t("qualification.submittedNote")}</AlertDescription>
        </Alert>
      )}

      {open ? (
        <QuestionnaireForm
          questions={questions}
          action={saveQuestionnaire.bind(null, open.id)}
          readOnly={open.status === "SUBMITTED"}
        />
      ) : (
        !graded && !onHold && <EmptyState message={t("qualification.empty")} action={startButton} />
      )}

      {responses.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("qualification.attempts")}</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {responses.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>{t("qualification.attempt", { number: r.attempt_no })}</span>
                <span className="flex items-center gap-3">
                  {r.grade && <span className="font-medium">{r.grade}</span>}
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
          {open && <HistoryTab recordType="questionnaire_response" recordId={open.id} />}
        </section>
      )}
    </div>
  );
}
