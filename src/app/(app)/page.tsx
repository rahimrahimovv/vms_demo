import Link from "next/link";
import { Building2, ClipboardCheck, FileCheck, Gavel, ListChecks, PackageSearch, ShoppingCart, Undo2, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { bakuHour, formatAge, formatDate, formatDateTime } from "@/lib/format";
import { messageValues } from "@/lib/notifications";
import { recordHref } from "@/lib/records";
import type { PoListRow } from "@/lib/purchase-orders/types";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { VendorHome } from "@/components/vendor/vendor-home";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UnreadRow = {
  id: string;
  event: string;
  params: Record<string, string | number> | null;
  record_type: string;
  record_id: string;
  record_number: string | null;
  created_at: string;
};

const NOTIFICATION_COLUMNS = "id, event, params, record_type, record_id, record_number, created_at";

/**
 * "My tasks" home for every role: greeting with the number of waiting items, cards with counts of
 * items waiting for this user (each with a link), the "Waiting for you" list (unread notifications)
 * and the recent notifications. Admin gets shortcuts with counts.
 */
export default async function HomePage() {
  const { user, allowed } = await checkSection("home");
  if (!allowed) return <NoAccess />;
  if (user.vendorId) return <VendorHome vendorId={user.vendorId} />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("notification")
    .select(NOTIFICATION_COLUMNS, { count: "exact" })
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<UnreadRow[]>();
  const { data: recentData } = await supabase
    .from("notification")
    .select(NOTIFICATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(4)
    .returns<UnreadRow[]>();

  const unread = data ?? [];
  const recent = recentData ?? [];

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
  // Slice 7b (REG-08): change requests waiting for a Procurement Specialist
  const changeRequests = isSpecialist ? await supabase.from("vendor_change_request").select("id", { count: "exact", head: true }).eq("status", "SUBMITTED") : null;
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
    ...(isCommittee ? [{ key: "votesWaiting", href: "/decisions", count: votesWaiting?.count ?? 0 }] : []),
    ...(isApprover ? [{ key: "posToApprove", href: "/purchase-orders", count: posToApprove }] : []),
    ...(isApprover ? [{ key: "prsToApprove", href: "/requisitions?tab=toApprove", count: toApprove?.count ?? 0 }] : []),
    ...(isRequester ? [{ key: "prsReturned", href: "/requisitions?tab=mine", count: returned?.count ?? 0 }] : []),
    ...(isSpecialist
      ? [
          { key: "registrations", href: "/vendors", count: registrations?.count ?? 0 },
          { key: "changeRequests", href: "/change-requests", count: changeRequests?.count ?? 0 },
          { key: "questionnaires", href: "/questionnaires", count: questionnaires?.count ?? 0 },
          { key: "applications", href: "/category-applications", count: applications?.count ?? 0 },
          { key: "sourcingsBelowMinimum", href: "/sourcing", count: belowMinimum?.count ?? 0 },
          { key: "prsReadyForSourcing", href: "/requisitions?tab=all", count: readyForSourcing?.count ?? 0 },
        ]
      : []),
  ];

  // Admin: shortcuts with counts (users, committee members, catalogue items, categories).
  const isAdmin = canAccess(user.roles, "adminUsers");
  const adminCounts = isAdmin
    ? await Promise.all([
        supabase.from("app_user").select("id", { count: "exact", head: true }),
        supabase.from("committee_member").select("id", { count: "exact", head: true }),
        supabase.from("item").select("id", { count: "exact", head: true }),
        supabase.from("category").select("id", { count: "exact", head: true }),
      ])
    : [];
  const adminCards = isAdmin
    ? [
        { key: "users", href: "/admin/users", count: adminCounts[0]?.count ?? 0 },
        { key: "committee", href: "/admin/committee", count: adminCounts[1]?.count ?? 0 },
        { key: "items", href: "/admin/items", count: adminCounts[2]?.count ?? 0 },
        { key: "categories", href: "/admin/categories", count: adminCounts[3]?.count ?? 0 },
      ]
    : [];

  const text = (row: UnreadRow) => {
    const key = `notifications.events.${row.event}`;
    const values = messageValues(row.params ?? {}, row.record_number, { has: t.has, translate: (k) => t(k) }, formatDate);
    return t.has(key) ? t(key, values) : t("notifications.fallback", values);
  };
  const recordType = (type: string) => (t.has(`home.recordTypes.${type}`) ? t(`home.recordTypes.${type}`) : type);

  const mainAction = isRequester ? (
    <Button asChild>
      <Link href="/requisitions/new">
        <ShoppingCart className="size-4" aria-hidden />
        {t("home.newPr")}
      </Link>
    </Button>
  ) : isAdmin ? (
    <Button asChild>
      <Link href="/admin/users/new">
        <UserPlus className="size-4" aria-hidden />
        {t("home.addUser")}
      </Link>
    </Button>
  ) : undefined;

  const ICONS = { registrations: Building2, questionnaires: ClipboardCheck, applications: ListChecks, sourcingsBelowMinimum: PackageSearch, prsReadyForSourcing: PackageSearch, prsToApprove: ShoppingCart, prsReturned: Undo2, votesWaiting: Gavel, posToApprove: FileCheck } as const;
  const cardColumns = taskCards.length + adminCards.length <= 5 ? Math.max(1, taskCards.length + adminCards.length) : 4;
  const waiting = (count ?? 0) + taskCards.reduce((sum, card) => sum + card.count, 0);
  const hour = bakuHour();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-2 py-1">
        <h2 className="text-2xl font-bold">{t(`home.greeting.${greeting}`, { name: firstName })}</h2>
        <p className="text-[#3d4a50]" data-testid="waiting-count">
          {t("home.waitingCount", { count: waiting })}
        </p>
        <span className="sr-only" data-testid="task-card-unread">
          {t("home.unreadCard", { count: count ?? 0 })}
        </span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))` }}>
        {taskCards.map((card) => {
          const Icon = ICONS[card.key as keyof typeof ICONS];
          return (
            <Card key={card.key} data-testid={`task-card-${card.key}`}>
              <CardContent className="flex flex-col gap-1">
                <span className="flex items-start justify-between">
                  <span className="text-[32px] leading-[1.1] font-bold text-brand-ink">{card.count}</span>
                  {Icon && <Icon className="size-5 text-brand" aria-hidden />}
                </span>
                <span className="font-semibold">{t(`home.cardLabels.${card.key}`)}</span>
                <span className="sr-only">{t(`home.cards.${card.key}`, { count: card.count })}</span>
                <Link href={card.href} className="text-[13px] font-semibold hover:underline">
                  {t(`home.cardLinks.${card.key}`)}
                </Link>
              </CardContent>
            </Card>
          );
        })}
        {adminCards.map((card) => (
          <Card key={card.key} data-testid={`task-card-admin-${card.key}`}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-[32px] leading-[1.1] font-bold text-brand-ink">{card.count}</span>
              <span className="font-semibold">{t(`home.adminCards.${card.key}.label`)}</span>
              <Link href={card.href} className="text-[13px] font-semibold hover:underline">
                {t(`home.adminCards.${card.key}.link`)}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-4">
        <section className="min-w-0 flex-1">
          {unread.length === 0 ? (
            <>
              <h2 className="px-2 pb-3 text-base font-semibold">{t("home.listTitle")}</h2>
              <EmptyState message={t("home.empty")} action={mainAction} />
            </>
          ) : (
            <div className="surface-solid overflow-hidden">
              <h2 className="px-[18px] py-3 text-base font-semibold">{t("home.listTitle")}</h2>
              <ul>
                {unread.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 border-t border-[rgba(23,38,43,0.08)] px-[18px] py-2.5" data-testid="waiting-row">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{text(row)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.record_number ? `${row.record_number} · ` : ""}
                        {formatDateTime(row.created_at)}
                      </div>
                    </div>
                    <div className="w-36 shrink-0">
                      <span className="inline-flex h-5 items-center rounded-full bg-(--brand-grade-bg) px-2.5 text-xs font-semibold text-(--brand-grade-fg)">
                        {recordType(row.record_type)}
                      </span>
                    </div>
                    <div className="w-24 shrink-0 text-xs text-muted-foreground">{formatAge(row.created_at)}</div>
                    <Button asChild variant="outline">
                      <Link href={recordHref(row.record_type, row.record_id, "internal", row.event)}>{t("home.open")}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <Card className="w-[330px] shrink-0" data-testid="recent-notifications">
          <CardHeader>
            <CardTitle>{t("home.recentTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("home.recentEmpty")}</p>
            ) : (
              recent.map((row) => (
                <div key={row.id} className="surface-inner px-3 py-2">
                  <div className="text-[13px] font-semibold">{text(row)}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.record_number ? `${row.record_number} · ` : ""}
                    {formatAge(row.created_at)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
