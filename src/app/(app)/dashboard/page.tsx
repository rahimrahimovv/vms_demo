import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod, type DashboardSummary } from "@/lib/dashboard/calc";
import { NoAccess } from "@/components/no-access";
import { DashboardView, PeriodControl } from "@/components/dashboard/dashboard-view";

/**
 * PLT-04: the dashboard for Approver, Procurement Specialist, Committee Member and Admin. One database call
 * (public.dashboard_summary) returns every figure; it refuses everyone else, and no vendor page calls it (D-026).
 * The period travels in the query string, so it survives a reload.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, allowed } = await checkSection("dashboard");
  if (!allowed) return <NoAccess />;

  const period = parsePeriod((await searchParams).period);
  const t = await getTranslations("dashboard");
  const { data } = await (await createClient()).rpc("dashboard_summary", { p_period: period });
  const summary = data as DashboardSummary | null;
  if (!summary) return <NoAccess />;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <PeriodControl period={period} />
      </div>
      <DashboardView data={summary} roles={user.roles} />
    </div>
  );
}
