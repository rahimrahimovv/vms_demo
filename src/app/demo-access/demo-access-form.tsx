"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { unlockAction, type DemoState } from "@/app/actions/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const IDLE: DemoState = { error: null };

export function DemoAccessForm() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(unlockAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-code">{t("demo.access.code")}</Label>
        <Input
          id="demo-code"
          name="code"
          type="password"
          autoComplete="off"
          required
          aria-invalid={Boolean(state.error)}
          data-testid="demo-code"
        />
        {state.error && (
          <p role="alert" className="text-xs font-medium text-destructive" data-testid="demo-code-error">
            {t(state.error)}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} data-testid="demo-unlock">
        {t("demo.access.submit")}
      </Button>
    </form>
  );
}
