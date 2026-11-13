import Link from "next/link";
import { Bell, Building2, ClipboardCheck, FileCheck, Gavel, ListChecks, PackageSearch, ShoppingCart, Undo2, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { messageValues } from "@/lib/notifications";
import { recordHref } from "@/lib/records";
import type { PoListRow } from "@/lib/purchase-orders/types";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { VendorHome } from "@/components/vendor/vendor-home";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type UnreadRow = {
  id: string;
  event: string;
  params: Record<string, string | number> | null;
  record_type: string;
  record_id: string;
  record_number: string | null;
  created_at: string;
};

/**
 * "My tasks" home for every role: cards with counts of items waiting for this user, then the
 * list. Slice 1 has one source of tasks (unread notifications); each slice adds its cards
 * (e.g. "3 PRs to approve").
 */
export default async function HomePage() {
  const { user, allowed } = await checkSection("home");
  if (!allowed) return <NoAccess />;
  if (user.vendorId) return <VendorHome vendorId={user.vendorId} />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("notification")
    .select("id, event, params, record_type, record_id, record_number, created_at", { count: "exact" })
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<UnreadRow[]>();

  const unread = data ?? [];

  // Slice 2 task cards for the Procurement Specialist (items waiting for a decision).
  const isSpecialist = user.roles.includes("PROCUREMENT_SPECIALIST");
  const [registrations, questionnaires, applications] = isSpecialist
    ? await Promise.all([
        supabase.from("vendor").select("id", { count: "exact", head: true }).eq("status", "SUBMITTED"),
        supabase.from("questionnaire_response").select("id", { count: "exact", head: true }).eq("status", "SUBMITTED"),
        supabase.from("category_application").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      ])
    : [null, null, null];
  // Slice 3 (PR-01, PR-02): PRs waiting for this user. Approvers never decide on their own PRs (#83).
  const isApprover = user.roles.includes("APPROVER");
  const isRequester = user.roles.includes("REQUESTER");
  const prCount = (status: string, filter?: "own" | "notOwn") => {
    let q = supabase.from("requisition").select("id", { count: "exact", head: true }).eq("status", status);
    if (filter === "own") q = q.eq("requester_id", user.id);
    if (filter === "notOwn") q = q.neq("requester_id", user.id);
    return q;
  };
  const belowMinimum = isSpecialist ? await supabase.from("sourcing").select("id", { count: "exact", head: true }).eq("status", "CLOSED").eq("owner_id", user.id) : null;
  const [toApprove, returned, readyForSourcing] = await Promise.all([
    isApprover ? prCount("PENDING_APPROVAL", "notOwn") : null,
    isRequester ? prCount("RETURNED", "own") : null,
    isSpecialist ? prCount("APPROVED") : null,
  ]);
  // Slice 5 (CMT-02): decisions where this member's vote is still missing (the owner is never a voter).
  const isCommittee = user.roles.includes("COMMITTEE_MEMBER");
  const votesWaiting = isCommittee
    ? await supabase
        .from("decision_voter")
        .select("id, decision!inner(status)", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("vote", "NONE")
        .eq("decision.status", "VOTING")
    : null;
  // Slice 7 (PO-02): POs waiting for this Approver; never the ones for the own PR or own sourcing (#83).
  const poRows = isApprover ? (((await supabase.rpc("po_list")).data ?? []) as PoListRow[]) : [];
  const posToApprove = poRows.filter((po) => po.status === "PENDING_APPROVAL" && po.requester_id !== user.id && po.owner_id !== user.id).length;
  const taskCards = [
    ...(isCommittee ? [{ key: "votesWaiting", href: "/decisions", count: votesWaiting?.count ?? 0, icon: Gavel }] : []),
    ...(isApprover ? [{ key: "posToApprove", href: "/purchase-orders", count: posToApprove, icon: FileCheck }] : []),
    ...(isApprover ? [{ key: "prsToApprove", href: "/requisitions?tab=toApprove", count: toApprove?.count ?? 0, icon: ShoppingCart }] : []),
    ...(isRequester ? [{ key: "prsReturned", href: "/requisitions?tab=mine", count: returned?.count ?? 0, icon: Undo2 }] : []),
    ...(isSpecialist
      ? [
          { key: "registrations", href: "/vendors", count: registrations?.count ?? 0, icon: Building2 },
          { key: "questionnaires", href: "/questionnaires", count: questionnaires?.count ?? 0, icon: ClipboardCheck },
          { key: "applications", href: "/category-applications", count: applications?.count ?? 0, icon: ListChecks },
          { key: "sourcingsBelowMinimum", href: "/sourcing", count: belowMinimum?.count ?? 0, icon: PackageSearch },
          { key: "prsReadyForSourcing", href: "/requisitions?tab=all", count: readyForSourcing?.count ?? 0, icon: PackageSearch },
        ]
      : []),
  ];
  const text = (row: UnreadRow) => {
    const key = `notifications.events.${row.event}`;
    const values = messageValues(row.params ?? {}, row.record_number, { has: t.has, translate: (k) => t(k) }, formatDate);
    return t.has(key) ? t(key, values) : t("notifications.fallback", values);
  };

  const mainAction = isRequester ? (
    <Button asChild>
      <Link href="/requisitions/new">
        <ShoppingCart className="size-4" aria-hidden />
        {t("home.newPr")}
      </Link>
    </Button>
  ) : canAccess(user.roles, "adminUsers") ? (
    <Button asChild>
      <Link href="/admin/users/new">
        <UserPlus className="size-4" aria-hidden />
        {t("home.addUser")}
      </Link>
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="task-card-unread">
          <CardContent className="flex items-center gap-4">
            <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Bell className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{t("home.unreadCard", { count: count ?? 0 })}</span>
          </CardContent>
        </Card>
        {taskCards.map((card) => (
          <Link key={card.key} href={card.href} data-testid={`task-card-${card.key}`}>
            <Card className="h-full hover:bg-muted/60">
              <CardContent className="flex items-center gap-4">
                <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <card.icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium">{t(`home.cards.${card.key}`, { count: card.count })}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t("home.listTitle")}</h2>
        {unread.length === 0 ? (
          <EmptyState message={t("home.empty")} action={mainAction} />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {unread.map((row) => (
              <li key={row.id}>
                <Link
                  href={recordHref(row.record_type, row.record_id, "internal", row.event)}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/60"
                >
                  <span className="text-sm">{text(row)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.record_number ? `${row.record_number} · ` : ""}
                    {formatDateTime(row.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
