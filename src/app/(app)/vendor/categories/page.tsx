import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CategoryApplyForm, type CategoryChoice } from "@/components/vendor/category-apply-form";
import { applyForCategories } from "./actions";

type Application = {
  id: string;
  category_id: string;
  status: string;
  valid_until: string | null;
  reason: string | null;
  created_at: string;
};

/** REG-03 / REG-04 AC3: categories with the vendor's application status (EXPIRED shown by date). */
export default async function VendorCategoriesPage() {
  const { user, allowed } = await checkSection("vendorCategories");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();

  const [{ data: vendor }, { data: grades }, { data: categoryRows }, { data: applicationRows }] = await Promise.all([
    supabase.from("vendor").select("status, standing, standing_until").eq("id", user.vendorId).single(),
    supabase
      .from("questionnaire_response")
      .select("grade")
      .eq("vendor_id", user.vendorId)
      .eq("status", "GRADED")
      .gte("valid_until", today)
      .in("grade", ["A", "B", "C"]),
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").eq("is_active", true).returns<CategoryRow[]>(),
    supabase
      .from("category_application")
      .select("id, category_id, status, valid_until, reason, created_at")
      .eq("vendor_id", user.vendorId)
      .order("created_at", { ascending: false })
      .returns<Application[]>(),
  ]);

  // REG-02 AC6: approved registration and a valid grade A, B or C come first.
  if (vendor?.status !== "APPROVED") return <EmptyState message={t("errors.registrationNotApproved")} />;
  const onHold = vendor.standing === "HOLD" && vendor.standing_until && today < vendor.standing_until;
  if (onHold || (grades ?? []).length === 0) return <EmptyState message={t("errors.questionnaireFirst")} />;

  // Latest application per category; a QUALIFIED one past its date shows EXPIRED (REG-04 AC3).
  const latest = new Map<string, Application>();
  for (const a of applicationRows ?? []) if (!latest.has(a.category_id)) latest.set(a.category_id, a);
  const choices: CategoryChoice[] = flattenTree(categoryRows ?? []).map((c) => {
    const app = latest.get(c.id);
    const status =
      app?.status === "QUALIFIED" && app.valid_until && app.valid_until < today ? "EXPIRED" : (app?.status ?? null);
    return {
      ...c,
      status,
      validUntil: app?.valid_until ? formatDate(app.valid_until) : null,
      reason: app?.reason ?? null,
      blocked: status === "PENDING" || status === "QUALIFIED",
    };
  });

  const pathOf = new Map(choices.map((c) => [c.id, c.path]));
  const applications = applicationRows ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("categories.intro")}</p>
      <CategoryApplyForm categories={choices} action={applyForCategories} />
      {applications.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("categories.allApplications")}</h2>
          <ul className="divide-y rounded-lg border bg-card" data-testid="applications">
            {applications.map((a) => {
              const shown = a.status === "QUALIFIED" && a.valid_until && a.valid_until < today ? "EXPIRED" : a.status;
              return (
                <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span>{pathOf.get(a.category_id) ?? ""}</span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    {formatDate(a.created_at)}
                    <StatusBadge status={shown} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
