"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { INTERNAL_ROLES } from "@/lib/auth/roles";
import type { UserFormState } from "./actions";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  mode: "create" | "edit";
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  initial: UserFormState;
};

/** Two-column form, required fields marked, error message under the field (CLAUDE.md Design). */
export function UserForm({ mode, action, initial }: Props) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (key: keyof UserFormState["errors"]) => (state.errors[key] ? t(state.errors[key]) : undefined);

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="flex flex-col gap-6">
          {state.errors.form && (
            <Alert variant="destructive" data-testid="form-error">
              <AlertDescription>{t(state.errors.form)}</AlertDescription>
            </Alert>
          )}

          {/* React resets the form after each action; Radix checkboxes would reset to their first
              default, so the grid remounts per server answer and shows the submitted values. */}
          <div key={state.attempt ?? 0} className="grid grid-cols-2 gap-x-6 gap-y-5">
            <FormField id="fullName" label={t("users.fields.fullName")} required error={err("fullName")}>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={state.values.fullName}
                aria-invalid={Boolean(state.errors.fullName)}
              />
            </FormField>

            <FormField id="email" label={t("users.fields.email")} required error={err("email")}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                defaultValue={state.values.email}
                readOnly={mode === "edit"}
                aria-invalid={Boolean(state.errors.email)}
              />
            </FormField>

            {mode === "create" && (
              <FormField
                id="password"
                label={t("users.fields.password")}
                required
                hint={t("users.fields.passwordHint")}
                error={err("password")}
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(state.errors.password)}
                />
              </FormField>
            )}

            {mode === "edit" && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("users.fields.active")}</Label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox name="isActive" defaultChecked={state.values.isActive} />
                  {t("users.fields.active")}
                </label>
                <p className="text-xs text-muted-foreground">{t("users.fields.activeHint")}</p>
              </div>
            )}

            <fieldset className="col-span-2 flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t("users.fields.roles")}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {INTERNAL_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox name="roles" value={role} defaultChecked={state.values.roles.includes(role)} />
                    {t(`roles.${role}`)}
                  </label>
                ))}
              </div>
              {state.errors.roles && (
                <p id="roles-error" role="alert" className="text-xs font-medium text-destructive">
                  {t(state.errors.roles)}
                </p>
              )}
            </fieldset>
          </div>

          <div className="flex justify-end gap-2 border-t pt-5">
            <Button asChild variant="outline">
              <Link href="/admin/users">{t("common.cancel")}</Link>
            </Button>
            {/* NFR-006: disabled while saving, so a second click creates nothing. */}
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
