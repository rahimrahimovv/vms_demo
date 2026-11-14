"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePassword, type PasswordState } from "@/app/actions/password";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: PasswordState = { errors: {} };

/** PLT-03 AC1-AC3: current password, new password and its confirmation; the messages sit under their fields. */
export function ChangePasswordForm() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  const msg = (key?: string) => (key ? t(key) : undefined);

  return (
    <form action={action} className="flex flex-col gap-2.5" noValidate key={state.saved ? state.attempt : "form"}>
      {state.saved && (
        <Alert data-testid="password-saved">
          <AlertDescription>{t("password.saved")}</AlertDescription>
        </Alert>
      )}
      {state.errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      <FormField id="current" label={t("password.fields.current")} required error={msg(state.errors.current)}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.errors.current)} />
      </FormField>
      <FormField id="next" label={t("password.fields.next")} required hint={t("password.fields.hint")} error={msg(state.errors.next)}>
        <Input id="next" name="next" type="password" autoComplete="new-password" required aria-invalid={Boolean(state.errors.next)} />
      </FormField>
      <FormField id="confirm" label={t("password.fields.confirm")} required error={msg(state.errors.confirm)}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={Boolean(state.errors.confirm)} />
      </FormField>
      {/* NFR-006: disabled while the request runs, so a second click sends nothing. */}
      <Button type="submit" disabled={pending} size="lg" className="mt-2 h-11 rounded-[18px]" data-testid="password-submit">
        {pending ? t("common.saving") : t("password.fields.submit")}
      </Button>
    </form>
  );
}
