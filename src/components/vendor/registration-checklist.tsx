import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { STEP_KEYS, type StepKey, type StepStatus } from "@/lib/vendors/steps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICONS: Record<StepStatus, typeof Circle> = {
  NOT_STARTED: Circle,
  IN_PROGRESS: CircleDot,
  COMPLETE: CheckCircle2,
  NOT_NEEDED: CheckCircle2,
};

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
  const items: { key: "account" | StepKey; status: StepStatus }[] = [
    { key: "account", status: "COMPLETE" },
    ...STEP_KEYS.map((key) => ({ key, status: statuses[key] })),
  ];
  const percent = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="flex flex-col gap-4" data-testid="registration-checklist">
      <div className="flex items-center gap-4">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm text-muted-foreground" data-testid="progress-text">
          {t("progress", { done: progress.done, total: progress.total })}
        </span>
        {continueStep && (
          <Button asChild data-testid="continue-registration">
            <Link href={`/vendor/registration/${continueStep}`}>{t("continue")}</Link>
          </Button>
        )}
      </div>
      <ol className="grid grid-cols-4 gap-3">
        {items.map(({ key, status }) => {
          const Icon = ICONS[status];
          const body = (
            <>
              <Icon
                className={cn("mt-0.5 size-5 shrink-0", status === "COMPLETE" || status === "NOT_NEEDED" ? "text-emerald-600" : status === "IN_PROGRESS" ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t(`steps.${key}`)}</span>
                <span className="text-xs text-muted-foreground" data-testid={`step-status-${key}`}>
                  {t(`stepStatus.${status}`)}
                </span>
              </span>
            </>
          );
          const cls = cn("flex items-start gap-3 rounded-lg border p-3", current === key && "border-primary bg-accent");
          return (
            <li key={key} data-step={key} data-status={status}>
              {key === "account" ? <div className={cls}>{body}</div> : (
                <Link href={`/vendor/registration/${key}`} className={cn(cls, "hover:bg-muted/60")}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {showLocked && (
        <ul className="grid grid-cols-2 gap-3" data-testid="locked-steps">
          {(["questionnaire", "categories"] as const).map((key) => (
            <li key={key} className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-muted-foreground" data-locked={key}>
              <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t(`lockedSteps.${key}`)}</span>
                <span className="text-xs">{t("locked")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
