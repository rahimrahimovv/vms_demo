"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signIn, type SignInState } from "@/app/actions/auth";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: SignInState = { error: null, email: "" };

export function SignInForm() {
  const t = useTranslations("signIn");
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2.5" noValidate>
      {state.error && (
        <Alert variant="destructive" data-testid="sign-in-error">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <FormField id="email" label={t("email")} required>
        <Input id="email" name="email" type="email" autoComplete="username" defaultValue={state.email} required />
      </FormField>
      <FormField id="password" label={t("password")} required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      {/* NFR-006: disabled while the request runs, so a second click sends nothing. */}
      <Button type="submit" disabled={pending} size="lg" className="mt-2 h-11 rounded-[18px]">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
