"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { COUNTRIES, VENDOR_TYPES, type VendorType } from "@/lib/vendors/constants";
import type { AccountValues } from "@/lib/vendors/validate";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RegisterFormState = {
  errors: Record<string, string>;
  values: Omit<AccountValues, "password">;
  attempt?: number;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** REG-01 AC1: the short account form (about 8 fields). */
export function RegisterForm({
  action,
  initial,
}: {
  action: (prev: RegisterFormState, formData: FormData) => Promise<RegisterFormState>;
  initial: RegisterFormState;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, initial);
  const [type, setType] = useState<VendorType>(initial.values.vendorType);
  const v = state.values;
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const isIndividual = type === "INDIVIDUAL";
  const isForeign = type === "FOREIGN_COMPANY";

  const text = (
    name: keyof Omit<AccountValues, "password" | "vendorType" | "countryCode">,
    label: string,
    opts: { type?: string; hint?: string } = {},
  ) => (
    <FormField id={name} label={label} required error={err(name)} hint={opts.hint}>
      <Input id={name} name={name} type={opts.type ?? "text"} defaultValue={v[name]} aria-invalid={Boolean(state.errors[name])} />
    </FormField>
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="register-form">
      {state.errors.form && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      <div key={state.attempt ?? 0} className="flex flex-col gap-6">
        <div role="radiogroup" className="grid grid-cols-3 gap-3">
          {VENDOR_TYPES.map((vt) => (
            <label
              key={vt}
              className={cn("flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-sm", type === vt && "border-primary bg-accent")}
            >
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="vendorType" value={vt} checked={type === vt} onChange={() => setType(vt)} className="accent-primary" />
                {t(`vendorTypes.${vt}`)}
              </span>
              <span className="text-xs text-muted-foreground">{t(`registration.typeHints.${vt}`)}</span>
            </label>
          ))}
        </div>

        <Card>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5">
            {text("legalName", isIndividual ? t("registration.fields.fullName") : t("registration.fields.legalName"))}
            {isForeign ? (
              <FormField id="countryCode" label={t("registration.fields.country")} required error={err("countryCode")}>
                <select
                  id="countryCode"
                  name="countryCode"
                  defaultValue={v.countryCode && v.countryCode !== "AZ" ? v.countryCode : ""}
                  className={SELECT_CLASS}
                  aria-invalid={Boolean(state.errors.countryCode)}
                >
                  <option value="">{t("common.select")}</option>
                  {COUNTRIES.filter((c) => c !== "AZ").map((c) => (
                    <option key={c} value={c}>
                      {t(`countries.${c}`)}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : isIndividual ? (
              text("idCardNumber", t("registration.fields.idCardNumber"))
            ) : (
              text("voen", t("registration.fields.voen"), { hint: t("registration.hints.voen") })
            )}
            {isForeign &&
              text("foreignTaxNumber", t("registration.fields.foreignTaxNumber"), { hint: t("registration.hints.foreignTaxNumber") })}
            {text("contactPerson", t("registration.fields.contactPerson"))}
            {text("phone", t("registration.fields.phone"), { hint: t("registration.hints.phone") })}
            {text("contactEmail", t("registration.fields.contactEmail"), { type: "email", hint: t("registration.hints.contactEmail") })}
            <FormField id="password" label={t("registration.fields.password")} required hint={t("users.fields.passwordHint")} error={err("password")}>
              <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(state.errors.password)} />
            </FormField>
          </CardContent>
        </Card>
      </div>
      {/* NFR-006: disabled while saving, so a second click creates nothing. */}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="create-account">
          {t("registration.createAccount")}
        </Button>
      </div>
    </form>
  );
}
