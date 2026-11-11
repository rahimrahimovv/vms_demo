"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { cn } from "@/lib/utils";

/** Result of a master-data save: errors by field ("form" for the whole form), or saved. */
export type EntryState = { errors: Record<string, string>; saved?: boolean; attempt?: number };

export type EntryField = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  readOnly?: boolean;
  step?: string;
  /** Spans both columns of the form */
  wide?: boolean;
};

export const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/**
 * Add or edit one master-data entry (MDM-01, MDM-02, PLN-01) in a dialog: two-column form,
 * required fields marked, the backlog's message under the field. Closes once the server saves.
 */
export function EntryDialog({
  title,
  trigger,
  triggerVariant = "default",
  triggerSize = "default",
  testId,
  fields,
  values = {},
  action,
}: {
  title: string;
  trigger: ReactNode;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "default" | "sm";
  testId: string;
  fields: EntryField[];
  values?: Record<string, string | boolean | null | undefined>;
  action: (prev: EntryState, formData: FormData) => Promise<EntryState>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  // Closes by itself once the server answers with "saved" (the attempt changes).
  const open = openedAt !== null && (openedAt === (state.attempt ?? 0) || !state.saved);
  // only errors of an answer that came after this dialog was opened
  const fresh = open && openedAt !== (state.attempt ?? 0);
  const err = (name: string) => (fresh && state.errors[name] ? t(state.errors[name]) : undefined);
  // Submitting through onSubmit (not the action prop) keeps what the Admin typed when the server
  // refuses the entry; React resets an action form after every submission.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpenedAt(state.attempt ?? 0)}
        data-testid={testId}
      >
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpenedAt(null)}>
        <DialogContent className="sm:max-w-2xl">
          {open && (
            <form onSubmit={submit} className="flex flex-col gap-5" data-testid="entry-form">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription className="sr-only">{title}</DialogDescription>
              </DialogHeader>
              {fresh && state.errors.form && (
                <Alert variant="destructive" data-testid="form-error">
                  <AlertDescription>{t(state.errors.form)}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {fields.map((f) => {
                  const id = `entry-${f.name}`;
                  const value = values[f.name];
                  if (f.type === "checkbox") {
                    return (
                      <label key={f.name} className={cn("flex items-center gap-2 text-sm", f.wide && "col-span-2")}>
                        <input
                          id={id}
                          type="checkbox"
                          name={f.name}
                          value="yes"
                          defaultChecked={value === undefined ? true : Boolean(value)}
                          className="size-4 accent-primary"
                        />
                        {f.label}
                        {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
                      </label>
                    );
                  }
                  return (
                    <FormField
                      key={f.name}
                      id={id}
                      label={f.label}
                      required={f.required}
                      hint={f.hint}
                      error={err(f.name)}
                      className={cn((f.wide || f.type === "textarea") && "col-span-2")}
                    >
                      {f.type === "select" ? (
                        <select
                          id={id}
                          name={f.name}
                          defaultValue={String(value ?? "")}
                          disabled={f.readOnly}
                          className={SELECT_CLASS}
                          aria-invalid={Boolean(err(f.name))}
                        >
                          <option value="">{t("common.select")}</option>
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "textarea" ? (
                        <Textarea id={id} name={f.name} defaultValue={String(value ?? "")} rows={3} />
                      ) : (
                        <Input
                          id={id}
                          name={f.name}
                          type={f.type === "number" ? "number" : "text"}
                          step={f.step}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          defaultValue={String(value ?? "")}
                          readOnly={f.readOnly}
                          aria-invalid={Boolean(err(f.name))}
                        />
                      )}
                      {/* a disabled select is not sent: keep its value */}
                      {f.type === "select" && f.readOnly && <input type="hidden" name={f.name} value={String(value ?? "")} />}
                    </FormField>
                  );
                })}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenedAt(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending} data-testid="entry-save">
                  {pending ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
