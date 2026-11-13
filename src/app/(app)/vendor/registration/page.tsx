import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { loadSnapshot } from "@/lib/vendors/queries";
import { bakuToday } from "@/lib/vendors/rules";
import { firstIncompleteStep, progress, stepStatuses } from "@/lib/vendors/steps";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { RegistrationChecklist } from "@/components/vendor/registration-checklist";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * REG-07: while DRAFT or RETURNED this page opens the first incomplete step; once SUBMITTED, APPROVED or
 * REJECTED it shows the read-only overview and the History (REG-02 AC4).
 */
export default async function VendorRegistrationPage() {
  const { user, allowed } = await checkSection("vendorRegistration");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const loaded = await loadSnapshot(supabase, user.vendorId);
  if (!loaded) return <NoAccess />;
  const { vendor, snapshot } = loaded;
  const statuses = stepStatuses(snapshot, bakuToday());

  // REG-07 AC11: an APPROVED vendor finds the registration history in the Profile.
  if (vendor.status === "APPROVED") redirect("/vendor/profile");

  if (vendor.status === "DRAFT" || vendor.status === "RETURNED") {
    redirect(`/vendor/registration/${firstIncompleteStep(statuses)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader title={vendor.legal_name} subtitle={t(`vendorTypes.${vendor.vendor_type}`)} status={vendor.status} />
      {vendor.status === "REJECTED" && (
        <Alert variant="destructive" data-testid="rejected-reason">
          <AlertTitle>{t("registration.rejectedTitle")}</AlertTitle>
          <AlertDescription>{vendor.review_comment}</AlertDescription>
        </Alert>
      )}
      {vendor.status === "SUBMITTED" && (
        <Alert data-testid="submitted-note">
          <AlertDescription>{t("registration.readOnlyNote")}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <RegistrationChecklist statuses={statuses} progress={progress(statuses)} continueStep={null} showLocked={false} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="vendor" recordId={vendor.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
