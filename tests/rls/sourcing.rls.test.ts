/**
 * Slice 4 (RFQ-01, RFQ-02, RFQ-04, RFQ-06) against vms-dev. Throwaway users (two Procurement Specialists, a
 * Requester, an Approver, a Committee Member, an Admin) and three vendors (A and B on the AVL, C not) work on
 * their own test category, item and plan line; everything is removed afterwards. Deadlines are moved into the
 * past with SQL and the deadline job is run directly, as pg_cron does every minute.
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
const SEED = { centralWarehouse: "00000000-0000-4000-8000-000000000301" };
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Key = "specialist" | "specialist2" | "requester" | "approver" | "committee" | "admin" | "vendorA" | "vendorB" | "vendorC";
type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<Key, Actor>;
let root = "";
let item = "";
let planLine = "";
let place = "";
let mode = "";
let payment = "";
const created = { categories: [] as string[], items: [] as string[], planLines: [] as string[] };

const anon = () => createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}
async function createUser(key: Key, email: string) {
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}
async function internal(key: Exclude<Key, "vendorA" | "vendorB" | "vendorC">, roles: string[]) {
  const email = `rls4-${key.toLowerCase()}-${RUN}@rls.test`;
  const id = await createUser(key, email);
  await service.from("app_user").insert({ id, company_id: COMPANY_ID, full_name: `RLS4 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: id, role })));
  actors[key] = { id, email, client: await signIn(email) };
}
async function vendor(key: "vendorA" | "vendorB" | "vendorC", onAvl: boolean) {
  const email = `rls4-${key.toLowerCase()}-${RUN}@rls.test`;
  const id = await createUser(key, email);
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS4 ${key} ${RUN}`, voen: `95${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ", legal_address: "Test street 4", director_name: "Test Director", is_vat_payer: true,
      contact_person: "Test Contact", contact_email: email, phone: "+994500000004", founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: `HEAD4-${key}-${RUN}`, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0004", swift: "TESTAZ22", currency: "AZN", is_main: true }],
  });
  if (error) throw error;
  if (onAvl) {
    await db.query("update public.vendor set status = 'APPROVED', standing = 'ACTIVE' where id = $1", [vendorId]);
    await db.query(
      `insert into public.questionnaire_response (company_id, vendor_id, attempt_no, status, score, grade, valid_until)
       values ($1, $2, 1, 'GRADED', 80, 'B', app.today() + 300)`,
      [COMPANY_ID, vendorId],
    );
    await db.query(
      `insert into public.category_application (company_id, vendor_id, category_id, status, valid_until)
       values ($1, $2, $3, 'QUALIFIED', app.today() + 300)`,
      [COMPANY_ID, vendorId, root],
    );
  }
  actors[key] = { id, email, client: await signIn(email), vendorId };
}

const plusDays = async (n: number) => (await db.query("select (app.today() + $1::int)::text as d", [n])).rows[0].d as string;

/** An APPROVED PR worth quantity × price (estimated value, excluding VAT). */
async function approvedPr(quantity: number, price: number) {
  const lines = [{
    item_id: item, quantity, estimated_unit_price: price, delivery_date: await plusDays(30),
    delivery_place_id: SEED.centralWarehouse, specification: "RLS4 line",
  }];
  const saved = await actors.requester.client.rpc("requisition_save", { p_id: null, p_plan_line_id: planLine, p_lines: lines, p_submit: true });
  if (saved.error) throw saved.error;
  const decided = await actors.approver.client.rpc("requisition_decide", { p_id: saved.data, p_decision: "APPROVE", p_comment: null });
  if (decided.error) throw decided.error;
  return saved.data as string;
}
async function startRfq(quantity: number, price: number, owner: Key = "specialist") {
  const pr = await approvedPr(quantity, price);
  const { data, error } = await actors[owner].client.rpc("sourcing_start", { p_requisition: pr, p_method: "COMPETITIVE" });
  if (error) throw error;
  return { pr, id: data as string };
}
async function sourcingRow(id: string) {
  return (await db.query("select * from public.sourcing where id = $1", [id])).rows[0];
}
async function prStatus(id: string) {
  return (await db.query("select status from public.requisition where id = $1", [id])).rows[0].status as string;
}
/** Fills the DRAFT terms with a deadline set by hand and publishes. */
async function publish(id: string, opts: { excluded?: string[]; hours?: number; owner?: Key; techDoc?: boolean } = {}) {
  const c = actors[opts.owner ?? "specialist"].client;
  const deadline = new Date(Date.now() + (opts.hours ?? 72) * 3600_000).toISOString();
  const saved = await c.rpc("sourcing_save", {
    p_id: id, p_deadline: deadline, p_incoterm: "DDP", p_named_place: place, p_delivery_mode: mode, p_payment_term: payment,
    p_tech_doc: opts.techDoc ?? false, p_justification: "", p_excluded: opts.excluded ?? [],
  });
  if (saved.error) return saved;
  return c.rpc("sourcing_publish", { p_id: id });
}
async function pastDeadline(id: string) {
  await db.query("update public.sourcing set deadline = now() - interval '1 second' where id = $1", [id]);
  await db.query("select app.close_due_sourcings()");
}
async function lineIds(sourcingId: string) {
  return (await db.query("select id from public.sourcing_line where sourcing_id = $1", [sourcingId])).rows.map((r) => r.id as string);
}
async function offer(vendorKey: "vendorA" | "vendorB", sourcingId: string, price = 24.5) {
  const c = actors[vendorKey].client;
  const accepted = await c.rpc("invitation_accept", { p_sourcing: sourcingId });
  if (accepted.error) throw accepted.error;
  const ids = await lineIds(sourcingId);
  const terms = { incoterm: "DDP", named_place_id: place, delivery_mode_id: mode, payment_term_id: payment, prices_include_vat: false, vat_rate: 0, delivery_days: 10, validity_days: 30, comment: "" };
  return c.rpc("proposal_save", {
    p_sourcing: sourcingId, p_terms: terms, p_lines: ids.map((i) => ({ sourcing_line_id: i, unit_price: price })), p_submit: true,
  });
}
const terms = { incoterm: "DDP", named_place_id: "", delivery_mode_id: "", payment_term_id: "", prices_include_vat: false, vat_rate: 0 };

beforeAll(async () => {
  await db.connect();
  await internal("specialist", ["PROCUREMENT_SPECIALIST"]);
  await internal("specialist2", ["PROCUREMENT_SPECIALIST"]);
  await internal("requester", ["REQUESTER"]);
  await internal("approver", ["APPROVER"]);
  await internal("committee", ["COMMITTEE_MEMBER"]);
  await internal("admin", ["ADMIN"]);

  const admin = actors.admin.client;
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS4 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  created.categories.push(root);
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS4-${RUN}`, p_name: "RLS4 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  created.items.push(item);
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS4 plan ${RUN}`, p_planned_amount: 100, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  created.planLines.push(planLine);

  place = SEED.centralWarehouse;
  const m = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS4 mode ${RUN}`, p_is_active: true });
  if (m.error) throw m.error;
  mode = m.data as string;
  const p = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS4 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
  if (p.error) throw p.error;
  payment = p.data as string;
  terms.named_place_id = place;
  terms.delivery_mode_id = mode;
  terms.payment_term_id = payment;

  await vendor("vendorA", true);
  await vendor("vendorB", true);
  await vendor("vendorC", false);
}, 180_000);

afterAll(async () => {
  try {
    await removeTestData(db, service, "rls4");
  } finally {
    await db.end();
  }
}, 180_000);

describe("RFQ-01 type, minimum and start", () => {
  it("AC3: bands 1 up to 5,000, 2 above up to 15,000, 3 above; Tender 3; SSP 1", async () => {
    const min = async (type: string, value: number) =>
      (await db.query("select app.min_proposals($1, $2, $3) as m", [COMPANY_ID, type, value])).rows[0].m;
    expect([await min("RFQ", 5000), await min("RFQ", 5000.01), await min("RFQ", 15000), await min("RFQ", 15000.01)]).toEqual([1, 2, 2, 3]);
    expect([await min("TENDER", 60000), await min("SSP", 99999)]).toEqual([3, 1]);
  });

  it("AC1-AC2: an APPROVED PR becomes IN_SOURCING and a DRAFT SRC-YYYY-NNNN is created; below the threshold it is an RFQ", async () => {
    const { pr, id } = await startRfq(10, 25.5);
    const s = await sourcingRow(id);
    expect(s).toMatchObject({ status: "DRAFT", type: "RFQ", method: "COMPETITIVE", min_proposals: 1, owner_id: actors.specialist.id, deadline_prefilled: true });
    expect(s.number).toMatch(/^SRC-\d{4}-\d{4}$/);
    expect(Number(s.value)).toBe(255);
    expect(s.required_incoterm).toBe("DDP");
    expect(s.named_place_id).toBe(SEED.centralWarehouse);
    expect(await prStatus(pr)).toBe("IN_SOURCING");
    expect((await lineIds(id)).length).toBe(1);
  });

  it("AC2: exactly at the threshold (50,000.00) it is a Tender with a technical document by default and minimum 3", async () => {
    const { id } = await startRfq(2000, 25);
    expect(await sourcingRow(id)).toMatchObject({ type: "TENDER", min_proposals: 3, tech_doc_required: true });
  });

  it("only an APPROVED PR can be started, and only by a Procurement Specialist", async () => {
    const { pr } = await startRfq(1, 10);
    const again = await actors.specialist.client.rpc("sourcing_start", { p_requisition: pr, p_method: "COMPETITIVE" });
    expect(again.error?.message).toBe("errors.statusChanged");
    const second = await approvedPr(1, 10);
    const requester = await actors.requester.client.rpc("sourcing_start", { p_requisition: second, p_method: "COMPETITIVE" });
    expect(requester.error?.message).toBe("errors.noAccess");
  });
});

describe("RFQ-01 publish and RFQ-02 vendor side", () => {
  let id = "";
  it("AC4: a hand-set deadline must be later than now; the untouched prefilled one is recalculated at Publish", async () => {
    ({ id } = await startRfq(10, 25.5));
    const past = await actors.specialist.client.rpc("sourcing_save", {
      p_id: id, p_deadline: new Date(Date.now() - 3600_000).toISOString(), p_incoterm: "DDP", p_named_place: place,
      p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: "", p_excluded: [],
    });
    expect(past.error?.message).toBe("errors.deadlinePast");

    // untouched prefilled deadline made stale: Publish counts from the publish time (+3 days)
    const before = await sourcingRow(id);
    await db.query("update public.sourcing set deadline = now() - interval '5 days' where id = $1", [id]);
    const saved = await actors.specialist.client.rpc("sourcing_save", {
      p_id: id, p_deadline: new Date(Math.floor((await sourcingRow(id)).deadline.getTime() / 60000) * 60000).toISOString(), p_incoterm: "DDP", p_named_place: place,
      p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: "", p_excluded: [],
    });
    expect(saved.error).toBeNull();
    expect((await sourcingRow(id)).deadline_prefilled).toBe(true);
    expect(before.deadline_prefilled).toBe(true);
    const published = await actors.specialist.client.rpc("sourcing_publish", { p_id: id });
    expect(published.error).toBeNull();
    const s = await sourcingRow(id);
    const days = (s.deadline.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThan(3.01);
    expect(s.status).toBe("OPEN");
  });

  it("AC5/AC7: invitations go to the AVL vendors only (A and B, not C); the vendors are notified with the deadline", async () => {
    const { rows } = await db.query("select vendor_id, status from public.invitation where sourcing_id = $1", [id]);
    expect(rows.map((r) => r.vendor_id).sort()).toEqual([actors.vendorA.vendorId, actors.vendorB.vendorId].sort());
    expect(rows.every((r) => r.status === "INVITED")).toBe(true);
    const n = await db.query("select params from public.notification where user_id = $1 and event = 'sourcing.published' and record_id = $2", [actors.vendorA.id, id]);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0].params.deadline).toBeTruthy();
    const none = await db.query("select 1 from public.notification where user_id = $1 and event = 'sourcing.published'", [actors.vendorC.id]);
    expect(none.rows).toHaveLength(0);
  });

  it("only the owner publishes or cancels; another specialist is refused", async () => {
    const other = await startRfq(5, 10);
    const r = await actors.specialist2.client.rpc("sourcing_publish", { p_id: other.id });
    expect(r.error?.message).toBe("errors.noAccess");
    const c = await actors.specialist2.client.rpc("sourcing_cancel", { p_id: other.id, p_reason: "x" });
    expect(c.error?.message).toBe("errors.noAccess");
  });

  it("AC5: removing every vendor shows 'Invite at least one vendor' and the sourcing stays DRAFT", async () => {
    const { id: draft } = await startRfq(5, 10);
    const r = await publish(draft, { excluded: [actors.vendorA.vendorId!, actors.vendorB.vendorId!] });
    expect(r.error?.message).toBe("errors.noInvitees");
    expect((await sourcingRow(draft)).status).toBe("DRAFT");
  });

  it("RFQ-02 AC9 / NFR-001: a vendor reads only its own invitation; the sourcing tables stay closed to vendors", async () => {
    const a = await actors.vendorA.client.rpc("vendor_invitation_list");
    expect((a.data as { sourcing_id: string }[]).some((r) => r.sourcing_id === id)).toBe(true);
    expect((await actors.vendorC.client.rpc("vendor_invitation_list")).data).toEqual([]);
    expect((await actors.vendorC.client.rpc("vendor_invitation_view", { p_sourcing: id })).data).toBeNull();
    expect((await actors.vendorA.client.from("sourcing").select("id")).data).toEqual([]);
    expect((await actors.vendorA.client.from("requisition_line").select("id")).data).toEqual([]);
    const view = (await actors.vendorA.client.rpc("vendor_invitation_view", { p_sourcing: id })).data as { lines: Record<string, unknown>[] };
    expect(view.lines).toHaveLength(1);
    expect(Object.keys(view.lines[0]).some((k) => /price/i.test(k))).toBe(false);
  });

  it("AC2: Decline needs a reason, then it is DECLINED, the owner sees the reason, the vendor cannot submit", async () => {
    const noReason = await actors.vendorB.client.rpc("invitation_decline", { p_sourcing: id, p_reason: " " });
    expect(noReason.error?.message).toBe("errors.required");
    const ok = await actors.vendorB.client.rpc("invitation_decline", { p_sourcing: id, p_reason: "Out of stock" });
    expect(ok.error).toBeNull();
    const seen = await actors.specialist.client.from("invitation").select("status, decline_reason").eq("vendor_id", actors.vendorB.vendorId!).eq("sourcing_id", id);
    expect(seen.data).toEqual([{ status: "DECLINED", decline_reason: "Out of stock" }]);
    const submit = await actors.vendorB.client.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [], p_submit: true });
    expect(submit.error?.message).toBe("errors.statusChanged");
    expect((await actors.vendorA.client.from("invitation").select("decline_reason").eq("vendor_id", actors.vendorB.vendorId!)).data).toEqual([]);
  });

  it("AC3-AC5: price rules, VAT rate, at least one priced line; Submit makes it SUBMITTED", async () => {
    const c = actors.vendorA.client;
    expect((await c.rpc("invitation_accept", { p_sourcing: id })).error).toBeNull();
    const [line] = await lineIds(id);
    const save = (lines: unknown[], t: Record<string, unknown> = terms, submit = false) =>
      c.rpc("proposal_save", { p_sourcing: id, p_terms: t, p_lines: lines, p_submit: submit });
    expect((await save([{ sourcing_line_id: line, unit_price: 24.555 }])).error?.message).toBe("errors.priceInvalid");
    expect((await save([{ sourcing_line_id: line, unit_price: 0 }])).error?.message).toBe("errors.priceInvalid");
    expect((await save([{ sourcing_line_id: line, unit_price: 24.5 }], { ...terms, prices_include_vat: true, vat_rate: 0 })).error?.message).toBe("errors.vatRateRequired");
    expect((await save([], terms, true)).error?.message).toBe("errors.priceRequired");
    expect((await save([{ sourcing_line_id: line, unit_price: 24.5 }])).error).toBeNull();
    expect((await db.query("select status from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0].status).toBe("DRAFT");
    expect((await save([{ sourcing_line_id: line, unit_price: 24.5 }], { ...terms, prices_include_vat: true, vat_rate: 18 }, true)).error).toBeNull();
    expect((await db.query("select status from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0].status).toBe("SUBMITTED");
  });

  it("AC6: resubmit keeps the latest version; Withdraw gives WITHDRAWN and it can be submitted again", async () => {
    const c = actors.vendorA.client;
    const [line] = await lineIds(id);
    expect((await c.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [{ sourcing_line_id: line, unit_price: 23 }], p_submit: true })).error).toBeNull();
    expect((await db.query("select unit_price from public.proposal_line pl join public.proposal p on p.id = pl.proposal_id where p.sourcing_id = $1", [id])).rows.map((r) => Number(r.unit_price))).toEqual([23]);
    expect((await c.rpc("proposal_withdraw", { p_sourcing: id })).error).toBeNull();
    expect((await db.query("select status from public.proposal where sourcing_id = $1", [id])).rows[0].status).toBe("WITHDRAWN");
    expect((await c.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [{ sourcing_line_id: line, unit_price: 23 }], p_submit: true })).error).toBeNull();
  });

  it("RFQ-02 AC8 / NFR-002: while OPEN no internal user reads a proposal, a price or a vendor name; only the count", async () => {
    for (const key of ["specialist", "specialist2", "admin", "committee"] as const) {
      const c = actors[key].client;
      expect((await c.from("proposal").select("id")).data, key).toEqual([]);
      expect((await c.from("proposal_line").select("id")).data, key).toEqual([]);
    }
    expect((await actors.specialist.client.rpc("sourcing_proposal_count", { p_id: id })).data).toBe(1);
  });

  it("AC1 and RFQ-02 AC7: at the deadline it is CLOSED within the job run, proposals are locked, and RFQ prices open (COMPARISON)", async () => {
    await pastDeadline(id);
    const s = await sourcingRow(id);
    expect(s.status).toBe("COMPARISON");
    expect(s.bids_opened_at).not.toBeNull();
    expect(s.prices_opened_at).not.toBeNull();
    const [line] = await lineIds(id);
    const late = await actors.vendorA.client.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [{ sourcing_line_id: line, unit_price: 20 }], p_submit: true });
    expect(late.error?.message).toBe("errors.deadlinePassed");
    expect((await actors.vendorA.client.rpc("proposal_withdraw", { p_sourcing: id })).error?.message).toBe("errors.deadlinePassed");
    for (const key of ["specialist", "admin", "committee"] as const) {
      expect((await actors[key].client.from("proposal_line").select("unit_price")).data?.length, key).toBeGreaterThan(0);
    }
    expect((await db.query("select user_id, reason from public.audit_entry where record_id = $1 and to_status = 'CLOSED'", [id])).rows).toEqual([{ user_id: null, reason: "Deadline passed" }]);
    const owner = await db.query("select params from public.notification where user_id = $1 and event = 'sourcing.closed' and record_id = $2", [actors.specialist.id, id]);
    expect(owner.rows[0].params).toEqual({ received: 1, minimum: 1 });
  });
});

describe("RFQ-04 below the minimum", () => {
  it("AC3-AC4: CLOSED below minimum, prices sealed; Extend twice, the third is refused; vendors notified", async () => {
    const { id } = await startRfq(240, 25); // 6,000.00 -> minimum 2
    expect((await publish(id, { hours: 48 })).error).toBeNull();
    expect((await offer("vendorA", id)).error).toBeNull();
    await pastDeadline(id);
    expect((await sourcingRow(id)).status).toBe("CLOSED");
    expect((await actors.specialist.client.rpc("sourcing_proposal_count", { p_id: id })).data).toBe(1);
    expect((await actors.specialist.client.from("proposal").select("id").eq("sourcing_id", id)).data).toEqual([]);

    const soon = new Date(Date.now() + 3600_000 * 24).toISOString();
    const noReason = await actors.specialist.client.rpc("sourcing_extend", { p_id: id, p_deadline: soon, p_reason: "" });
    expect(noReason.error?.message).toBe("errors.required");
    const pastExtend = await actors.specialist.client.rpc("sourcing_extend", { p_id: id, p_deadline: new Date(Date.now() - 1000).toISOString(), p_reason: "More time" });
    expect(pastExtend.error?.message).toBe("errors.deadlinePast");
    for (let n = 1; n <= 2; n++) {
      const e = await actors.specialist.client.rpc("sourcing_extend", { p_id: id, p_deadline: soon, p_reason: `More time ${n}` });
      expect(e.error).toBeNull();
      expect(await sourcingRow(id)).toMatchObject({ status: "OPEN", extension_count: n });
      await pastDeadline(id);
    }
    const third = await actors.specialist.client.rpc("sourcing_extend", { p_id: id, p_deadline: soon, p_reason: "Again" });
    expect(third.error?.message).toBe("errors.maxExtensions");
    const note = await db.query("select 1 from public.notification where user_id = $1 and event = 'sourcing.extended' and record_id = $2", [actors.vendorA.id, id]);
    expect(note.rows).toHaveLength(2);
  });

  it("AC5: Continue needs a reason, moves on, and stores the reason; with 0 proposals Continue is refused", async () => {
    const { id } = await startRfq(240, 25);
    expect((await publish(id)).error).toBeNull();
    await pastDeadline(id);
    expect((await sourcingRow(id)).status).toBe("CLOSED");
    expect((await actors.specialist.client.rpc("sourcing_continue", { p_id: id, p_reason: "No bids" })).error?.message).toBe("errors.statusChanged");
    expect((await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "" })).error?.message).toBe("errors.required");

    const { id: second } = await startRfq(240, 25);
    expect((await publish(second)).error).toBeNull();
    expect((await offer("vendorA", second)).error).toBeNull();
    await pastDeadline(second);
    expect((await actors.specialist.client.rpc("sourcing_continue", { p_id: second, p_reason: " " })).error?.message).toBe("errors.required");
    expect((await actors.specialist.client.rpc("sourcing_continue", { p_id: second, p_reason: "Only one qualified bidder" })).error).toBeNull();
    expect(await sourcingRow(second)).toMatchObject({ status: "COMPARISON", low_competition_reason: "Only one qualified bidder" });
  });

  it("AC6: Cancel needs a reason, the sourcing is CANCELLED, vendors that did not decline are told, the PR is APPROVED again", async () => {
    const { pr, id } = await startRfq(240, 25);
    expect((await publish(id)).error).toBeNull();
    await actors.vendorB.client.rpc("invitation_decline", { p_sourcing: id, p_reason: "No capacity" });
    expect((await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Need changed" })).error).toBeNull();
    expect(await sourcingRow(id)).toMatchObject({ status: "CANCELLED", cancel_reason: "Need changed" });
    expect(await prStatus(pr)).toBe("APPROVED");
    const cancelled = async (u: string) => (await db.query("select params from public.notification where user_id = $1 and event = 'sourcing.cancelled' and record_id = $2", [u, id])).rows;
    expect((await cancelled(actors.vendorA.id))[0].params).toEqual({ reason: "Need changed" });
    expect(await cancelled(actors.vendorB.id)).toHaveLength(0);
  });

  it("the 24-hour reminder reaches vendors that neither declined nor submitted, once", async () => {
    const { id } = await startRfq(240, 25);
    expect((await publish(id, { hours: 23 })).error).toBeNull();
    await actors.vendorB.client.rpc("invitation_decline", { p_sourcing: id, p_reason: "No capacity" });
    await db.query("select app.close_due_sourcings()");
    await db.query("select app.close_due_sourcings()");
    const count = async (u: string) => (await db.query("select 1 from public.notification where user_id = $1 and event = 'sourcing.deadlineSoon' and record_id = $2", [u, id])).rows.length;
    expect(await count(actors.vendorA.id)).toBe(1);
    expect(await count(actors.vendorB.id)).toBe(0);
  });
});

describe("RFQ-06 Single Source Purchase", () => {
  async function startSsp(quantity: number, price: number, vendorId: string | null) {
    const pr = await approvedPr(quantity, price);
    return actors.specialist.client.rpc("sourcing_start", { p_requisition: pr, p_method: "SINGLE_SOURCE", p_ssp_vendor: vendorId ?? undefined });
  }

  it("AC1: one vendor from the AVL is required; a vendor outside the AVL is refused; the type is SSP whatever the value", async () => {
    expect((await startSsp(10, 10, null)).error?.message).toBe("errors.sspVendorRequired");
    expect((await startSsp(10, 10, actors.vendorC.vendorId!)).error?.message).toBe("errors.vendorNotInAvl");
    const ok = await startSsp(5000, 20, actors.vendorA.vendorId!); // 100,000.00, above the Tender threshold
    expect(ok.error).toBeNull();
    expect(await sourcingRow(ok.data as string)).toMatchObject({ type: "SSP", method: "SINGLE_SOURCE", min_proposals: 1, ssp_vendor_id: actors.vendorA.vendorId });
  });

  it("AC2: above the limit Publish needs a justification text and a file; AC3: at or below it is optional", async () => {
    const big = (await startSsp(5, 400, actors.vendorA.vendorId!)).data as string; // 2,000.00 > 1,000.00
    expect((await publish(big)).error?.message).toBe("errors.sspJustification");
    await actors.specialist.client.rpc("sourcing_save", {
      p_id: big, p_deadline: new Date(Date.now() + 86400_000).toISOString(), p_incoterm: "DDP", p_named_place: place,
      p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: "Only supplier of this blend", p_excluded: [],
    });
    expect((await actors.specialist.client.rpc("sourcing_publish", { p_id: big })).error?.message).toBe("errors.sspJustification");
    await db.query(
      `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
       values ($1, 'sourcing', $2, 'justification', 'why.pdf', 'application/pdf', 100, $3)`,
      [COMPANY_ID, big, `test/${RUN}/why.pdf`],
    );
    expect((await actors.specialist.client.rpc("sourcing_publish", { p_id: big })).error).toBeNull();

    const small = (await startSsp(10, 100, actors.vendorA.vendorId!)).data as string; // 1,000.00, not above
    expect((await publish(small)).error).toBeNull();
  });

  it("AC4-AC5: only the chosen vendor is invited; with the proposal in, the deadline moves it straight to COMPARISON", async () => {
    const id = (await startSsp(10, 100, actors.vendorA.vendorId!)).data as string;
    expect((await publish(id)).error).toBeNull();
    const inv = await db.query("select vendor_id from public.invitation where sourcing_id = $1", [id]);
    expect(inv.rows).toEqual([{ vendor_id: actors.vendorA.vendorId }]);
    expect((await actors.vendorB.client.rpc("vendor_invitation_view", { p_sourcing: id })).data).toBeNull();
    expect((await offer("vendorA", id, 95)).error).toBeNull();
    await pastDeadline(id);
    expect((await sourcingRow(id)).status).toBe("COMPARISON");
  });

  it("AC5: with no proposal an SSP stays CLOSED and Continue is not possible", async () => {
    const id = (await startSsp(10, 100, actors.vendorA.vendorId!)).data as string;
    expect((await publish(id)).error).toBeNull();
    await pastDeadline(id);
    expect((await sourcingRow(id)).status).toBe("CLOSED");
    expect((await actors.specialist.client.rpc("sourcing_continue", { p_id: id, p_reason: "Go on" })).error?.message).toBe("errors.statusChanged");
  });
});

describe("Tender and NFR-011", () => {
  it("RFQ-04 AC2: a Tender that reaches the minimum goes to AWAITING_OPENING with prices still sealed", async () => {
    const { id } = await startRfq(2000, 25);
    expect((await publish(id, { techDoc: true })).error).toBeNull();
    // only A and B are on the AVL, so lower the minimum for the test through SQL and submit two proposals
    await db.query("update public.sourcing set min_proposals = 2 where id = $1", [id]);
    for (const key of ["vendorA", "vendorB"] as const) {
      const accepted = await actors[key].client.rpc("invitation_accept", { p_sourcing: id });
      expect(accepted.error).toBeNull();
      const [line] = await lineIds(id);
      const noDoc = await actors[key].client.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [{ sourcing_line_id: line, unit_price: 24 }], p_submit: true });
      expect(noDoc.error?.message).toBe("errors.techDocRequired");
      const proposal = (await db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors[key].vendorId])).rows[0].id;
      await db.query(
        `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
         values ($1, 'proposal', $2, 'technical_document', 'tech.pdf', 'application/pdf', 100, $3)`,
        [COMPANY_ID, proposal, `test/${RUN}/${key}.pdf`],
      );
      const ok = await actors[key].client.rpc("proposal_save", { p_sourcing: id, p_terms: terms, p_lines: [{ sourcing_line_id: line, unit_price: 24 }], p_submit: true });
      expect(ok.error).toBeNull();
    }
    await pastDeadline(id);
    const s = await sourcingRow(id);
    expect(s.status).toBe("AWAITING_OPENING");
    expect(s.prices_opened_at).toBeNull();
    expect(s.bids_opened_at).toBeNull();
    const proposals = (await db.query("select id from public.proposal where sourcing_id = $1", [id])).rows.map((r) => r.id as string);
    for (const key of ["specialist", "admin", "committee"] as const) {
      expect((await actors[key].client.from("proposal_line").select("unit_price").in("proposal_id", proposals)).data, key).toEqual([]);
      expect((await actors[key].client.from("proposal").select("id").eq("sourcing_id", id)).data?.length, key).toBeGreaterThan(0);
    }
  });

  it("NFR-011: every sourcing status change has an audit entry with the user, or System for the job", async () => {
    const { id } = await startRfq(10, 25.5);
    expect((await publish(id)).error).toBeNull();
    expect((await offer("vendorA", id)).error).toBeNull();
    await pastDeadline(id);
    const { rows } = await db.query("select from_status, to_status, user_id from public.audit_entry where record_id = $1 order by created_at, to_status", [id]);
    expect(rows.map((r) => `${r.from_status ?? "-"}>${r.to_status}`)).toEqual(["->DRAFT", "DRAFT>OPEN", "OPEN>CLOSED", "CLOSED>COMPARISON"]);
    expect(rows[0].user_id).toBe(actors.specialist.id);
    expect(rows[2].user_id).toBeNull();
  });
});
