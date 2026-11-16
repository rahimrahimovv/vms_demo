/**
 * RFQ-10 saving against the estimate (D-026), against vms-dev. Throwaway users and vendors, as in the other RLS suites.
 * Test values follow the backlog example scaled to an RFQ: 10 x 800.00 estimated = 8,000.00, awarded 10 x 745.00 =
 * 7,450.00, saving 550.00 = 6.9%. The second sourcing is above its estimate (Over estimate). Two vendors prove that the
 * estimate and the saving never reach a vendor: no vendor RPC, table read or notification carries them.
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
  const email = `rls10-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS10 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: data.user.id, role })));
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}
async function vendor(key: Vendor, ownerId = `HEAD10-${key}-${RUN}`) {
  const email = `rls10-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error: authError } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (authError) throw authError;
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS10 ${key} ${RUN}`, voen: `97${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
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
    p_lines: lines.map((l) => ({ item_id: item, quantity: l.quantity, estimated_unit_price: l.price, delivery_date: date, delivery_place_id: CENTRAL, specification: "RLS10 line" })),
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
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS10 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS10-${RUN}`, p_name: "RLS10 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS10 plan ${RUN}`, p_planned_amount: 100, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  otherPlace = (await db.query("select id from public.delivery_place where id <> $1 order by name limit 1", [CENTRAL])).rows[0].id;
  const m1 = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS10 mode ${RUN}`, p_is_active: true });
  if (m1.error) throw m1.error;
  mode = m1.data as string;
  const p1 = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS10 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
  if (p1.error) throw p1.error;
  payment = p1.data as string;

  await vendor("vendorA");
  await vendor("vendorB", `SHARED10-${RUN}`);
  await vendor("vendorC", `SHARED10-${RUN}`); // shares an owner with B (REG-06 AC8)
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
    await removeTestData(db, service, "rls10");
  } finally {
    await db.end();
  }
}, 300_000);

const voteAll = async (decision: string) => { for (const k of ["cm1", "cm2", "cm3"] as const) await vote(k, decision, "FOR"); };
type SavingJson = { lines: { lineId: string; estimated: number; awarded: number; saving: number }[]; estimated: number; awarded: number; saving: number; percent: number; over: boolean };
const savingRows = async (key: Internal | Vendor) =>
  (await actors[key].client.rpc("sourcing_savings")).data as { sourcing_id: string; estimated: number; awarded: number; saving: number; percent: number; over: boolean }[] | null;
/** Everything a vendor can read about a sourcing must be free of the estimate and the saving. */
const leaks = (value: unknown) => /estimat|saving/i.test(JSON.stringify(value ?? null));

describe("RFQ-10 saving against the estimate", () => {
  let id = "";
  let over = "";
  let poA = "";
  beforeAll(async () => {
    // 10 x estimate 800.00; vendor A offers 745.00 (winner), vendor B 760.00
    id = await start([{ quantity: 10, price: 800 }]);
    await offer("vendorA", id, { prices: [745] });
    await offer("vendorB", id, { prices: [760] });
    // above its estimate: 10 x 700.00 estimated, vendor A wins with 745.00
    over = await start([{ quantity: 10, price: 700 }]);
    await offer("vendorA", over, { prices: [745] });
    await offer("vendorB", over, { prices: [760] });
    await closeNow(id);
    await closeNow(over);
  }, 300_000);

  it("comparison: estimate, winner's price and saving per line and in total, computed on the server (6.9%)", async () => {
    const c = (await actors.specialist.client.rpc("sourcing_comparison", { p_id: id })).data as { saving: SavingJson };
    expect(c.saving.estimated).toBe(8000);
    expect(c.saving.awarded).toBe(7450);
    expect(c.saving.saving).toBe(550);
    expect(c.saving.percent).toBe(6.9);
    expect(c.saving.over).toBe(false);
    expect(c.saving.lines).toEqual([expect.objectContaining({ estimated: 8000, awarded: 7450, saving: 550 })]);
    const o = (await actors.specialist.client.rpc("sourcing_comparison", { p_id: over })).data as { saving: SavingJson };
    expect(o.saving).toMatchObject({ estimated: 7000, awarded: 7450, saving: -450, over: true });
  });

  it("sealed and role-bound: the Approver, the Requester and vendors get no comparison", async () => {
    for (const k of ["approver", "requester", "vendorA", "vendorB"] as const) {
      expect((await actors[k].client.rpc("sourcing_comparison", { p_id: id })).data).toBeNull();
    }
  });

  it("list: no saving before WINNER_APPROVED; the frozen package holds it; the list shows it after approval", async () => {
    expect((await savingRows("specialist"))!.filter((r) => r.sourcing_id === id)).toEqual([]);
    const sent = await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: id, p_reason: "" });
    if (sent.error) throw sent.error;
    const [winner] = await decisionsOf(id, "WINNER");
    const pkg = (await actors.cm1.client.rpc("decision_package", { p_decision: winner.id })).data as { comparison: { saving: SavingJson } };
    expect(pkg.comparison.saving).toMatchObject({ estimated: 8000, awarded: 7450, saving: 550, percent: 6.9 });
    const stored = (await db.query("select package -> 'saving' as saving from public.decision where id = $1", [winner.id])).rows[0].saving;
    expect(stored).toMatchObject({ estimated: 8000, awarded: 7450, saving: 550, percent: 6.9 });
    expect(((await actors.approver.client.rpc("decision_package", { p_decision: winner.id })).data as { comparison: unknown }).comparison).toBeNull();
    await voteAll(winner.id);
    expect((await sourcingRow(id)).status).toBe("WINNER_APPROVED");
    const row = (await savingRows("specialist"))!.find((r) => r.sourcing_id === id);
    expect(row).toMatchObject({ estimated: 8000, awarded: 7450, saving: 550, percent: 6.9, over: false });
    expect((await savingRows("cm1"))!.some((r) => r.sourcing_id === id)).toBe(true);
    for (const k of ["approver", "requester", "vendorA", "vendorB"] as const) expect((await savingRows(k)) ?? []).toEqual([]);
  });

  it("an over-estimate winner shows Over estimate with a negative saving in the list", async () => {
    const sent = await actors.specialist.client.rpc("sourcing_send_to_committee", { p_id: over, p_reason: "Single offer" });
    if (sent.error) throw sent.error;
    await voteAll((await decisionsOf(over, "WINNER"))[0].id);
    const row = (await savingRows("specialist"))!.find((r) => r.sourcing_id === over);
    expect(row).toMatchObject({ estimated: 7000, awarded: 7450, saving: -450, over: true });
  });

  it("PO: internal readers see the saving on the order (the Approver too); vendors never", async () => {
    poA = (await db.query("select id from public.purchase_order where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0].id;
    for (const k of ["specialist", "approver"] as const) {
      const v = (await actors[k].client.rpc("po_view", { p_id: poA })).data as { saving: SavingJson };
      expect(v.saving).toMatchObject({ estimated: 8000, awarded: 7450, saving: 550, percent: 6.9 });
    }
    expect((await actors.approver.client.rpc("po_decide", { p_po: poA, p_decision: "APPROVE", p_reason: null })).error).toBeNull();
    const decision = (await db.query("select id from public.decision where purchase_order_id = $1", [poA])).rows[0];
    await voteAll(decision.id);
    expect((await db.query("select status from public.purchase_order where id = $1", [poA])).rows[0].status).toBe("FULLY_APPROVED");
    const own = (await actors.vendorA.client.rpc("po_view", { p_id: poA })).data as Record<string, unknown>;
    expect(own).toMatchObject({ total: 7450 });
    expect(own.saving ?? null).toBeNull();
    expect(leaks(own)).toBe(false);
    expect((await actors.vendorB.client.rpc("po_view", { p_id: poA })).data).toBeNull();
  });

  it("vendors (two of them) never receive the estimate or the saving from any function, table or notification", async () => {
    for (const k of ["vendorA", "vendorB"] as const) {
      const c = actors[k].client;
      expect(leaks((await c.rpc("vendor_invitation_list")).data)).toBe(false);
      expect(leaks((await c.rpc("vendor_invitation_view", { p_sourcing: id })).data)).toBe(false);
      expect(leaks((await c.rpc("vendor_invitation_view", { p_sourcing: over })).data)).toBe(false);
      expect(leaks((await c.rpc("po_list")).data)).toBe(false);
      expect(leaks((await c.rpc("vendor_qa", { p_sourcing: id })).data)).toBe(false);
      for (const t of ["proposal", "proposal_line", "invitation", "notification"]) {
        expect(leaks((await c.from(t).select("*")).data)).toBe(false);
      }
      expect((await c.from("requisition_line").select("id")).data ?? []).toEqual([]);
      expect((await c.from("requisition").select("id")).data ?? []).toEqual([]);
      expect(leaks((await c.from("sourcing_line").select("*")).data)).toBe(false);
      expect((await c.rpc("sourcing_savings")).data ?? []).toEqual([]);
      expect((await c.rpc("sourcing_comparison", { p_id: id })).data).toBeNull();
      // the internal helpers are not callable at all
      expect((await c.rpc("sourcing_saving" as never, { p_sourcing: id } as never)).error).not.toBeNull();
      expect((await c.rpc("po_saving" as never, { p_po: poA } as never)).error).not.toBeNull();
    }
    for (const k of ["vendorA", "vendorB"] as const) {
      const notes = (await db.query("select params, event from public.notification where user_id = $1", [actors[k].id])).rows;
      expect(leaks(notes)).toBe(false);
    }
  });
});
