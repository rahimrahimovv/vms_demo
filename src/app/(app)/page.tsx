import Link from "next/link";
import { Building2, ClipboardCheck, FileCheck, Gavel, ListChecks, PackageSearch, ShoppingCart, Undo2, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { bakuHour, formatAge, formatDate, formatDateTime } from "@/lib/format";
import { messageValues } from "@/lib/notifications";
import { recordHref } from "@/lib/records";
import { TASK_HREF, loadTasks, waitingRows, waitingTotal, type TaskRow } from "@/lib/home/tasks";
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
 * "My tasks" home for every role: greeting with the number of waiting items, cards with counts of items waiting for this user
 * (each with a link), the "Waiting for you" list and the recent notifications. The cards and the list are built from the current
 * state with the same queries (src/lib/home/tasks.ts), so they always agree; notifications have their own card. Admin gets shortcuts.
 */
export default async function HomePage() {
  const { user, allowed } = await checkSection("home");
  if (!allowed) return <NoAccess />;
  if (user.vendorId) return <VendorHome vendorId={user.vendorId} />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { count: unreadCount } = await supabase.from("notification").select("id", { count: "exact", head: true }).eq("is_read", false);
  const { data: recentData } = await supabase
    .from("notification")
    .select(NOTIFICATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(4)
    .returns<UnreadRow[]>();
  const recent = recentData ?? [];
  const count = unreadCount ?? 0;

  const isRequester = user.roles.includes("REQUESTER");
  const results = await loadTasks(supabase, { id: user.id, roles: user.roles });
  const taskCards = results.map((r) => ({ key: r.key, href: TASK_HREF[r.key], count: r.count }));
  const rows = waitingRows(results);

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
  const taskText = (row: TaskRow) => {
    const params: Record<string, string> = { ...row.params };
    if (params.section) params.section = t(`changeRequest.sections.${params.section}`);
    if (params.type) params.type = t(`decisions.types.${params.type}`);
    return t(`home.tasks.${row.key}`, params);
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

  const ICONS = { changeRequests: FileCheck, registrations: Building2, questionnaires: ClipboardCheck, applications: ListChecks, sourcingsBelowMinimum: PackageSearch, prsReadyForSourcing: PackageSearch, prsToApprove: ShoppingCart, prsReturned: Undo2, votesWaiting: Gavel, posToApprove: FileCheck } as const;
  const cardColumns = taskCards.length + adminCards.length <= 5 ? Math.max(1, taskCards.length + adminCards.length) : 4;
  const waiting = waitingTotal(results);
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
          {t("home.unreadCard", { count })}
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
          {rows.length === 0 ? (
            <>
              <h2 className="px-2 pb-3 text-base font-semibold">{t("home.listTitle")}</h2>
              <EmptyState message={t("home.empty")} action={mainAction} />
            </>
          ) : (
            <div className="surface-solid overflow-hidden">
              <h2 className="px-[18px] py-3 text-base font-semibold">{t("home.listTitle")}</h2>
              <ul>
                {rows.map((row) => (
                  <li key={`${row.key}-${row.recordId}`} className="flex items-center gap-3 border-t border-[rgba(23,38,43,0.08)] px-[18px] py-2.5" data-testid="waiting-row">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{taskText(row)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(row.since)}</div>
                    </div>
                    <div className="w-36 shrink-0">
                      <span className="inline-flex h-5 items-center rounded-full bg-(--brand-grade-bg) px-2.5 text-xs font-semibold text-(--brand-grade-fg)">
                        {recordType(row.recordType)}
                      </span>
                    </div>
                    <div className="w-24 shrink-0 text-xs text-muted-foreground">{formatAge(row.since)}</div>
                    <Button asChild variant="outline">
                      <Link href={recordHref(row.recordType, row.recordId, "internal")}>{t("home.open")}</Link>
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
