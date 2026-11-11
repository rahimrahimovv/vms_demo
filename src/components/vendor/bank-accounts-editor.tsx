"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { ACCOUNT_CURRENCIES } from "@/lib/vendors/constants";
import type { BankAccount } from "@/lib/vendors/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const EMPTY: BankAccount = { bankName: "", iban: "", swift: "", currency: "AZN", isMain: false };

/**
 * REG-01 AC4, REG-06 AC3: one or more bank accounts, exactly one main. The list is sent as JSON in
 * the hidden field "bankAccounts"; the server and the database check it again.
 */
export function BankAccountsEditor({
  initial,
  readOnly = false,
  error,
}: {
  initial: BankAccount[];
  readOnly?: boolean;
  error?: string;
}) {
  const t = useTranslations();
  const [accounts, setAccounts] = useState<BankAccount[]>(
    initial.length > 0 ? initial : [{ ...EMPTY, isMain: true }],
  );
  const update = (i: number, patch: Partial<BankAccount>) =>
    setAccounts((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setMain = (i: number) => setAccounts((list) => list.map((a, j) => ({ ...a, isMain: j === i })));
  const remove = (i: number) =>
    setAccounts((list) => {
      const rest = list.filter((_, j) => j !== i);
      // The main account was removed: the first remaining one becomes main.
      return rest.some((a) => a.isMain) ? rest : rest.map((a, j) => ({ ...a, isMain: j === 0 }));
    });
  const columns = "grid grid-cols-[2fr_2.5fr_1.2fr_1fr_auto_auto] items-center gap-3";

  return (
    <div className="flex flex-col gap-3" data-testid="bank-accounts">
      <input type="hidden" name="bankAccounts" value={JSON.stringify(accounts)} />
      <div className={`${columns} text-xs font-medium text-muted-foreground`}>
        <span>
          {t("bankAccounts.bankName")} <span className="text-destructive">*</span>
        </span>
        <span>
          {t("bankAccounts.iban")} <span className="text-destructive">*</span>
        </span>
        <span>
          {t("bankAccounts.swift")} <span className="text-destructive">*</span>
        </span>
        <span>
          {t("bankAccounts.currency")} <span className="text-destructive">*</span>
        </span>
        <span>{t("bankAccounts.main")}</span>
        <span className="w-9" />
      </div>
      {accounts.map((a, i) => (
        <div key={i} className={columns} data-testid="bank-account-row">
          <Input
            aria-label={t("bankAccounts.bankName")}
            value={a.bankName}
            readOnly={readOnly}
            onChange={(e) => update(i, { bankName: e.target.value })}
          />
          <Input
            aria-label={t("bankAccounts.iban")}
            value={a.iban}
            maxLength={42}
            readOnly={readOnly}
            onChange={(e) => update(i, { iban: e.target.value })}
          />
          <Input
            aria-label={t("bankAccounts.swift")}
            value={a.swift}
            readOnly={readOnly}
            onChange={(e) => update(i, { swift: e.target.value })}
          />
          <select
            aria-label={t("bankAccounts.currency")}
            className={SELECT_CLASS}
            value={a.currency}
            disabled={readOnly}
            onChange={(e) => update(i, { currency: e.target.value })}
          >
            {ACCOUNT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center justify-center">
            <input
              type="radio"
              name="bankAccountMain"
              aria-label={t("bankAccounts.main")}
              checked={a.isMain}
              disabled={readOnly}
              onChange={() => setMain(i)}
              className="accent-primary"
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("bankAccounts.remove")}
            disabled={readOnly || accounts.length === 1}
            onClick={() => remove(i)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("bankAccounts.hint")}</p>
      {error && (
        <p id="bankAccounts-error" role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {!readOnly && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAccounts((list) => [...list, { ...EMPTY }])}>
            <Plus className="size-4" aria-hidden />
            {t("bankAccounts.add")}
          </Button>
        </div>
      )}
    </div>
  );
}
