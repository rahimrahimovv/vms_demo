"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, Lock, TimerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  deadlineInfoAction,
  endDeadlineAction,
  lockAction,
  switchUserAction,
  type DemoState,
} from "@/app/actions/demo";
import { Button } from "@/components/ui/button";

export type DemoUser = { id: string; name: string; email: string; role: string; isVendor: boolean };

const IDLE: DemoState = { error: null };
const SOURCING_PATH = /^\/sourcing\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/**
 * "End deadline now" shows only on a sourcing record whose deadline can be ended (OPEN, or a running final-offer
 * round). The layout stays mounted between pages, so the bar asks the server again when the page changes and every
 * 10 seconds (a sourcing may have just been published or its round started).
 */
function useEndableSourcing(): { id: string; kind: "OPEN" | "FINAL_OFFER_ROUND" } | null {
  const sourcingId = SOURCING_PATH.exec(usePathname())?.[1] ?? null;
  const [found, setFound] = useState<{ id: string; kind: "OPEN" | "FINAL_OFFER_ROUND" } | null>(null);
  useEffect(() => {
    if (!sourcingId) return;
    let alive = true;
    const ask = () =>
      deadlineInfoAction(sourcingId).then((kind) => {
        if (alive) setFound(kind ? { id: sourcingId, kind } : null);
      });
    ask();
    const timer = setInterval(ask, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sourcingId]);
  return sourcingId && found?.id === sourcingId ? found : null;
}

/**
 * The demo bar (glass strip): Switch user, End deadline now (where it applies) and Lock. Resetting and loading
 * data are developer commands, never part of this bar (D-023). The server renders it only for an unlocked demo session.
 */
export function DemoBarControls({ users, currentUserId }: { users: DemoUser[]; currentUserId?: string }) {
  const t = useTranslations("demo.bar");
  const roles = useTranslations("roles");
  const router = useRouter();
  const [state, switchAction, switching] = useActionState(switchUserAction, IDLE);
  const endable = useEndableSourcing();
  const [endState, endAction, ending] = useActionState(async (prev: DemoState, formData: FormData) => {
    const result = await endDeadlineAction(prev, formData);
    if (!result.error) router.refresh();
    return result;
  }, IDLE);

  const label = (u: DemoUser) =>
    `${u.name} (${u.role
      .split(", ")
      .filter(Boolean)
      .map((r) => roles(r))
      .join(", ")})`;
  const internal = users.filter((u) => !u.isVendor);
  const vendors = users.filter((u) => u.isVendor);

  return (
    <div
      data-testid="demo-bar"
      role="region"
      aria-label={t("label")}
      className="surface-glass flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-ink uppercase">
        <FlaskConical className="size-4" aria-hidden />
        {t("label")}
      </span>

      <form action={switchAction} className="flex items-center gap-2">
        <label htmlFor="demo-switch-user" className="text-[13px] font-medium">
          {t("switchUser")}
        </label>
        <select
          id="demo-switch-user"
          name="userId"
          defaultValue=""
          required
          data-testid="demo-switch-select"
          className="surface-pill h-8 max-w-64 rounded-[20px] px-3 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="" disabled>
            {t("switchPlaceholder")}
          </option>
          <optgroup label={t("internalUsers")}>
            {internal.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === currentUserId}>
                {label(u)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("vendorUsers")}>
            {vendors.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === currentUserId}>
                {label(u)}
              </option>
            ))}
          </optgroup>
        </select>
        <Button type="submit" size="sm" disabled={switching} data-testid="demo-switch-go">
          {switching ? t("switching") : t("switchGo")}
        </Button>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {endable && (
          <form action={endAction}>
            <input type="hidden" name="sourcingId" value={endable.id} />
            <Button type="submit" variant="outline" size="sm" disabled={ending} data-testid="demo-end-deadline">
              <TimerOff aria-hidden />
              {endable.kind === "OPEN" ? t("endDeadline") : t("endFinalOffer")}
            </Button>
          </form>
        )}
        <form action={lockAction}>
          <Button type="submit" variant="outline" size="sm" data-testid="demo-lock">
            <Lock aria-hidden />
            {t("lock")}
          </Button>
        </form>
      </div>

      {endState.error && (
        <p role="alert" className="basis-full text-xs font-medium text-destructive" data-testid="demo-end-error">
          {endState.error === "errors.notAvailable" ? t("notAvailable") : t("nothingToEnd")}
        </p>
      )}
      {state.error && (
        <p role="alert" className="basis-full text-xs font-medium text-destructive" data-testid="demo-bar-error">
          {state.error === "errors.notAvailable" ? t("notAvailable") : t("failed")}
        </p>
      )}
    </div>
  );
}
