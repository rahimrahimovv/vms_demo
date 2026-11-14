import Link from "next/link";
import { useTranslations } from "next-intl";
import { SECTION_SLUGS, type ChangeSection } from "@/lib/vendors/change-requests";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export type OpenRequest = { id: string; section: string; status: string };

/**
 * REG-08 AC1-AC3: the control of one section of the Profile of an APPROVED vendor. With no open request it is the
 * "Request a change" button; with one, the request status ("Change pending approval") and a link to it. The data
 * shown next to it stays in force until a Procurement Specialist approves.
 */
export function RequestChangeControl({ section, open }: { section: ChangeSection; open?: OpenRequest }) {
  const t = useTranslations("changeRequest");
  if (open) {
    return (
      <div className="flex items-center gap-3" data-testid={`request-state-${section}`}>
        <StatusBadge status={open.status} />
        <span className="text-sm text-muted-foreground">{open.status === "RETURNED" ? t("returnedNote") : t("pending")}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/vendor/profile/requests/${open.id}`}>{t("openRequest")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/vendor/profile/change/${SECTION_SLUGS[section]}`} data-testid={`request-change-${section}`}>
        {t("requestButton")}
      </Link>
    </Button>
  );
}
