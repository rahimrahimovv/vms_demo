"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ACCEPT_ATTRIBUTE, checkFile } from "@/lib/files/rules";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { FileText } from "lucide-react";

const BUCKET = "files";

/**
 * File input that sends the file straight to Storage with a signed upload URL as soon as it is picked.
 * The form carries only a small token (hidden input `name`); the server action then checks type, size and
 * first bytes and keeps the file. While an upload runs, the form cannot be submitted.
 */
export function StagedFileInput({
  id,
  name,
  label,
  invalid,
}: {
  id: string;
  name: string;
  label?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("files");
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "failed">("idle");
  const input = useRef<HTMLInputElement>(null);

  // No submit while the upload runs (the token would still be empty).
  useEffect(() => {
    const form = input.current?.form;
    if (!form || state !== "uploading") return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    form.addEventListener("submit", stop, true);
    return () => form.removeEventListener("submit", stop, true);
  }, [state]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setToken("");
    if (!file) return setState("idle");

    // quick check before uploading; the server checks again (first bytes included)
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!checkFile(file.name, file.size, head).ok) return fail(event.target);

    setState("uploading");
    const prepared = await fetch("/api/files/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!prepared) return fail(event.target);

    const { error } = await createClient()
      .storage.from(BUCKET)
      .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType });
    if (error) return fail(event.target);

    setToken(JSON.stringify({ path: prepared.path, name: file.name }));
    setState("idle");
  }

  function fail(target: HTMLInputElement) {
    target.value = "";
    setState("failed");
  }

  return (
    <>
      {/* no name on the file input: only the token is submitted */}
      <Input
        id={id}
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        aria-label={label}
        aria-invalid={invalid || state === "failed"}
        onChange={onPick}
        data-upload-state={state}
      />
      <input type="hidden" name={name} value={token} data-uploading={state === "uploading" ? "true" : undefined} />
      {state === "uploading" && <p className="text-xs text-muted-foreground">{t("uploading")}</p>}
      {state === "failed" && <p className="text-xs text-destructive">{t("uploadFailed")}</p>}
    </>
  );
}

/** Form field with a staged file input and its current file(s) shown below. */
export function FileField({
  id,
  name,
  label,
  required,
  error,
  current,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  current?: { id: string; file_name: string }[];
  disabled?: boolean;
}) {
  const t = useTranslations("files");
  return (
    <FormField id={id} label={label} required={required} error={error} hint={t("hint")}>
      {!disabled && <StagedFileInput id={id} name={name} invalid={Boolean(error)} />}
      {current && current.length > 0 && (
        <ul className="flex flex-col gap-1">
          {current.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs">
              <FileText className="size-3.5 text-muted-foreground" aria-hidden />
              <a href={`/api/files/${f.id}`} className="text-primary hover:underline">
                {f.file_name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </FormField>
  );
}
