"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { COUNTRIES, OWNER_ROLES, VENDOR_TYPES, type VendorType } from "@/lib/vendors/constants";
import type { Owner, RegistrationValues } from "@/lib/vendors/validate";
import { FormField } from "@/components/form-field";
import { FileField } from "@/components/file-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RegistrationFormState = {
  errors: Record<string, string>;
  values: Omit<RegistrationValues, "password">;
  attempt?: number;
  saved?: boolean;
};

type CurrentFiles = Partial<Record<"charter" | "id_card" | "registration_certificate" | "vat_certificate", { id: string; file_name: string }[]>>;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

/**
 * REG-01 + REG-06 AC1-AC2: one form for the three vendor types. "register" also asks for the
 * sign-in e-mail and password; "edit" is the vendor's own registration (read-only once submitted).
 */
export function RegistrationForm({
  mode,
  action,
  initial,
  files = {},
  readOnly = false,
}: {
  mode: "register" | "edit";
  action: (prev: RegistrationFormState, formData: FormData) => Promise<RegistrationFormState>;
  initial: RegistrationFormState;
  files?: CurrentFiles;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, initial);
  const [type, setType] = useState<VendorType>(initial.values.vendorType);
  const [owners, setOwners] = useState<Owner[]>(
    initial.values.owners.length > 0 ? initial.values.owners : [{ fullName: "", idNumber: "", sharePercent: "", role: "HEAD" }],
  );
  const [vatPayer, setVatPayer] = useState(initial.values.isVatPayer);
  const v = state.values;
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const isIndividual = type === "INDIVIDUAL";
  const isForeign = type === "FOREIGN_COMPANY";
  const isLocal = type === "LOCAL_COMPANY";

  const text = (name: keyof RegistrationValues, label: string, opts: { required?: boolean; type?: string; hint?: string } = {}) => (
    <FormField id={name} label={label} required={opts.required} error={err(name)} hint={opts.hint}>
      <Input
        id={name}
        name={name}
        type={opts.type ?? "text"}
        defaultValue={String(v[name as keyof typeof v] ?? "")}
        aria-invalid={Boolean(state.errors[name])}
        readOnly={readOnly}
      />
    </FormField>
  );

  const updateOwner = (i: number, patch: Partial<Owner>) =>
    setOwners((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="registration-form">
      {state.errors.form && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      {state.saved && !state.errors.form && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("registration.saved")}</AlertDescription>
        </Alert>
      )}

      <div key={state.attempt ?? 0} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("registration.sections.type")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" className="grid grid-cols-3 gap-3">
              {VENDOR_TYPES.map((vt) => (
                <label
                  key={vt}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-4 text-sm",
                    type === vt && "border-primary bg-accent",
                    readOnly && "cursor-default",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="vendorType"
                      value={vt}
                      checked={type === vt}
                      disabled={readOnly && type !== vt}
                      onChange={() => setType(vt)}
                      className="accent-primary"
                    />
                    {t(`vendorTypes.${vt}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(`registration.typeHints.${vt}`)}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("registration.sections.company")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5">
            {text("legalName", isIndividual ? t("registration.fields.fullName") : t("registration.fields.legalName"), { required: true })}
            {isForeign ? (
              <FormField id="countryCode" label={t("registration.fields.country")} required error={err("countryCode")}>
                <select
                  id="countryCode"
                  name="countryCode"
                  defaultValue={v.countryCode && v.countryCode !== "AZ" ? v.countryCode : ""}
                  className={SELECT_CLASS}
                  aria-invalid={Boolean(state.errors.countryCode)}
                  disabled={readOnly}
                >
                  <option value="">{t("common.select")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`countries.${c}`)}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              text("voen", t("registration.fields.voen"), { required: isLocal, hint: t("registration.hints.voen") })
            )}
            {isForeign &&
              text("foreignTaxNumber", t("registration.fields.foreignTaxNumber"), {
                required: true,
                hint: t("registration.hints.foreignTaxNumber"),
              })}
            {isIndividual && text("idCardNumber", t("registration.fields.idCardNumber"), { required: true })}
            {text("legalAddress", t("registration.fields.legalAddress"), { required: !isIndividual })}
            {!isIndividual && text("directorName", t("registration.fields.directorName"), { required: isLocal })}
            {!isIndividual && text("foundedOn", t("registration.fields.foundedOn"), { required: true, type: "date" })}
            {!isForeign && (
              <FormField id="isVatPayer" label={t("registration.fields.vatPayer")} required={isLocal} error={err("isVatPayer")}>
                <div className="flex h-9 items-center gap-5 text-sm">
                  {(["yes", "no"] as const).map((option) => (
                    <label key={option} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="isVatPayer"
                        value={option}
                        checked={vatPayer === option}
                        onChange={() => setVatPayer(option)}
                        disabled={readOnly}
                        className="accent-primary"
                      />
                      {t(`common.${option}`)}
                    </label>
                  ))}
                </div>
              </FormField>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("registration.sections.contact")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5">
            {text("contactPerson", t("registration.fields.contactPerson"), { required: true })}
            {text("phone", t("registration.fields.phone"), { required: true, hint: t("registration.hints.phone") })}
            {mode === "register" ? (
              <>
                {text("contactEmail", t("registration.fields.contactEmail"), {
                  required: true,
                  type: "email",
                  hint: t("registration.hints.contactEmail"),
                })}
                <FormField
                  id="password"
                  label={t("registration.fields.password")}
                  required
                  hint={t("users.fields.passwordHint")}
                  error={err("password")}
                >
                  <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(state.errors.password)} />
                </FormField>
              </>
            ) : (
              <FormField id="contactEmail" label={t("registration.fields.contactEmail")}>
                <Input id="contactEmail" value={v.contactEmail} readOnly />
              </FormField>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("registration.sections.bank")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5">
            {text("bankName", t("registration.fields.bankName"), { required: true })}
            {text("iban", t("registration.fields.iban"), { required: true })}
            {text("swift", t("registration.fields.swift"), { required: true })}
          </CardContent>
        </Card>

        {!isIndividual && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("registration.sections.owners")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("registration.hints.owners")}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <input type="hidden" name="owners" value={JSON.stringify(owners)} />
              <div className="grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-3 text-xs font-medium text-muted-foreground">
                <span>{t("owners.fullName")}</span>
                <span>{t("owners.idNumber")}</span>
                <span>{t("owners.share")}</span>
                <span>{t("owners.role")}</span>
                <span className="w-9" />
              </div>
              {owners.map((o, i) => (
                <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-3" data-testid="owner-row">
                  <Input aria-label={t("owners.fullName")} value={o.fullName} readOnly={readOnly} onChange={(e) => updateOwner(i, { fullName: e.target.value })} />
                  <Input aria-label={t("owners.idNumber")} value={o.idNumber} readOnly={readOnly} onChange={(e) => updateOwner(i, { idNumber: e.target.value })} />
                  <Input
                    aria-label={t("owners.share")}
                    inputMode="decimal"
                    value={o.sharePercent}
                    readOnly={readOnly}
                    onChange={(e) => updateOwner(i, { sharePercent: e.target.value })}
                  />
                  <select
                    aria-label={t("owners.role")}
                    className={SELECT_CLASS}
                    value={o.role}
                    disabled={readOnly}
                    onChange={(e) => updateOwner(i, { role: e.target.value as Owner["role"] })}
                  >
                    {OWNER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`ownerRoles.${r}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("owners.remove")}
                    disabled={readOnly || owners.length === 1}
                    onClick={() => setOwners((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {state.errors.owners && (
                <p id="owners-error" role="alert" className="text-xs font-medium text-destructive">
                  {t(state.errors.owners)}
                </p>
              )}
              {!readOnly && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOwners((list) => [...list, { fullName: "", idNumber: "", sharePercent: "", role: "SHAREHOLDER" }])}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("owners.add")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("registration.sections.documents")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5">
            {isLocal && (
              <FileField id="file_charter" name="file_charter" label={t("files.kinds.charter")} required error={err("file_charter")} current={files.charter} disabled={readOnly} />
            )}
            {isIndividual && (
              <FileField id="file_id_card" name="file_id_card" label={t("files.kinds.id_card")} required error={err("file_id_card")} current={files.id_card} disabled={readOnly} />
            )}
            {isForeign && (
              <FileField
                id="file_registration_certificate"
                name="file_registration_certificate"
                label={t("files.kinds.registration_certificate")}
                required
                error={err("file_registration_certificate")}
                current={files.registration_certificate}
                disabled={readOnly}
              />
            )}
            {!isForeign && vatPayer === "yes" && (
              <FileField
                id="file_vat_certificate"
                name="file_vat_certificate"
                label={t("files.kinds.vat_certificate")}
                required
                error={err("file_vat_certificate")}
                current={files.vat_certificate}
                disabled={readOnly}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2">
          {/* NFR-006: disabled while saving, so a second click creates nothing. */}
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending} data-testid="save">
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="submit" name="intent" value="submit" disabled={pending} data-testid="submit">
            {t("registration.submit")}
          </Button>
        </div>
      )}
    </form>
  );
}
