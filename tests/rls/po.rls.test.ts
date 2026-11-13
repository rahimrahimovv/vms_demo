/**
 * Slice 7 (PO-01, PO-02, PO-03, CMT-02 AC3/AC9/AC10) against vms-dev. Throwaway users and vendors (A, B, C, D) work on
 * their own category, item and plan line; a throwaway committee replaces the demo committee for the run and the demo
 * committee is put back exactly as it was. Deadlines are moved into the past with SQL and the jobs are run directly,
 * as pg_cron does every minute. Amounts: 10 x 20.00 at 18% VAT = 200.00 + 36.00 = 236.00 (vendor A entered 23.60 with
 * VAT), vendor B 4 x 45.00 without VAT; extra costs never reach the PO.
 *
 * Flow 1: two lines, two POs, an ACCEPTED PO that stays untouched when the other PO is rejected, locked lines,
 *         a sourcing with a PO that cannot be cancelled, completion by cancelling the last open line.
 * Flow 2: PO decision package with differences, vendor decline, re-award, second winner decision, completion.
 * Flow 3: separation of duties (Requester, sourcing owner), committee rejection, NO_DECISION and Reopen.
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

type Internal = "specialist" | "specialist2" | "requester" | "reqApprover" | "approver" | "ownerApprover" | "admin" | "cm1" | "cm2" | "cm3";
type Vendor = "vendorA" | "vendorB" | "vendorC" | "vendorD";
type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<Internal | Vendor, Actor>;
let root = "";
let item = "";
let planLine = "";
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
  const email = `rls7-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS7 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: data.user.id, role })));
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}
async function vendor(key: Vendor) {
  const email = `rls7-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error: authError } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (authError) throw authError;
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS7 ${key} ${RUN}`, voen: `96${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ", legal_address: "Test street 7", director_name: "Test Director", is_vat_payer: true,
      contact_person: "Test Contact", contact_email: email, phone: "+994500000007", founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: `HEAD7-${key}-${RUN}`, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0007", swift: "TESTAZ22", currency: "AZN", is_main: true }],
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
type Flow = { owner?: Internal; requester?: Internal };
async function approvedPr(lines: { quantity: number; price: number }[], requester: Internal) {
  const date = await plusDays(30);
  const saved = await actors[requester].client.rpc("requisition_save", {
    p_id: null, p_plan_line_id: planLine, p_submit: true,
    p_lines: lines.map((l) => ({ item_id: item, quantity: l.quantity, estimated_unit_price: l.price, delivery_date: date, delivery_place_id: CENTRAL, specification: "RLS7 line" })),
  });
  if (saved.error) throw saved.error;
  const decided = await actors.approver.client.rpc("requisition_decide", { p_id: saved.data, p_decision: "APPROVE", p_comment: null });
  if (decided.error) throw decided.error;
  return saved.data as string;
}
async function start(lines: { quantity: number; price: number }[], flow: Flow = {}) {
  const owner = flow.owner ?? "specialist";
  const pr = await approvedPr(lines, flow.requester ?? "requester");
  const { data, error } = await actors[owner].client.rpc("sourcing_start", { p_requisition: pr, p_method: "COMPETITIVE" });
  if (error) throw error;
  const id = data as string;
  const c = actors[owner].client;
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
async function offer(key: Vendor, sourcingId: string, prices: number[], vat?: number) {
  const c = actors[key].client;
  const accepted = await c.rpc("invitation_accept", { p_sourcing: sourcingId });
  if (accepted.error) throw accepted.error;
  const ids = await lineIds(sourcingId);
  const terms = {
    incoterm: "DDP", named_place_id: CENTRAL, delivery_mode_id: mode, payment_term_id: payment,
    prices_include_vat: Boolean(vat), vat_rate: vat ?? 0, delivery_days: 20, validity_days: 30, comment: "",
  };
  const saved = await c.rpc("proposal_save", {
    p_sourcing: sourcingId, p_terms: terms, p_submit: true,
    p_lines: ids.map((id, i) => ({ sourcing_line_id: id, unit_price: prices[i] })).filter((l) => l.unit_price !== undefined),
  });
  if (saved.error) throw saved.error;
}
async function closeNow(id: string) {
  await db.query("update public.sourcing set deadline = now() - interval '1 second' where id = $1", [id]);
  await db.query("select app.close_due_sourcings()");
}
const sourcingRow = async (id: string) => (await db.query("select * from public.sourcing where id = $1", [id])).rows[0];
const requisitionOf = async (sourcingId: string) =>
  (await db.query(`select r.* from public.requisition r join public.requisition_line rl on rl.requisition_id = r.id
                    join public.sourcing_line sl on sl.requisition_line_id = rl.id where sl.sourcing_id = $1 limit 1`, [sourcingId])).rows[0];
const decisionsOf = async (sourcingId: string, type: string) =>
  (await db.query("select * from public.decision where sourcing_id = $1 and type = $2 order by opened_at", [sourcingId, type])).rows;
const vote = async (key: Internal, decision: string, v: "FOR" | "AGAINST", comment = "") => {
  const r = await actors[key].client.rpc("decision_vote", { p_decision: decision, p_vote: v, p_comment: comment });
  if (r.error) throw r.error;
};
const voteAll = async (decision: string) => { for (const k of ["cm1", "cm2", "cm3"] as const) await vote(k, decision, "FOR"); };
const notified = async (key: Internal | Vendor, event: string, recordId: string) =>
  (await db.query("select params, record_number from public.notification where user_id = $1 and event = $2 and record_id = $3", [actors[key].id, event, recordId])).rows;
const poRows = async (sourcingId: string) =>
  (await db.query(`select po.*, v.legal_name from public.purchase_order po join public.vendor v on v.id = po.vendor_id
                    where po.sourcing_id = $1 order by po.number`, [sourcingId])).rows;
const poOf = async (sourcingId: string, key: Vendor, status?: string) =>
  (await poRows(sourcingId)).filter((p) => p.vendor_id === actors[key].vendorId && (!status || p.status === status)).at(-1);
const poLines = async (poId: string) =>
  (await db.query("select * from public.purchase_order_line where purchase_order_id = $1", [poId])).rows;
const poStatus = async (poId: string) => (await db.query("select status from public.purchase_order where id = $1", [poId])).rows[0].status as string;
const awardStatuses = async (poId: string) =>
  (await db.query(`select a.status from public.purchase_order_line pl join public.award_line a on a.id = pl.award_line_id
                    where pl.purchase_order_id = $1`, [poId])).rows.map((r) => r.status as string);
const auditOf = async (recordType: string, recordId: string) =>
  (await db.query("select from_status, to_status, reason from public.audit_entry where record_type = $1 and record_id = $2 order by created_at", [recordType, recordId])).rows;
type CompLine = { id: string; locked?: boolean; poNumber?: string | null; status: string; cells: { proposalId: string; excluded: boolean }[] };
const comparison = async (key: Internal, id: string) =>
  (await actors[key].client.rpc("sourcing_comparison", { p_id: id })).data as { lines: CompLine[] } | null;

/** A competitive sourcing with the vendors' offers, closed and ready for the owner's comparison. */
async function offersClosed(lines: { quantity: number; price: number }[], offers: { key: Vendor; prices: number[]; vat?: number }[], flow: Flow = {}) {
  const id = await start(lines, flow);
  for (const o of offers) await offer(o.key, id, o.prices, o.vat);
  await closeNow(id);
  return id;
}
async function sendAndApprove(id: string, owner: Internal = "specialist") {
  const sent = await actors[owner].client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" });
  if (sent.error) throw sent.error;
  const decision = (await decisionsOf(id, "WINNER")).at(-1);
  await voteAll(decision.id);
  return decision.id as string;
}
async function approvePo(poId: string, by: Internal = "approver") {
  const r = await actors[by].client.rpc("po_decide", { p_po: poId, p_decision: "APPROVE", p_reason: null });
  if (r.error) throw r.error;
  return (await db.query("select * from public.decision where purchase_order_id = $1 order by opened_at desc limit 1", [poId])).rows[0];
}
const respond = (key: Vendor, poId: string, decision: "ACCEPT" | "DECLINE", reason = "") =>
  actors[key].client.rpc("po_respond", { p_po: poId, p_decision: decision, p_reason: reason });

beforeAll(async () => {
  await db.connect();
  const c = await db.query("select voting_period_days from public.committee where company_id = $1", [COMPANY_ID]);
  const m = await db.query("select user_id, is_chair from public.committee_member");
  committeeBackup = { days: c.rows[0]?.voting_period_days ?? 3, members: m.rows };

  await internal("specialist", ["PROCUREMENT_SPECIALIST"]);
  await internal("specialist2", ["PROCUREMENT_SPECIALIST"]);
  await internal("requester", ["REQUESTER"]);
  await internal("reqApprover", ["REQUESTER", "APPROVER"]); // the PR's Requester who is also an Approver
  await internal("approver", ["APPROVER"]);
  await internal("ownerApprover", ["PROCUREMENT_SPECIALIST", "APPROVER"]); // the sourcing owner who is also an Approver
  await internal("admin", ["ADMIN"]);
  for (const key of ["cm1", "cm2", "cm3"] as const) await internal(key, ["COMMITTEE_MEMBER"]);

  const admin = actors.admin.client;
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS7 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS7-${RUN}`, p_name: "RLS7 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS7 plan ${RUN}`, p_planned_amount: 100000, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  const m1 = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS7 mode ${RUN}`, p_is_active: true });
  if (m1.error) throw m1.error;
  mode = m1.data as string;
  const p1 = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS7 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
  if (p1.error) throw p1.error;
  payment = p1.data as string;

  for (const key of ["vendorA", "vendorB", "vendorC", "vendorD"] as const) await vendor(key);

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
    await removeTestData(db, service, "rls7");
  } finally {
    await db.end();
  }
}, 300_000);

describe("Flow 1: two lines, two POs, rejection beside an accepted PO, completion by cancelling the open line", () => {
  let id = "";
  let l1 = "";
  let l2 = "";
  let winnerDecision = "";
  let poA = "";
  let poB = "";
  let poDecisionB = "";

  beforeAll(async () => {
    id = await offersClosed(
      [{ quantity: 10, price: 25 }, { quantity: 4, price: 50 }],
      [
        { key: "vendorA", prices: [23.6, 60], vat: 18 }, // 20.00 excluding VAT on line 1
        { key: "vendorB", prices: [22, 45] },
        { key: "vendorC", prices: [30, 80] },
      ],
      { requester: "reqApprover" },
    );
    [l1, l2] = await lineIds(id);
    const proposalA = (await db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0].id;
    // RFQ-07 AC5: an extra cost for vendor A on line 1 keeps A the lowest evaluated price (21.00 < 22.00) and never reaches the PO
    const cost = await actors.specialist.client.rpc("comparison_cost_save", { p_id: null, p_line: l1, p_proposal: proposalA, p_type: "DELIVERY", p_amount: 1, p_note: "Delivery" });
    expect(cost.error).toBeNull();
    winnerDecision = await sendAndApprove(id);
    poA = (await poOf(id, "vendorA")).id;
    poB = (await poOf(id, "vendorB")).id;
  }, 300_000);

  it("PO-01 AC1-AC2: one PO per winning vendor with the award quantity, the vendor's own price, VAT and terms", async () => {
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED");
    const pos = await poRows(id);
    expect(pos).toHaveLength(2);
    for (const po of pos) {
      expect(po.number).toMatch(/^PO-\d{4}-\d{4}$/);
      expect(po.status).toBe("PENDING_APPROVAL");
      expect(po.winner_decision_id).toBe(winnerDecision);
      expect([po.incoterm, po.named_place_id, po.delivery_mode_id, po.payment_term_id]).toEqual(["DDP", CENTRAL, mode, payment]);
    }
    const a = await poOf(id, "vendorA");
    const b = await poOf(id, "vendorB");
    expect(Number(a.vat_rate)).toBe(18);
    expect([a.total, a.vat_amount, a.total_incl_vat].map(Number)).toEqual([200, 36, 236]); // 10 x 20.00, not 21.00
    expect([b.total, b.vat_amount, b.total_incl_vat].map(Number)).toEqual([180, 0, 180]);
    const linesA = await poLines(a.id);
    expect(linesA).toHaveLength(1);
    expect([Number(linesA[0].quantity), Number(linesA[0].unit_price), Number(linesA[0].line_total)]).toEqual([10, 20, 200]);
    const [lineB] = await poLines(b.id);
    expect([Number(lineB.quantity), Number(lineB.unit_price), Number(lineB.line_total)]).toEqual([4, 45, 180]);
    // the link to the winner minutes: the winner decision has numbered minutes
    const minutes = (await db.query("select number from public.minutes where decision_id = $1", [a.winner_decision_id])).rows;
    expect(minutes).toEqual([{ number: expect.stringMatching(/^MIN-\d{4}-\d{3}$/) }]);
    expect((await auditOf("purchase_order", a.id))[0]).toMatchObject({ from_status: null, to_status: "PENDING_APPROVAL" });
  });

  it("PO-01 AC3: every Approver except the PR's Requester and the sourcing owner is notified", async () => {
    for (const po of [poA, poB]) {
      const rows = await notified("approver", "po.created", po);
      expect(rows).toHaveLength(1);
      expect(rows[0].params).toMatchObject({ vendor: expect.stringContaining("RLS7 vendor") });
      expect(await notified("reqApprover", "po.created", po)).toHaveLength(0); // the Requester, although an Approver
      expect(await notified("specialist", "po.created", po)).toHaveLength(0); // the owner
    }
    expect((await notified("approver", "po.created", poA))[0].params.total).toBe(200);
  });

  it("PO-01 AC4: no edit action exists; nothing can be written directly; reading follows the Role Matrix", async () => {
    for (const key of ["admin", "specialist", "approver"] as const) {
      await actors[key].client.from("purchase_order").update({ total: 1 }).eq("id", poA);
      await actors[key].client.from("purchase_order").delete().eq("id", poA);
      await actors[key].client.from("purchase_order_line").update({ unit_price: 1 }).eq("purchase_order_id", poA);
      await actors[key].client.from("purchase_order_line").delete().eq("purchase_order_id", poA);
    }
    expect(Number((await db.query("select total from public.purchase_order where id = $1", [poA])).rows[0].total)).toBe(200);
    expect(Number((await poLines(poA))[0].unit_price)).toBe(20);
    // readers: the Requester of the PR, the owner, the committee, the Admin; not another Requester; vendors only once released
    const ids = async (key: Internal | Vendor) => ((await actors[key].client.rpc("po_list")).data as { id: string }[]).map((r) => r.id);
    for (const key of ["reqApprover", "specialist", "specialist2", "approver", "cm1", "admin"] as const) {
      expect(await ids(key)).toEqual(expect.arrayContaining([poA, poB]));
    }
    expect((await ids("requester")).filter((x) => [poA, poB].includes(x))).toEqual([]);
    for (const key of ["vendorA", "vendorB", "vendorC", "vendorD"] as const) {
      expect(await ids(key)).toEqual([]);
      expect((await actors[key].client.from("purchase_order").select("id")).data).toEqual([]);
    }
    expect((await actors.vendorA.client.rpc("po_view", { p_id: poA })).data).toBeNull();
    expect((await actors.requester.client.rpc("po_view", { p_id: poA })).data).toBeNull();
    const view = (await actors.specialist.client.rpc("po_view", { p_id: poA })).data as { winnerMinutes: { number: string } };
    expect(view.winnerMinutes.number).toMatch(/^MIN-/);
  });

  it("PO-02 AC3 (#83): not for the Requester of the PR; role, reason and decision are checked", async () => {
    expect((await actors.reqApprover.client.rpc("po_decide", { p_po: poB, p_decision: "APPROVE", p_reason: null })).error?.message).toBe("errors.ownPurchaseOrder");
    expect((await actors.reqApprover.client.rpc("po_decide", { p_po: poB, p_decision: "REJECT", p_reason: "No" })).error?.message).toBe("errors.ownPurchaseOrder");
    expect((await actors.specialist.client.rpc("po_decide", { p_po: poB, p_decision: "APPROVE", p_reason: null })).error?.message).toBe("errors.noAccess");
    expect((await actors.vendorB.client.rpc("po_decide", { p_po: poB, p_decision: "APPROVE", p_reason: null })).error?.message).toBe("errors.noAccess");
    expect((await actors.approver.client.rpc("po_decide", { p_po: poB, p_decision: "REJECT", p_reason: "  " })).error?.message).toBe("errors.reasonRequired");
    expect((await actors.approver.client.rpc("po_decide", { p_po: poB, p_decision: "MAYBE", p_reason: null })).error?.message).toBe("errors.noAccess");
    expect(await poStatus(poB)).toBe("PENDING_APPROVAL");
  });

  it("PO-02 AC1, CMT-02 AC3: Approve opens a PO decision; its package is the PO, the same as the winner decision", async () => {
    const decision = await approvePo(poB);
    poDecisionB = decision.id;
    expect(await poStatus(poB)).toBe("PENDING_COMMITTEE");
    expect(decision).toMatchObject({ type: "PO", status: "VOTING", purchase_order_id: poB, sourcing_id: id });
    const voters = (await db.query("select user_id from public.decision_voter where decision_id = $1", [decision.id])).rows.map((r) => r.user_id);
    expect(voters.sort()).toEqual([actors.cm1.id, actors.cm2.id, actors.cm3.id].sort());
    for (const key of ["cm1", "admin", "approver", "specialist"] as const) {
      const pkg = (await actors[key].client.rpc("decision_package", { p_decision: decision.id })).data as { po: { same: boolean; differences: unknown[]; po: { total: number } } };
      expect(pkg.po).toMatchObject({ same: true, differences: [], po: { total: 180 } });
    }
    expect((await actors.vendorB.client.rpc("decision_package", { p_decision: decision.id })).data).toBeNull();
    // not visible to the vendor before the committee approves
    expect((await actors.vendorB.client.rpc("po_view", { p_id: poB })).data).toBeNull();
    expect((await actors.vendorB.client.rpc("po_list")).data as unknown[]).toEqual([]);
    expect((await respond("vendorB", poB, "ACCEPT")).error?.message).toBe("errors.statusChanged"); // its own PO, not released yet
    // a second Approve on the same PO is refused
    expect((await actors.approver.client.rpc("po_decide", { p_po: poB, p_decision: "APPROVE", p_reason: null })).error?.message).toBe("errors.statusChanged");
  });

  it("CMT-02 AC10, PO-02 AC4: the committee approves; FULLY_APPROVED, visible to its vendor only; notices", async () => {
    await voteAll(poDecisionB);
    expect(await poStatus(poB)).toBe("FULLY_APPROVED");
    expect((await auditOf("purchase_order", poB)).map((a) => a.to_status)).toEqual(["PENDING_APPROVAL", "PENDING_COMMITTEE", "FULLY_APPROVED"]);
    const bUser = await notified("vendorB", "po.fullyApproved", poB);
    expect(bUser).toHaveLength(1);
    expect(bUser[0].params.total).toBe(180);
    expect(await notified("specialist", "po.fullyApproved", poB)).toHaveLength(1);
    expect(await notified("reqApprover", "po.fullyApproved", poB)).toHaveLength(1);
    expect(await notified("vendorA", "po.fullyApproved", poB)).toHaveLength(0);
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED"); // the sourcing waits while the PO is with the vendor
  });

  it("PO-03 AC1, AC5: the vendor lists and reads only its own PO; no minutes, no sourcing id, no other vendor", async () => {
    const list = (await actors.vendorB.client.rpc("po_list")).data as { id: string; sourcing_id: string | null; requester_id: string | null; owner_id: string | null; status: string }[];
    expect(list.map((r) => r.id)).toEqual([poB]);
    expect(list[0]).toMatchObject({ sourcing_id: null, requester_id: null, owner_id: null, status: "FULLY_APPROVED" });
    const view = (await actors.vendorB.client.rpc("po_view", { p_id: poB })).data as Record<string, unknown> & { lines: { item: string; quantity: number; unitPrice: number; lineTotal: number }[] };
    expect(view).toMatchObject({ total: 180, vatAmount: 0, totalInclVat: 180, winnerMinutes: null, decision: null, ownerId: null });
    expect(view.lines).toEqual([expect.objectContaining({ item: "RLS7 item", quantity: 4, unitPrice: 45, lineTotal: 180 })]);
    expect(((await actors.vendorB.client.from("purchase_order").select("id")).data ?? []).map((r) => r.id)).toEqual([poB]);
    // another vendor: nothing to see, nothing to answer (NFR-001)
    for (const key of ["vendorA", "vendorC", "vendorD"] as const) {
      expect((await actors[key].client.rpc("po_list")).data as unknown[]).toEqual([]);
      expect((await actors[key].client.rpc("po_view", { p_id: poB })).data).toBeNull();
      expect((await actors[key].client.from("purchase_order").select("id").eq("id", poB)).data).toEqual([]);
      expect((await respond(key, poB, "ACCEPT")).error?.message).toBe("errors.noAccess");
    }
    // internal users cannot answer for the vendor
    expect((await actors.approver.client.rpc("po_respond", { p_po: poB, p_decision: "ACCEPT", p_reason: "" })).error?.message).toBe("errors.noAccess");
    expect(await poStatus(poB)).toBe("FULLY_APPROVED");
  });

  it("PO-03 AC2: the vendor accepts; the owner and the Requester are notified; nothing is completed yet", async () => {
    expect((await respond("vendorB", poB, "ACCEPT")).error).toBeNull();
    expect(await poStatus(poB)).toBe("ACCEPTED");
    expect(await notified("specialist", "po.accepted", poB)).toHaveLength(1);
    expect(await notified("reqApprover", "po.accepted", poB)).toHaveLength(1);
    expect((await respond("vendorB", poB, "ACCEPT")).error?.message).toBe("errors.statusChanged");
    expect((await respond("vendorB", poB, "DECLINE", "Changed my mind")).error?.message).toBe("errors.statusChanged");
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED"); // line 1 still waits for its PO
  });

  it("PO-02 AC2: the Approver rejects with a reason; only that PO's lines return; the accepted PO is untouched", async () => {
    expect((await actors.approver.client.rpc("po_decide", { p_po: poA, p_decision: "REJECT", p_reason: "" })).error?.message).toBe("errors.reasonRequired");
    const rejected = await actors.approver.client.rpc("po_decide", { p_po: poA, p_decision: "REJECT", p_reason: "Price no longer valid" });
    expect(rejected.error).toBeNull();
    expect((await db.query("select status, reason from public.purchase_order where id = $1", [poA])).rows[0]).toEqual({ status: "REJECTED", reason: "Price no longer valid" });
    expect(await notified("specialist", "po.rejected", poA)).toEqual([expect.objectContaining({ params: { reason: "Price no longer valid" } })]);
    expect(await awardStatuses(poA)).toEqual(["REJECTED"]);
    expect(await awardStatuses(poB)).toEqual(["ACTIVE"]);
    expect(await poStatus(poB)).toBe("ACCEPTED");
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    expect((await auditOf("purchase_order", poA)).at(-1)).toMatchObject({ from_status: "PENDING_APPROVAL", to_status: "REJECTED", reason: "Price no longer valid" });
    expect((await auditOf("sourcing", id)).at(-1)).toMatchObject({ from_status: "WINNER_APPROVED", to_status: "COMPARISON" });
  });

  it("RFQ-05 AC7: the rejected vendor is excluded on its line; the line on the accepted PO is locked", async () => {
    const c = (await comparison("specialist", id))!;
    const line1 = c.lines.find((l) => l.id === l1)!;
    const line2 = c.lines.find((l) => l.id === l2)!;
    const proposalA = (await db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0].id;
    expect(line1.cells.find((x) => x.proposalId === proposalA)!.excluded).toBe(true);
    expect(line1.locked).toBe(false);
    expect(line2).toMatchObject({ locked: true, poNumber: expect.stringMatching(/^PO-/) });
  });

  it("RFQ-04 AC6: a sourcing with a live PO cannot be cancelled; locked lines cannot be re-awarded, cancelled or costed", async () => {
    expect((await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Not needed" })).error?.message).toBe("errors.sourcingHasPurchaseOrders");
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    expect((await actors.specialist.client.rpc("sourcing_line_cancel", { p_line: l2, p_reason: "No" })).error?.message).toBe("errors.lineOnPurchaseOrder");
    const proposalB = (await db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorB.vendorId])).rows[0].id;
    expect((await actors.specialist.client.rpc("award_choose", { p_line: l2, p_proposal: proposalB, p_justification: "x" })).error?.message).toBe("errors.lineOnPurchaseOrder");
    expect((await actors.specialist.client.rpc("comparison_cost_save", { p_id: null, p_line: l2, p_proposal: proposalB, p_type: "OTHER", p_amount: 1, p_note: "" })).error?.message).toBe("errors.lineOnPurchaseOrder");
    expect((await actors.specialist2.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Not needed" })).error?.message).toBe("errors.noAccess");
  });

  it("PO-03 AC4: cancelling the last open line completes the sourcing and the PR; proposals and result notices", async () => {
    expect((await actors.specialist.client.rpc("sourcing_line_cancel", { p_line: l1, p_reason: "Vendor price expired" })).error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("COMPLETED");
    const requisition = await requisitionOf(id);
    expect(requisition.status).toBe("COMPLETED");
    expect((await auditOf("sourcing", id)).at(-1)).toMatchObject({ from_status: "COMPARISON", to_status: "COMPLETED" });
    expect((await auditOf("requisition", requisition.id)).at(-1)).toMatchObject({ to_status: "COMPLETED" });
    const proposals = (await db.query("select vendor_id, status from public.proposal where sourcing_id = $1", [id])).rows;
    const statusOf = (key: Vendor) => proposals.find((p) => p.vendor_id === actors[key].vendorId)?.status;
    expect([statusOf("vendorA"), statusOf("vendorB"), statusOf("vendorC")]).toEqual(["NOT_AWARDED", "AWARDED", "NOT_AWARDED"]);
    const won = await notified("vendorB", "sourcing.completed", id);
    expect(won).toHaveLength(1);
    expect(won[0].params.lines).toContain("RLS7 item (4 bag, ");
    expect(won[0].params.lines).toContain((await poOf(id, "vendorB")).number);
    expect(await notified("vendorA", "sourcing.notAwarded", id)).toHaveLength(1);
    expect(await notified("vendorC", "sourcing.notAwarded", id)).toHaveLength(1);
    expect(await notified("vendorA", "sourcing.completed", id)).toHaveLength(0);
    expect(await notified("vendorD", "sourcing.notAwarded", id)).toHaveLength(0); // no submitted proposal
    // the PO stays ACCEPTED and the vendor still reads it
    expect(await poStatus(poB)).toBe("ACCEPTED");
    expect(((await actors.vendorB.client.rpc("po_list")).data as { status: string }[]).map((r) => r.status)).toEqual(["ACCEPTED"]);
  });
});

describe("Flow 2: package differences, vendor decline, re-award and completion", () => {
  let id = "";
  let poA = "";
  let poB = "";

  beforeAll(async () => {
    id = await offersClosed(
      [{ quantity: 10, price: 25 }],
      [{ key: "vendorA", prices: [23.6], vat: 18 }, { key: "vendorB", prices: [22] }, { key: "vendorC", prices: [30] }],
    );
    await sendAndApprove(id);
    poA = (await poOf(id, "vendorA")).id;
  }, 300_000);

  it("CMT-02 AC3: the PO decision shows every difference from the approved winner decision", async () => {
    // the frozen winner package is changed on purpose to force differences: another quantity and another Incoterm
    const winnerId = (await db.query("select winner_decision_id from public.purchase_order where id = $1", [poA])).rows[0].winner_decision_id;
    await db.query(
      `update public.decision set package = jsonb_set(jsonb_set(package, '{lines,0,quantity}', '99'), '{vendors,0,incoterm}', '"FOB"') where id = $1`,
      [winnerId],
    );
    const decision = await approvePo(poA);
    const pkg = (await actors.cm2.client.rpc("decision_package", { p_decision: decision.id })).data as {
      po: { same: boolean; differences: { field: string; winner: unknown; po: unknown }[]; po: { vendor: string; total: number; totalInclVat: number } };
    };
    expect(pkg.po.same).toBe(false);
    expect(pkg.po.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "quantity", winner: 99, po: 10 }),
        expect.objectContaining({ field: "incoterm", winner: "FOB", po: "DDP" }),
      ]),
    );
    expect(pkg.po.differences).toHaveLength(2);
    expect(pkg.po.po).toMatchObject({ total: 200, totalInclVat: 236 });
    await voteAll(decision.id);
    expect(await poStatus(poA)).toBe("FULLY_APPROVED");
  });

  it("PO-03 AC3: the vendor declines with a reason; the PO, the lines and the sourcing go back; the owner is notified", async () => {
    expect((await respond("vendorA", poA, "DECLINE", "  ")).error?.message).toBe("errors.reasonRequired");
    expect(await poStatus(poA)).toBe("FULLY_APPROVED");
    expect((await respond("vendorA", poA, "DECLINE", "Cannot deliver by the date")).error).toBeNull();
    expect((await db.query("select status, reason from public.purchase_order where id = $1", [poA])).rows[0]).toEqual({ status: "DECLINED_BY_VENDOR", reason: "Cannot deliver by the date" });
    expect(await notified("specialist", "po.declined", poA)).toEqual([expect.objectContaining({ params: { reason: "Cannot deliver by the date" } })]);
    expect(await awardStatuses(poA)).toEqual(["REJECTED"]);
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    // the vendor still reads the declined PO (its own); nobody else does
    expect(((await actors.vendorA.client.rpc("po_list")).data as { status: string }[]).map((r) => r.status)).toEqual(["DECLINED_BY_VENDOR"]);
    expect((await actors.vendorB.client.rpc("po_view", { p_id: poA })).data).toBeNull();
  });

  it("RFQ-05 AC7, PO-01: the owner re-awards; the new winner decision creates a PO only for the returned line", async () => {
    const [line] = await lineIds(id);
    expect((await comparison("specialist", id))!.lines.find((l) => l.id === line)).toMatchObject({ locked: false });
    expect((await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("IN_COMMITTEE");
    const decisions = await decisionsOf(id, "WINNER");
    expect(decisions).toHaveLength(2);
    await voteAll(decisions[1].id);
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED");
    const pos = await poRows(id);
    expect(pos).toHaveLength(2);
    expect(pos.map((p) => p.status).sort()).toEqual(["DECLINED_BY_VENDOR", "PENDING_APPROVAL"]);
    poB = (await poOf(id, "vendorB", "PENDING_APPROVAL")).id;
    expect(poB).toBeTruthy();
    expect(await poLines(poB)).toHaveLength(1);
    expect(await notified("approver", "po.created", poB)).toHaveLength(1);
    // WINNER_APPROVED is not a cancellable status; the PO rule itself is tested in flow 1 (sourcing back in COMPARISON)
    expect((await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Stop" })).error?.message).toBe("errors.statusChanged");
  });

  it("PO-03 AC4: the last accepted PO completes the sourcing; the declining vendor is Not awarded", async () => {
    const decision = await approvePo(poB);
    await voteAll(decision.id);
    expect(await poStatus(poB)).toBe("FULLY_APPROVED");
    expect((await respond("vendorB", poB, "ACCEPT")).error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("COMPLETED");
    expect((await requisitionOf(id)).status).toBe("COMPLETED");
    const proposals = (await db.query("select vendor_id, status from public.proposal where sourcing_id = $1", [id])).rows;
    const statusOf = (key: Vendor) => proposals.find((p) => p.vendor_id === actors[key].vendorId)?.status;
    expect([statusOf("vendorA"), statusOf("vendorB"), statusOf("vendorC")]).toEqual(["NOT_AWARDED", "AWARDED", "NOT_AWARDED"]);
    expect(await notified("vendorA", "sourcing.notAwarded", id)).toHaveLength(1);
    expect((await notified("vendorB", "sourcing.completed", id))[0].params.lines).toContain("RLS7 item (10 bag, ");
    // a closed sourcing accepts no further answers
    expect((await respond("vendorB", poB, "ACCEPT")).error?.message).toBe("errors.statusChanged");
  });
});

describe("Flow 3: separation of duties, committee rejection, NO_DECISION and Reopen", () => {
  let id = "";
  let poA = "";
  let poB = "";

  beforeAll(async () => {
    id = await offersClosed(
      [{ quantity: 10, price: 25 }],
      [{ key: "vendorA", prices: [20] }, { key: "vendorB", prices: [22] }],
      { owner: "ownerApprover", requester: "reqApprover" },
    );
    await sendAndApprove(id, "ownerApprover");
    poA = (await poOf(id, "vendorA")).id;
  }, 300_000);

  it("PO-01 AC3, PO-02 AC3: neither the Requester nor the sourcing owner is notified or may decide, although Approvers", async () => {
    expect(await notified("approver", "po.created", poA)).toHaveLength(1);
    expect(await notified("reqApprover", "po.created", poA)).toHaveLength(0);
    expect(await notified("ownerApprover", "po.created", poA)).toHaveLength(0);
    for (const key of ["reqApprover", "ownerApprover"] as const) {
      expect((await actors[key].client.rpc("po_decide", { p_po: poA, p_decision: "APPROVE", p_reason: null })).error?.message).toBe("errors.ownPurchaseOrder");
      expect((await actors[key].client.rpc("po_decide", { p_po: poA, p_decision: "REJECT", p_reason: "No" })).error?.message).toBe("errors.ownPurchaseOrder");
    }
    expect(await poStatus(poA)).toBe("PENDING_APPROVAL");
    expect(await decisionsOf(id, "PO")).toHaveLength(0);
  });

  it("CMT-02 AC10: the committee rejects the PO; it is REJECTED, its line returns, and the decision cannot be reopened", async () => {
    const decision = await approvePo(poA);
    await vote("cm1", decision.id, "FOR");
    await vote("cm2", decision.id, "AGAINST", "Delivery terms are unclear");
    await vote("cm3", decision.id, "AGAINST", "Price is above the market");
    expect((await db.query("select status, result_rule from public.decision where id = $1", [decision.id])).rows[0]).toEqual({ status: "REJECTED", result_rule: "MAJORITY" });
    expect(await poStatus(poA)).toBe("REJECTED");
    expect(await awardStatuses(poA)).toEqual(["REJECTED"]);
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
    expect((await auditOf("purchase_order", poA)).at(-1)).toMatchObject({ from_status: "PENDING_COMMITTEE", to_status: "REJECTED" });
    // Reopen vote works after NO_DECISION only (CMT-02 AC8)
    expect((await actors.ownerApprover.client.rpc("decision_reopen", { p_decision: decision.id, p_reason: "Please look again" })).error?.message).toBe("errors.statusChanged");
    // vendors never saw this PO
    expect(((await actors.vendorA.client.rpc("po_list")).data as { id: string }[]).filter((r) => r.id === poA)).toEqual([]);
    expect((await actors.vendorA.client.rpc("po_view", { p_id: poA })).data).toBeNull();
  });

  it("CMT-02 AC8: a PO decision without enough votes closes as NO_DECISION; only the owner reopens it, with the same package", async () => {
    expect((await actors.ownerApprover.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" })).error).toBeNull();
    const winner = (await decisionsOf(id, "WINNER")).at(-1);
    await voteAll(winner.id);
    poB = (await poOf(id, "vendorB", "PENDING_APPROVAL")).id;
    expect(poB).toBeTruthy();
    expect(Number((await db.query("select total from public.purchase_order where id = $1", [poB])).rows[0].total)).toBe(220);
    const decision = await approvePo(poB);
    await vote("cm1", decision.id, "FOR");
    await db.query("update public.decision set deadline = now() - interval '1 second' where id = $1", [decision.id]);
    await db.query("select app.close_due_decisions()");
    expect((await db.query("select status, result_rule from public.decision where id = $1", [decision.id])).rows[0]).toEqual({ status: "NO_DECISION", result_rule: "NO_QUORUM" });
    expect(await poStatus(poB)).toBe("PENDING_COMMITTEE"); // waits for the owner's Reopen
    expect((await actors.specialist2.client.rpc("decision_reopen", { p_decision: decision.id, p_reason: "" })).error?.message).toBe("errors.noAccess");
    const reopened = await actors.ownerApprover.client.rpc("decision_reopen", { p_decision: decision.id, p_reason: "" });
    expect(reopened.error).toBeNull();
    const now = (await db.query("select * from public.decision where id = $1", [reopened.data])).rows[0];
    expect(now).toMatchObject({ type: "PO", status: "VOTING", purchase_order_id: poB, reopened_from_id: decision.id });
    const frozen = (await db.query("select id, package from public.decision where id = any($1::uuid[])", [[decision.id, reopened.data]])).rows;
    const byId = (x: string) => frozen.find((r) => r.id === x)!.package;
    expect(byId(reopened.data as string)).toEqual(byId(decision.id));
    await voteAll(reopened.data as string);
    expect(await poStatus(poB)).toBe("FULLY_APPROVED");
  });
});
