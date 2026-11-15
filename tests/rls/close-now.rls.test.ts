/**
 * RFQ-09 (D-025), "Specialist closes a sourcing early", against vms-dev. Throwaway users, vendors on the AVL, a category, an item
 * and a plan line; a throwaway committee replaces the demo committee for the run and the demo committee is put back exactly as it was.
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
  const email = `rls9-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS9 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: data.user.id, role })));
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}
async function vendor(key: Vendor) {
  const email = `rls9-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error: authError } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (authError) throw authError;
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS9 ${key} ${RUN}`, voen: `97${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ", legal_address: "Test street 9", director_name: "Test Director", is_vat_payer: true,
      contact_person: "Test Contact", contact_email: email, phone: "+994500000009", founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: `HEADQ-${key}-${RUN}`, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0009", swift: "TESTAZ22", currency: "AZN", is_main: true }],
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
async function approvedPr(quantity: number, price: number) {
  const date = await plusDays(30);
  const saved = await actors.requester.client.rpc("requisition_save", {
    p_id: null, p_plan_line_id: planLine, p_submit: true,
    p_lines: [{ item_id: item, quantity, estimated_unit_price: price, delivery_date: date, delivery_place_id: CENTRAL, specification: "RLS9 line" }],
  });
  if (saved.error) throw saved.error;
  const decided = await actors.approver.client.rpc("requisition_decide", { p_id: saved.data, p_decision: "APPROVE", p_comment: null });
  if (decided.error) throw decided.error;
  return saved.data as string;
}
/** A published sourcing; value = quantity x price decides RFQ (band) or Tender; `ssp` makes it a Single Source Purchase. */
async function start(quantity: number, price: number, ssp?: Vendor, hours = 72) {
  const pr = await approvedPr(quantity, price);
  const c = actors.specialist.client;
  const started = await c.rpc("sourcing_start", { p_requisition: pr, p_method: ssp ? "SINGLE_SOURCE" : "COMPETITIVE", p_ssp_vendor: ssp ? actors[ssp].vendorId : undefined });
  if (started.error) throw started.error;
  const id = started.data as string;
  const saved = await c.rpc("sourcing_save", {
    p_id: id, p_deadline: new Date(Date.now() + hours * 3600_000).toISOString(), p_incoterm: "DDP", p_named_place: CENTRAL,
    p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: ssp ? "Only importer" : "", p_excluded: [],
  });
  if (saved.error) throw saved.error;
  if (ssp) await service.from("file").insert({ company_id: COMPANY_ID, owner_type: "sourcing", owner_id: id, kind: "justification", file_name: "j.pdf", mime_type: "application/pdf", size_bytes: 10, storage_path: `rls9/${RUN}/${randomUUID()}.pdf` });
  const published = await c.rpc("sourcing_publish", { p_id: id });
  if (published.error) throw published.error;
  return id;
}
const lineId = async (sourcingId: string) => (await db.query("select id from public.sourcing_line where sourcing_id = $1 limit 1", [sourcingId])).rows[0].id as string;
async function offer(key: Vendor, sourcingId: string, submit = true) {
  const c = actors[key].client;
  const accepted = await c.rpc("invitation_accept", { p_sourcing: sourcingId });
  if (accepted.error) throw accepted.error;
  const saved = await c.rpc("proposal_save", {
    p_sourcing: sourcingId, p_submit: submit,
    p_terms: { incoterm: "DDP", named_place_id: CENTRAL, delivery_mode_id: mode, payment_term_id: payment, prices_include_vat: false, vat_rate: 0, delivery_days: 20, validity_days: 30, comment: "" },
    p_lines: [{ sourcing_line_id: await lineId(sourcingId), unit_price: 20 }],
  });
  if (saved.error) throw saved.error;
}
const decline = async (key: Vendor, id: string) => {
  const r = await actors[key].client.rpc("invitation_decline", { p_sourcing: id, p_reason: "No stock" });
  if (r.error) throw r.error;
};
const closeNow = (key: Internal, id: string, reason = "All vendors have answered") => actors[key].client.rpc("close_now", { p_sourcing: id, p_reason: reason });
const row = async (id: string) => (await db.query("select status, deadline from public.sourcing where id = $1", [id])).rows[0];
const auditCount = async (id: string) => (await db.query("select count(*)::int as n from public.audit_entry where record_type = 'sourcing' and record_id = $1", [id])).rows[0].n as number;
const notices = async (key: Internal | Vendor, event: string, id: string) =>
  (await db.query("select params from public.notification where user_id = $1 and event = $2 and record_id = $3", [actors[key].id, event, id])).rows;

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
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS9 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS9-${RUN}`, p_name: "RLS9 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS9 plan ${RUN}`, p_planned_amount: 100, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  const m1 = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS9 mode ${RUN}`, p_is_active: true });
  if (m1.error) throw m1.error;
  mode = m1.data as string;
  const p1 = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS9 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
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
    await service.from("file").delete().like("storage_path", `rls9/${RUN}/%`);
    await removeTestData(db, service, "rls9");
  } finally {
    await db.end();
  }
}, 300_000);

describe("RFQ-09: the refusals change nothing", () => {
  it("only the owner may close; a reason is required; the sourcing must be OPEN; nothing changes after a refusal", async () => {
    const id = await start(10, 25); // RFQ, all four vendors invited
    for (const key of ["vendorA", "vendorB", "vendorC", "vendorD"] as const) await decline(key, id);
    const before = { ...(await row(id)), audit: await auditCount(id) };

    expect((await closeNow("specialist2", id)).error?.message).toBe("errors.noAccess"); // another specialist, not the owner
    for (const key of ["requester", "approver", "admin", "cm1"] as const) expect((await closeNow(key, id)).error?.message, key).toBe("errors.noAccess");
    expect((await actors.vendorA.client.rpc("close_now", { p_sourcing: id, p_reason: "x" })).error?.message).toBe("errors.noAccess");
    expect((await anon().rpc("close_now", { p_sourcing: id, p_reason: "x" })).error?.code).toBe("42501");
    expect((await closeNow("specialist", id, "")).error?.message).toBe("errors.required");
    expect((await closeNow("specialist", id, "   ")).error?.message).toBe("errors.required");
    expect({ ...(await row(id)), audit: await auditCount(id) }).toEqual(before);

    // not OPEN: closed once, a second call is refused
    expect((await closeNow("specialist", id)).error).toBeNull();
    expect((await closeNow("specialist", id)).error?.message).toBe("errors.statusChanged");
    // a DRAFT sourcing cannot be closed either
    const pr = await approvedPr(10, 25);
    const draft = await actors.specialist.client.rpc("sourcing_start", { p_requisition: pr, p_method: "COMPETITIVE" });
    expect((await closeNow("specialist", draft.data as string)).error?.message).toBe("errors.statusChanged");
  });

  it("every invitation must be answered: INVITED, ACCEPTED without a proposal, a saved but unsubmitted proposal and a withdrawn one all block", async () => {
    const id = await start(10, 25);
    const detail = async () => {
      const r = await closeNow("specialist", id);
      expect(r.error?.message).toBe("errors.vendorsNotAnswered");
      return Number(r.error?.details);
    };
    expect(await detail()).toBe(4); // nobody answered
    await decline("vendorD", id);
    expect(await detail()).toBe(3);
    await actors.vendorC.client.rpc("invitation_accept", { p_sourcing: id });
    expect(await detail()).toBe(3); // accepted is not an answer
    await offer("vendorB", id, false); // saved, not submitted
    expect(await detail()).toBe(3);
    await offer("vendorA", id, true);
    expect(await detail()).toBe(2);
    const w = await actors.vendorA.client.rpc("proposal_withdraw", { p_sourcing: id });
    expect(w.error).toBeNull();
    expect(await detail()).toBe(3); // a withdrawn proposal is no answer

    // the page state names the vendors that have not answered, to the owner only
    const state = (await actors.specialist.client.rpc("close_now_state", { p_sourcing: id })).data as { unanswered: string[] };
    expect(state.unanswered.sort()).toEqual([`RLS9 vendorA ${RUN}`, `RLS9 vendorB ${RUN}`, `RLS9 vendorC ${RUN}`]);
    expect((await actors.specialist2.client.rpc("close_now_state", { p_sourcing: id })).data).toBeNull();
    expect((await actors.vendorA.client.rpc("close_now_state", { p_sourcing: id })).data).toBeNull();

    expect(await row(id)).toMatchObject({ status: "OPEN" }); // nothing changed
    expect(await notices("vendorA", "sourcing.closedEarly", id)).toHaveLength(0);
  });
});

describe("RFQ-09: closing early", () => {
  it("RFQ: COMPARISON at once, audit entry with the user, the reason and the original deadline, vendors with a submitted proposal notified (without the reason)", async () => {
    const id = await start(10, 25);
    await offer("vendorA", id);
    await offer("vendorC", id);
    await decline("vendorB", id);
    await decline("vendorD", id);
    const original = (await row(id)).deadline as Date;
    const t0 = Date.now();
    const closed = await closeNow("specialist", id, "Both quotes are in, no need to wait");
    expect(closed.error).toBeNull();
    const after = await row(id);
    expect(after.status).toBe("COMPARISON");
    expect(Math.abs((after.deadline as Date).getTime() - t0)).toBeLessThan(15_000); // the deadline is now
    expect(after.deadline.getTime()).toBeLessThan(original.getTime());

    const audit = (await db.query(
      "select from_status, to_status, user_id, reason, created_at from public.audit_entry where record_type = 'sourcing' and record_id = $1 order by created_at, id", [id])).rows;
    const early = audit.filter((a) => /^Closed early: /.test(a.reason ?? ""));
    expect(early.map((a) => `${a.from_status}>${a.to_status}`).sort()).toEqual(["CLOSED>COMPARISON", "OPEN>CLOSED"]); // written in one transaction: same instant
    for (const a of early) {
      expect(a.user_id).toBe(actors.specialist.id);
      expect(a.reason).toContain("Both quotes are in, no need to wait");
      expect(a.reason).toMatch(/\(original deadline \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}\)$/);
      expect(Math.abs(a.created_at.getTime() - t0)).toBeLessThan(30_000);
    }

    for (const key of ["vendorA", "vendorC"] as const) {
      const n = await notices(key, "sourcing.closedEarly", id);
      expect(n, key).toHaveLength(1);
      expect(JSON.stringify(n[0].params)).not.toContain("Both quotes");
    }
    for (const key of ["vendorB", "vendorD"] as const) expect(await notices(key, "sourcing.closedEarly", id), key).toHaveLength(0); // declined
    expect(await notices("specialist", "sourcing.closed", id)).toHaveLength(1); // the owner's usual notice
    // the vendor's own page does not carry the reason either
    const view = await actors.vendorA.client.rpc("vendor_invitation_view", { p_sourcing: id });
    expect(JSON.stringify(view.data)).not.toContain("Both quotes");
  });

  it("below the minimum the sourcing stays CLOSED with Extend, Continue and Cancel, as at a normal deadline", async () => {
    const id = await start(500, 30); // 15,000.00: RFQ, minimum 2
    await offer("vendorA", id);
    await decline("vendorB", id);
    await decline("vendorC", id);
    await decline("vendorD", id);
    expect((await closeNow("specialist", id)).error).toBeNull();
    expect((await row(id)).status).toBe("CLOSED");
    expect((await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Not enough bids" })).error).toBeNull();
  });

  it("a Tender goes to AWAITING_OPENING with its OPENING decision", async () => {
    const id = await start(2000, 30); // 60,000.00: Tender, minimum 3
    await offer("vendorA", id);
    await offer("vendorB", id);
    await offer("vendorC", id);
    await decline("vendorD", id);
    expect((await closeNow("specialist", id)).error).toBeNull();
    expect((await row(id)).status).toBe("AWAITING_OPENING");
    const d = await db.query("select type, status from public.decision where sourcing_id = $1", [id]);
    expect(d.rows).toEqual([{ type: "OPENING", status: "VOTING" }]);
  });

  it("SSP: the one invited vendor answers, then it closes to COMPARISON", async () => {
    const id = await start(5, 40, "vendorA"); // 200.00, below the single-source limit
    expect((await closeNow("specialist", id)).error?.message).toBe("errors.vendorsNotAnswered"); // the vendor has not answered
    await offer("vendorA", id);
    expect((await closeNow("specialist", id)).error).toBeNull();
    expect((await row(id)).status).toBe("COMPARISON");
    expect(await notices("vendorA", "sourcing.closedEarly", id)).toHaveLength(1);
  });

  it("the deadline job is unchanged: a normal deadline still closes with the reason 'Deadline passed' and no early-close notice", async () => {
    const id = await start(10, 25);
    await offer("vendorA", id);
    for (const key of ["vendorB", "vendorC", "vendorD"] as const) await decline(key, id);
    await db.query("update public.sourcing set deadline = now() - interval '1 second' where id = $1", [id]);
    await db.query("select app.close_due_sourcings()");
    expect((await row(id)).status).toBe("COMPARISON");
    const reasons = (await db.query("select reason from public.audit_entry where record_type = 'sourcing' and record_id = $1 and to_status in ('CLOSED', 'COMPARISON')", [id])).rows.map((r) => r.reason);
    expect(reasons).toEqual(["Deadline passed", "Deadline passed"]);
    expect(await notices("vendorA", "sourcing.closedEarly", id)).toHaveLength(0);
  });

  it("no API role can run the internal closing function, and the demo tool's functions are gone", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1, 'app.close_open_sourcing(uuid, text)', 'execute') as ok", [role]);
      expect(rows[0].ok, role).toBe(false);
    }
    const gone = await db.query("select count(*)::int as n from pg_proc where proname in ('demo_end_deadline', 'demo_deadline_info')");
    expect(gone.rows[0].n).toBe(0);
  });
});
