import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { bakuLocalInDays, isoToBakuLocal } from "@/lib/sourcing/dates";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { HistoryTab } from "@/components/history-tab";
import { FileList } from "@/components/file-list";
import { StatusBadge } from "@/components/status-badge";
import { DecisionPanel, type DecisionOption } from "@/components/decision-panel";
import { SourcingForm } from "@/components/sourcing-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionButton, ActionDialog } from "@/components/action-dialog";
import { ComparisonView } from "@/components/sourcing/comparison-view";
import { RequestFinalOffer, SEND_FORM_ID, SendToCommittee } from "@/components/sourcing/owner-actions";
import { QaPanel, type QaItem } from "@/components/sourcing/qa-panel";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Comparison } from "@/lib/sourcing/comparison";
import type { PoListRow } from "@/lib/purchase-orders/types";
import {
  cancelLine,
  chooseWinner,
  decideSourcing,
  deleteCost,
  evaluateProposal,
  publishAnswer,
  removeJustificationFile,
  requestFinalOffer,
  saveCost,
  saveSourcing,
  sendToCommittee,
} from "../actions";

type SourcingRecord = {
  id: string;
  number: string;
  type: "RFQ" | "TENDER" | "SSP";
  method: string;
  status: string;
  value: string;
  min_proposals: number;
  deadline: string | null;
  extension_count: number;
  owner_id: string;
  required_incoterm: string | null;
  named_place_id: string | null;
  delivery_mode_id: string | null;
  payment_term_id: string | null;
  tech_doc_required: boolean;
  ssp_justification: string | null;
  low_competition_reason: string | null;
  cancel_reason: string | null;
  bids_opened_at: string | null;
  owner: { full_name: string } | null;
  ssp_vendor: { legal_name: string } | null;
};

type LineRow = {
  id: string;
  status: string;
  requisition_line: {
    quantity: string;
    delivery_date: string;
    specification: string | null;
    item: { code: string; name: string; unit: string } | null;
    place: { name: string } | null;
    requisition: { id: string; number: string } | null;
  } | null;
};

type InvitationRow = { id: string; status: string; decline_reason: string | null; vendor: { legal_name: string } | null };

const CANCELLABLE = ["DRAFT", "OPEN", "CLOSED", "AWAITING_OPENING", "TECHNICAL_EVALUATION", "COMPARISON", "FINAL_OFFER_ROUND"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Sourcing record (RFQ-01, RFQ-04, RFQ-06): number, status and the owner's actions on the right; tabs Details,
 * Invitations, Files, History. Before the bids open only the number of submitted proposals is shown (NFR-002).
 */
export default async function SourcingPage({ params }: PageProps<"/sourcing/[id]">) {
  const { user, allowed } = await checkSection("sourcing");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("sourcing")
    .select(
      "id, number, type, method, status, value, min_proposals, deadline, extension_count, owner_id, required_incoterm, named_place_id, delivery_mode_id, payment_term_id, tech_doc_required, ssp_justification, low_competition_reason, cancel_reason, bids_opened_at, owner:app_user!sourcing_owner_id_fkey(full_name), ssp_vendor:vendor!sourcing_ssp_vendor_id_fkey(legal_name)",
    )
    .eq("id", id)
    .returns<SourcingRecord[]>()
    .maybeSingle();
  if (!s) return <NoAccess />;

  const owner = s.owner_id === user.id && user.roles.includes("PROCUREMENT_SPECIALIST");
  const draft = s.status === "DRAFT";
  const admin = createAdminClient();

  const [{ data: lineData }, { data: invitationData }, { data: fileData }, count, settings, dictionaries] = await Promise.all([
    supabase
      .from("sourcing_line")
      .select(
        "id, status, requisition_line(quantity, delivery_date, specification, item(code, name, unit), place:delivery_place(name), requisition(id, number))",
      )
      .eq("sourcing_id", id)
      .returns<LineRow[]>(),
    supabase
      .from("invitation")
      .select("id, status, decline_reason, vendor:vendor(legal_name)")
      .eq("sourcing_id", id)
      .order("created_at")
      .returns<InvitationRow[]>(),
    supabase
      .from("file")
      .select("id, file_name, kind, uploaded_at")
      .eq("owner_type", "sourcing")
      .eq("owner_id", id)
      .order("uploaded_at"),
    s.status === "DRAFT" ? Promise.resolve(null) : supabase.rpc("sourcing_proposal_count", { p_id: id }),
    admin.from("setting").select("key, value").in("key", ["tender_threshold", "single_source_limit"]),
    Promise.all([
      supabase.from("incoterm").select("code, name, is_active").order("code"),
      supabase.from("delivery_place").select("id, name, is_active").order("name"),
      supabase.from("delivery_mode").select("id, name, is_active").order("name"),
      supabase.from("payment_term").select("id, name, is_active").order("name"),
    ]),
  ]);
  const lines = (lineData ?? []).filter((l) => l.requisition_line);
  const invitations = invitationData ?? [];
  const files = fileData ?? [];
  const submitted = (count?.data as number | null | undefined) ?? 0;
  const setting = (key: string) => Number((settings.data ?? []).find((r) => r.key === key)?.value ?? 0);
  const [incotermRows, placeRows, modeRows, termRows] = dictionaries.map((d) => d.data ?? []);
  const prLink = lines[0]?.requisition_line?.requisition;

  // CMT-04: the Tender's opening decision, and once it is approved the bidders' names and technical documents;
  // prices only after the technical evaluation (RFQ-05 AC1, CMT-04 AC3).
  const bidsOpen = Boolean(s.bids_opened_at);
  const canReadQa = user.roles.some((r) => r === "PROCUREMENT_SPECIALIST" || r === "ADMIN");
  type ProposalRow = { id: string; status: string; disqualify_reason: string | null; submitted_at: string | null; vendor: { legal_name: string } | null };
  type QuestionRow = {
    id: string; question_text: string | null; published_question_text: string | null; answer_text: string | null;
    status: "UNANSWERED" | "PUBLISHED"; asked_at: string; published_at: string | null; vendor: { legal_name: string } | null;
  };
  const [{ data: decisionData }, { data: proposalData }, comparisonResult, { data: questionData }] = await Promise.all([
    supabase.from("decision").select("id, type, status").eq("sourcing_id", id).in("type", ["OPENING", "WINNER"]).order("opened_at", { ascending: false }),
    bidsOpen
      ? supabase
          .from("proposal")
          .select("id, status, disqualify_reason, submitted_at, vendor:vendor(legal_name)")
          .eq("sourcing_id", id)
          .in("status", ["SUBMITTED", "PASSED", "DISQUALIFIED", "AWARDED", "NOT_AWARDED"])
          .order("submitted_at")
          .returns<ProposalRow[]>()
      : Promise.resolve({ data: [] as ProposalRow[] }),
    supabase.rpc("sourcing_comparison", { p_id: id }),
    canReadQa && !draft
      ? supabase
          .from("question")
          .select("id, question_text, published_question_text, answer_text, status, asked_at, published_at, vendor:vendor(legal_name)")
          .eq("sourcing_id", id)
          .order("asked_at")
          .returns<QuestionRow[]>()
      : Promise.resolve({ data: [] as QuestionRow[] }),
  ]);
  const opening = (decisionData ?? []).find((d) => d.type === "OPENING") ?? null;
  const winnerDecision = (decisionData ?? []).find((d) => d.type === "WINNER") ?? null;
  const proposals = proposalData ?? [];
  const comparison = comparisonResult.data as Comparison | null;
  const questions = questionData ?? [];
  const { data: questionFiles } =
    questions.length > 0
      ? await supabase.from("file").select("id, file_name, owner_id").eq("owner_type", "question").in("owner_id", questions.map((q) => q.id))
      : { data: [] as { id: string; file_name: string; owner_id: string }[] };
  const qaItems: QaItem[] = questions.map((q) => ({
    id: q.id, vendorName: q.vendor?.legal_name ?? null, questionText: q.question_text, publishedText: q.published_question_text,
    answer: q.answer_text, status: q.status, askedAt: q.asked_at, publishedAt: q.published_at,
    files: (questionFiles ?? []).filter((f) => f.owner_id === q.id),
  }));
  const evaluating = owner && s.status === "TECHNICAL_EVALUATION";
  const unmarked = proposals.filter((p) => p.status === "SUBMITTED").length;
  const comparing = owner && s.status === "COMPARISON";
  const { data: proposalFiles } =
    proposals.length > 0
      ? await supabase.from("file").select("id, file_name, owner_id").eq("owner_type", "proposal").in("owner_id", proposals.map((p) => p.id))
      : { data: [] as { id: string; file_name: string; owner_id: string }[] };

  // Slice 7 (PO-01): the sourcing's purchase orders. A sourcing with a PO other than REJECTED or DECLINED_BY_VENDOR cannot be
  // cancelled (RFQ-04 AC6); the owner cancels its open lines instead.
  const { data: poData } = draft ? { data: [] as PoListRow[] } : await supabase.rpc("po_list");
  const purchaseOrders = ((poData ?? []) as PoListRow[]).filter((po) => po.sourcing_id === id);
  const hasLivePo = purchaseOrders.some((po) => po.status !== "REJECTED" && po.status !== "DECLINED_BY_VENDOR");

  const invitees = draft && owner ? ((await supabase.rpc("sourcing_invitees", { p_id: id })).data ?? []) : [];

  // Dictionary entries: active ones, plus the one already chosen
  const options = <T extends { is_active: boolean }>(rows: T[], value: (r: T) => string, label: (r: T) => string, current: string | null) =>
    rows.filter((r) => r.is_active || value(r) === current).map((r) => ({ value: value(r), label: label(r) }));
  const labelOf = (rows: { id?: string; code?: string; name: string }[], key: string | null) =>
    rows.find((r) => (r.id ?? r.code) === key)?.name ?? t("common.none");

  const belowMinimum = s.status === "CLOSED";
  const reason =
    s.type === "SSP"
      ? t("sourcing.reason.SSP")
      : t(s.type === "TENDER" ? "sourcing.reason.TENDER" : "sourcing.reason.RFQ", {
          value: formatAmount(s.value),
          threshold: formatAmount(setting("tender_threshold")),
        });

  const decisionOptions: DecisionOption[] = [];
  if (owner && belowMinimum) {
    {
      decisionOptions.push({
        value: "EXTEND",
        label: t("sourcing.actions.extend"),
        comment: "required",
        commentLabel: t("sourcing.fields.extendReason"),
        field: { name: "deadline", label: t("sourcing.fields.newDeadline"), type: "datetime-local" },
      });
    }
    if (submitted > 0) {
      decisionOptions.push({
        value: "CONTINUE",
        label: t("sourcing.actions.continue"),
        variant: "outline",
        comment: "required",
        commentLabel: t("sourcing.fields.continueReason"),
      });
    }
  }
  if (owner && CANCELLABLE.includes(s.status) && !hasLivePo) {
    decisionOptions.push({
      value: "CANCEL",
      label: t("sourcing.actions.cancel"),
      variant: "destructive",
      comment: "required",
      commentLabel: t("decision.reason"),
    });
  }
  const extendDisabled = belowMinimum && s.extension_count >= 2;
  const filteredOptions = extendDisabled ? decisionOptions.filter((o) => o.value !== "EXTEND") : decisionOptions;

  const finalOfferDays = comparison?.sourcing.finalOfferDays ?? 2;
  const actions =
    filteredOptions.length > 0 || extendDisabled || comparing ? (
      <div className="flex items-start gap-2">
        {comparing && comparison && (
          <RequestFinalOffer
            action={requestFinalOffer.bind(null, s.id)}
            vendors={comparison.vendors.map((v) => ({ vendorId: v.vendorId, name: v.name }))}
            defaultDeadline={bakuLocalInDays(finalOfferDays)}
            used={comparison.sourcing.finalOfferRoundsUsed >= comparison.sourcing.finalOfferRoundsMax}
          />
        )}
        <div className="flex flex-col items-end gap-2">
          <DecisionPanel action={decideSourcing.bind(null, s.id)} options={filteredOptions} />
          {extendDisabled && (
            <p className="text-xs text-muted-foreground" data-testid="max-extensions">
              {t("errors.maxExtensions")}
            </p>
          )}
        </div>
        {comparing && <SendToCommittee action={sendToCommittee.bind(null, s.id)} />}
      </div>
    ) : undefined;
  const defaultTab = comparison ? "comparison" : evaluating ? "proposals" : "details";

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        title={s.number}
        tag={t(`sourcing.types.${s.type}`)}
        subtitle={reason || undefined}
        status={s.status}
        actions={actions}
      />

      {belowMinimum && (
        <Alert className="surface-warning" data-testid="below-minimum">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>{t("sourcing.belowMinimum", { count: submitted, minimum: s.min_proposals })}</AlertTitle>
          <AlertDescription>{t(submitted > 0 ? "sourcing.belowMinimumHint" : "sourcing.belowMinimumNone")}</AlertDescription>
        </Alert>
      )}
      {s.status === "CANCELLED" && s.cancel_reason && (
        <Alert variant="destructive" data-testid="cancel-reason">
          <AlertTitle>{t("sourcing.cancelledTitle")}</AlertTitle>
          <AlertDescription>{s.cancel_reason}</AlertDescription>
        </Alert>
      )}
      {owner && hasLivePo && s.status === "COMPARISON" && (
        <Alert data-testid="cancel-blocked">
          <AlertDescription>{t("sourcing.purchaseOrders.cancelBlocked")}</AlertDescription>
        </Alert>
      )}
      {opening && (
        <Alert data-testid="opening-decision">
          <AlertTitle>{t("sourcing.proposals.committeeDecision")}</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <StatusBadge status={opening.status} />
            <Link href={`/decisions/${opening.id}`} className="text-primary hover:underline" data-testid="opening-decision-link">
              {t("sourcing.proposals.openDecision")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {winnerDecision && (
        <Alert data-testid="winner-decision">
          <AlertTitle>{t("sourcing.comparison.winnerDecision")}</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <StatusBadge status={winnerDecision.status} />
            <Link href={`/decisions/${winnerDecision.id}`} className="text-primary hover:underline" data-testid="winner-decision-link">
              {t("sourcing.comparison.openDecision")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {s.low_competition_reason && !comparison && (
        <Alert data-testid="continue-reason">
          <AlertTitle>{t("sourcing.continuedTitle")}</AlertTitle>
          <AlertDescription>{s.low_competition_reason}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="details">{t("record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="invitations">
            {t("sourcing.tabs.invitations")} ({invitations.length})
          </TabsTrigger>
          {bidsOpen && <TabsTrigger value="proposals">{t("sourcing.tabs.proposals")}</TabsTrigger>}
          {comparison && <TabsTrigger value="comparison">{t("sourcing.tabs.comparison")}</TabsTrigger>}
          {canReadQa && !draft && (
            <TabsTrigger value="qa">
              {t("sourcing.tabs.qa")} ({qaItems.length})
            </TabsTrigger>
          )}
          {purchaseOrders.length > 0 && (
            <TabsTrigger value="purchaseOrders">
              {t("sourcing.tabs.purchaseOrders")} ({purchaseOrders.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="files">{t("record.tabs.files")}</TabsTrigger>
          <TabsTrigger value="history">{t("record.tabs.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="flex flex-col gap-5 pt-4">
          {draft && owner ? (
            <SourcingForm
              action={saveSourcing.bind(null, s.id)}
              type={s.type}
              minimum={s.min_proposals}
              initial={{
                deadline: isoToBakuLocal(s.deadline),
                incoterm: s.required_incoterm ?? "",
                namedPlace: s.named_place_id ?? "",
                deliveryMode: s.delivery_mode_id ?? "",
                paymentTerm: s.payment_term_id ?? "",
                techDoc: s.tech_doc_required,
                justification: s.ssp_justification ?? "",
              }}
              incoterms={options(incotermRows as { code: string; name: string; is_active: boolean }[], (r) => r.code, (r) => `${r.code} · ${r.name}`, s.required_incoterm)}
              places={options(placeRows as { id: string; name: string; is_active: boolean }[], (r) => r.id, (r) => r.name, s.named_place_id)}
              modes={options(modeRows as { id: string; name: string; is_active: boolean }[], (r) => r.id, (r) => r.name, s.delivery_mode_id)}
              paymentTerms={options(termRows as { id: string; name: string; is_active: boolean }[], (r) => r.id, (r) => r.name, s.payment_term_id)}
              invitees={(invitees as { vendor_id: string; legal_name: string; grade: string | null; excluded: boolean }[]).map((i) => ({
                vendorId: i.vendor_id,
                name: i.legal_name,
                grade: i.grade,
                excluded: i.excluded,
              }))}
              justificationFiles={files.map((f) => ({ id: f.id, file_name: f.file_name }))}
              removeFile={removeJustificationFile.bind(null, s.id)}
            />
          ) : (
            <Card>
              <CardContent>
                <dl className="grid grid-cols-4 gap-x-8 gap-y-5" data-testid="sourcing-details">
                  <Field label={t("sourcing.fields.owner")}>{s.owner?.full_name}</Field>
                  <Field label={t("sourcing.fields.value")}>
                    <span className="font-semibold tabular-nums">{formatAmount(s.value)}</span>
                  </Field>
                  <Field label={t("sourcing.fields.minimum")}>{s.min_proposals}</Field>
                  <Field label={t("sourcing.fields.pr")}>
                    {prLink ? (
                      <Link href={`/requisitions/${prLink.id}`} className="text-primary hover:underline">
                        {prLink.number}
                      </Link>
                    ) : null}
                  </Field>
                  <Field label={t("sourcing.fields.deadline")}>{s.deadline ? formatDateTime(s.deadline) : t("common.none")}</Field>
                  <Field label={t("sourcing.fields.extensions")}>{s.extension_count}</Field>
                  <Field label={t("sourcing.fields.incoterm")}>{s.required_incoterm ?? t("common.none")}</Field>
                  <Field label={t("sourcing.fields.namedPlace")}>{labelOf(placeRows as { id: string; name: string }[], s.named_place_id)}</Field>
                  <Field label={t("sourcing.fields.deliveryMode")}>{labelOf(modeRows as { id: string; name: string }[], s.delivery_mode_id)}</Field>
                  <Field label={t("sourcing.fields.paymentTerm")}>{labelOf(termRows as { id: string; name: string }[], s.payment_term_id)}</Field>
                  {s.type === "TENDER" && (
                    <Field label={t("sourcing.fields.techDoc")}>{s.tech_doc_required ? t("common.yes") : t("common.no")}</Field>
                  )}
                  {s.type === "SSP" && <Field label={t("sourcing.fields.sspVendor")}>{s.ssp_vendor?.legal_name}</Field>}
                  {s.type === "SSP" && s.ssp_justification && (
                    <Field label={t("sourcing.fields.justification")}>{s.ssp_justification}</Field>
                  )}
                  {s.status === "OPEN" && (
                    <Field label={t("sourcing.fields.proposals")}>
                      <span data-testid="proposal-count">{t("sourcing.proposalsOf", { count: submitted, minimum: s.min_proposals })}</span>
                    </Field>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          <div className="surface-solid overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("items.columns.name")}</TableHead>
                  <TableHead className="text-right">{t("requisitions.fields.quantity")}</TableHead>
                  <TableHead>{t("requisitions.fields.unit")}</TableHead>
                  <TableHead>{t("requisitions.fields.deliveryDate")}</TableHead>
                  <TableHead>{t("requisitions.fields.deliveryPlace")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.id} data-testid="sourcing-line-row">
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      {l.requisition_line?.item?.name}
                      {l.requisition_line?.specification && (
                        <p className="max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">{l.requisition_line.specification}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.requisition_line?.quantity)}</TableCell>
                    <TableCell>{l.requisition_line?.item?.unit}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.requisition_line ? formatDate(l.requisition_line.delivery_date) : null}
                    </TableCell>
                    <TableCell>{l.requisition_line?.place?.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invitations" className="pt-4">
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sourcing.invitees.none")}</p>
          ) : (
            <div className="surface-solid overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>{t("sourcing.invitees.vendor")}</TableHead>
                    <TableHead>{t("sourcing.columns.status")}</TableHead>
                    <TableHead>{t("sourcing.invitees.declineReason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((i) => (
                    <TableRow key={i.id} data-testid="invitation-row">
                      <TableCell className="font-medium">{i.vendor?.legal_name}</TableCell>
                      <TableCell>
                        <StatusBadge status={i.status} />
                      </TableCell>
                      <TableCell>{i.decline_reason ?? t("common.none")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {bidsOpen && (
          <TabsContent value="proposals" className="flex flex-col gap-3 pt-4">
            <div className="surface-solid overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>{t("sourcing.proposals.vendor")}</TableHead>
                    <TableHead>{t("sourcing.proposals.submitted")}</TableHead>
                    <TableHead>{t("sourcing.proposals.documents")}</TableHead>
                    <TableHead>{t("sourcing.proposals.result")}</TableHead>
                    {evaluating && <TableHead className="text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p) => {
                    const docs = (proposalFiles ?? []).filter((f) => f.owner_id === p.id);
                    const last = unmarked === 1 && p.status === "SUBMITTED";
                    return (
                      <TableRow key={p.id} data-testid="proposal-row" data-status={p.status}>
                        <TableCell className="font-medium">{p.vendor?.legal_name}</TableCell>
                        <TableCell>{p.submitted_at ? formatDateTime(p.submitted_at) : t("common.none")}</TableCell>
                        <TableCell>
                          {docs.length === 0
                            ? t("sourcing.proposals.none")
                            : docs.map((f) => (
                                <a key={f.id} href={`/api/files/${f.id}`} className="block text-primary hover:underline">
                                  {f.file_name}
                                </a>
                              ))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                          {p.disqualify_reason && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{p.disqualify_reason}</p>}
                        </TableCell>
                        {evaluating && (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {p.status === "SUBMITTED" &&
                                (last ? (
                                  <ActionDialog
                                    action={evaluateProposal.bind(null, s.id)}
                                    trigger={t("sourcing.proposals.pass")}
                                    triggerSize="sm"
                                    title={`${t("sourcing.proposals.pass")}: ${p.vendor?.legal_name ?? ""}`}
                                    description={t("sourcing.proposals.lastConfirm")}
                                    hidden={{ proposal: p.id, decision: "PASSED" }}
                                    testId="pass-proposal"
                                  />
                                ) : (
                                  <ActionButton
                                    action={evaluateProposal.bind(null, s.id)}
                                    label={t("sourcing.proposals.pass")}
                                    hidden={{ proposal: p.id, decision: "PASSED" }}
                                    size="sm"
                                    testId="pass-proposal"
                                  />
                                ))}
                              {(p.status === "SUBMITTED" || p.status === "PASSED") && (
                                <ActionDialog
                                  action={evaluateProposal.bind(null, s.id)}
                                  trigger={t("sourcing.proposals.disqualify")}
                                  triggerSize="sm"
                                  triggerVariant="destructive"
                                  title={`${t("sourcing.proposals.disqualify")}: ${p.vendor?.legal_name ?? ""}`}
                                  description={last ? t("sourcing.proposals.lastConfirm") : undefined}
                                  hidden={{ proposal: p.id, decision: "DISQUALIFIED" }}
                                  submitVariant="destructive"
                                  testId="disqualify-proposal"
                                >
                                  <Label htmlFor={`dq-${p.id}`}>
                                    {t("sourcing.proposals.disqualifyReason")}
                                    <span className="text-destructive" aria-hidden>*</span>
                                  </Label>
                                  <Textarea id={`dq-${p.id}`} name="reason" rows={3} required />
                                </ActionDialog>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {s.type === "TENDER" && s.status === "TECHNICAL_EVALUATION" && (
              <p className="text-xs text-muted-foreground" data-testid="prices-sealed">
                {evaluating ? t("sourcing.proposals.markHint") : t("sourcing.proposals.sealed")}
              </p>
            )}
          </TabsContent>
        )}

        {comparison && (
          <TabsContent value="comparison" className="pt-4">
            <ComparisonView
              data={comparison}
              sendFormId={comparing ? SEND_FORM_ID : undefined}
              actions={
                comparing
                  ? {
                      chooseWinner: chooseWinner.bind(null, s.id),
                      cancelLine: cancelLine.bind(null, s.id),
                      saveCost: saveCost.bind(null, s.id),
                      deleteCost: deleteCost.bind(null, s.id),
                      disqualify: evaluateProposal.bind(null, s.id),
                    }
                  : undefined
              }
            />
          </TabsContent>
        )}

        {canReadQa && !draft && (
          <TabsContent value="qa" className="pt-4">
            <QaPanel
              items={qaItems}
              publish={publishAnswer.bind(null, s.id)}
              canAnswer={owner && !["COMPLETED", "CANCELLED"].includes(s.status)}
              canClarify={owner && s.status === "OPEN"}
            />
          </TabsContent>
        )}

        {purchaseOrders.length > 0 && (
          <TabsContent value="purchaseOrders" className="pt-4">
            <div className="surface-solid overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>{t("purchaseOrders.columns.number")}</TableHead>
                    <TableHead>{t("purchaseOrders.columns.vendor")}</TableHead>
                    <TableHead className="text-right">{t("purchaseOrders.columns.total")}</TableHead>
                    <TableHead className="text-right">{t("purchaseOrders.columns.totalInclVat")}</TableHead>
                    <TableHead>{t("purchaseOrders.columns.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow key={po.id} data-testid="sourcing-po-row">
                      <TableCell>
                        <Link href={`/purchase-orders/${po.id}`} className="font-medium text-primary hover:underline" data-testid="sourcing-po-link">
                          {po.number}
                        </Link>
                      </TableCell>
                      <TableCell>{po.vendor_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(po.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(po.total_incl_vat)}</TableCell>
                      <TableCell>
                        <StatusBadge status={po.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}

        <TabsContent value="files" className="pt-4">
          <FileList files={files} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab recordType="sourcing" recordId={s.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
