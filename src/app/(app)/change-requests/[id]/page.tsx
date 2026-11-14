import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { VendorType } from "@/lib/vendors/constants";
import { isChangeSection } from "@/lib/vendors/change-requests";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { FileList, type FileItem } from "@/components/file-list";
import { DecisionPanel } from "@/components/decision-panel";
import { ChangeDiff } from "@/components/vendor/change-diff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideChangeRequest } from "../actions";

type Values = Record<string, unknown>;

/**
 * REG-08 AC5-AC7: one request for the Procurement Specialist: each changed value next to the current one, the reason
 * and the files, with Approve, Return for correction and Reject. Committee Members and Admins read it.
 */
export default async function ChangeRequestPage({ params }: PageProps<"/change-requests/[id]">) {
  const { user, allowed } = await checkSection("changeRequests");
  if (!allowed) return <NoAccess />;
  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("vendor_change_request")
    .select("id, vendor_id, section, status, reason, current_values, proposed_values, review_comment, submitted_at, decided_at, vendor:vendor(legal_name, vendor_type), decider:app_user!vendor_change_request_decided_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!request || !isChangeSection(request.section)) return <NoAccess />;

  const vendor = (Array.isArray(request.vendor) ? request.vendor[0] : request.vendor) as { legal_name: string; vendor_type: VendorType } | null;
  const decider = (Array.isArray(request.decider) ? request.decider[0] : request.decider) as { full_name: string } | null;
  const [{ data: requestFiles }, { data: vendorFiles }] = await Promise.all([
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "vendor_change_request").eq("owner_id", id).order("uploaded_at"),
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "vendor").eq("owner_id", request.vendor_id),
  ]);
  const files = (requestFiles ?? []) as FileItem[];

  const canDecide = user.roles.includes("PROCUREMENT_SPECIALIST") && request.status === "SUBMITTED";
  const actions = canDecide ? (
    <DecisionPanel
      action={decideChangeRequest.bind(null, request.id)}
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
        title={t("changeRequest.formTitle", { section: t(`changeRequest.sections.${request.section}`) })}
        subtitle={vendor?.legal_name}
        status={request.status}
        actions={actions}
      />
      <p className="px-2 text-sm">
        <Link href={`/vendors/${request.vendor_id}`} className="font-medium text-primary hover:underline" data-testid="vendor-link">
          {vendor?.legal_name}
        </Link>
        {request.submitted_at && <span className="text-muted-foreground"> · {t("changeRequest.submittedAt", { date: formatDateTime(request.submitted_at) })}</span>}
      </p>
      {request.review_comment && (
        <Alert className="surface-warning" data-testid="review-comment">
          <AlertDescription>
            <span className="font-semibold">{decider?.full_name ? `${decider.full_name}: ` : ""}</span>
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
            vendorType={vendor?.vendor_type ?? "LOCAL_COMPANY"}
            current={(request.current_values ?? null) as Values | null}
            proposed={(request.proposed_values ?? {}) as Values}
            currentFiles={(vendorFiles ?? []) as FileItem[]}
            proposedFiles={files}
          />
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
