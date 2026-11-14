import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { currencyOptions } from "@/lib/currencies";
import { formatDateTime } from "@/lib/format";
import type { VendorType } from "@/lib/vendors/constants";
import { documentKinds, isChangeSection } from "@/lib/vendors/change-requests";
import { companyFormValues } from "@/lib/vendors/change-form";
import { toBankAccounts } from "@/lib/vendors/queries";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { FileList, type FileItem } from "@/components/file-list";
import { ChangeDiff } from "@/components/vendor/change-diff";
import { ChangeRequestForm } from "@/components/vendor/change-request-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { submitChange, withdrawChange } from "../../change-actions";

type Values = Record<string, unknown>;

/**
 * REG-08 AC3, AC7, AC8: the vendor's view of one request: the status, what changes, the reason and the files; while
 * it is RETURNED the vendor edits and resubmits it; while it is SUBMITTED or RETURNED the vendor can withdraw it.
 */
export default async function VendorChangeRequestPage({ params }: PageProps<"/vendor/profile/requests/[id]">) {
  const { user, allowed } = await checkSection("vendorProfile");
  if (!allowed || !user.vendorId) return <NoAccess />;
  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("vendor_change_request")
    .select("id, section, status, reason, current_values, proposed_values, review_comment, submitted_at, decided_at")
    .eq("id", id)
    .eq("vendor_id", user.vendorId)
    .maybeSingle();
  if (!request || !isChangeSection(request.section)) return <NoAccess />;

  const { data: vendor } = await supabase.from("vendor").select("vendor_type, is_vat_payer").eq("id", user.vendorId).single();
  const type = (vendor?.vendor_type ?? "LOCAL_COMPANY") as VendorType;
  const proposed = (request.proposed_values ?? {}) as Values;
  const current = (request.current_values ?? null) as Values | null;

  const [{ data: requestFiles }, { data: vendorFiles }] = await Promise.all([
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "vendor_change_request").eq("owner_id", id).order("uploaded_at"),
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "vendor").eq("owner_id", user.vendorId),
  ]);
  const files = (requestFiles ?? []) as FileItem[];
  const returned = request.status === "RETURNED";

  let form: React.ReactNode = null;
  if (returned) {
    const accounts = ((proposed.accounts as Values[] | undefined) ?? []).map((a) => ({
      id: "",
      bank_name: String(a.bank_name ?? ""),
      iban: String(a.iban ?? ""),
      swift: String(a.swift ?? ""),
      currency: String(a.currency ?? ""),
      is_main: a.is_main === true,
    }));
    form = (
      <ChangeRequestForm
        section={request.section}
        vendorType={type}
        resubmit
        initial={{
          company: companyFormValues(type, proposed),
          owners: ((proposed.owners as Values[] | undefined) ?? []).map((o) => ({
            fullName: String(o.full_name ?? ""),
            idNumber: String(o.id_number ?? ""),
            sharePercent: o.share_percent === null || o.share_percent === undefined ? "" : String(Number(o.share_percent)),
            role: (o.role as "HEAD" | "FOUNDER" | "SHAREHOLDER") ?? "SHAREHOLDER",
          })),
          accounts: toBankAccounts(accounts),
        }}
        initialReason={request.reason}
        currencies={await currencyOptions(supabase, accounts.map((a) => a.currency))}
        documentKinds={documentKinds(type, vendor?.is_vat_payer ?? null)}
        hasSupportFile={files.some((f) => f.kind === "change_support")}
        action={submitChange.bind(null, request.section, request.id)}
      />
    );
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <RecordHeader
        title={t("changeRequest.formTitle", { section: t(`changeRequest.sections.${request.section}`) })}
        subtitle={request.submitted_at ? t("changeRequest.submittedAt", { date: formatDateTime(request.submitted_at) }) : undefined}
        status={request.status}
        actions={
          request.status === "SUBMITTED" || returned ? (
            <form action={withdrawChange.bind(null, request.id)}>
              <Button type="submit" variant="outline" data-testid="withdraw">
                {t("changeRequest.withdraw")}
              </Button>
            </form>
          ) : undefined
        }
      />
      {request.status === "SUBMITTED" && (
        <Alert data-testid="pending-note">
          <AlertDescription>{t("changeRequest.pending")}</AlertDescription>
        </Alert>
      )}
      {request.review_comment && (
        <Alert className="surface-warning" data-testid="review-comment">
          <AlertDescription>
            <span className="font-semibold">{t(request.status === "REJECTED" ? "decision.reason" : "decision.comment")}: </span>
            {request.review_comment}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="files">{t("record.tabs.files")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="flex flex-col gap-4 pt-4">
          <Card>
            <CardContent>
              <p className="text-xs font-semibold text-muted-foreground">{t("changeRequest.reason")}</p>
              <p className="text-sm whitespace-pre-wrap" data-testid="request-reason">
                {request.reason}
              </p>
            </CardContent>
          </Card>
          <ChangeDiff
            section={request.section}
            vendorType={type}
            current={current}
            proposed={proposed}
            currentFiles={(vendorFiles ?? []) as FileItem[]}
            proposedFiles={files}
          />
          {form}
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <Card>
            <CardContent>
              <FileList files={files} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="vendor_change_request" recordId={request.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
