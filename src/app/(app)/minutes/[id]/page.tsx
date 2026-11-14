import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { MinutesView } from "@/lib/minutes/pdf";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { DownloadPdf } from "@/components/download-pdf";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Minutes (CMT-03 AC2): number, decision type, sourcing and PO numbers, opening and closing time, eligible voters
 * with each vote and comment, the result and the rule applied. Read-only; Download gives the English PDF.
 */
export default async function MinutesPage({ params }: PageProps<"/minutes/[id]">) {
  const { allowed } = await checkSection("minutes");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.rpc("minutes_view", { p_id: id });
  const m = data as MinutesView | null;
  if (!m) return <NoAccess />;

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={m.number}
        subtitle={t("minutes.heading")}
        status={m.status}
        actions={<DownloadPdf href={`/api/minutes/${m.id}/pdf`} fileName={`${m.number}.pdf`} />}
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="minutes-details">
            <Field label={t("minutes.fields.type")}>{t(`decisions.typeTitle.${m.type}`)}</Field>
            <Field label={t("minutes.fields.sourcing")}>
              <Link href={`/sourcing/${m.sourcingId}`} className="text-primary hover:underline">
                {m.sourcingNumber}
              </Link>
            </Field>
            {m.poNumber && <Field label={t("minutes.fields.po")}>{m.poNumber}</Field>}
            <Field label={t("minutes.fields.opened")}>{formatDateTime(m.openedAt)}</Field>
            <Field label={t("minutes.fields.closed")}>{formatDateTime(m.closedAt)}</Field>
            <Field label={t("minutes.fields.result")}>{t(`status.${m.status}`)}</Field>
            <Field label={t("minutes.fields.rule")}>
              <span data-testid="minutes-rule">{t(`decisions.rules.${m.resultRule}`)}</span>
            </Field>
            <Field label={t("minutes.fields.counts")}>
              {t("minutes.counts", { for: m.for, against: m.against, eligible: m.eligible })}
            </Field>
            {m.closeReason && <Field label={t("minutes.fields.cancellation")}>{m.closeReason}</Field>}
            {m.reopenReason && <Field label={t("minutes.fields.reopen")}>{m.reopenReason}</Field>}
          </dl>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{t("minutes.voters")}</h3>
        <div className="surface-solid overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>{t("minutes.voterColumns.member")}</TableHead>
                <TableHead>{t("minutes.voterColumns.vote")}</TableHead>
                <TableHead>{t("minutes.voterColumns.comment")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.voters.map((v) => (
                <TableRow key={v.name} data-testid="minutes-voter">
                  <TableCell className="font-medium">
                    {v.name} {v.isChair && <Badge variant="secondary">{t("minutes.chair")}</Badge>}
                  </TableCell>
                  <TableCell>{t(`decisions.votes.${v.vote}`)}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{v.comment ?? t("common.none")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{t("minutes.readOnly")}</p>
      </section>
    </div>
  );
}
