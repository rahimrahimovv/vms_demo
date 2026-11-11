import Link from "next/link";
import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday, certificateStatus, yearsInBusiness } from "@/lib/vendors/rules";
import { loadVendor } from "@/lib/vendors/queries";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { StatusBadge } from "@/components/status-badge";
import { FileList } from "@/components/file-list";
import { DecisionPanel } from "@/components/decision-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideRegistration } from "./actions";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * REG-06 AC7-AC8: the vendor card for PS, CM and Admin; REG-02: the specialist decides on a
 * SUBMITTED registration from its header.
 */
export default async function VendorCardPage({ params }: PageProps<"/vendors/[id]">) {
  const { user, allowed } = await checkSection("vendors");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();
  const { vendor, owners, files } = await loadVendor(supabase, id);
  if (!vendor) return <NoAccess />;

  const [{ data: brands }, { data: certificates }, { data: applications }, { data: responses }, { data: categories }, { data: shared }] =
    await Promise.all([
      supabase.from("vendor_brand").select("id, brand, is_official_dealer").eq("vendor_id", id).order("brand"),
      supabase.from("vendor_certificate").select("id, type, number, issuer, issued_on, expires_on").eq("vendor_id", id).order("created_at"),
      supabase
        .from("category_application")
        .select("id, category_id, status, valid_until, reason, created_at")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("questionnaire_response")
        .select("id, attempt_no, status, grade, score, valid_until")
        .eq("vendor_id", id)
        .order("attempt_no", { ascending: false }),
      supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
      supabase.rpc("vendor_shared_owners", { p_vendor: id }),
    ]);

  const paths = new Map(flattenTree(categories ?? []).map((c) => [c.id, c.path]));
  const grade = (responses ?? []).find((r) => r.status === "GRADED" && r.valid_until && r.valid_until >= today);
  const qualified = (applications ?? []).filter((a) => a.status === "QUALIFIED" && a.valid_until && a.valid_until >= today);
  const sharedWith = (shared ?? []) as { vendor_id: string; legal_name: string }[];
  const none = t("common.none");

  const canDecide = user.roles.includes("PROCUREMENT_SPECIALIST") && vendor.status === "SUBMITTED";
  const actions = canDecide ? (
    <DecisionPanel
      action={decideRegistration.bind(null, vendor.id)}
      options={[
        { value: "APPROVE", label: t("decision.approve"), comment: "none" },
        { value: "RETURN", label: t("decision.return"), variant: "outline", comment: "required", commentLabel: t("decision.comment") },
        { value: "REJECT", label: t("decision.reject"), variant: "destructive", comment: "required", commentLabel: t("decision.reason") },
      ]}
    />
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={vendor.legal_name}
        subtitle={`${t(`vendorTypes.${vendor.vendor_type}`)} · ${t(`countries.${vendor.country_code}`)}`}
        status={vendor.status}
        actions={actions}
      />

      {sharedWith.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50" data-testid="shared-owner">
          <Users className="size-4" aria-hidden />
          <AlertDescription>
            {sharedWith.map((s, i) => (
              <span key={s.vendor_id}>
                {i > 0 && ", "}
                {t("vendorCard.sharesOwner")}{" "}
                <Link href={`/vendors/${s.vendor_id}`} className="font-medium underline">
                  {s.legal_name}
                </Link>
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="owners">{t("vendorCard.tabs.owners")}</TabsTrigger>
          <TabsTrigger value="certificates">{t("vendorCard.tabs.certificates")}</TabsTrigger>
          <TabsTrigger value="categories">{t("vendorCard.tabs.categories")}</TabsTrigger>
          <TabsTrigger value="files">{t("record.tabs.files")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="pt-4">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-3 gap-x-8 gap-y-5" data-testid="vendor-details">
                <Field label={t("vendors.columns.taxNumber")}>{vendor.voen ?? vendor.foreign_tax_number ?? none}</Field>
                <Field label={t("vendorCard.founded")}>
                  {vendor.founded_on
                    ? t("vendorCard.foundedValue", {
                        date: formatDate(vendor.founded_on),
                        years: yearsInBusiness(vendor.founded_on, today),
                      })
                    : none}
                </Field>
                <Field label={t("vendors.columns.standing")}>
                  {vendor.standing ? <StatusBadge status={vendor.standing} /> : none}
                  {vendor.standing === "HOLD" && vendor.standing_until && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("vendorCard.holdUntil", { date: formatDate(vendor.standing_until) })}
                    </span>
                  )}
                </Field>
                <Field label={t("qualification.grade")}>
                  {grade ? (
                    <span data-testid="card-grade">
                      {grade.grade} · {t("qualification.validUntil")} {formatDate(grade.valid_until!)}
                    </span>
                  ) : (
                    none
                  )}
                </Field>
                <Field label={t("vendorCard.qualifiedCategories")}>
                  {qualified.length > 0 ? qualified.map((a) => paths.get(a.category_id)).join(", ") : none}
                </Field>
                <Field label={t("profile.fields.mainActivity")}>
                  {vendor.main_activity ? t(`activities.${vendor.main_activity}`) : none}
                </Field>
                <Field label={t("profile.sections.brands")}>
                  {(brands ?? []).length > 0
                    ? (brands ?? [])
                        .map((b) => (b.is_official_dealer ? `${b.brand} (${t("profile.fields.officialDealer")})` : b.brand))
                        .join(", ")
                    : none}
                </Field>
                <Field label={t("profile.fields.mainGoods")}>{vendor.main_goods.length > 0 ? vendor.main_goods.join(", ") : none}</Field>
                <Field label={t("profile.fields.bankGuarantee")}>
                  {vendor.bank_guarantee_available
                    ? [
                        vendor.bank_guarantee_types.map((g) => t(`guaranteeTypes.${g}`)).join(", "),
                        vendor.bank_guarantee_max
                          ? `${t("profile.fields.guaranteeMax")} ${Number(vendor.bank_guarantee_max).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${vendor.bank_guarantee_currency}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("common.yes")
                    : t("common.no")}
                </Field>
                <Field label={t("registration.fields.legalAddress")}>{vendor.legal_address ?? none}</Field>
                <Field label={t("registration.fields.directorName")}>{vendor.director_name ?? none}</Field>
                <Field label={t("registration.fields.vatPayer")}>
                  {vendor.is_vat_payer === null ? none : t(vendor.is_vat_payer ? "common.yes" : "common.no")}
                </Field>
                {vendor.id_card_number && <Field label={t("registration.fields.idCardNumber")}>{vendor.id_card_number}</Field>}
                <Field label={t("registration.fields.contactPerson")}>{vendor.contact_person}</Field>
                <Field label={t("registration.fields.contactEmail")}>{vendor.contact_email}</Field>
                <Field label={t("registration.fields.phone")}>{vendor.phone}</Field>
                <Field label={t("registration.fields.bankName")}>{vendor.bank_name}</Field>
                <Field label={t("registration.fields.iban")}>{vendor.iban}</Field>
                <Field label={t("registration.fields.swift")}>{vendor.swift}</Field>
                {vendor.review_comment && <Field label={t("vendorCard.reviewComment")}>{vendor.review_comment}</Field>}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="owners" className="pt-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table data-testid="owners">
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>{t("owners.fullName")}</TableHead>
                  <TableHead>{t("owners.idNumber")}</TableHead>
                  <TableHead className="text-right">{t("owners.share")}</TableHead>
                  <TableHead>{t("owners.role")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {t("profile.noOwners")}
                    </TableCell>
                  </TableRow>
                ) : (
                  owners.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.full_name}</TableCell>
                      <TableCell>{o.id_number}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.share_percent !== null ? `${Number(o.share_percent)}%` : none}</TableCell>
                      <TableCell>{t(`ownerRoles.${o.role}`)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="certificates" className="pt-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>{t("profile.fields.certificateType")}</TableHead>
                  <TableHead>{t("profile.fields.number")}</TableHead>
                  <TableHead>{t("profile.fields.issuer")}</TableHead>
                  <TableHead>{t("profile.fields.expiresOn")}</TableHead>
                  <TableHead>{t("profile.fields.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(certificates ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      {t("vendorCard.noCertificates")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (certificates ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{t(`certificateTypes.${c.type}`)}</TableCell>
                      <TableCell>{c.number ?? none}</TableCell>
                      <TableCell>{c.issuer ?? none}</TableCell>
                      <TableCell>{c.expires_on ? formatDate(c.expires_on) : t("profile.noExpiry")}</TableCell>
                      <TableCell>
                        <StatusBadge status={certificateStatus(c.expires_on, today)} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>{t("categories.columns.category")}</TableHead>
                  <TableHead>{t("categories.columns.applied")}</TableHead>
                  <TableHead>{t("categories.columns.status")}</TableHead>
                  <TableHead>{t("qualification.validUntil")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(applications ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {t("vendorCard.noApplications")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (applications ?? []).map((a) => {
                    const shown = a.status === "QUALIFIED" && a.valid_until && a.valid_until < today ? "EXPIRED" : a.status;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          {user.roles.includes("PROCUREMENT_SPECIALIST") ? (
                            <Link href={`/category-applications/${a.id}`} className="text-primary hover:underline">
                              {paths.get(a.category_id)}
                            </Link>
                          ) : (
                            paths.get(a.category_id)
                          )}
                        </TableCell>
                        <TableCell>{formatDate(a.created_at)}</TableCell>
                        <TableCell>
                          <StatusBadge status={shown} />
                        </TableCell>
                        <TableCell>{a.valid_until ? formatDate(a.valid_until) : none}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="files" className="pt-4">
          <Card>
            <CardContent>
              <FileList files={files} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-4 pt-4">
          <HistoryTab recordType="vendor" recordId={vendor.id} />
          <h3 className="text-sm font-semibold">{t("vendorCard.standingHistory")}</h3>
          <HistoryTab recordType="vendor_standing" recordId={vendor.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
