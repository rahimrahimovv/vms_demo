import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { STEP_KEYS, type StepKey, type StepStatus } from "@/lib/vendors/steps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The round mark in front of a step: filled brand with a check = done, amber ring = in progress, grey ring = not started. */
export function StepMark({ status, size = 26 }: { status: StepStatus; size?: number }) {
  const done = status === "COMPLETE" || status === "NOT_NEEDED";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        done && "bg-primary shadow-[0_2px_8px_var(--brand-glow)]",
        status === "IN_PROGRESS" && "box-border border-[3px] border-[#d99a00]",
        status === "NOT_STARTED" && "box-border border-2 border-[rgba(23,38,43,0.35)]",
      )}
    >
      {done && <Check className="size-3.5 text-white" strokeWidth={3} />}
    </span>
  );
}

/**
 * REG-07 AC1: Account (complete), Company details, Owners, Contact persons, Bank accounts, Documents and
 * Review and submit, each Not started / In progress / Complete, with a progress bar and a Continue button.
 * Qualification and Categories are listed below it as locked until the registration is approved.
 */
export function RegistrationChecklist({
  statuses,
  progress,
  continueStep,
  showLocked = true,
  current,
}: {
  statuses: Record<StepKey, StepStatus>;
  progress: { done: number; total: number };
  /** the step Continue opens; null hides the button */
  continueStep: StepKey | null;
  showLocked?: boolean;
  current?: StepKey;
}) {
  const t = useTranslations("registration");
  const tHome = useTranslations("vendorHome");
  const items: { key: "account" | StepKey; status: StepStatus }[] = [
    { key: "account", status: "COMPLETE" },
    ...STEP_KEYS.map((key) => ({ key, status: statuses[key] })),
  ];
  const percent = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="flex flex-col gap-4" data-testid="registration-checklist">
      <section className="surface-glass flex flex-col gap-2.5 px-[18px] py-4">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold">{tHome("steps.registration")}</span>
          <span className="text-[13px] text-[#3d4a50]" data-testid="progress-text">
            {t("progress", { done: progress.done, total: progress.total })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={tHome("steps.registration")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2.5 overflow-hidden rounded-[5px] bg-[rgba(23,38,43,0.1)]"
        >
          <div className="h-full rounded-[5px] bg-[linear-gradient(90deg,#2a62a8,#3e78c2)]" style={{ width: `${percent}%` }} />
        </div>
      </section>
      <ol className="grid grid-cols-4 gap-4">
        {items.map(({ key, status }) => {
          const label = t(`steps.${key}`);
          return (
            <li
              key={key}
              data-step={key}
              data-status={status}
              className={cn(
                "surface-glass flex items-start gap-3 px-[18px] py-4",
                current === key && "border-primary! shadow-[0_0_0_1px_var(--primary),var(--glass-card-shadow)]",
              )}
            >
              <StepMark status={status} />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                {key === "account" ? (
                  <span className="font-semibold">{label}</span>
                ) : (
                  <Link href={`/vendor/registration/${key}`} className="font-semibold hover:underline">
                    {label}
                  </Link>
                )}
                <span className="text-xs text-muted-foreground" data-testid={`step-status-${key}`}>
                  {t(`stepStatus.${status}`)}
                </span>
                {continueStep === key && (
                  <Button asChild className="mt-1" data-testid="continue-registration">
                    <Link href={`/vendor/registration/${key}`}>{t("continue")}</Link>
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {showLocked && (
        <>
          <p className="px-2 pt-1 font-semibold text-[#3d4a50]">{tHome("afterApproval")}</p>
          <ul className="grid grid-cols-4 gap-4" data-testid="locked-steps">
            {(["questionnaire", "categories"] as const).map((key) => (
              <li key={key} className="surface-glass flex items-center gap-2.5 px-[18px] py-4 opacity-80" data-locked={key}>
                <Lock className="size-5 shrink-0 text-[#3d4a50]" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t(`lockedSteps.${key}`)}</span>
                  <span className="text-xs text-[#3d4a50]">{t("locked")}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
