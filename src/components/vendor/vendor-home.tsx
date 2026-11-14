import Link from "next/link";
import { Check, Lock, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday, certificateStatus } from "@/lib/vendors/rules";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loadSnapshot } from "@/lib/vendors/queries";
import { firstIncompleteStep, progress, stepStatuses } from "@/lib/vendors/steps";
import { RegistrationChecklist } from "@/components/vendor/registration-checklist";

type Stage = { key: "registration" | "questionnaire" | "categories"; href: string; done: boolean };

const DAY_MS = 86_400_000;

/** Grade badges stay brand blue (Midnight Navy). */
function GradeBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full bg-(--brand-grade-bg) px-2.5 text-xs font-semibold whitespace-nowrap text-(--brand-grade-fg)", className)}>
      {children}
    </span>
  );
}

/**
 * Vendor portal home (CLAUDE.md Design, REG-06 AC6). DRAFT or RETURNED: the registration cabinet (warning, progress bar, the
 * seven step cards, Qualification and Categories locked). Otherwise: company heading with badges, certificate warnings, three
 * count cards, "Your progress" with three stages, the grade card and the qualified categories.
 */
export async function VendorHome({ vendorId }: { vendorId: string }) {
  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();

  const [{ data: vendor }, { data: responses }, { data: applications }, { data: categories }, { data: certificates }] =
    await Promise.all([
      supabase.from("vendor").select("legal_name, status, vendor_type").eq("id", vendorId).single(),
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
  const stages: Stage[] = [
    { key: "registration", href: approved ? "/vendor/profile" : "/vendor/registration", done: approved },
    { key: "questionnaire", href: "/vendor/qualification", done: graded },
    { key: "categories", href: "/vendor/categories", done: qualified.length > 0 },
  ];

  const heading = (
    <div className="flex flex-wrap items-center gap-3 px-2 py-1">
      <h2 className="text-2xl font-bold" data-testid="vendor-name">
        {vendor?.legal_name}
      </h2>
      {vendor?.status && <StatusBadge status={vendor.status} />}
      {approved && grade && <GradeBadge>{t("vendorHome.gradeBadge", { grade: grade.grade ?? "" })}</GradeBadge>}
      {vendor?.vendor_type && <span className="text-[#3d4a50]">{t(`vendorTypes.${vendor.vendor_type}`)}</span>}
    </div>
  );

  // Slice 4 (RFQ-02): invitations waiting for an answer, accepted ones still without a submitted proposal
  const { data: invitationRows } = await supabase.rpc("vendor_invitation_list");
  const open = ((invitationRows ?? []) as { sourcing_status: string; deadline: string; invitation_status: string; proposal_status: string | null }[]).filter(
    (i) => i.sourcing_status === "OPEN" && new Date(i.deadline) > new Date(),
  );
  const toAnswer = open.filter((i) => i.invitation_status === "INVITED").length;
  const toSubmit = open.filter((i) => i.invitation_status === "ACCEPTED" && i.proposal_status !== "SUBMITTED").length;

  // Slice 7 (PO-03): fully approved POs waiting for the vendor's answer
  const { data: poRows } = await supabase.rpc("po_list");
  const toAccept = ((poRows ?? []) as { status: string }[]).filter((po) => po.status === "FULLY_APPROVED").length;

  // REG-07 AC1, AC10: while DRAFT or RETURNED the home page is the registration checklist
  const registering = vendor?.status === "DRAFT" || vendor?.status === "RETURNED";
  if (registering) {
    const loaded = await loadSnapshot(supabase, vendorId);
    if (loaded) {
      const statuses = stepStatuses(loaded.snapshot, today);
      const next = firstIncompleteStep(statuses);
      return (
        <div className="flex flex-col gap-4">
          {heading}
          {loaded.vendor.status === "RETURNED" && loaded.vendor.review_comment && (
            <Alert className="surface-warning" data-testid="returned-comment">
              <AlertTitle>{t("registration.returnedTitle")}</AlertTitle>
              <AlertDescription>{loaded.vendor.review_comment}</AlertDescription>
            </Alert>
          )}
          <Alert className="surface-warning flex items-center gap-3.5" data-testid="complete-profile-warning">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <AlertTitle className="text-sm font-semibold">{t("registration.warning")}</AlertTitle>
              <AlertDescription className="text-[13px]">{t("registration.approvalNote")}</AlertDescription>
            </div>
            <Button asChild>
              <Link href={`/vendor/registration/${next}`}>{t("registration.continue")}</Link>
            </Button>
          </Alert>
          <RegistrationChecklist statuses={statuses} progress={progress(statuses)} continueStep={next} />
        </div>
      );
    }
  }

  const stagesDone = stages.filter((s) => s.done).length;
  const daysLeft = grade?.valid_until ? Math.max(0, Math.round((Date.parse(grade.valid_until) - Date.parse(today)) / DAY_MS)) : 0;
  const barPercent = Math.min(100, Math.round((daysLeft / 365) * 100));
  const counts = [
    { key: "invitationsToAnswer", count: toAnswer, href: "/vendor/invitations" },
    { key: "proposalsToSubmit", count: toSubmit, href: "/vendor/invitations" },
    { key: "posToAccept", count: toAccept, href: "/vendor/purchase-orders" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {heading}

      {warnings.map((c) => (
        <Alert
          key={c.id}
          variant={c.status === "EXPIRED" ? "destructive" : "default"}
          className={cn("flex items-center gap-3.5", c.status === "EXPIRING" && "surface-warning")}
          data-testid="certificate-warning"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <AlertDescription className="min-w-0 flex-1 font-semibold">
            {t(c.status === "EXPIRED" ? "vendorHome.certificateExpired" : "vendorHome.certificateExpiring", {
              type: t(`certificateTypes.${c.type}`),
              date: c.expires_on ? formatDate(c.expires_on) : "",
            })}
          </AlertDescription>
          <Button asChild variant="outline">
            <Link href="/vendor/profile">{t("vendorHome.openProfile")}</Link>
          </Button>
        </Alert>
      ))}

      <div className="grid grid-cols-3 gap-4">
        {counts.map((card) => (
          <Link key={card.key} href={card.href} data-testid={`task-card-${card.key}`} className="rounded-[22px]">
            <Card className="h-full transition-colors hover:bg-white/70">
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl leading-[1.1] font-bold text-brand-ink">{card.count}</span>
                  <span className="font-semibold">{t(`vendorHome.cardLabels.${card.key}`)}</span>
                </div>
                <span className="sr-only">{t(`home.cards.${card.key}`, { count: card.count })}</span>
                <p className="text-[13px] text-muted-foreground">{t(`vendorHome.cardHints.${card.key}`, { count: card.count })}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("vendorHome.checklist")}</CardTitle>
          <span className="text-[13px] text-[#3d4a50]">
            {stagesDone === stages.length ? t("vendorHome.allComplete") : t("vendorHome.stagesComplete", { done: stagesDone, total: stages.length })}
          </span>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-3 gap-3" data-testid="checklist">
            {stages.map((s) => {
              const status = s.key === "registration" ? vendor?.status : s.key === "questionnaire" ? latestResponse?.status : undefined;
              const locked = !approved && s.key !== "registration";
              return (
                <li key={s.key} data-step={s.key} data-state={s.done ? "done" : locked ? "todo" : "current"}>
                  <Link
                    href={s.href}
                    className="flex h-full items-start gap-3 rounded-[18px] border border-white/80 bg-white/55 px-3.5 py-3 transition-colors hover:bg-white/75"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-[30px] shrink-0 items-center justify-center rounded-full",
                        s.done ? "bg-primary shadow-[0_2px_8px_var(--brand-glow)]" : locked ? "border-2 border-[rgba(23,38,43,0.35)]" : "box-border border-[3px] border-[#d99a00]",
                      )}
                    >
                      {s.done ? <Check className="size-4 text-white" strokeWidth={3} /> : locked ? <Lock className="size-3.5 text-[#3d4a50]" /> : null}
                    </span>
                    <span className="flex flex-col items-start gap-0.5">
                      <span className="font-semibold">{t(`vendorHome.steps.${s.key}`)}</span>
                      <span className="pb-1 text-xs text-muted-foreground">{t(`vendorHome.stepHints.${s.key}`)}</span>
                      {s.key === "categories" && qualified.length > 0 ? (
                        <span className="inline-flex h-5 items-center rounded-full bg-(--tone-green-bg) px-2.5 text-xs font-semibold text-(--tone-green-fg)">
                          {t("vendorHome.qualifiedCount", { count: qualified.length })}
                        </span>
                      ) : status ? (
                        <StatusBadge status={status} />
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[1fr_1.4fr] items-start gap-4">
        <Card data-testid="home-grade">
          <CardHeader>
            <CardTitle>{t("qualification.grade")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {grade ? (
              <>
                <div className="flex items-center gap-4 py-1.5">
                  <span
                    className="flex size-[72px] shrink-0 items-center justify-center rounded-full border border-white/90 bg-[linear-gradient(180deg,#e4eefb,#cfe0f8)] text-4xl font-bold text-(--brand-grade-fg) shadow-[0_6px_16px_rgba(29,78,137,0.18)]"
                    aria-label={t("qualification.grade")}
                  >
                    {grade.grade}
                  </span>
                  <div>
                    <div className="font-semibold">
                      {t("qualification.validUntil")}: {formatDate(grade.valid_until!)}
                    </div>
                    <div className="text-[13px] text-muted-foreground">{t("vendorHome.gradeLeft", { days: daysLeft })}</div>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("qualification.validUntil")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={barPercent}
                  className="h-2 overflow-hidden rounded-[4px] bg-[rgba(23,38,43,0.1)]"
                >
                  <div className="h-full rounded-[4px] bg-[linear-gradient(90deg,#2a62a8,#3e78c2)]" style={{ width: `${barPercent}%` }} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("vendorHome.noGrade")}</p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="home-categories">
          <CardHeader>
            <CardTitle>{t("vendorHome.qualifiedCategories")}</CardTitle>
          </CardHeader>
          <CardContent>
            {qualified.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("vendorHome.noCategories")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {qualified.map((a) => (
                  <li key={a.category_id} className="surface-inner flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{paths.get(a.category_id)}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status="QUALIFIED" />
                      <span className="text-xs text-muted-foreground">{t("categories.validUntil", { date: formatDate(a.valid_until!) })}</span>
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
