import Link from "next/link";
import { Bell, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { recordHref } from "@/lib/records";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
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
  const text = (row: UnreadRow) => {
    const key = `notifications.events.${row.event}`;
    const values = { ...(row.params ?? {}), number: row.record_number ?? "" };
    return t.has(key) ? t(key, values) : t("notifications.fallback", values);
  };

  const mainAction = canAccess(user.roles, "adminUsers") ? (
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
                  href={recordHref(row.record_type, row.record_id)}
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
