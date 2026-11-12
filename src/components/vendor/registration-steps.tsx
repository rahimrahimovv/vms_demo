"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileText, Plus, Trash2 } from "lucide-react";
import { OWNER_ROLES, type VendorType } from "@/lib/vendors/constants";
import {
  isStorableAccount,
  parseBankAccounts,
  parseOwners,
  sharesExceed100,
  type BankAccount,
  type CompanyValues,
  type ContactValues,
  type Owner,
} from "@/lib/vendors/validate";
import type { StepKey, StepStatus } from "@/lib/vendors/steps";
import type { ContactRow } from "@/lib/vendors/queries";
import {
  continueContacts,
  deleteContact,
  saveBank,
  saveCompany,
  saveContact,
  saveDocuments,
  saveOwners,
  submitRegistration,
  type StepState,
} from "@/app/(app)/vendor/registration/actions";
import { FormField } from "@/components/form-field";
import { FileField, StagedFileInput } from "@/components/file-field";
import { BankAccountsEditor } from "@/components/vendor/bank-accounts-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

type Files = Record<string, { id: string; file_name: string }[]>;

function FormAlert({ state }: { state: StepState }) {
  const t = useTranslations();
  if (!state.errors.form) return null;
  return (
    <Alert variant="destructive" data-testid="form-error">
      <AlertDescription>{t(state.errors.form)}</AlertDescription>
    </Alert>
  );
}

/** REG-07 AC8: Save and continue / Back. Back also saves, so nothing is lost. */
/** True when rows of the step cannot be stored (owners, bank accounts): the vendor confirms before leaving the step. */
type RowCheck = (form: HTMLFormElement) => boolean;

const ownersNotStorable: RowCheck = (form) => {
  const owners = parseOwners(new FormData(form).get("owners"));
  return (
    owners.some((o) => !o.fullName || !o.idNumber || (o.sharePercent !== "" && !(Number(o.sharePercent) > 0 && Number(o.sharePercent) <= 100))) ||
    sharesExceed100(owners)
  );
};
const banksNotStorable: RowCheck = (form) =>
  parseBankAccounts(new FormData(form).get("bankAccounts")).some((a) => !isStorableAccount(a));

function StepFooter({ pending, readOnly, rowCheck }: { pending: boolean; readOnly: boolean; rowCheck?: RowCheck }) {
  const t = useTranslations("registration");
  if (readOnly) return null;
  const confirmRows = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (rowCheck && form && rowCheck(form) && !window.confirm(t("incompleteRowsConfirm"))) e.preventDefault();
  };
  return (
    <div className="flex justify-between">
      <Button type="submit" name="intent" value="back" variant="outline" disabled={pending} onClick={confirmRows} data-testid="step-back">
        {t("back")}
      </Button>
      <Button type="submit" name="intent" value="continue" disabled={pending} onClick={confirmRows} data-testid="step-continue">
        {t("saveContinue")}
      </Button>
    </div>
  );
}

// ---- Company details ----

export function CompanyStep({ vendorType, initial, readOnly, initialErrors }: { vendorType: VendorType; initial: CompanyValues; readOnly: boolean; initialErrors?: Record<string, string> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(saveCompany, { errors: initialErrors ?? {}, company: initial } as StepState);
  const v = state.company ?? initial;
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const local = vendorType === "LOCAL_COMPANY";
  const individual = vendorType === "INDIVIDUAL";

  const text = (name: keyof CompanyValues, label: string, opts: { required?: boolean; type?: string; hint?: string } = {}) => (
    <FormField id={name} label={label} required={opts.required} error={err(name)} hint={opts.hint}>
      <Input id={name} name={name} type={opts.type ?? "text"} defaultValue={v[name]} readOnly={readOnly} aria-invalid={Boolean(state.errors[name])} />
    </FormField>
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="step-company">
      <FormAlert state={state} />
      <Card>
        <CardContent key={state.attempt ?? 0} className="grid grid-cols-2 gap-x-6 gap-y-5">
          {individual ? (
            text("voen", t("registration.fields.voen"), { hint: t("registration.hints.voen") })
          ) : (
            <>
              {text("legalAddress", t("registration.fields.legalAddress"), { required: true })}
              {local && text("directorName", t("registration.fields.directorName"), { required: true })}
              {text("foundedOn", t("registration.fields.foundedOn"), { required: true, type: "date" })}
              {local && (
                <FormField id="isVatPayer" label={t("registration.fields.vatPayer")} required error={err("isVatPayer")}>
                  <div className="flex h-9 items-center gap-5 text-sm">
                    {(["yes", "no"] as const).map((option) => (
                      <label key={option} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="isVatPayer"
                          value={option}
                          defaultChecked={v.isVatPayer === option}
                          disabled={readOnly}
                          className="accent-primary"
                        />
                        {t(`common.${option}`)}
                      </label>
                    ))}
                  </div>
                </FormField>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <StepFooter pending={pending} readOnly={readOnly} />
    </form>
  );
}

// ---- Owners ----

export function OwnersStep({ vendorType, initial, readOnly, initialErrors }: { vendorType: VendorType; initial: Owner[]; readOnly: boolean; initialErrors?: Record<string, string> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(saveOwners, { errors: initialErrors ?? {}, owners: initial } as StepState);
  const [owners, setOwners] = useState<Owner[]>(
    (state.owners ?? initial).length > 0 ? (state.owners ?? initial) : [{ fullName: "", idNumber: "", sharePercent: "", role: "HEAD" }],
  );
  const update = (i: number, patch: Partial<Owner>) => setOwners((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const grid = "grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-3";

  if (vendorType === "INDIVIDUAL") {
    return (
      <form action={formAction} className="flex flex-col gap-6" data-testid="step-owners">
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("registration.stepStatus.NOT_NEEDED")}</CardContent>
        </Card>
        <StepFooter pending={pending} readOnly={readOnly} />
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="step-owners">
      <FormAlert state={state} />
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">{t("registration.hints.owners")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input type="hidden" name="owners" value={JSON.stringify(owners)} />
          <div className={`${grid} text-xs font-medium text-muted-foreground`}>
            <span>{t("owners.fullName")}</span>
            <span>{t("owners.idNumber")}</span>
            <span>{t("owners.share")}</span>
            <span>{t("owners.role")}</span>
            <span className="w-9" />
          </div>
          {owners.map((o, i) => (
            <div key={i} className={grid} data-testid="owner-row">
              <Input aria-label={t("owners.fullName")} value={o.fullName} readOnly={readOnly} onChange={(e) => update(i, { fullName: e.target.value })} />
              <Input aria-label={t("owners.idNumber")} value={o.idNumber} readOnly={readOnly} onChange={(e) => update(i, { idNumber: e.target.value })} />
              <Input aria-label={t("owners.share")} inputMode="decimal" value={o.sharePercent} readOnly={readOnly} onChange={(e) => update(i, { sharePercent: e.target.value })} />
              <select aria-label={t("owners.role")} className={SELECT_CLASS} value={o.role} disabled={readOnly} onChange={(e) => update(i, { role: e.target.value as Owner["role"] })}>
                {OWNER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`ownerRoles.${r}`)}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label={t("owners.remove")} disabled={readOnly || owners.length === 1} onClick={() => setOwners((list) => list.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {state.errors.owners && (
            <p role="alert" className="text-xs font-medium text-destructive" data-testid="owners-error">
              {t(state.errors.owners)}
            </p>
          )}
          {!readOnly && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOwners((list) => [...list, { fullName: "", idNumber: "", sharePercent: "", role: "SHAREHOLDER" }])}>
                <Plus className="size-4" aria-hidden />
                {t("owners.add")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <StepFooter pending={pending} readOnly={readOnly} rowCheck={ownersNotStorable} />
    </form>
  );
}

// ---- Bank accounts ----

export function BankStep({ initial, currencies, readOnly, initialErrors }: { initial: BankAccount[]; currencies: string[]; readOnly: boolean; initialErrors?: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveBank, { errors: initialErrors ?? {}, bankAccounts: initial } as StepState);
  const t = useTranslations();
  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="step-bank">
      <FormAlert state={state} />
      <Card>
        <CardContent>
          <BankAccountsEditor
            initial={state.bankAccounts ?? initial}
            currencies={currencies}
            readOnly={readOnly}
            error={state.errors.bankAccounts ? t(state.errors.bankAccounts) : undefined}
          />
        </CardContent>
      </Card>
      <StepFooter pending={pending} readOnly={readOnly} rowCheck={banksNotStorable} />
    </form>
  );
}

// ---- Documents ----

export function DocumentsStep({ kinds, files, readOnly, initialErrors }: { kinds: string[]; files: Files; readOnly: boolean; initialErrors?: Record<string, string> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(saveDocuments, { errors: initialErrors ?? {} } as StepState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="step-documents">
      <FormAlert state={state} />
      <Card>
        <CardContent key={state.attempt ?? 0} className="grid grid-cols-2 gap-x-6 gap-y-5">
          {kinds.map((kind) => (
            <FileField
              key={kind}
              id={`file_${kind}`}
              name={`file_${kind}`}
              label={t(`files.kinds.${kind}`)}
              required
              error={state.errors[`file_${kind}`] ? t(state.errors[`file_${kind}`]) : undefined}
              current={files[kind]}
              disabled={readOnly}
            />
          ))}
        </CardContent>
      </Card>
      <StepFooter pending={pending} readOnly={readOnly} />
    </form>
  );
}

// ---- Contact persons ----

const EMPTY_CONTACT: ContactValues = { fullName: "", position: "", phone: "", email: "", isLegal: false };

/** One contact person: its own form and Save button, so a saved person never loses its proof file. */
export function ContactForm({
  contact,
  vendorType,
  readOnly,
  onDone,
}: {
  contact: ContactRow | null;
  vendorType: VendorType;
  readOnly: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const initial: ContactValues = contact
    ? { fullName: contact.full_name, position: contact.position ?? "", phone: contact.phone, email: contact.email, isLegal: contact.is_legal_representative }
    : EMPTY_CONTACT;
  const [state, formAction, pending] = useActionState(
    async (prev: StepState, formData: FormData) => {
      const result = await saveContact(prev, formData);
      if (result.saved && !Object.keys(result.errors).length) onDone?.();
      return result;
    },
    { errors: {}, contact: initial } as StepState,
  );
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const v = state.contact ?? initial;
  const [legal, setLegal] = useState(v.isLegal);
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const individual = vendorType === "INDIVIDUAL";

  const text = (name: "fullName" | "position" | "phone" | "email", label: string, required = true) => (
    <FormField id={`${contact?.id ?? "new"}-${name}`} label={label} required={required} error={err(name)}>
      <Input id={`${contact?.id ?? "new"}-${name}`} name={name} defaultValue={v[name]} readOnly={readOnly} aria-invalid={Boolean(state.errors[name])} />
    </FormField>
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4 rounded-lg border p-4" data-testid="contact-form">
      <input type="hidden" name="contactId" value={contact?.id ?? ""} />
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {text("fullName", t("owners.fullName"))}
        {text("position", t("registration.contacts.position"), false)}
        {text("phone", t("registration.fields.phone"))}
        {text("email", t("registration.fields.contactEmail"))}
      </div>
      {!individual && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="isLegal" defaultChecked={v.isLegal} disabled={readOnly} onChange={(e) => setLegal(e.target.checked)} className="accent-primary" />
            {t("registration.contacts.legalRepresentative")}
          </label>
          {legal && (
            <FormField id={`${contact?.id ?? "new"}-proof`} label={t("registration.contacts.proof")} required error={err("proof")} hint={t("files.hint")}>
              {!readOnly && <StagedFileInput id={`${contact?.id ?? "new"}-proof`} name="file_proof" invalid={Boolean(state.errors.proof)} />}
              {contact && contact.proof.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {contact.proof.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5 text-xs" data-testid="proof-file">
                      <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                      <a href={`/api/files/${f.id}`} className="text-primary hover:underline">
                        {f.file_name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          )}
        </div>
      )}
      {removeError && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t(removeError)}
        </p>
      )}
      {!readOnly && (
        <div className="flex justify-end gap-2">
          {contact && !contact.is_primary && (
            <Button
              type="button"
              variant="outline"
              disabled={removing}
              onClick={() =>
                startRemoving(async () => {
                  const result = await deleteContact(contact.id);
                  setRemoveError(result.error);
                })
              }
              data-testid="contact-remove"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("registration.contacts.remove")}
            </Button>
          )}
          <Button type="submit" disabled={pending} data-testid="contact-save">
            {t("registration.contacts.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

/** The list of contact persons, with "Add contact person". Used by the step and by the Profile page. */
export function ContactList({ contacts, vendorType, readOnly }: { contacts: ContactRow[]; vendorType: VendorType; readOnly: boolean }) {
  const t = useTranslations();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4" data-testid="contact-list">
      {contacts.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          {c.is_primary && <span className="text-xs font-medium text-muted-foreground">{t("registration.contacts.primary")}</span>}
          <ContactForm contact={c} vendorType={vendorType} readOnly={readOnly} />
        </div>
      ))}
      {adding && <ContactForm contact={null} vendorType={vendorType} readOnly={false} onDone={() => setAdding(false)} />}
      {!readOnly && !adding && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="contact-add">
            <Plus className="size-4" aria-hidden />
            {t("registration.contacts.add")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ContactsStep({ contacts, vendorType, readOnly }: { contacts: ContactRow[]; vendorType: VendorType; readOnly: boolean }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(continueContacts, { errors: {} } as StepState);
  return (
    <div className="flex flex-col gap-6" data-testid="step-contacts">
      {vendorType !== "INDIVIDUAL" && <p className="text-sm text-muted-foreground">{t("registration.contacts.hint")}</p>}
      <ContactList contacts={contacts} vendorType={vendorType} readOnly={readOnly} />
      <form action={formAction} className="flex flex-col gap-4">
        <FormAlert state={state} />
        {state.errors.contacts && (
          <p role="alert" className="text-sm font-medium text-destructive" data-testid="contacts-error">
            {t(state.errors.contacts)}
          </p>
        )}
        <StepFooter pending={pending} readOnly={readOnly} />
      </form>
    </div>
  );
}

// ---- Review and submit ----

export function ReviewStep({
  statuses,
  incomplete,
  readOnly,
}: {
  statuses: Record<StepKey, StepStatus>;
  incomplete: StepKey[];
  readOnly: boolean;
}) {
  const t = useTranslations("registration");
  const [state, formAction, pending] = useActionState(submitRegistration, { errors: {} } as StepState);
  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="step-review">
      <FormAlert state={state} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("steps.review")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {incomplete.length > 0 ? (
            <>
              <p className="font-medium">{t("submitDisabled")}</p>
              <ul className="flex flex-col gap-1" data-testid="incomplete-steps">
                {incomplete.map((k) => (
                  <li key={k}>
                    <Link href={`/vendor/registration/${k}`} className="text-primary hover:underline">
                      {t(`steps.${k}`)}
                    </Link>{" "}
                    <span className="text-muted-foreground">({t(`stepStatus.${statuses[k]}`)})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">{t("steps.review")}</p>
          )}
        </CardContent>
      </Card>
      {!readOnly && (
        <div className="flex justify-between">
          <Button asChild variant="outline">
            <Link href="/vendor/registration/documents">{t("back")}</Link>
          </Button>
          <Button type="submit" disabled={pending || incomplete.length > 0} data-testid="submit-registration">
            {t("submit")}
          </Button>
        </div>
      )}
    </form>
  );
}
