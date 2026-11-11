import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday } from "@/lib/vendors/rules";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { FileList } from "@/components/file-list";
import { DecisionPanel } from "@/components/decision-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideApplication } from "./actions";

/** REG-04: one category application with its licence files; Qualify or Reject. */
export default async function CategoryApplicationPage({ params }: PageProps<"/category-applications/[id]">) {
  const { user, allowed } = await checkSection("categoryApplications");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();

  const [{ data: application }, { data: categories }, { data: files }] = await Promise.all([
    supabase
      .from("category_application")
      .select("id, vendor_id, category_id, status, valid_until, reason, created_at, decided_at, vendor(legal_name)")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        vendor_id: string;
        category_id: string;
        status: string;
        valid_until: string | null;
        reason: string | null;
        created_at: string;
        decided_at: string | null;
        vendor: { legal_name: string } | null;
      }>(),
    supabase.from("category").select("id, parent_id, name, licence_required, is_active").returns<CategoryRow[]>(),
    supabase.from("file").select("id, file_name, kind, uploaded_at").eq("owner_type", "category_application").eq("owner_id", id),
  ]);
  if (!application) return <NoAccess />;

  const node = flattenTree(categories ?? []).find((c) => c.id === application.category_id);
  const status =
    application.status === "QUALIFIED" && application.valid_until && application.valid_until < today ? "EXPIRED" : application.status;
  const canDecide = application.status === "PENDING" && user.roles.includes("PROCUREMENT_SPECIALIST");

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={`${application.vendor?.legal_name ?? ""} · ${node?.name ?? ""}`}
        subtitle={node?.path}
        status={status}
        actions={
          canDecide ? (
            <DecisionPanel
              action={decideApplication.bind(null, application.id)}
              options={[
                { value: "QUALIFY", label: t("decision.qualify"), comment: "none" },
                { value: "REJECT", label: t("decision.reject"), variant: "destructive", comment: "required", commentLabel: t("decision.reason") },
              ]}
            />
          ) : undefined
        }
      />
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="files">{t("record.tabs.files")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-3 gap-x-8 gap-y-5 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("applications.columns.vendor")}</dt>
                  <dd>
                    <Link href={`/vendors/${application.vendor_id}`} className="font-medium text-primary hover:underline">
                      {application.vendor?.legal_name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("applications.columns.category")}</dt>
                  <dd>{node?.path}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("applications.licence")}</dt>
                  <dd>{node?.needsLicence ? t("categories.licenceRequired") : t("common.no")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("applications.columns.applied")}</dt>
                  <dd>{formatDate(application.created_at)}</dd>
                </div>
                {application.valid_until && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("qualification.validUntil")}</dt>
                    <dd>{formatDate(application.valid_until)}</dd>
                  </div>
                )}
                {application.reason && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("decision.reason")}</dt>
                    <dd>{application.reason}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <Card>
            <CardContent>
              <FileList files={files ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="category_application" recordId={application.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
