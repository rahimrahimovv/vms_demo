import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { DEFAULT_GRADE_BANDS, gradeFor, questionnaireScore, type GradeBands } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { FileList } from "@/components/file-list";
import { DecisionPanel } from "@/components/decision-panel";
import { AdjustPointsForm } from "@/components/adjust-points-form";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adjustPoints, decideQuestionnaire } from "./actions";

type Answer = {
  id: string;
  points_awarded: number;
  weight: number;
  max_points: number;
  adjust_comment: string | null;
  question: { text: string; section: string | null; sort_order: number; evidence_required: boolean } | null;
  option: { label: string } | null;
};

/** REG-05 AC4-AC6: review answers, adjust points with a comment, confirm the grade or return. */
export default async function QuestionnaireReviewPage({ params }: PageProps<"/questionnaires/[id]">) {
  const { user, allowed } = await checkSection("questionnaires");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();

  const [{ data: response }, { data: answerRows }, { data: bands }] = await Promise.all([
    supabase
      .from("questionnaire_response")
      .select("id, vendor_id, attempt_no, status, score, grade, valid_until, review_comment, submitted_at, vendor(legal_name)")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        vendor_id: string;
        attempt_no: number;
        status: string;
        score: string | null;
        grade: string | null;
        valid_until: string | null;
        review_comment: string | null;
        submitted_at: string | null;
        vendor: { legal_name: string } | null;
      }>(),
    supabase
      .from("questionnaire_answer")
      .select(
        "id, points_awarded, weight, max_points, adjust_comment, question:questionnaire_question(text, section, sort_order, evidence_required), option:questionnaire_option(label)",
      )
      .eq("response_id", id)
      .returns<Answer[]>(),
    supabase.from("setting").select("value").eq("key", "grade_bands").maybeSingle<{ value: GradeBands }>(),
  ]);
  if (!response) return <NoAccess />;

  const answers = (answerRows ?? []).sort((a, b) => (a.question?.sort_order ?? 0) - (b.question?.sort_order ?? 0));
  const { data: files } = await supabase
    .from("file")
    .select("id, file_name, owner_id")
    .eq("owner_type", "questionnaire_answer")
    .in("owner_id", answers.map((a) => a.id));

  // AC4: the score and the proposed grade recalculate at once (same formula as the database).
  const score = questionnaireScore(answers.map((a) => ({ weight: a.weight, points: a.points_awarded, maxPoints: a.max_points })));
  const proposed = gradeFor(score, bands?.value ?? DEFAULT_GRADE_BANDS);
  const reviewing = response.status === "SUBMITTED" && user.roles.includes("PROCUREMENT_SPECIALIST");

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={response.vendor?.legal_name ?? ""}
        subtitle={t("qualification.attempt", { number: response.attempt_no })}
        status={response.status}
        actions={
          reviewing ? (
            <DecisionPanel
              action={decideQuestionnaire.bind(null, response.id)}
              options={[
                {
                  value: "CONFIRM",
                  label: t("questionnaires.confirmGrade"),
                  comment: "optional",
                  confirmTitle: t("questionnaires.confirmTitle", { grade: proposed, score: score.toFixed(1) }),
                },
                { value: "RETURN", label: t("decision.returnForCorrection"), variant: "outline", comment: "required" },
              ]}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("qualification.score")}</span>
            <span className="text-2xl font-semibold tabular-nums" data-testid="live-score">
              {(response.score !== null ? Number(response.score) : score).toFixed(1)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {response.grade ? t("qualification.grade") : t("questionnaires.proposedGrade")}
            </span>
            <span className="text-2xl font-semibold" data-testid="proposed-grade">
              {response.grade ?? proposed}
            </span>
          </CardContent>
        </Card>
        {response.valid_until && (
          <Card>
            <CardContent className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t("qualification.validUntil")}</span>
              <span className="text-lg font-medium">{formatDate(response.valid_until)}</span>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("questionnaires.vendorCard")}</span>
            <Link href={`/vendors/${response.vendor_id}`} className="text-sm font-medium text-primary hover:underline">
              {response.vendor?.legal_name}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table data-testid="answers">
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>{t("questionnaires.columns.question")}</TableHead>
                  <TableHead>{t("questionnaires.columns.answer")}</TableHead>
                  <TableHead className="text-right">{t("questionnaires.columns.weight")}</TableHead>
                  <TableHead className="text-right">{t("questionnaires.columns.points")}</TableHead>
                  <TableHead>{t("questionnaires.columns.evidence")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {answers.map((a, i) => (
                  <TableRow key={a.id} data-testid="answer-row">
                    <TableCell className="max-w-sm whitespace-normal align-top">
                      <span className="text-xs text-muted-foreground">{a.question?.section}</span>
                      <p>
                        {i + 1}. {a.question?.text}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">{a.option?.label ?? t("common.none")}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">{a.weight}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      <span data-testid="points">
                        {a.points_awarded} / {a.max_points}
                      </span>
                      {a.adjust_comment && (
                        <p className="mt-1 max-w-48 whitespace-normal text-left text-xs text-muted-foreground">{a.adjust_comment}</p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <FileList files={(files ?? []).filter((f) => f.owner_id === a.id)} showKind={false} />
                    </TableCell>
                    <TableCell className="align-top">
                      {reviewing && (
                        <AdjustPointsForm
                          action={adjustPoints.bind(null, response.id, a.id)}
                          points={a.points_awarded}
                          maxPoints={a.max_points}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="questionnaire_response" recordId={response.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
