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
import { HistoryTab } from "@/components/history-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountsForm, BrandForm, CertificateForm, ProfileDetailsForm, RenewForm } from "@/components/vendor/profile-forms";
import { loadBankAccounts, loadContacts, toBankAccounts } from "@/lib/vendors/queries";
import { ContactList } from "@/components/vendor/registration-steps";
import { Button } from "@/components/ui/button";
import { ChangeRequestHistory } from "@/components/vendor/change-request-history";
import { RequestChangeControl, type OpenRequest } from "@/components/vendor/request-change-control";
import { COMPANY_FIELDS, COMPANY_FIELD_LABELS } from "@/lib/vendors/change-requests";
import type { VendorType } from "@/lib/vendors/constants";
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

  const [{ data: vendor }, { data: brands }, { data: certificates }, { data: owners }, bankAccounts, { data: openRequests }, { data: registrationFiles }] = await Promise.all([
    supabase
      .from("vendor")
      .select("vendor_type, status, legal_name, voen, foreign_tax_number, id_card_number, legal_address, director_name, is_vat_payer, founded_on, main_activity, main_goods, bank_guarantee_available, bank_guarantee_types, bank_guarantee_max, bank_guarantee_currency")
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
    supabase.from("vendor_change_request").select("id, section, status").eq("vendor_id", user.vendorId).in("status", ["SUBMITTED", "RETURNED"]),
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "vendor").eq("owner_id", user.vendorId).order("uploaded_at"),
  ]);
  // REG-08: after approval the core data changes only through a change request; DRAFT and RETURNED edit directly (REG-07)
  const approved = vendor?.status === "APPROVED";
  const openBy = (section: string) => ((openRequests ?? []) as OpenRequest[]).find((r) => r.section === section);
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
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">{t("profile.tabs.profile")}</TabsTrigger>
        <TabsTrigger value="registration-history">{t("profile.tabs.registrationHistory")}</TabsTrigger>
      </TabsList>
      <TabsContent value="registration-history" className="flex flex-col gap-4 pt-4">
        <HistoryTab recordType="vendor" recordId={user.vendorId} />
        <h3 className="text-sm font-semibold">{t("changeRequest.history")}</h3>
        <ChangeRequestHistory vendorId={user.vendorId} audience="vendor" />
      </TabsContent>
      <TabsContent value="profile" className="pt-4">
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

      {vendor.status !== "DRAFT" && vendor.status !== "RETURNED" && (
        <Card data-testid="company-details">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("changeRequest.sections.COMPANY_DETAILS")}</CardTitle>
            {approved && <RequestChangeControl section="COMPANY_DETAILS" open={openBy("COMPANY_DETAILS")} />}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-x-8 gap-y-4">
              {COMPANY_FIELDS[vendor.vendor_type as VendorType].map((key) => {
                const value = (vendor as Record<string, unknown>)[key];
                return (
                  <div key={key} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{t(`registration.fields.${COMPANY_FIELD_LABELS[key]}`)}</dt>
                    <dd className="text-sm">
                      {value === null || value === undefined || value === ""
                        ? t("common.none")
                        : key === "is_vat_payer"
                          ? t(value ? "common.yes" : "common.no")
                          : key === "founded_on"
                            ? formatDate(String(value))
                            : String(value)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("registration.contacts.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("registration.contacts.hint")}</p>
        </CardHeader>
        <CardContent>
          <ContactList
            contacts={await loadContacts(supabase, user.vendorId)}
            vendorType={vendor.vendor_type}
            readOnly={!["DRAFT", "RETURNED", "APPROVED"].includes(vendor.status)}
          />
        </CardContent>
      </Card>

      <Card data-testid="bank-accounts-card">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t("bankAccounts.title")}</CardTitle>
          {approved && <RequestChangeControl section="BANK_ACCOUNTS" open={openBy("BANK_ACCOUNTS")} />}
        </CardHeader>
        <CardContent>
          {vendor.status === "DRAFT" || vendor.status === "RETURNED" ? (
            <BankAccountsForm action={saveBankAccounts} initial={toBankAccounts(bankAccounts)} currencies={accountCurrencies} />
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm" data-testid="bank-account-list">
              {bankAccounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{a.bank_name}</span>
                  <span className="font-mono text-xs">{a.iban}</span>
                  <span>{a.swift}</span>
                  <span>{a.currency}</span>
                  {a.is_main && <span className="text-xs font-semibold text-brand-ink">{t("bankAccounts.main")}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.sections.brands")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(brands ?? []).length > 0 && (
            <ul className="surface-solid divide-y" data-testid="brands">
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
            <div className="surface-solid overflow-hidden">
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
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t("profile.sections.owners")}</CardTitle>
          {approved && vendor.vendor_type !== "INDIVIDUAL" && <RequestChangeControl section="OWNERS" open={openBy("OWNERS")} />}
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

      {vendor.status !== "DRAFT" && vendor.status !== "RETURNED" && (
        <Card data-testid="documents-card">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("changeRequest.sections.DOCUMENTS")}</CardTitle>
            {approved && <RequestChangeControl section="DOCUMENTS" open={openBy("DOCUMENTS")} />}
          </CardHeader>
          <CardContent>
            <FileList files={registrationFiles ?? []} />
          </CardContent>
        </Card>
      )}
    </div>
      </TabsContent>
    </Tabs>
  );
}
