import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { QuestionForm } from "@/components/question-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addQuestion, setQuestionActive } from "./actions";

type Question = {
  id: string;
  section: string | null;
  text: string;
  answer_type: string;
  weight: number;
  evidence_required: boolean;
  is_active: boolean;
  questionnaire_option: { label: string; points: number; sort_order: number }[];
};

/** REG-05 AC1: the Admin builds the qualification questionnaire. */
export default async function AdminQuestionnairePage() {
  const { allowed } = await checkSection("adminQuestionnaire");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("questionnaire_question")
    .select("id, section, text, answer_type, weight, evidence_required, is_active, questionnaire_option(label, points, sort_order)")
    .order("sort_order")
    .returns<Question[]>();
  const questions = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {questions.length === 0 ? (
        <EmptyState message={t("adminQuestionnaire.empty")} />
      ) : (
        <div className="surface-solid overflow-hidden">
          <Table data-testid="questions">
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>{t("adminQuestionnaire.fields.text")}</TableHead>
                <TableHead>{t("adminQuestionnaire.fields.options")}</TableHead>
                <TableHead className="text-right">{t("adminQuestionnaire.fields.weight")}</TableHead>
                <TableHead>{t("adminQuestionnaire.fields.evidence")}</TableHead>
                <TableHead>{t("vendors.columns.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="max-w-md whitespace-normal align-top">
                    {q.section && <span className="text-xs text-muted-foreground">{q.section}</span>}
                    <p>{q.text}</p>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top text-xs text-muted-foreground">
                    {[...q.questionnaire_option]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((o) => `${o.label} (${o.points})`)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">{q.weight}</TableCell>
                  <TableCell className="align-top">{t(q.evidence_required ? "common.yes" : "common.no")}</TableCell>
                  <TableCell className="align-top">
                    <StatusBadge status={q.is_active ? "ACTIVE" : "INACTIVE"} />
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <form action={setQuestionActive.bind(null, q.id, !q.is_active)}>
                      <Button type="submit" variant="ghost" size="sm">
                        {t(q.is_active ? "adminQuestionnaire.deactivate" : "adminQuestionnaire.activate")}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminQuestionnaire.newQuestion")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionForm action={addQuestion} />
        </CardContent>
      </Card>
    </div>
  );
}
