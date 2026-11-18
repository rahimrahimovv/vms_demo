import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { sectionsFor } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { BELL_COLUMNS, BELL_MAX_ITEMS, toBellItem, type NotificationRow } from "@/lib/notifications";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";

/** Signed-in shell: sidebar (menu by role), top bar (title, bell, user). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("roles");
  const supabase = await createClient();

  const [{ data: latest }, { count: unread }, vendorStatus] = await Promise.all([
    supabase
      .from("notification")
      .select(BELL_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(BELL_MAX_ITEMS)
      .returns<NotificationRow[]>(),
    supabase.from("notification").select("id", { count: "exact", head: true }).eq("is_read", false),
    user.vendorId
      ? supabase.from("vendor").select("status").eq("id", user.vendorId).single().then(({ data }) => data?.status ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar sections={sectionsFor(user.roles, vendorStatus)} />
      {/* Content starts 256 px from the left, 32 px padding; the top bar spans the content area */}
      <div className="flex min-w-0 flex-col gap-5 pr-(--page-pad) pb-(--page-pad) pl-[calc(var(--sidebar-w)+var(--page-pad))]">
        <TopBar
          userId={user.id}
          fullName={user.fullName}
          roleLabels={user.roles.map((r) => t(r))}
          initialItems={(latest ?? []).map(toBellItem)}
          initialUnread={unread ?? 0}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
