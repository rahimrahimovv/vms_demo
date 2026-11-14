import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AuditRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
  user_id: string | null;
  user: { full_name: string } | null;
};

/**
 * PLT-02 AC5: a record's audit entries, newest first. Read as the signed-in user, so RLS
 * (app.can_read_record) decides what is visible. Time shown in Asia/Baku.
 */
export async function HistoryTab({ recordType, recordId }: { recordType: string; recordId: string }) {
  const t = await getTranslations("history");
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_entry")
    .select("id, from_status, to_status, reason, created_at, user_id, user:app_user(full_name)")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .returns<AuditRow[]>();

  const entries = data ?? [];
  if (entries.length === 0) return <EmptyState message={t("empty")} />;

  return (
    <div className="surface-solid overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>{t("columns.when")}</TableHead>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.from")}</TableHead>
            <TableHead>{t("columns.to")}</TableHead>
            <TableHead>{t("columns.reason")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(entry.created_at)}</TableCell>
              <TableCell>{entry.user_id ? (entry.user?.full_name ?? "") : t("system")}</TableCell>
              <TableCell>{entry.from_status ? <StatusBadge status={entry.from_status} /> : null}</TableCell>
              <TableCell>
                <StatusBadge status={entry.to_status} />
              </TableCell>
              <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">{entry.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
