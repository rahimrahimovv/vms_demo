/**
 * Slice 6 (RFQ-03, RFQ-05, RFQ-06 AC6-AC7, RFQ-07, RFQ-08, CMT-02 AC2 and AC9, CMT-04 AC3) against vms-dev.
 * Throwaway users and four vendors on the AVL work on their own category, item and plan line; a throwaway committee
 * replaces the demo committee for the run and the demo committee is put back exactly as it was. Deadlines are moved
 * into the past with SQL and the jobs are run directly, as pg_cron does every minute. Test values are the backlog's
 * Calculation Rules examples (33.04 with 18% VAT -> 28.00; Beta Trade 29.50 + delivery 1.00 = 30.50; final offer
 * 28.00 -> 27.50 allowed, 28.00 -> 28.50 refused; tie -> earlier submitted proposal).
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { removeTestData } from "./helpers/dev-cleanup";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const CENTRAL = "00000000-0000-4000-8000-000000000301";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Internal = "specialist" | "specialist2" | "requester" | "approver" | "admin" | "cm1" | "cm2" | "cm3";
type Vendor = "vendorA" | "vendorB" | "vendorC" | "vendorD";
type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<Internal | Vendor, Actor>;
let root = "";
let item = "";
let planLine = "";
let otherPlace = "";
let mode = "";
let payment = "";
let committeeBackup: { days: number; members: { user_id: string; is_chair: boolean }[] } | null = null;

const anon = () => createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}
async function internal(key: Internal, roles: string[]) {
  const email = `rls6-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS6 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: data.user.id, role })));
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}
async function vendor(key: Vendor, ownerId = `HEAD6-${key}-${RUN}`) {
  const email = `rls6-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error: authError } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (authError) throw authError;
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS6 ${key} ${RUN}`, voen: `97${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ", legal_address: "Test street 6", director_name: "Test Director", is_vat_payer: true,
      contact_person: "Test Contact", contact_email: email, phone: "+994500000006", founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: ownerId, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0006", swift: "TESTAZ22", currency: "AZN", is_main: true }],
  });
  if (error) throw error;
  await db.query("update public.vendor set status = 'APPROVED', standing = 'ACTIVE' where id = $1", [vendorId]);
  await db.query(
    `insert into public.questionnaire_response (company_id, vendor_id, attempt_no, status, score, grade, valid_until)
     values ($1, $2, 1, 'GRADED', 80, 'B', app.today() + 300)`, [COMPANY_ID, vendorId]);
  await db.query(
    `insert into public.category_application (company_id, vendor_id, category_id, status, valid_until)
     values ($1, $2, $3, 'QUALIFIED', app.today() + 300)`, [COMPANY_ID, vendorId, root]);
  actors[key] = { id: data.user.id, email, client: await signIn(email), vendorId };
}

const plusDays = async (n: number) => (await db.query("select (app.today() + $1::int)::text as d", [n])).rows[0].d as string;
async function approvedPr(lines: { quantity: number; price: number }[]) {
  const date = await plusDays(30);
  const saved = await actors.requester.client.rpc("requisition_save", {
    p_id: null, p_plan_line_id: planLine, p_submit: true,
    p_lines: lines.map((l) => ({ item_id: item, quantity: l.quantity, estimated_unit_price: l.price, delivery_date: date, delivery_place_id: CENTRAL, specification: "RLS6 line" })),
  });
  if (saved.error) throw saved.error;
  const decided = await actors.approver.client.rpc("requisition_decide", { p_id: saved.data, p_decision: "APPROVE", p_comment: null });
  if (decided.error) throw decided.error;
  return saved.data as string;
}
async function start(lines: { quantity: number; price: number }[], ssp?: Vendor) {
  const pr = await approvedPr(lines);
  const { data, error } = await actors.specialist.client.rpc("sourcing_start", {
    p_requisition: pr, p_method: ssp ? "SINGLE_SOURCE" : "COMPETITIVE", p_ssp_vendor: ssp ? actors[ssp].vendorId : undefined,
  });
  if (error) throw error;
  const id = data as string;
  const c = actors.specialist.client;
  const saved = await c.rpc("sourcing_save", {
    p_id: id, p_deadline: new Date(Date.now() + 72 * 3600_000).toISOString(), p_incoterm: "DDP", p_named_place: CENTRAL,
    p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: "", p_excluded: [],
  });
  if (saved.error) throw saved.error;
  const published = await c.rpc("sourcing_publish", { p_id: id });
  if (published.error) throw published.error;
  return id;
}
const lineIds = async (sourcingId: string) =>
  (await db.query("select sl.id from public.sourcing_line sl join public.requisition_line rl on rl.id = sl.requisition_line_id where sl.sourcing_id = $1 order by rl.quantity desc", [sourcingId])).rows.map((r) => r.id as string);
type OfferOpts = { prices: (number | null)[]; vat?: number; incoterm?: string; place?: string };
async function offer(key: Vendor, sourcingId: string, o: OfferOpts) {
  const c = actors[key].client;
  const accepted = await c.rpc("invitation_accept", { p_sourcing: sourcingId });
  if (accepted.error) throw accepted.error;
  const ids = await lineIds(sourcingId);
  const terms = {
    incoterm: o.incoterm ?? "DDP", named_place_id: o.place ?? CENTRAL, delivery_mode_id: mode, payment_term_id: payment,
    prices_include_vat: Boolean(o.vat), vat_rate: o.vat ?? 0, delivery_days: 20, validity_days: 30, comment: "",
  };
  const saved = await c.rpc("proposal_save", {
    p_sourcing: sourcingId, p_terms: terms, p_submit: true,
    p_lines: ids.map((id, i) => ({ sourcing_line_id: id, unit_price: o.prices[i] ?? null })).filter((l) => l.unit_price !== null),
  });
  if (saved.error) throw saved.error;
}
async function closeNow(id: string) {
  await db.query("update public.sourcing set deadline = now() - interval '1 second' where id = $1", [id]);
  await db.query("select app.close_due_sourcings()");
}
const sourcingRow = async (id: string) => (await db.query("select * from public.sourcing where id = $1", [id])).rows[0];
const proposalOf = async (sourcingId: string, key: Vendor) =>
  (await db.query("select * from public.proposal where sourcing_id = $1 and vendor_id = $2", [sourcingId, actors[key].vendorId])).rows[0];
const decisionsOf = async (sourcingId: string, type: string) =>
  (await db.query("select * from public.decision where sourcing_id = $1 and type = $2 order by opened_at", [sourcingId, type])).rows;
const vote = async (key: Internal, decision: string, v: "FOR" | "AGAINST", comment = "") => {
  const r = await actors[key].client.rpc("decision_vote", { p_decision: decision, p_vote: v, p_comment: comment });
  if (r.error) throw r.error;
};
const notified = async (key: Internal | Vendor, event: string, sourcingId: string) =>
  (await db.query("select params from public.notification where user_id = $1 and event = $2 and record_id = $3", [actors[key].id, event, sourcingId])).rows;
type Cell = { proposalId: string; unitExclVat: number; firstExclVat: number | null; extra: number; evaluated: number; lineTotal: number; excluded: boolean };
type Line = { id: string; eligibleCount: number; defaultProposalId: string | null; chosenProposalId: string | null; manual: boolean; notLowest: boolean; cells: Cell[] };
type Comparison = {
  sourcing: { type: string; needsLowCompetitionReason: boolean; lowCompetitionReason: string | null; sspJustification: string | null };
  vendors: { proposalId: string; name: string; differentTerms: string[]; sharedOwners: string[]; finalOffer: { respondedAt: string | null } | null }[];
  lines: Line[];
  disqualified: { name: string; reason: string }[];
  purchaseOrders: { name: string; total: number; lines: number }[];
  committeeComments: { comment: string }[];
};
const comparison = async (key: Internal | Vendor, id: string) =>
  (await actors[key].client.rpc("sourcing_comparison", { p_id: id })).data as Comparison | null;
const cellOf = (c: Comparison, lineIndex: number, proposalId: string) => c.lines[lineIndex].cells.find((x) => x.proposalId === proposalId)!;
const visiblePrices = async (key: Internal | Vendor, sourcingId: string) => {
  const ids = (await db.query("select id from public.proposal where sourcing_id = $1", [sourcingId])).rows.map((r) => r.id);
  return (await actors[key].client.from("proposal_line").select("proposal_id, round, unit_price").in("proposal_id", ids)).data ?? [];
};

beforeAll(async () => {
  await db.connect();
  const c = await db.query("select voting_period_days from public.committee where company_id = $1", [COMPANY_ID]);
  const m = await db.query("select user_id, is_chair from public.committee_member");
  committeeBackup = { days: c.rows[0]?.voting_period_days ?? 3, members: m.rows };

  await internal("specialist", ["PROCUREMENT_SPECIALIST"]);
  await internal("specialist2", ["PROCUREMENT_SPECIALIST"]);
  await internal("requester", ["REQUESTER"]);
  await internal("approver", ["APPROVER"]);
  await internal("admin", ["ADMIN"]);
  for (const key of ["cm1", "cm2", "cm3"] as const) await internal(key, ["COMMITTEE_MEMBER"]);

  const admin = actors.admin.client;
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS6 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS6-${RUN}`, p_name: "RLS6 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS6 plan ${RUN}`, p_planned_amount: 100, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  otherPlace = (await db.query("select id from public.delivery_place where id <> $1 order by name limit 1", [CENTRAL])).rows[0].id;
  const m1 = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS6 mode ${RUN}`, p_is_active: true });
  if (m1.error) throw m1.error;
  mode = m1.data as string;
  const p1 = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS6 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
  if (p1.error) throw p1.error;
  payment = p1.data as string;

  await vendor("vendorA");
  await vendor("vendorB", `SHARED6-${RUN}`);
  await vendor("vendorC", `SHARED6-${RUN}`); // shares an owner with B (REG-06 AC8)
  await vendor("vendorD");

  const saved = await admin.rpc("committee_save", { p_members: ["cm1", "cm2", "cm3"].map((k) => actors[k as Internal].id), p_chair: actors.cm1.id, p_voting_days: 3 });
  if (saved.error) throw saved.error;
}, 300_000);

afterAll(async () => {
  try {
    if (committeeBackup) {
      await db.query("delete from public.committee_member");
      const committee = (await db.query("select id from public.committee where company_id = $1", [COMPANY_ID])).rows[0];
      for (const m of committeeBackup.members) {
        await db.query("insert into public.committee_member (committee_id, user_id, is_chair) values ($1, $2, $3)", [committee.id, m.user_id, m.is_chair]);
      }
      await db.query("update public.committee set voting_period_days = $1 where company_id = $2", [committeeBackup.days, COMPANY_ID]);
    }
    await removeTestData(db, service, "rls6");
  } finally {
    await db.end();
  }
}, 300_000);

describe("RFQ-03 Q&A", () => {
  let id = "";
  beforeAll(async () => {
    id = await start([{ quantity: 10, price: 25 }]); // RFQ, vendors A-D invited
    const declined = await actors.vendorD.client.rpc("invitation_decline", { p_sourcing: id, p_reason: "No stock" });
    if (declined.error) throw declined.error;
  });

  it("AC1: an invited vendor asks (up to 2,000 characters); the owner is notified; it shows as UNANSWERED", async () => {
    expect((await actors.vendorA.client.rpc("question_ask", { p_sourcing: id, p_text: "x".repeat(2001) })).error?.message).toBe("errors.questionTooLong");
    expect((await actors.vendorA.client.rpc("question_ask", { p_sourcing: id, p_text: "  " })).error?.message).toBe("errors.required");
    const asked = await actors.vendorA.client.rpc("question_ask", { p_sourcing: id, p_text: "Can delivery be split into two shipments?" });
    expect(asked.error).toBeNull();
    expect((await notified("specialist", "question.received", id))).toHaveLength(1);
    const mine = (await actors.vendorA.client.rpc("vendor_qa", { p_sourcing: id })).data as { status: string; own: boolean }[];
    expect(mine).toEqual([expect.objectContaining({ status: "UNANSWERED", own: true })]);
    // a declined vendor cannot ask, and another vendor does not see the unanswered question
    expect((await actors.vendorD.client.rpc("question_ask", { p_sourcing: id, p_text: "Hello" })).error?.message).toBe("errors.questionsClosed");
    expect((await actors.vendorB.client.rpc("vendor_qa", { p_sourcing: id })).data).toEqual([]);
    expect((await actors.vendorB.client.from("question").select("id").eq("sourcing_id", id)).data).toEqual([]);
  });

  it("AC2-AC3: published with an edited text to every vendor not declined, without the asker; original in History", async () => {
    const q = (await db.query("select id from public.question where sourcing_id = $1", [id])).rows[0].id;
    expect((await actors.specialist2.client.rpc("question_publish", { p_sourcing: id, p_question: q, p_question_text: "", p_answer: "Yes" })).error?.message).toBe("errors.noAccess");
    expect((await actors.specialist.client.rpc("question_publish", { p_sourcing: id, p_question: q, p_question_text: "", p_answer: " " })).error?.message).toBe("errors.required");
    const r = await actors.specialist.client.rpc("question_publish", {
      p_sourcing: id, p_question: q, p_question_text: "Can delivery be split into shipments?", p_answer: "Yes, two shipments before the delivery date.",
    });
    expect(r.error).toBeNull();
    const seenByB = (await actors.vendorB.client.rpc("vendor_qa", { p_sourcing: id })).data as Record<string, unknown>[];
    expect(seenByB).toEqual([expect.objectContaining({ question: "Can delivery be split into shipments?", answer: "Yes, two shipments before the delivery date.", own: false })]);
    expect(Object.keys(seenByB[0])).not.toContain("vendor_id");
    expect((await actors.vendorD.client.rpc("vendor_qa", { p_sourcing: id })).data).toEqual([]);
    expect(await notified("vendorB", "qa.published", id)).toHaveLength(1);
    expect(await notified("vendorD", "qa.published", id)).toHaveLength(0);
    const audit = (await db.query("select from_status, to_status, reason from public.audit_entry where record_type = 'question' and record_id = $1 order by created_at", [q])).rows;
    expect(audit.at(-1)).toMatchObject({ from_status: "UNANSWERED", to_status: "PUBLISHED", reason: "Original question: Can delivery be split into two shipments?" });
  });

  it("AC4-AC5: a clarification without a question; once closed, asking is refused and items stay readable", async () => {
    expect((await actors.specialist.client.rpc("question_publish", { p_sourcing: id, p_question: null, p_question_text: "", p_answer: "The site is closed on Sundays." })).error).toBeNull();
    expect(((await actors.vendorC.client.rpc("vendor_qa", { p_sourcing: id })).data as unknown[]).length).toBe(2);
    await closeNow(id);
    expect((await actors.vendorB.client.rpc("question_ask", { p_sourcing: id, p_text: "Late question" })).error?.message).toBe("errors.questionsClosed");
    expect(((await actors.vendorB.client.rpc("vendor_qa", { p_sourcing: id })).data as unknown[]).length).toBe(2);
  });
});

describe("Tender: technical evaluation, comparison, extra costs, final offer, winner decision (backlog Scenario A)", () => {
  let id = "";
  let pA = "";
  let pB = "";
  let pC = "";
  beforeAll(async () => {
    id = await start([{ quantity: 2000, price: 30 }]); // 60,000.00 -> Tender, minimum 3
    await offer("vendorA", id, { prices: [33.04], vat: 18 });                       // 28.00 excluding VAT
    await offer("vendorB", id, { prices: [29.5], incoterm: "CIP", place: otherPlace }); // different terms
    await offer("vendorC", id, { prices: [27] });
    await closeNow(id);
    const [opening] = await decisionsOf(id, "OPENING");
    for (const k of ["cm1", "cm2", "cm3"] as const) await vote(k, opening.id, "FOR");
    expect((await sourcingRow(id)).status).toBe("TECHNICAL_EVALUATION");
    [pA, pB, pC] = [(await proposalOf(id, "vendorA")).id, (await proposalOf(id, "vendorB")).id, (await proposalOf(id, "vendorC")).id];
  });

  it("RFQ-05 AC1, CMT-04 AC3: pass/fail without prices; the last mark opens the prices of PASSED proposals only", async () => {
    expect(await visiblePrices("specialist", id)).toEqual([]);
    expect(await comparison("specialist", id)).toBeNull();
    expect((await actors.specialist2.client.rpc("proposal_evaluate", { p_proposal: pA, p_result: "PASSED", p_reason: null })).error?.message).toBe("errors.noAccess");
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pC, p_result: "DISQUALIFIED", p_reason: "" })).error?.message).toBe("errors.required");
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pC, p_result: "DISQUALIFIED", p_reason: "Missing product certificate" })).error).toBeNull();
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pC, p_result: "PASSED", p_reason: null })).error?.message).toBe("errors.statusChanged");
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pA, p_result: "PASSED", p_reason: null })).error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("TECHNICAL_EVALUATION");
    expect(await visiblePrices("specialist", id)).toEqual([]); // still sealed until every proposal is marked
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pB, p_result: "PASSED", p_reason: null })).error).toBeNull();
    const s = await sourcingRow(id);
    expect(s.status).toBe("COMPARISON");
    expect(s.prices_opened_at).not.toBeNull();
  });

  it("NFR-002: PASSED prices for the owner, the committee and the Admin; never the disqualified one; not the Approver or vendors' others", async () => {
    for (const k of ["specialist", "cm1", "admin"] as const) {
      const rows = await visiblePrices(k, id);
      expect(rows.map((r) => r.proposal_id).sort()).toEqual([pA, pB].sort());
    }
    expect(await visiblePrices("approver", id)).toEqual([]);
    expect(await comparison("approver", id)).toBeNull();
    expect((await visiblePrices("vendorB", id)).map((r) => r.proposal_id)).toEqual([pB]);
    expect(await comparison("vendorB", id)).toBeNull();
  });

  it("RFQ-05 AC3-AC4: prices excluding VAT, Different terms, shared owner, default winner, disqualified listed", async () => {
    const c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pA)).toMatchObject({ unitExclVat: 28, evaluated: 28, lineTotal: 56000 });
    expect(cellOf(c, 0, pB)).toMatchObject({ unitExclVat: 29.5, evaluated: 29.5, lineTotal: 59000 });
    expect(c.vendors.find((v) => v.proposalId === pB)!.differentTerms).toEqual(["incoterm", "namedPlace"]);
    expect(c.vendors.find((v) => v.proposalId === pA)!.differentTerms).toEqual([]);
    expect(c.vendors.find((v) => v.proposalId === pB)!.sharedOwners).toEqual([`RLS6 vendorC ${RUN}`]);
    expect(c.lines[0]).toMatchObject({ defaultProposalId: pA, chosenProposalId: pA, manual: false, eligibleCount: 2 });
    expect(c.disqualified).toEqual([expect.objectContaining({ name: `RLS6 vendorC ${RUN}`, reason: "Missing product certificate" })]);
    expect(c.sourcing.needsLowCompetitionReason).toBe(true);
    expect(c.purchaseOrders).toEqual([expect.objectContaining({ name: `RLS6 vendorA ${RUN}`, total: 56000, lines: 1 })]);
  });

  it("RFQ-07 AC1-AC3: extra costs give the evaluated price; a chosen non-lowest vendor needs a justification", async () => {
    const [line] = await lineIds(id);
    const cost = { p_id: null, p_line: line, p_proposal: pB, p_type: "DELIVERY", p_note: "Port to warehouse" };
    expect((await actors.specialist.client.rpc("comparison_cost_save", { ...cost, p_amount: -1 })).error?.message).toBe("errors.amountInvalid");
    expect((await actors.specialist2.client.rpc("comparison_cost_save", { ...cost, p_amount: 1 })).error?.message).toBe("errors.noAccess");
    expect((await actors.specialist.client.rpc("comparison_cost_save", { ...cost, p_proposal: pC, p_amount: 1 })).error?.message).toBe("errors.vendorNotEligible");
    expect((await actors.specialist.client.rpc("comparison_cost_save", { ...cost, p_amount: 1 })).error).toBeNull();
    let c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pB)).toMatchObject({ unitExclVat: 29.5, extra: 1, evaluated: 30.5, lineTotal: 59000 });
    expect((await actors.vendorB.client.from("comparison_cost").select("id")).data).toEqual([]);

    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: pB, p_justification: "" })).error?.message).toBe("errors.justificationRequired");
    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: pC, p_justification: "x" })).error?.message).toBe("errors.vendorNotEligible");
    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: pB, p_justification: "Faster delivery" })).error).toBeNull();
    c = (await comparison("specialist", id))!;
    expect(c.lines[0]).toMatchObject({ chosenProposalId: pB, manual: true, notLowest: true });
    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: null, p_justification: null })).error).toBeNull();
    expect((await comparison("specialist", id))!.lines[0]).toMatchObject({ chosenProposalId: pA, manual: false });
  });

  it("RFQ-08 AC1-AC4, AC7: final offer to chosen vendors; higher price refused; new prices hidden while the round runs", async () => {
    const deadline = new Date(Date.now() + 48 * 3600_000).toISOString();
    expect((await actors.specialist.client.rpc("final_offer_request", { p_id: id, p_vendors: [actors.vendorC.vendorId], p_deadline: deadline, p_message: "" })).error?.message).toBe("errors.vendorNotEligible");
    expect((await actors.specialist.client.rpc("final_offer_request", { p_id: id, p_vendors: [actors.vendorA.vendorId, actors.vendorB.vendorId], p_deadline: deadline, p_message: "Best and final offer" })).error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("FINAL_OFFER_ROUND");
    expect(await notified("vendorA", "finalOffer.requested", id)).toHaveLength(1);
    expect(await notified("vendorC", "finalOffer.requested", id)).toHaveLength(0);

    const [line] = await lineIds(id);
    expect((await actors.vendorA.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [{ sourcing_line_id: line, unit_price: 33.1 }], p_keep: false })).error?.message).toBe("errors.finalOfferHigher");
    expect((await actors.vendorC.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [], p_keep: true })).error?.message).toBe("errors.noAccess");
    expect((await actors.vendorA.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [{ sourcing_line_id: line, unit_price: 32.45 }], p_keep: false })).error).toBeNull();
    expect((await actors.vendorB.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [], p_keep: true })).error).toBeNull();

    expect((await visiblePrices("specialist", id)).filter((r) => r.round === 2)).toEqual([]);
    expect((await visiblePrices("vendorA", id)).filter((r) => r.round === 2)).toHaveLength(1);
    expect((await visiblePrices("vendorB", id)).filter((r) => r.round === 2)).toEqual([]);
    const c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pA).unitExclVat).toBe(28);
    expect(c.vendors.find((v) => v.proposalId === pA)!.finalOffer!.respondedAt).not.toBeNull();
  });

  it("RFQ-08 AC5-AC6: the round closes at its deadline; previous next to final; one round only", async () => {
    await db.query("update public.sourcing set final_offer_deadline = now() - interval '1 second' where id = $1", [id]);
    await db.query("select app.close_due_sourcings()");
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    expect((await notified("specialist", "finalOffer.closed", id))[0].params).toMatchObject({ responded: 2, chosen: 2 });
    const c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pA)).toMatchObject({ unitExclVat: 27.5, firstExclVat: 28, evaluated: 27.5, lineTotal: 55000 });
    expect(cellOf(c, 0, pB)).toMatchObject({ unitExclVat: 29.5, firstExclVat: null, evaluated: 30.5 });
    expect(c.lines[0].chosenProposalId).toBe(pA);
    const again = await actors.specialist.client.rpc("final_offer_request", { p_id: id, p_vendors: [actors.vendorA.vendorId], p_deadline: new Date(Date.now() + 86400_000).toISOString(), p_message: "" });
    expect(again.error?.message).toBe("errors.finalOfferUsed");
  });

  it("RFQ-05 AC5-AC6, CMT-02 AC2: low-competition reason required; Send freezes the package and opens the WINNER vote", async () => {
    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error?.message).toBe("errors.lowCompetitionReason");
    const sent = await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "Gamma Supply was disqualified; few qualified suppliers serve this region" });
    expect(sent.error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("IN_COMMITTEE");
    const [winner] = await decisionsOf(id, "WINNER");
    expect(winner.status).toBe("VOTING");
    const award = (await db.query("select a.quantity, a.status, x.round, x.proposal_id from public.award_line a join public.proposal_line x on x.id = a.proposal_line_id join public.sourcing_line sl on sl.id = a.sourcing_line_id where sl.sourcing_id = $1", [id])).rows;
    expect(award).toEqual([{ quantity: "2000.000", status: "ACTIVE", round: 2, proposal_id: pA }]);

    const pkg = (await actors.cm2.client.rpc("decision_package", { p_decision: winner.id })).data as { comparison: Comparison };
    expect(pkg.comparison.sourcing.lowCompetitionReason).toMatch(/Gamma Supply was disqualified/);
    expect(cellOf(pkg.comparison, 0, pB).extra).toBe(1);
    expect(pkg.comparison.disqualified[0].reason).toBe("Missing product certificate");
    expect(((await actors.approver.client.rpc("decision_package", { p_decision: winner.id })).data as { comparison: unknown }).comparison).toBeNull();
    expect((await actors.approver.client.from("decision").select("package").eq("id", winner.id)).error).not.toBeNull();
    expect((await actors.cm1.client.from("decision").select("id, status").eq("id", winner.id)).data).toHaveLength(1);

    // RFQ-07 AC4: costs are locked from IN_COMMITTEE on
    const [line] = await lineIds(id);
    expect((await actors.specialist.client.rpc("comparison_cost_save", { p_id: null, p_line: line, p_proposal: pA, p_type: "OTHER", p_amount: 1, p_note: "" })).error?.message).toBe("errors.costsLocked");
  });

  it("CMT-02 AC9: APPROVED moves the sourcing to WINNER_APPROVED (2 to 1)", async () => {
    const [winner] = await decisionsOf(id, "WINNER");
    await vote("cm1", winner.id, "FOR");
    await vote("cm2", winner.id, "FOR");
    await vote("cm3", winner.id, "AGAINST", "Beta Trade delivers 5 days faster");
    expect((await db.query("select status from public.decision where id = $1", [winner.id])).rows[0].status).toBe("APPROVED");
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED");
    const audit = (await db.query("select reason from public.audit_entry where record_type = 'sourcing' and record_id = $1 and to_status = 'WINNER_APPROVED'", [id])).rows;
    expect(audit).toEqual([{ reason: "Winner approved" }]);
  });
});

describe("Rejected winner, tie rule and the frozen package", () => {
  let id = "";
  let pA = "";
  let pB = "";
  beforeAll(async () => {
    id = await start([{ quantity: 100, price: 28 }]); // RFQ 2,800.00, minimum 1
    await offer("vendorA", id, { prices: [28] });
    await offer("vendorB", id, { prices: [28] }); // same price, submitted later
    await closeNow(id);
    [pA, pB] = [(await proposalOf(id, "vendorA")).id, (await proposalOf(id, "vendorB")).id];
  });

  it("RFQ-05 AC4 tie: the earlier submitted proposal is the default; the tied vendor needs no justification", async () => {
    const c = (await comparison("specialist", id))!;
    expect(c.lines[0].defaultProposalId).toBe(pA);
    const [line] = await lineIds(id);
    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: pB, p_justification: "" })).error).toBeNull();
    expect((await comparison("specialist", id))!.lines[0]).toMatchObject({ chosenProposalId: pB, manual: true, notLowest: false });
    await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: null, p_justification: null });
  });

  it("RFQ-08 AC3 (Calculation Rules): 28.00 -> 28.50 refused, 28.00 -> 27.50 allowed", async () => {
    const [line] = await lineIds(id);
    expect((await actors.specialist.client.rpc("final_offer_request", { p_id: id, p_vendors: [actors.vendorA.vendorId], p_deadline: new Date(Date.now() + 86400_000).toISOString(), p_message: "" })).error).toBeNull();
    expect((await actors.vendorA.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [{ sourcing_line_id: line, unit_price: 28.5 }], p_keep: false })).error?.message).toBe("errors.finalOfferHigher");
    expect((await actors.vendorA.client.rpc("final_offer_submit", { p_sourcing: id, p_lines: [{ sourcing_line_id: line, unit_price: 27.5 }], p_keep: false })).error).toBeNull();
    expect(await notified("vendorB", "finalOffer.requested", id)).toHaveLength(0);
    await db.query("update public.sourcing set final_offer_deadline = now() - interval '1 second' where id = $1", [id]);
    await db.query("select app.close_due_sourcings()");
    const c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pB).unitExclVat).toBe(28); // not chosen: unchanged (AC7)
    expect(c.lines[0].defaultProposalId).toBe(pA);
  });

  it("CMT-02 AC9, RFQ-05 AC7: REJECTED returns to COMPARISON with comments; the rejected winner is excluded; the old package stays as frozen", async () => {
    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error).toBeNull();
    const [first] = await decisionsOf(id, "WINNER");
    await vote("cm1", first.id, "AGAINST", "Ask Beta Trade for the delivery schedule");
    await vote("cm2", first.id, "AGAINST", "Too slow");
    await vote("cm3", first.id, "FOR");
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    const c = (await comparison("specialist", id))!;
    expect(cellOf(c, 0, pA).excluded).toBe(true);
    expect(c.lines[0]).toMatchObject({ defaultProposalId: pB, eligibleCount: 1 });
    expect(c.committeeComments.map((x) => x.comment).sort()).toEqual(["Ask Beta Trade for the delivery schedule", "Too slow"]);
    const [line] = await lineIds(id);
    expect((await actors.specialist.client.rpc("award_choose", { p_line: line, p_proposal: pA, p_justification: "x" })).error?.message).toBe("errors.vendorNotEligible");
    const frozen = ((await actors.cm1.client.rpc("decision_package", { p_decision: first.id })).data as { comparison: Comparison }).comparison;
    expect(frozen.lines[0].chosenProposalId).toBe(pA);

    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error).toBeNull();
    const second = (await decisionsOf(id, "WINNER"))[1];
    const pkg = ((await actors.cm1.client.rpc("decision_package", { p_decision: second.id })).data as { comparison: Comparison }).comparison;
    expect(pkg.lines[0].chosenProposalId).toBe(pB);
  });

  it("NFR-001: a vendor reads no award lines, no costs and no other vendor's final-offer request", async () => {
    expect((await actors.vendorA.client.from("award_line").select("id")).data).toEqual([]);
    const requests = (await actors.vendorB.client.from("final_offer_request").select("vendor_id")).data ?? [];
    expect(requests.every((r) => r.vendor_id === actors.vendorB.vendorId)).toBe(true);
  });
});

describe("RFQ-06 AC6-AC7: SSP in the comparison and the winner decision", () => {
  it("unpriced lines must be cancelled; the vendor wins every priced line; the package carries the SSP label", async () => {
    const id = await start([{ quantity: 20, price: 40 }, { quantity: 5, price: 10 }], "vendorB"); // 850.00, at or below the limit
    await offer("vendorB", id, { prices: [39, null] });
    await closeNow(id);
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    const pB = (await proposalOf(id, "vendorB")).id;
    const c = (await comparison("specialist", id))!;
    expect(c.sourcing.type).toBe("SSP");
    const [priced, unpriced] = await lineIds(id); // ordered by quantity: 20 priced, 5 not
    expect(c.lines.find((l) => l.id === priced)).toMatchObject({ chosenProposalId: pB, eligibleCount: 1 });
    expect(c.lines.find((l) => l.id === unpriced)).toMatchObject({ chosenProposalId: null, eligibleCount: 0 });
    expect((await actors.specialist.client.rpc("proposal_evaluate", { p_proposal: pB, p_result: "DISQUALIFIED", p_reason: "x" })).error?.message).toBe("errors.statusChanged");
    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error?.message).toBe("errors.lineNeedsWinner");
    expect((await actors.specialist.client.rpc("sourcing_line_cancel", { p_line: unpriced, p_reason: "" })).error?.message).toBe("errors.required");
    expect((await actors.specialist.client.rpc("sourcing_line_cancel", { p_line: unpriced, p_reason: "Not offered" })).error).toBeNull();
    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error).toBeNull();
    const [winner] = await decisionsOf(id, "WINNER");
    const pkg = ((await actors.cm1.client.rpc("decision_package", { p_decision: winner.id })).data as { comparison: Comparison }).comparison;
    expect(pkg.sourcing.type).toBe("SSP");
    expect(pkg.purchaseOrders).toEqual([expect.objectContaining({ name: `RLS6 vendorB ${RUN}`, total: 780, lines: 1 })]);
  });
});
