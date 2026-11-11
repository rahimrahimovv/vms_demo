import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { filesByKind, loadVendor, toFormState } from "@/lib/vendors/queries";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { RegistrationForm } from "@/components/vendor/registration-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateRegistration } from "./actions";

/** REG-01 AC10, REG-02 AC3-AC5: the vendor's own registration (editable while DRAFT or RETURNED). */
export default async function VendorRegistrationPage({ searchParams }: PageProps<"/vendor/registration">) {
  const { user, allowed } = await checkSection("vendorRegistration");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { vendor, owners, files } = await loadVendor(supabase, user.vendorId);
  if (!vendor) return <NoAccess />;
  const params = await searchParams;
  const error = typeof params.error === "string" && /^errors\.[A-Za-z]+$/.test(params.error) ? params.error : null;
  const editable = vendor.status === "DRAFT" || vendor.status === "RETURNED";

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={vendor.legal_name}
        subtitle={t(`vendorTypes.${vendor.vendor_type}`)}
        status={vendor.status}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      {params.saved === "1" && !error && (
        <Alert data-testid="registered-note">
          <AlertDescription>{t(vendor.status === "DRAFT" ? "registration.savedDraft" : "registration.saved")}</AlertDescription>
        </Alert>
      )}
      {vendor.status === "RETURNED" && vendor.review_comment && (
        <Alert className="border-amber-300 bg-amber-50" data-testid="returned-comment">
          <AlertTitle>{t("registration.returnedTitle")}</AlertTitle>
          <AlertDescription>{vendor.review_comment}</AlertDescription>
        </Alert>
      )}
      {vendor.status === "REJECTED" && (
        <Alert variant="destructive" data-testid="rejected-reason">
          <AlertTitle>{t("registration.rejectedTitle")}</AlertTitle>
          <AlertDescription>{vendor.review_comment}</AlertDescription>
        </Alert>
      )}
      {vendor.status === "SUBMITTED" && (
        <Alert>
          <AlertDescription>{t("registration.submittedNote")}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <RegistrationForm
            mode="edit"
            action={updateRegistration}
            initial={toFormState(vendor, owners)}
            files={filesByKind(files)}
            readOnly={!editable}
          />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="vendor" recordId={vendor.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
