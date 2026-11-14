import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";
import type { VendorType } from "@/lib/vendors/constants";
import { COMPANY_FIELDS, COMPANY_FIELD_LABELS, type ChangeSection } from "@/lib/vendors/change-requests";
import { FileList, type FileItem } from "@/components/file-list";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Values = Record<string, unknown>;
type Owner = { full_name: string; id_number: string; share_percent: number | string | null; role: string };
type Account = { bank_name: string; iban: string; swift: string; currency: string; is_main: boolean };

/**
 * REG-08 AC5: each changed field with the current and the proposed value side by side. Used on the Change requests
 * page of the specialist and on the request page of the vendor. The values come from the request row (the snapshot
 * taken at submit and the proposal), never from the live data.
 */
export async function ChangeDiff({
  section,
  vendorType,
  current,
  proposed,
  currentFiles = [],
  proposedFiles = [],
}: {
  section: ChangeSection;
  vendorType: VendorType;
  current: Values | null;
  proposed: Values;
  /** DOCUMENTS: the files on the vendor now, and the files attached to the request */
  currentFiles?: FileItem[];
  proposedFiles?: FileItem[];
}) {
  const t = await getTranslations();
  const none = t("common.none");
  const before = current ?? {};

  if (section === "COMPANY_DETAILS") {
    const show = (key: string, value: unknown) => {
      if (value === null || value === undefined || value === "") return none;
      if (key === "is_vat_payer") return t(value ? "common.yes" : "common.no");
      if (key === "founded_on") return formatDate(String(value));
      return String(value);
    };
    return (
      <div className="surface-solid overflow-hidden">
        <Table data-testid="change-diff">
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>{t("changeRequest.diff.field")}</TableHead>
              <TableHead>{t("changeRequest.diff.current")}</TableHead>
              <TableHead>{t("changeRequest.diff.proposed")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPANY_FIELDS[vendorType].map((key) => {
              const a = show(key, before[key]);
              const b = show(key, proposed[key]);
              const changed = a !== b;
              return (
                <TableRow key={key} data-testid="diff-row" data-changed={changed ? "true" : "false"}>
                  <TableCell className="font-medium">{t(`registration.fields.${COMPANY_FIELD_LABELS[key]}`)}</TableCell>
                  <TableCell className="text-muted-foreground">{a}</TableCell>
                  <TableCell className={changed ? "font-semibold" : "text-muted-foreground"}>
                    {b}
                    {changed && (
                      <Badge variant="secondary" className="ml-2">
                        {t("changeRequest.diff.changed")}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  const columns = (left: React.ReactNode, right: React.ReactNode) => (
    <div className="grid grid-cols-2 gap-4" data-testid="change-diff">
      <div className="surface-solid flex flex-col gap-2 p-4">
        <h4 className="text-xs font-semibold text-muted-foreground">{t("changeRequest.diff.current")}</h4>
        {left}
      </div>
      <div className="surface-solid flex flex-col gap-2 p-4">
        <h4 className="text-xs font-semibold text-muted-foreground">{t("changeRequest.diff.proposed")}</h4>
        {right}
      </div>
    </div>
  );

  if (section === "OWNERS") {
    const list = (values: Values | null) => {
      const owners = ((values?.owners as Owner[] | undefined) ?? []);
      if (owners.length === 0) return <p className="text-sm text-muted-foreground">{t("profile.noOwners")}</p>;
      return (
        <ul className="flex flex-col gap-1 text-sm" data-testid="diff-owners">
          {owners.map((o, i) => (
            <li key={i}>
              {o.full_name} · {o.id_number} · {o.share_percent === null || o.share_percent === undefined ? none : `${Number(o.share_percent)}%`} ·{" "}
              {t(`ownerRoles.${o.role}`)}
            </li>
          ))}
        </ul>
      );
    };
    return columns(list(current), list(proposed));
  }

  if (section === "BANK_ACCOUNTS") {
    const list = (values: Values | null) => {
      const accounts = ((values?.accounts as Account[] | undefined) ?? []);
      return (
        <ul className="flex flex-col gap-1 text-sm" data-testid="diff-accounts">
          {accounts.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span>{a.bank_name}</span>
              <span className="font-mono text-xs">{a.iban}</span>
              <span>{a.swift}</span>
              <span>{a.currency}</span>
              {a.is_main && <Badge variant="secondary">{t("bankAccounts.main")}</Badge>}
            </li>
          ))}
        </ul>
      );
    };
    return columns(list(current), list(proposed));
  }

  // DOCUMENTS: the files on the vendor now against the files attached to the request, per kind
  const kinds = ((proposed.documents as string[] | undefined) ?? []);
  return (
    <div className="surface-solid overflow-hidden">
      <Table data-testid="change-diff">
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>{t("changeRequest.diff.document")}</TableHead>
            <TableHead>{t("changeRequest.diff.current")}</TableHead>
            <TableHead>{t("changeRequest.diff.proposed")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kinds.map((kind) => (
            <TableRow key={kind}>
              <TableCell className="font-medium">{t(`files.kinds.${kind}`)}</TableCell>
              <TableCell>
                <FileList files={currentFiles.filter((f) => f.kind === kind)} showKind={false} />
              </TableCell>
              <TableCell>
                <FileList files={proposedFiles.filter((f) => f.kind === kind)} showKind={false} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
