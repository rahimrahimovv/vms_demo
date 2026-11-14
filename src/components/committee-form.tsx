"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { isValidCommitteeSize } from "@/lib/committee/rules";
import type { CommitteeFormState } from "@/app/(app)/admin/committee/actions";

export type Candidate = { id: string; fullName: string; email: string };

/**
 * CMT-01: pick the members from the Committee Member users, mark exactly one as Chair and set the voting
 * period in business days. The count is shown live; the server checks again (committee_save).
 */
export function CommitteeForm({
  action,
  candidates,
  initialMembers,
  initialChair,
  initialDays,
}: {
  action: (prev: CommitteeFormState, formData: FormData) => Promise<CommitteeFormState>;
  candidates: Candidate[];
  initialMembers: string[];
  initialChair: string;
  initialDays: number;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [members, setMembers] = useState<string[]>(initialMembers);
  const [chair, setChair] = useState(initialChair);

  const toggle = (id: string, on: boolean) => {
    setMembers((current) => (on ? [...current, id] : current.filter((m) => m !== id)));
    if (!on && chair === id) setChair("");
  };
  const sizeOk = isValidCommitteeSize(members.length);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6" data-testid="committee-form">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("committee.members")}</p>
        <p className="text-xs text-muted-foreground">{t("committee.membersHint")}</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("committee.noCandidates")}</p>
        ) : (
          <ul className="surface-solid divide-y">
            {candidates.map((c) => {
              const selected = members.includes(c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3" data-testid="committee-candidate">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="member"
                      value={c.id}
                      checked={selected}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    <span className="font-medium">{c.fullName}</span>
                    <span className="text-muted-foreground">{c.email}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="radio"
                      name="chair"
                      value={c.id}
                      checked={chair === c.id}
                      disabled={!selected}
                      onChange={() => setChair(c.id)}
                      className="size-4 accent-primary"
                    />
                    {t("committee.chair")}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className={sizeOk ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive"} data-testid="committee-count">
          {t("committee.selected", { count: members.length })}
        </p>
      </div>

      <FormField id="votingDays" label={t("committee.votingPeriod")} required hint={t("committee.votingPeriodHint")} className="max-w-xs">
        <Input id="votingDays" name="votingDays" type="number" min={1} step={1} defaultValue={initialDays} required />
      </FormField>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive" data-testid="committee-error">
          {t(state.error)}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-(--tone-green-fg)" data-testid="committee-saved">
          {t("committee.saved")}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending} data-testid="committee-save">
          {pending ? t("common.saving") : t("committee.save")}
        </Button>
      </div>
    </form>
  );
}
