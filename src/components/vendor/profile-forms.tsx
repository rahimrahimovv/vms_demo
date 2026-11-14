"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/app/(app)/vendor/profile/actions";
import { ACTIVITIES, CERTIFICATE_TYPES, GUARANTEE_TYPES, MAX_MAIN_GOODS } from "@/lib/vendors/constants";
import { FormField } from "@/components/form-field";
import { FileField } from "@/components/file-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BankAccountsEditor } from "@/components/vendor/bank-accounts-editor";
import type { BankAccount } from "@/lib/vendors/validate";

export const SELECT_CLASS =
  "h-9 w-full rounded-[14px] border border-input bg-(--field-bg) px-3 text-sm outline-none aria-invalid:border-destructive";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function useForm(action: Action) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const banner = (
    <>
      {state.errors.form && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert data-testid="form-saved">
          <AlertDescription>{t("common.savedNote")}</AlertDescription>
        </Alert>
      )}
    </>
  );
  return { t, state, formAction, pending, err, banner };
}

/** REG-06 AC3: add, edit or remove bank accounts; at least one, exactly one main. */
export function BankAccountsForm({ action, initial, currencies }: { action: Action; initial: BankAccount[]; currencies: string[] }) {
  const { t, state, formAction, pending, err, banner } = useForm(action);
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="bank-accounts-form">
      {banner}
      <BankAccountsEditor key={state.attempt ?? 0} initial={state.values?.bankAccounts ?? initial} currencies={currencies} error={err("bankAccounts")} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="save-bank-accounts">
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export type ProfileValues = {
  mainActivity: string;
  mainGoods: string[];
  bankGuaranteeAvailable: boolean;
  bankGuaranteeTypes: string[];
  bankGuaranteeMax: string;
  bankGuaranteeCurrency: string;
};

/** REG-06 AC3: activity, up to 20 main goods, bank guarantee capacity. */
export function ProfileDetailsForm({
  action,
  initial,
  currencies,
}: {
  action: Action;
  initial: ProfileValues;
  currencies: string[];
}) {
  const { t, state, formAction, pending, err, banner } = useForm(action);
  const [guarantee, setGuarantee] = useState(initial.bankGuaranteeAvailable);
  return (
    <form action={formAction} className="flex flex-col gap-5" data-testid="profile-form">
      {banner}
      <div key={state.attempt ?? 0} className="grid grid-cols-2 gap-x-6 gap-y-5">
        <FormField id="mainActivity" label={t("profile.fields.mainActivity")} error={err("mainActivity")}>
          <select id="mainActivity" name="mainActivity" defaultValue={initial.mainActivity} className={SELECT_CLASS}>
            <option value="">{t("common.select")}</option>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {t(`activities.${a}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="mainGoods"
          label={t("profile.fields.mainGoods")}
          hint={t("profile.hints.mainGoods", { max: MAX_MAIN_GOODS })}
          error={err("mainGoods")}
          className="row-span-2"
        >
          <Textarea id="mainGoods" name="mainGoods" rows={5} defaultValue={initial.mainGoods.join("\n")} />
        </FormField>
        <FormField id="bankGuaranteeAvailable" label={t("profile.fields.bankGuarantee")}>
          <div className="flex h-9 items-center gap-5 text-sm">
            {(["yes", "no"] as const).map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="bankGuaranteeAvailable"
                  value={o}
                  checked={guarantee === (o === "yes")}
                  onChange={() => setGuarantee(o === "yes")}
                  className="accent-primary"
                />
                {t(`common.${o}`)}
              </label>
            ))}
          </div>
        </FormField>
        {guarantee && (
          <>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("profile.fields.guaranteeTypes")}</legend>
              <div className="flex gap-4 text-sm">
                {GUARANTEE_TYPES.map((g) => (
                  <label key={g} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="bankGuaranteeTypes"
                      value={g}
                      defaultChecked={initial.bankGuaranteeTypes.includes(g)}
                      className="size-4 accent-primary"
                    />
                    {t(`guaranteeTypes.${g}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <FormField id="bankGuaranteeMax" label={t("profile.fields.guaranteeMax")} error={err("bankGuaranteeMax")}>
                <Input id="bankGuaranteeMax" name="bankGuaranteeMax" inputMode="decimal" defaultValue={initial.bankGuaranteeMax} />
              </FormField>
              <FormField id="bankGuaranteeCurrency" label={t("profile.fields.currency")} error={err("bankGuaranteeCurrency")}>
                <select id="bankGuaranteeCurrency" name="bankGuaranteeCurrency" defaultValue={initial.bankGuaranteeCurrency || "AZN"} className={SELECT_CLASS}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="save-profile">
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/** REG-06 AC3: add a brand with "Official dealer" and an optional dealer letter. */
export function BrandForm({ action }: { action: Action }) {
  const { t, state, formAction, pending, err, banner } = useForm(action);
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="brand-form">
      {banner}
      <div key={state.attempt ?? 0} className="grid grid-cols-[2fr_1fr_2fr_auto] items-start gap-4">
        <FormField id="brand" label={t("profile.fields.brand")} required error={err("brand")}>
          <Input id="brand" name="brand" />
        </FormField>
        <FormField id="isOfficialDealer" label={t("profile.fields.officialDealer")}>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input id="isOfficialDealer" type="checkbox" name="isOfficialDealer" className="size-4 accent-primary" />
            {t("common.yes")}
          </label>
        </FormField>
        <FileField id="dealerLetter" name="dealerLetter" label={t("profile.fields.dealerLetter")} error={err("dealerLetter")} />
        <Button type="submit" variant="outline" disabled={pending} className="mt-6" data-testid="add-brand">
          {t("profile.addBrand")}
        </Button>
      </div>
    </form>
  );
}

/** REG-06 AC4: add a certificate (type, number, issuer, issue date, optional expiry, file). */
export function CertificateForm({ action }: { action: Action }) {
  const { t, state, formAction, pending, err, banner } = useForm(action);
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="certificate-form">
      {banner}
      <div key={state.attempt ?? 0} className="grid grid-cols-3 gap-x-6 gap-y-5">
        <FormField id="type" label={t("profile.fields.certificateType")} required error={err("type")}>
          <select id="type" name="type" defaultValue="" className={SELECT_CLASS}>
            <option value="">{t("common.select")}</option>
            {CERTIFICATE_TYPES.map((c) => (
              <option key={c} value={c}>
                {t(`certificateTypes.${c}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="number" label={t("profile.fields.number")}>
          <Input id="number" name="number" />
        </FormField>
        <FormField id="issuer" label={t("profile.fields.issuer")}>
          <Input id="issuer" name="issuer" />
        </FormField>
        <FormField id="issuedOn" label={t("profile.fields.issuedOn")} required error={err("issuedOn")}>
          <Input id="issuedOn" name="issuedOn" type="date" />
        </FormField>
        <FormField id="expiresOn" label={t("profile.fields.expiresOn")} hint={t("profile.hints.expiresOn")} error={err("expiresOn")}>
          <Input id="expiresOn" name="expiresOn" type="date" />
        </FormField>
        <FileField id="file" name="file" label={t("profile.fields.certificateFile")} required error={err("file")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={pending} data-testid="add-certificate">
          {t("profile.addCertificate")}
        </Button>
      </div>
    </form>
  );
}

/** Renewal of an EXPIRING or EXPIRED certificate: later expiry date and the new file. */
export function RenewForm({ action }: { action: Action }) {
  const { t, state, formAction, pending, err } = useForm(action);
  return (
    <form action={formAction} key={state.attempt ?? 0} className="flex items-start gap-3" data-testid="renew-form">
      <FormField id="renew-expires" label={t("profile.fields.newExpiry")} required error={err("expiresOn")}>
        <Input id="renew-expires" name="expiresOn" type="date" />
      </FormField>
      <FileField id="renew-file" name="file" label={t("profile.fields.certificateFile")} required error={err("file")} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="mt-6">
        {t("profile.renew")}
      </Button>
      {state.errors.form && <p className="mt-7 text-xs text-destructive">{t(state.errors.form)}</p>}
    </form>
  );
}
