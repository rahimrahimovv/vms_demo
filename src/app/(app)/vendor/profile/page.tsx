import { Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { currencyOptions } from "@/lib/currencies";
import { formatDate } from "@/lib/format";
import { bakuToday, certificateStatus } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { StatusBadge } from "@/components/status-badge";
import { FileList } from "@/components/file-list";
import { BankAccountsForm, BrandForm, CertificateForm, ProfileDetailsForm, RenewForm } from "@/components/vendor/profile-forms";
import { loadBankAccounts, toBankAccounts } from "@/lib/vendors/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addBrand,
  addCertificate,
  deleteBrand,
  deleteCertificate,
  renewCertificate,
  saveBankAccounts,
  updateProfile,
} from "./actions";

type Brand = { id: string; brand: string; is_official_dealer: boolean };
type Certificate = {
  id: string;
  type: string;
  number: string | null;
  issuer: string | null;
  issued_on: string;
  expires_on: string | null;
};
type FileRow = { id: string; file_name: string; owner_id: string; uploaded_at: string };

/** REG-06 AC3-AC4: the vendor keeps its profile, brands and certificates at any time. */
export default async function VendorProfilePage() {
  const { user, allowed } = await checkSection("vendorProfile");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();

  const [{ data: vendor }, { data: brands }, { data: certificates }, { data: owners }, bankAccounts] = await Promise.all([
    supabase
      .from("vendor")
      .select("main_activity, main_goods, bank_guarantee_available, bank_guarantee_types, bank_guarantee_max, bank_guarantee_currency")
      .eq("id", user.vendorId)
      .single(),
    supabase.from("vendor_brand").select("id, brand, is_official_dealer").eq("vendor_id", user.vendorId).order("brand").returns<Brand[]>(),
    supabase
      .from("vendor_certificate")
      .select("id, type, number, issuer, issued_on, expires_on")
      .eq("vendor_id", user.vendorId)
      .order("created_at")
      .returns<Certificate[]>(),
    supabase.from("vendor_owner").select("id, full_name, share_percent, role").eq("vendor_id", user.vendorId),
    loadBankAccounts(supabase, user.vendorId),
  ]);
  if (!vendor) return <NoAccess />;
  const accountCurrencies = await currencyOptions(supabase, bankAccounts.map((a) => a.currency));
  const guaranteeCurrencies = await currencyOptions(supabase, [vendor.bank_guarantee_currency]);

  const ownerIds = [...(brands ?? []).map((b) => b.id), ...(certificates ?? []).map((c) => c.id)];
  const { data: files } = ownerIds.length
    ? await supabase
        .from("file")
        .select("id, file_name, owner_id, uploaded_at")
        .in("owner_type", ["vendor_brand", "vendor_certificate"])
        .in("owner_id", ownerIds)
        .order("uploaded_at", { ascending: false })
        .returns<FileRow[]>()
    : { data: [] as FileRow[] };
  const filesOf = (id: string) => (files ?? []).filter((f) => f.owner_id === id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.sections.company")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileDetailsForm
            action={updateProfile}
            initial={{
              mainActivity: vendor.main_activity ?? "",
              mainGoods: vendor.main_goods ?? [],
              bankGuaranteeAvailable: vendor.bank_guarantee_available,
              bankGuaranteeTypes: vendor.bank_guarantee_types ?? [],
              bankGuaranteeMax: vendor.bank_guarantee_max ? String(Number(vendor.bank_guarantee_max)) : "",
              bankGuaranteeCurrency: vendor.bank_guarantee_currency ?? "",
            }}
            currencies={guaranteeCurrencies}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bankAccounts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BankAccountsForm action={saveBankAccounts} initial={toBankAccounts(bankAccounts)} currencies={accountCurrencies} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.sections.brands")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(brands ?? []).length > 0 && (
            <ul className="divide-y rounded-md border" data-testid="brands">
              {(brands ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">{b.brand}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("profile.fields.officialDealer")}: {t(b.is_official_dealer ? "common.yes" : "common.no")}
                    </span>
                    {filesOf(b.id).length > 0 && <FileList files={filesOf(b.id)} showKind={false} />}
                  </span>
                  <form action={deleteBrand.bind(null, b.id)}>
                    <Button type="submit" variant="ghost" size="icon" aria-label={t("common.delete")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <BrandForm action={addBrand} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.sections.certificates")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(certificates ?? []).length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <Table data-testid="certificates">
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>{t("profile.fields.certificateType")}</TableHead>
                    <TableHead>{t("profile.fields.number")}</TableHead>
                    <TableHead>{t("profile.fields.issuer")}</TableHead>
                    <TableHead>{t("profile.fields.issuedOn")}</TableHead>
                    <TableHead>{t("profile.fields.expiresOn")}</TableHead>
                    <TableHead>{t("profile.fields.status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(certificates ?? []).map((c) => {
                    const status = certificateStatus(c.expires_on, today);
                    return (
                      <TableRow key={c.id} data-testid="certificate-row">
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{t(`certificateTypes.${c.type}`)}</span>
                            <FileList files={filesOf(c.id).slice(0, 1)} showKind={false} />
                          </div>
                        </TableCell>
                        <TableCell className="align-top">{c.number ?? t("common.none")}</TableCell>
                        <TableCell className="align-top">{c.issuer ?? t("common.none")}</TableCell>
                        <TableCell className="align-top">{formatDate(c.issued_on)}</TableCell>
                        <TableCell className="align-top">{c.expires_on ? formatDate(c.expires_on) : t("profile.noExpiry")}</TableCell>
                        <TableCell className="align-top">
                          <StatusBadge status={status} />
                          {status !== "VALID" && (
                            <div className="mt-2">
                              <RenewForm action={renewCertificate.bind(null, c.id)} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <form action={deleteCertificate.bind(null, c.id)}>
                            <Button type="submit" variant="ghost" size="icon" aria-label={t("common.delete")}>
                              <Trash2 className="size-4" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <CertificateForm action={addCertificate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.sections.owners")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(owners ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("profile.noOwners")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {(owners ?? []).map((o) => (
                <li key={o.id}>
                  {o.full_name} · {t(`ownerRoles.${o.role}`)}
                  {o.share_percent !== null && ` · ${Number(o.share_percent)}%`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("profile.ownersHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
