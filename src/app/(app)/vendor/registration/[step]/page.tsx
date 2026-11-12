import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { currencyOptions } from "@/lib/currencies";
import { filesByKind, loadSnapshot } from "@/lib/vendors/queries";
import { bakuToday } from "@/lib/vendors/rules";
import { incompleteSteps, progress, requiredKinds, STEP_KEYS, stepStatuses, type StepKey } from "@/lib/vendors/steps";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { RegistrationChecklist } from "@/components/vendor/registration-checklist";
import {
  BankStep,
  CompanyStep,
  ContactsStep,
  DocumentsStep,
  OwnersStep,
  ReviewStep,
} from "@/components/vendor/registration-steps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** REG-07: one step of the registration. Editable while DRAFT or RETURNED, read-only otherwise (AC11). */
export default async function RegistrationStepPage({ params }: PageProps<"/vendor/registration/[step]">) {
  const { step } = await params;
  if (!(STEP_KEYS as readonly string[]).includes(step)) notFound();
  const key = step as StepKey;

  const { user, allowed } = await checkSection("vendorRegistration");
  if (!allowed || !user.vendorId) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const loaded = await loadSnapshot(supabase, user.vendorId);
  if (!loaded) return <NoAccess />;
  const { vendor, snapshot, files, bankAccounts, contacts } = loaded;
  const statuses = stepStatuses(snapshot, bakuToday());
  const readOnly = !(vendor.status === "DRAFT" || vendor.status === "RETURNED");

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader title={vendor.legal_name} subtitle={t(`vendorTypes.${vendor.vendor_type}`)} status={vendor.status} />
      {vendor.status === "RETURNED" && vendor.review_comment && (
        <Alert className="border-amber-300 bg-amber-50" data-testid="returned-comment">
          <AlertTitle>{t("registration.returnedTitle")}</AlertTitle>
          <AlertDescription>{vendor.review_comment}</AlertDescription>
        </Alert>
      )}
      {vendor.status === "SUBMITTED" && (
        <Alert data-testid="submitted-note">
          <AlertDescription>{t("registration.readOnlyNote")}</AlertDescription>
        </Alert>
      )}
      <RegistrationChecklist statuses={statuses} progress={progress(statuses)} continueStep={null} showLocked={false} current={key} />

      <h3 className="text-lg font-semibold">{t(`registration.steps.${key}`)}</h3>
      {key === "company" && <CompanyStep vendorType={vendor.vendor_type} initial={snapshot.company} readOnly={readOnly} />}
      {key === "owners" && <OwnersStep vendorType={vendor.vendor_type} initial={snapshot.owners} readOnly={readOnly} />}
      {key === "contacts" && <ContactsStep contacts={contacts} vendorType={vendor.vendor_type} readOnly={readOnly} />}
      {key === "bank" && (
        <BankStep
          initial={snapshot.bankAccounts}
          currencies={await currencyOptions(supabase, bankAccounts.map((a) => a.currency))}
          readOnly={readOnly}
        />
      )}
      {key === "documents" && (
        <DocumentsStep
          kinds={requiredKinds(vendor.vendor_type, vendor.is_vat_payer === true)}
          files={filesByKind(files)}
          readOnly={readOnly}
        />
      )}
      {key === "review" && <ReviewStep statuses={statuses} incomplete={incompleteSteps(statuses)} readOnly={readOnly} />}
    </div>
  );
}
