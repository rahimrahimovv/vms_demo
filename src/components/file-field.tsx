"use client";

import { useTranslations } from "next-intl";
import { ACCEPT_ATTRIBUTE } from "@/lib/files/rules";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { FileText } from "lucide-react";

/** File input with its current file(s) shown below; the server re-checks type and size. */
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
      {!disabled && (
        <Input id={id} name={name} type="file" accept={ACCEPT_ATTRIBUTE} aria-invalid={Boolean(error)} />
      )}
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
