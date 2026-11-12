"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Download button for the minutes PDF. It fetches the file so a failure shows "The PDF could not be generated,
 * try again" next to the button instead of leaving the page (CMT-03 AC3; Flow "PDF generation").
 */
export function DownloadPdf({ href, fileName }: { href: string; fileName: string }) {
  const t = useTranslations();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  async function download() {
    setState("busy");
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={download} disabled={state === "busy"} data-testid="download-pdf">
        <Download className="size-4" aria-hidden />
        {state === "busy" ? t("minutes.downloading") : t("minutes.download")}
      </Button>
      {state === "failed" && (
        <p role="alert" className="text-xs font-medium text-destructive" data-testid="pdf-error">
          {t("errors.pdfFailed")}
        </p>
      )}
    </div>
  );
}
