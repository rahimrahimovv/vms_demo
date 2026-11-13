import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { timeRemaining } from "@/lib/sourcing/dates";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { DecisionPanel } from "@/components/decision-panel";
import { ProposalForm, type ProposalLine } from "@/components/vendor/proposal-form";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FinalOfferForm, type FinalOfferLine } from "@/components/vendor/final-offer-form";
import { VendorQa, type VendorQaItem } from "@/components/vendor/vendor-qa";
import { answerInvitation, askQuestion, saveProposal, submitFinalOffer } from "../actions";

type View = {
  id: string;
  number: string;
  type: "RFQ" | "TENDER" | "SSP";
  status: string;
  deadline: string;
  techDocRequired: boolean;
  invitationStatus: "INVITED" | "ACCEPTED" | "DECLINED";
  requiredIncoterm: string;
  namedPlaceId: string;
  deliveryModeId: string;
  paymentTermId: string;
  finalOffer: { deadline: string; message: string | null; respondedAt: string | null } | null;
  lines: {
    id: string; item: string; code: string; unit: string; quantity: number; deliveryDate: string;
    deliveryPlace: string; specification: string | null;
  }[];
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The vendor's invitation (RFQ-02): details without PR prices, Accept or Decline, then the sealed proposal.
 * The vendor sees only own records (NFR-001): the view comes from public.vendor_invitation_view.
 */
export default async function VendorInvitationPage({ params }: PageProps<"/vendor/invitations/[id]">) {
  const { allowed } = await checkSection("vendorInvitations");
  if (!allowed) return <NoAccess />;
  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();

  const { data } = await supabase.rpc("vendor_invitation_view", { p_sourcing: id });
  const view = data as View | null;
  if (!view) return <NoAccess />;

  const [{ data: proposal }, incoterms, places, modes, terms] = await Promise.all([
    supabase.from("proposal").select("*").eq("sourcing_id", id).maybeSingle(),
    supabase.from("incoterm").select("code, name, is_active").order("code"),
    supabase.from("delivery_place").select("id, name, is_active").order("name"),
    supabase.from("delivery_mode").select("id, name, is_active").order("name"),
    supabase.from("payment_term").select("id, name, is_active").order("name"),
  ]);
  const [{ data: allPrices }, { data: docRows }, { data: qaRows }] = await Promise.all([
    proposal
      ? supabase.from("proposal_line").select("sourcing_line_id, unit_price, round").eq("proposal_id", proposal.id)
      : Promise.resolve({ data: [] as { sourcing_line_id: string; unit_price: number; round: number }[] }),
    proposal
      ? supabase.from("file").select("id, file_name").eq("owner_type", "proposal").eq("owner_id", proposal.id).eq("kind", "technical_document")
      : Promise.resolve({ data: [] as { id: string; file_name: string }[] }),
    supabase.rpc("vendor_qa", { p_sourcing: id }),
  ]);
  const priceRows = (allPrices ?? []).filter((r) => r.round === 1);
  const finalRows = (allPrices ?? []).filter((r) => r.round === 2);

  const deadlinePassed = new Date(view.deadline) <= new Date();
  const open = view.status === "OPEN" && !deadlinePassed;
  const remaining = open ? timeRemaining(view.deadline) : null;
  const priceOf = new Map((priceRows ?? []).map((r) => [r.sourcing_line_id, String(Number(r.unit_price).toFixed(2))]));
  const lines: ProposalLine[] = view.lines.map((l) => ({
    id: l.id, item: l.item, unit: l.unit, quantity: Number(l.quantity), deliveryDate: l.deliveryDate,
    deliveryPlace: l.deliveryPlace, specification: l.specification, price: priceOf.get(l.id) ?? "",
  }));
  const total = lines.reduce((s, l) => (l.price ? s + Number(l.price) * l.quantity : s), 0);
  const submitted = proposal?.status === "SUBMITTED";
  const finalOf = new Map(finalRows.map((r) => [r.sourcing_line_id, Number(r.unit_price)]));
  // RFQ-08 AC2: a chosen vendor during an open final-offer round
  const finalOfferOpen =
    view.status === "FINAL_OFFER_ROUND" && view.finalOffer && new Date(view.finalOffer.deadline) > new Date();
  const finalOfferLines: FinalOfferLine[] = lines
    .filter((l) => l.price)
    .map((l) => ({ id: l.id, item: l.item, unit: l.unit, quantity: l.quantity, previous: Number(l.price), final: finalOf.get(l.id) ?? null }));
  // RFQ-03 AC1, AC5: asking while OPEN with an invitation that is not declined
  const canAsk = open && view.invitationStatus !== "DECLINED";

  const active = <T extends { is_active: boolean }>(rows: T[] | null, value: (r: T) => string, label: (r: T) => string, current: string) =>
    (rows ?? []).filter((r) => r.is_active || value(r) === current).map((r) => ({ value: value(r), label: label(r) }));
  const name = (rows: { id: string; name: string }[] | null, key: string) => rows?.find((r) => r.id === key)?.name ?? "";

  const actions =
    view.invitationStatus === "INVITED" && open ? (
      <DecisionPanel
        action={answerInvitation.bind(null, id)}
        options={[
          { value: "ACCEPT", label: t("invitations.accept"), comment: "none" },
          { value: "DECLINE", label: t("invitations.decline"), variant: "outline", comment: "required", commentLabel: t("decision.reason") },
        ]}
      />
    ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={view.number}
        subtitle={t(`sourcing.types.${view.type}`)}
        status={view.status === "OPEN" ? view.invitationStatus : view.status}
        actions={actions}
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="invitation-details">
            <Field label={t("sourcing.fields.deadline")}>{formatDateTime(view.deadline)}</Field>
            <Field label={t("invitations.remaining")}>
              <span data-testid="time-remaining">
                {remaining ? t("invitations.remainingValue", remaining) : t("errors.deadlinePassed")}
              </span>
            </Field>
            <Field label={t("sourcing.fields.incoterm")}>{view.requiredIncoterm}</Field>
            <Field label={t("sourcing.fields.namedPlace")}>{name(places.data, view.namedPlaceId)}</Field>
            <Field label={t("sourcing.fields.deliveryMode")}>{name(modes.data, view.deliveryModeId)}</Field>
            <Field label={t("sourcing.fields.paymentTerm")}>{name(terms.data, view.paymentTermId)}</Field>
            {view.type === "TENDER" && (
              <Field label={t("sourcing.fields.techDoc")}>{view.techDocRequired ? t("common.yes") : t("common.no")}</Field>
            )}
          </dl>
        </CardContent>
      </Card>

      {view.invitationStatus === "DECLINED" && (
        <Alert data-testid="declined-note">
          <AlertDescription>{t("invitations.declinedNote")}</AlertDescription>
        </Alert>
      )}
      {view.invitationStatus !== "DECLINED" && !open && (
        <Alert data-testid="deadline-passed">
          <AlertDescription>{t("errors.deadlinePassed")}</AlertDescription>
        </Alert>
      )}

      {view.invitationStatus === "ACCEPTED" && proposal && open ? (
        <>
          {submitted && (
            <Alert data-testid="submitted-total">
              <AlertDescription>
                {t("proposal.submittedNote", { total: formatAmount(total) })} <StatusBadge status="SUBMITTED" />
              </AlertDescription>
            </Alert>
          )}
          <ProposalForm
            key={`${proposal.status}-${proposal.submitted_at ?? ""}`}
            action={saveProposal.bind(null, id)}
            submitted={submitted}
            techDocRequired={view.type === "TENDER" && view.techDocRequired}
            lines={lines}
            terms={{
              incoterm: proposal.incoterm,
              namedPlace: proposal.named_place_id,
              deliveryMode: proposal.delivery_mode_id,
              paymentTerm: proposal.payment_term_id,
              includesVat: proposal.prices_include_vat,
              vatRate: proposal.vat_rate ? String(Number(proposal.vat_rate)) : "",
              deliveryDays: proposal.delivery_days?.toString() ?? "",
              validityDays: proposal.validity_days?.toString() ?? "",
              comment: proposal.comment ?? "",
            }}
            options={{
              incoterms: active(incoterms.data, (r) => r.code, (r) => `${r.code} · ${r.name}`, proposal.incoterm),
              places: active(places.data, (r) => r.id, (r) => r.name, proposal.named_place_id),
              modes: active(modes.data, (r) => r.id, (r) => r.name, proposal.delivery_mode_id),
              paymentTerms: active(terms.data, (r) => r.id, (r) => r.name, proposal.payment_term_id),
            }}
            technicalDocuments={docRows ?? []}
          />
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>{t("items.columns.name")}</TableHead>
                <TableHead className="text-right">{t("requisitions.fields.quantity")}</TableHead>
                <TableHead>{t("requisitions.fields.unit")}</TableHead>
                <TableHead>{t("requisitions.fields.deliveryDate")}</TableHead>
                <TableHead>{t("requisitions.fields.deliveryPlace")}</TableHead>
                {proposal && <TableHead className="text-right">{t("proposal.fields.unitPrice")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id} data-testid="invitation-line">
                  <TableCell>
                    {l.item}
                    {l.specification && <p className="max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">{l.specification}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell>{l.unit}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(l.deliveryDate)}</TableCell>
                  <TableCell>{l.deliveryPlace}</TableCell>
                  {proposal && (
                    <TableCell className="text-right tabular-nums">
                      {l.price ? formatAmount(l.price) : t("common.none")}
                      {finalOf.has(l.id) && (
                        <span className="block text-xs text-muted-foreground">
                          {t("proposal.finalOffer.newPrice")}: {formatAmount(finalOf.get(l.id)!)}
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {finalOfferOpen && view.finalOffer && (
        <FinalOfferForm
          lines={finalOfferLines}
          deadline={view.finalOffer.deadline}
          message={view.finalOffer.message}
          respondedAt={view.finalOffer.respondedAt}
          action={submitFinalOffer.bind(null, id)}
        />
      )}

      {view.invitationStatus !== "DECLINED" && (
        <VendorQa items={(qaRows ?? []) as VendorQaItem[]} canAsk={canAsk} action={askQuestion.bind(null, id)} />
      )}
    </div>
  );
}
