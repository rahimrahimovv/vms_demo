import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { currencyOptions } from "@/lib/currencies";
import type { VendorType } from "@/lib/vendors/constants";
import { documentKinds, sectionFromSlug } from "@/lib/vendors/change-requests";
import { loadChangeFormInitial } from "@/lib/vendors/change-form";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { ChangeRequestForm } from "@/components/vendor/change-request-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { submitChange } from "../../change-actions";

/** REG-08 AC1: "Request a change" for one section of an APPROVED vendor. DRAFT and RETURNED vendors edit directly. */
export default async function NewChangeRequestPage({ params }: PageProps<"/vendor/profile/change/[section]">) {
  const { user, allowed } = await checkSection("vendorProfile");
  if (!allowed || !user.vendorId) return <NoAccess />;
  const { section: slug } = await params;
  const section = sectionFromSlug(slug);
  if (!section) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const { data: vendor } = await supabase.from("vendor").select("vendor_type, status, is_vat_payer").eq("id", user.vendorId).single();
  if (!vendor) return <NoAccess />;
  if (vendor.status !== "APPROVED") redirect("/vendor/profile");
  const type = vendor.vendor_type as VendorType;
  if (section === "OWNERS" && type === "INDIVIDUAL") redirect("/vendor/profile");

  // REG-08 AC2: one open request per section
  const { data: open } = await supabase
    .from("vendor_change_request")
    .select("id")
    .eq("vendor_id", user.vendorId)
    .eq("section", section)
    .in("status", ["SUBMITTED", "RETURNED"])
    .maybeSingle();

  const initial = await loadChangeFormInitial(supabase, user.vendorId, type);
  const currencies = await currencyOptions(supabase, initial.accounts.map((a) => a.currency));

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <RecordHeader title={t("changeRequest.formTitle", { section: t(`changeRequest.sections.${section}`) })} subtitle={t("changeRequest.formSubtitle")} />
      {open ? (
        <Alert className="surface-warning" data-testid="request-open">
          <AlertDescription>
            {t("errors.changeRequestOpen")}{" "}
            <Link href={`/vendor/profile/requests/${open.id}`} className="font-medium underline">
              {t("changeRequest.openRequest")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <ChangeRequestForm
          section={section}
          vendorType={type}
          initial={initial}
          initialReason=""
          currencies={currencies}
          documentKinds={documentKinds(type, vendor.is_vat_payer)}
          action={submitChange.bind(null, section, null)}
        />
      )}
    </div>
  );
}
