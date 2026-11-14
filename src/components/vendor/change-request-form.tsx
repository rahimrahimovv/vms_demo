"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeState } from "@/app/(app)/vendor/profile/change-actions";
import { OWNER_ROLES, type VendorType } from "@/lib/vendors/constants";
import type { BankAccount, Owner } from "@/lib/vendors/validate";
import { COMPANY_FIELDS, COMPANY_FIELD_LABELS, type ChangeSection } from "@/lib/vendors/change-requests";
import { FormField } from "@/components/form-field";
import { FileField } from "@/components/file-field";
import { BankAccountsEditor } from "@/components/vendor/bank-accounts-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SELECT_CLASS = "h-9 w-full rounded-[14px] border border-input bg-(--field-bg) px-3 text-sm outline-none";

export type ChangeFormInitial = {
  company: Record<string, string>;
  owners: Owner[];
  accounts: BankAccount[];
};

/**
 * REG-08 AC1: the form of a change request. It starts from the data in force (or from the returned proposal), asks
 * for a reason and, where the section needs one, a supporting file. Documents: pick a file for each document to replace.
 * Everything is checked again by the server and the database, and nothing changes until a Procurement Specialist approves.
 */
export function ChangeRequestForm({
  section,
  vendorType,
  initial,
  initialReason,
  currencies,
  documentKinds,
  action,
  resubmit = false,
  hasSupportFile = false,
}: {
  section: ChangeSection;
  vendorType: VendorType;
  initial: ChangeFormInitial;
  initialReason: string;
  currencies: string[];
  documentKinds: string[];
  action: (prev: ChangeState, formData: FormData) => Promise<ChangeState>;
  resubmit?: boolean;
  hasSupportFile?: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} } as ChangeState);
  const err = (key: string) => (state.errors[key] ? t(state.errors[key]) : undefined);
  const [owners, setOwners] = useState<Owner[]>(
    initial.owners.length > 0 ? initial.owners : [{ fullName: "", idNumber: "", sharePercent: "", role: "HEAD" }],
  );
  const updateOwner = (i: number, patch: Partial<Owner>) => setOwners((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const grid = "grid grid-cols-[2fr_2fr_1fr_1.5fr_auto] gap-3";
  const supportRequired = section === "OWNERS" || section === "BANK_ACCOUNTS";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="change-form">
      {state.errors.form && (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{t(state.errors.form)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent key={state.attempt ?? 0} className="flex flex-col gap-5">
          {section === "COMPANY_DETAILS" && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {COMPANY_FIELDS[vendorType].map((key) =>
                key === "is_vat_payer" ? (
                  <FormField key={key} id={key} label={t(`registration.fields.${COMPANY_FIELD_LABELS[key]}`)} required error={err(key)}>
                    <div className="flex h-9 items-center gap-5 text-sm">
                      {(["yes", "no"] as const).map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input type="radio" name={key} value={option} defaultChecked={initial.company[key] === option} className="accent-primary" />
                          {t(`common.${option}`)}
                        </label>
                      ))}
                    </div>
                  </FormField>
                ) : (
                  <FormField
                    key={key}
                    id={key}
                    label={t(`registration.fields.${COMPANY_FIELD_LABELS[key]}`)}
                    required={!(vendorType === "INDIVIDUAL" && key === "voen")}
                    error={err(key)}
                  >
                    <Input
                      id={key}
                      name={key}
                      type={key === "founded_on" ? "date" : "text"}
                      defaultValue={initial.company[key] ?? ""}
                      aria-invalid={Boolean(state.errors[key])}
                    />
                  </FormField>
                ),
              )}
            </div>
          )}

          {section === "OWNERS" && (
            <div className="flex flex-col gap-3">
              <input type="hidden" name="owners" value={JSON.stringify(owners)} />
              <p className="text-sm text-muted-foreground">{t("registration.hints.owners")}</p>
              <div className={`${grid} text-xs font-medium text-muted-foreground`}>
                <span>{t("owners.fullName")}</span>
                <span>{t("owners.idNumber")}</span>
                <span>{t("owners.share")}</span>
                <span>{t("owners.role")}</span>
                <span className="w-9" />
              </div>
              {owners.map((o, i) => (
                <div key={i} className={grid} data-testid="owner-row">
                  <Input aria-label={t("owners.fullName")} value={o.fullName} onChange={(e) => updateOwner(i, { fullName: e.target.value })} />
                  <Input aria-label={t("owners.idNumber")} value={o.idNumber} onChange={(e) => updateOwner(i, { idNumber: e.target.value })} />
                  <Input aria-label={t("owners.share")} inputMode="decimal" value={o.sharePercent} onChange={(e) => updateOwner(i, { sharePercent: e.target.value })} />
                  <select aria-label={t("owners.role")} className={SELECT_CLASS} value={o.role} onChange={(e) => updateOwner(i, { role: e.target.value as Owner["role"] })}>
                    {OWNER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`ownerRoles.${r}`)}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("owners.remove")} disabled={owners.length === 1} onClick={() => setOwners((list) => list.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {state.errors.owners && (
                <p role="alert" className="text-xs font-medium text-destructive" data-testid="owners-error">
                  {t(state.errors.owners)}
                </p>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setOwners((list) => [...list, { fullName: "", idNumber: "", sharePercent: "", role: "SHAREHOLDER" }])}>
                  <Plus className="size-4" aria-hidden />
                  {t("owners.add")}
                </Button>
              </div>
            </div>
          )}

          {section === "BANK_ACCOUNTS" && (
            <BankAccountsEditor initial={initial.accounts} currencies={currencies} error={err("bankAccounts")} />
          )}

          {section === "DOCUMENTS" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("changeRequest.documentsHint")}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                {documentKinds.map((kind) => (
                  <FileField key={kind} id={`file_${kind}`} name={`file_${kind}`} label={t(`files.kinds.${kind}`)} error={err(`file_${kind}`)} />
                ))}
              </div>
              {state.errors.documents && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {t(state.errors.documents)}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <FormField id="reason" label={t("changeRequest.reason")} required error={err("reason")}>
              <Textarea id="reason" name="reason" rows={3} defaultValue={initialReason} aria-invalid={Boolean(state.errors.reason)} />
            </FormField>
            {section !== "DOCUMENTS" && (
              <FileField
                id="support"
                name="support"
                label={t("changeRequest.support")}
                required={supportRequired && !hasSupportFile}
                error={err("support")}
              />
            )}
          </div>
          {section === "COMPANY_DETAILS" && <p className="text-xs text-muted-foreground">{t("changeRequest.supportHintCompany")}</p>}
          {hasSupportFile && <p className="text-xs text-muted-foreground">{t("changeRequest.supportKept")}</p>}
        </CardContent>
      </Card>

      {/* NFR-006: disabled while the request runs, so a second click sends nothing. */}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="change-submit">
          {pending ? t("common.saving") : t(resubmit ? "changeRequest.resubmit" : "changeRequest.submit")}
        </Button>
      </div>
    </form>
  );
}
