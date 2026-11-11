import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday, certificateStatus } from "@/lib/vendors/rules";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Step = { key: "registration" | "questionnaire" | "categories"; href: string; state: "done" | "current" | "todo"; status?: string };

/**
 * Vendor portal home (CLAUDE.md Design, REG-06 AC6): progress checklist (Registration,
 * Questionnaire, Categories), grade with valid-until date, qualified categories and a warning
 * for every EXPIRING or EXPIRED certificate.
 */
export async function VendorHome({ vendorId }: { vendorId: string }) {
  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();

  const [{ data: vendor }, { data: responses }, { data: applications }, { data: categories }, { data: certificates }] =
    await Promise.all([
      supabase.from("vendor").select("legal_name, status").eq("id", vendorId).single(),
      supabase
        .from("questionnaire_response")
        .select("status, grade, valid_until")
        .eq("vendor_id", vendorId)
        .order("attempt_no", { ascending: false }),
      supabase.from("category_application").select("category_id, status, valid_until").eq("vendor_id", vendorId),
      supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
      supabase.from("vendor_certificate").select("id, type, expires_on").eq("vendor_id", vendorId),
    ]);

  const grade = (responses ?? []).find((r) => r.status === "GRADED" && r.valid_until && r.valid_until >= today);
  const latestResponse = (responses ?? [])[0];
  const qualified = (applications ?? []).filter((a) => a.status === "QUALIFIED" && a.valid_until && a.valid_until >= today);
  const paths = new Map(flattenTree(categories ?? []).map((c) => [c.id, c.path]));
  const warnings = (certificates ?? [])
    .map((c) => ({ ...c, status: certificateStatus(c.expires_on, today) }))
    .filter((c) => c.status !== "VALID");

  const approved = vendor?.status === "APPROVED";
  const graded = Boolean(grade && grade.grade !== "D");
  const steps: Step[] = [
    { key: "registration", href: "/vendor/registration", state: approved ? "done" : "current", status: vendor?.status },
    {
      key: "questionnaire",
      href: "/vendor/qualification",
      state: graded ? "done" : approved ? "current" : "todo",
      status: latestResponse?.status,
    },
    { key: "categories", href: "/vendor/categories", state: qualified.length > 0 ? "done" : graded ? "current" : "todo" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {warnings.map((c) => (
        <Alert key={c.id} variant={c.status === "EXPIRED" ? "destructive" : "default"} className={cn(c.status === "EXPIRING" && "border-amber-300 bg-amber-50")} data-testid="certificate-warning">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertDescription>
            {t(c.status === "EXPIRED" ? "vendorHome.certificateExpired" : "vendorHome.certificateExpiring", {
              type: t(`certificateTypes.${c.type}`),
              date: c.expires_on ? formatDate(c.expires_on) : "",
            })}{" "}
            <Link href="/vendor/profile" className="font-medium underline">
              {t("vendorHome.openProfile")}
            </Link>
          </AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendorHome.checklist")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-3 gap-4" data-testid="checklist">
            {steps.map((s, i) => {
              const Icon = s.state === "done" ? CheckCircle2 : s.state === "current" ? CircleDot : Circle;
              return (
                <li key={s.key} data-step={s.key} data-state={s.state}>
                  <Link
                    href={s.href}
                    className={cn(
                      "flex h-full items-start gap-3 rounded-lg border p-4 hover:bg-muted/60",
                      s.state === "current" && "border-primary",
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-5 shrink-0", s.state === "done" ? "text-emerald-600" : s.state === "current" ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        {i + 1}. {t(`vendorHome.steps.${s.key}`)}
                      </span>
                      <span className="text-xs text-muted-foreground">{t(`vendorHome.stepHints.${s.key}`)}</span>
                      {s.status && <StatusBadge status={s.status} className="self-start" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card data-testid="home-grade">
          <CardHeader>
            <CardTitle className="text-base">{t("qualification.grade")}</CardTitle>
          </CardHeader>
          <CardContent>
            {grade ? (
              <p className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold">{grade.grade}</span>
                <span className="text-sm text-muted-foreground">
                  {t("qualification.validUntil")}: {formatDate(grade.valid_until!)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("vendorHome.noGrade")}</p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="home-categories">
          <CardHeader>
            <CardTitle className="text-base">{t("vendorHome.qualifiedCategories")}</CardTitle>
          </CardHeader>
          <CardContent>
            {qualified.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("vendorHome.noCategories")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {qualified.map((a) => (
                  <li key={a.category_id} className="flex justify-between gap-4">
                    <span>{paths.get(a.category_id)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("categories.validUntil", { date: formatDate(a.valid_until!) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
