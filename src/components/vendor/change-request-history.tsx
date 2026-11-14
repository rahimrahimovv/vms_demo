import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  section: string;
  status: string;
  reason: string;
  review_comment: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decider: { full_name: string } | { full_name: string }[] | null;
};

/**
 * REG-08 AC12: every change request of a vendor with its status, decision, decider and comments. Read as the signed-in
 * user, so RLS decides what is visible (the vendor sees its own, the specialist, committee member and admin see the
 * company's). Used under the Registration history of the Profile and of the vendor card.
 */
export async function ChangeRequestHistory({ vendorId, audience }: { vendorId: string; audience: "vendor" | "internal" }) {
  const t = await getTranslations("changeRequest");
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_change_request")
    .select("id, section, status, reason, review_comment, submitted_at, decided_at, decider:app_user!vendor_change_request_decided_by_fkey(full_name)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState message={t("historyEmpty")} />;
  const href = (id: string) => (audience === "vendor" ? `/vendor/profile/requests/${id}` : `/change-requests/${id}`);

  return (
    <div className="surface-solid overflow-hidden">
      <Table data-testid="change-request-history">
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>{t("columns.section")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.submitted")}</TableHead>
            <TableHead>{t("columns.decision")}</TableHead>
            <TableHead>{t("columns.comments")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const decider = Array.isArray(r.decider) ? r.decider[0] : r.decider;
            return (
              <TableRow key={r.id} data-testid="change-request-row">
                <TableCell>
                  <Link href={href(r.id)} className="font-medium text-primary hover:underline">
                    {t(`sections.${r.section}`)}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{r.submitted_at ? formatDateTime(r.submitted_at) : ""}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.decided_at ? `${decider?.full_name ?? ""} · ${formatDateTime(r.decided_at)}` : ""}
                </TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">
                  {[r.reason, r.review_comment].filter(Boolean).join("\n")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
