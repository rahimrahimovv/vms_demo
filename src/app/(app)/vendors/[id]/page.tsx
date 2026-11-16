import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { flattenTree, type CategoryRow } from "@/lib/categories";
import { bakuToday } from "@/lib/vendors/rules";
import { buildAttention } from "@/lib/vendors/attention";
import { loadContacts, loadVendor } from "@/lib/vendors/queries";
import { NoAccess } from "@/components/no-access";
import { DecisionPanel } from "@/components/decision-panel";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { ActionDialog } from "@/components/action-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ActivityCard,
  BankAccountsCard,
  CategoriesCard,
  CertificatesCard,
  ChangeRequestBanner,
  ContactsCard,
  DocumentsCard,
  DraftNotice,
  MoreDetailsCard,
  OwnersCard,
  VendorRail,
  type OpenRequest,
  type OwnerShare,
} from "@/components/vendor/vendor-card";
import { decideRegistration, reopenRegistration } from "./actions";

const norm = (s: string) => s.trim().toUpperCase();

/**
 * REG-06 AC7-AC8: the vendor card for PS, CM and Admin, one page: a summary rail on the left, the working cards on the right.
 * REG-02: the specialist decides on a SUBMITTED registration from the rail. Data, permissions and RLS are those of the
 * earlier tabbed page; only the layout changed.
 */
export default async function VendorCardPage({ params, searchParams }: PageProps<"/vendors/[id]">) {
  const { user, allowed } = await checkSection("vendors");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const { activity } = await searchParams;
  const t = await getTranslations();
  const supabase = await createClient();
  const today = bakuToday();
  const { vendor, owners, files, bankAccounts } = await loadVendor(supabase, id);
  const contacts = await loadContacts(supabase, id);
  if (!vendor) return <NoAccess />;

  const [{ data: brands }, { data: certificates }, { data: applications }, { data: responses }, { data: categories }, { data: shared }, { data: requests }] =
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
      supabase
        .from("vendor_change_request")
        .select("id, section, status, submitted_at, created_at")
        .eq("vendor_id", id)
        .eq("status", "SUBMITTED")
        .order("submitted_at", { ascending: true })
        .returns<(OpenRequest & { status: string })[]>(),
    ]);

  const paths = new Map(flattenTree(categories ?? []).map((c) => [c.id, c.path]));
  const categoryName = (cid: string) => paths.get(cid) ?? "";
  const grade = (responses ?? []).find((r) => r.status === "GRADED" && r.valid_until && r.valid_until >= today) ?? null;
  const sharedWith = (shared ?? []) as { vendor_id: string; legal_name: string }[];
  const openRequests = requests ?? [];

  // which owner is the shared one: the same ID number among the owners of the other vendors (read as the signed-in user)
  const shares: OwnerShare[] = [];
  if (sharedWith.length > 0) {
    const { data: others } = await supabase.from("vendor_owner").select("vendor_id, id_number").in("vendor_id", sharedWith.map((s) => s.vendor_id));
    for (const s of sharedWith) {
      const ids = new Set((others ?? []).filter((o) => o.vendor_id === s.vendor_id).map((o) => norm(o.id_number)));
      for (const o of owners) if (ids.has(norm(o.id_number))) shares.push({ ownerName: o.full_name, vendorId: s.vendor_id, vendorName: s.legal_name });
    }
  }

  const attention = buildAttention({
    today,
    vendor,
    sharedWith,
    certificates: certificates ?? [],
    changeRequests: openRequests,
    questionnaires: responses ?? [],
    applications: applications ?? [],
  });

  const isSpecialist = user.roles.includes("PROCUREMENT_SPECIALIST");
  const canDecide = isSpecialist && vendor.status === "SUBMITTED";
  const canReopen = isSpecialist && vendor.status === "REJECTED";
  const canReviewChange = isSpecialist && vendor.status === "APPROVED" && openRequests.length > 0;

  // The same dialogs, messages and permissions as before; the buttons only sit in the rail now.
  const actions =
    canDecide || canReopen || canReviewChange || isSpecialist ? (
      <>
        {canDecide && (
          <DecisionPanel
            stacked
            action={decideRegistration.bind(null, vendor.id)}
            options={[
              { value: "APPROVE", label: t("decision.approve"), comment: "none" },
              { value: "RETURN", label: t("decision.return"), variant: "outline", comment: "required", commentLabel: t("decision.comment") },
              { value: "REJECT", label: t("decision.reject"), variant: "destructive", comment: "required", commentLabel: t("decision.reason") },
            ]}
          />
        )}
        {canReopen && (
          <ActionDialog
            action={reopenRegistration.bind(null, vendor.id)}
            trigger={t("rejected.reopen")}
            triggerVariant="default"
            triggerClassName="w-full"
            title={t("rejected.reopenTitle")}
            testId="reopen"
          >
            <FormField id="comment" label={t("decision.comment")} required>
              <Textarea id="comment" name="comment" rows={3} />
            </FormField>
          </ActionDialog>
        )}
        {canReviewChange && (
          <Button asChild className="w-full">
            <Link
              href={openRequests.length === 1 ? `/change-requests/${openRequests[0].id}` : "/change-requests"}
              data-testid="review-change-request"
            >
              {t("vendorCard.reviewChangeRequest", { count: openRequests.length })}
            </Link>
          </Button>
        )}
        {/* PLT-03 AC5: a Procurement Specialist resets the sign-in account of the vendor; an Admin cannot */}
        {isSpecialist && <ResetPasswordButton vendorId={vendor.id} name={vendor.legal_name} className="w-full" />}
      </>
    ) : null;

  return (
    <div className="flex items-start gap-4" data-testid="vendor-card">
      <VendorRail
        vendor={vendor}
        attention={attention}
        grade={grade}
        brands={brands ?? []}
        today={today}
        categoryName={categoryName}
        actions={actions}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-(--density-gap)">
        {vendor.status === "DRAFT" && <DraftNotice />}
        {openRequests.map((r) => (
          <ChangeRequestBanner key={r.id} request={r} canReview={isSpecialist} />
        ))}
        <div className="grid grid-cols-1 items-start gap-(--density-gap) min-[1400px]:grid-cols-2">
          <OwnersCard owners={owners} shares={shares} />
          <ContactsCard contacts={contacts} />
          <BankAccountsCard accounts={bankAccounts} />
          <CertificatesCard certificates={certificates ?? []} today={today} />
          <CategoriesCard applications={applications ?? []} categoryName={categoryName} today={today} canOpen={isSpecialist} />
          <DocumentsCard files={files} />
          <MoreDetailsCard vendor={vendor} />
        </div>
        <ActivityCard vendorId={vendor.id} showAll={activity === "all"} />
      </div>
    </div>
  );
}
