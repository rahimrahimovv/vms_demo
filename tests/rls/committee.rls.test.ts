/**
 * Slice 5 (CMT-01 to CMT-04) against vms-dev. Throwaway users (a Procurement Specialist who owns the sourcings, a
 * second one who also holds the Committee Member role, a Requester, an Approver, an Admin, four Committee Members)
 * and three vendors on the AVL work on their own category, item and plan line; everything is removed afterwards and
 * the demo committee is put back exactly as it was. Voting periods are moved into the past with SQL and the jobs are
 * run directly, as pg_cron does every minute.
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

type Internal = "specialist" | "specialist2" | "requester" | "approver" | "admin" | "cm1" | "cm2" | "cm3" | "cm4";
type Vendor = "vendorA" | "vendorB" | "vendorC";
type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<Internal | Vendor, Actor>;
let root = "";
let item = "";
let planLine = "";
let place = "";
let mode = "";
let payment = "";
let committeeBackup: { days: number; members: { user_id: string; is_chair: boolean }[] } | null = null;
let seededCommittee: { name: string; chair: boolean }[] = [];

const anon = () => createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}
async function internal(key: Internal, roles: string[]) {
  const email = `rls5-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await service.from("app_user").insert({ id, company_id: COMPANY_ID, full_name: `RLS5 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: id, role })));
  actors[key] = { id, email, client: await signIn(email) };
}
async function vendor(key: Vendor) {
  const email = `rls5-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error: authError } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (authError) throw authError;
  const { data: vendorId, error } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY", legal_name: `RLS5 ${key} ${RUN}`, voen: `96${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ", legal_address: "Test street 5", director_name: "Test Director", is_vat_payer: true,
      contact_person: "Test Contact", contact_email: email, phone: "+994500000005", founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: `HEAD5-${key}-${RUN}`, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0005", swift: "TESTAZ22", currency: "AZN", is_main: true }],
  });
  if (error) throw error;
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
  actors[key] = { id: data.user.id, email, client: await signIn(email), vendorId };
}

const plusDays = async (n: number) => (await db.query("select (app.today() + $1::int)::text as d", [n])).rows[0].d as string;

async function approvedPr(quantity: number, price: number) {
  const lines = [{
    item_id: item, quantity, estimated_unit_price: price, delivery_date: await plusDays(30),
    delivery_place_id: SEED.centralWarehouse, specification: "RLS5 line",
  }];
  const saved = await actors.requester.client.rpc("requisition_save", { p_id: null, p_plan_line_id: planLine, p_lines: lines, p_submit: true });
  if (saved.error) throw saved.error;
  const decided = await actors.approver.client.rpc("requisition_decide", { p_id: saved.data, p_decision: "APPROVE", p_comment: null });
  if (decided.error) throw decided.error;
  return saved.data as string;
}
async function startSourcing(quantity: number, price: number, owner: "specialist" | "specialist2" = "specialist") {
  const pr = await approvedPr(quantity, price);
  const { data, error } = await actors[owner].client.rpc("sourcing_start", { p_requisition: pr, p_method: "COMPETITIVE" });
  if (error) throw error;
  return data as string;
}
async function publish(id: string, owner: "specialist" | "specialist2" = "specialist") {
  const c = actors[owner].client;
  const saved = await c.rpc("sourcing_save", {
    p_id: id, p_deadline: new Date(Date.now() + 72 * 3600_000).toISOString(), p_incoterm: "DDP", p_named_place: place,
    p_delivery_mode: mode, p_payment_term: payment, p_tech_doc: false, p_justification: "", p_excluded: [],
  });
  if (saved.error) throw saved.error;
  const published = await c.rpc("sourcing_publish", { p_id: id });
  if (published.error) throw published.error;
}
async function lineIds(sourcingId: string) {
  return (await db.query("select id from public.sourcing_line where sourcing_id = $1", [sourcingId])).rows.map((r) => r.id as string);
}
async function offer(key: Vendor, sourcingId: string, price = 24.5) {
  const c = actors[key].client;
  const accepted = await c.rpc("invitation_accept", { p_sourcing: sourcingId });
  if (accepted.error) throw accepted.error;
  const terms = { incoterm: "DDP", named_place_id: place, delivery_mode_id: mode, payment_term_id: payment, prices_include_vat: false, vat_rate: 0, delivery_days: 10, validity_days: 30, comment: "" };
  const saved = await c.rpc("proposal_save", {
    p_sourcing: sourcingId, p_terms: terms, p_lines: (await lineIds(sourcingId)).map((i) => ({ sourcing_line_id: i, unit_price: price })), p_submit: true,
  });
  if (saved.error) throw saved.error;
}
async function pastDeadline(id: string) {
  await db.query("update public.sourcing set deadline = now() - interval '1 second' where id = $1", [id]);
  await db.query("select app.close_due_sourcings()");
}
/** A Tender (value 50,000.00) with the given bidders, closed at its deadline. */
async function tender(bidders: Vendor[] = ["vendorA", "vendorB", "vendorC"]) {
  const id = await startSourcing(2000, 25);
  await publish(id);
  for (const key of bidders) await offer(key, id);
  await pastDeadline(id);
  return id;
}
const sourcingRow = async (id: string) => (await db.query("select * from public.sourcing where id = $1", [id])).rows[0];
const decisionsOf = async (sourcingId: string, type = "OPENING") =>
  (await db.query("select * from public.decision where sourcing_id = $1 and type = $2 order by opened_at", [sourcingId, type])).rows;
const decisionRow = async (id: string) => (await db.query("select * from public.decision where id = $1", [id])).rows[0];
const minutesOf = async (decisionId: string) => (await db.query("select * from public.minutes where decision_id = $1", [decisionId])).rows[0];
const openWinner = async (sourcingId: string) =>
  (await db.query("select app.open_decision($1, 'WINNER') as id", [sourcingId])).rows[0].id as string;
const vote = (key: Internal, decision: string, v: "FOR" | "AGAINST", comment = "") =>
  actors[key].client.rpc("decision_vote", { p_decision: decision, p_vote: v, p_comment: comment });
const conflict = (key: Internal, decision: string, comment = "Related to a bidder") =>
  actors[key].client.rpc("decision_declare_conflict", { p_decision: decision, p_comment: comment });
const dueNow = async (decision: string) => {
  await db.query("update public.decision set deadline = now() - interval '1 second' where id = $1", [decision]);
  await db.query("select app.close_due_decisions()");
};
const members = async () =>
  (await db.query("select user_id from public.committee_member order by user_id")).rows.map((r) => r.user_id as string);
const setCommittee = (keys: Internal[], chair: Internal, days = 3) =>
  actors.admin.client.rpc("committee_save", { p_members: keys.map((k) => actors[k].id), p_chair: actors[chair].id, p_voting_days: days });

beforeAll(async () => {
  await db.connect();
  const c = await db.query("select voting_period_days from public.committee where company_id = $1", [COMPANY_ID]);
  const m = await db.query("select user_id, is_chair from public.committee_member");
  committeeBackup = { days: c.rows[0]?.voting_period_days ?? 3, members: m.rows };
  seededCommittee = (await db.query(
    `select u.full_name as name, mm.is_chair as chair from public.committee_member mm
       join public.app_user u on u.id = mm.user_id order by u.full_name`)).rows;

  await internal("specialist", ["PROCUREMENT_SPECIALIST"]);
  await internal("specialist2", ["PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER"]);
  await internal("requester", ["REQUESTER"]);
  await internal("approver", ["APPROVER"]);
  await internal("admin", ["ADMIN"]);
  for (const key of ["cm1", "cm2", "cm3", "cm4"] as const) await internal(key, ["COMMITTEE_MEMBER"]);

  const admin = actors.admin.client;
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS5 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("item_save", { p_id: null, p_category_id: root, p_code: `RLS5-${RUN}`, p_name: "RLS5 item", p_unit: "bag", p_is_active: true });
  if (r2.error) throw r2.error;
  item = r2.data as string;
  const r3 = await admin.rpc("plan_line_save", { p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS5 plan ${RUN}`, p_planned_amount: 100, p_quarter: "Q4" });
  if (r3.error) throw r3.error;
  planLine = r3.data as string;
  place = SEED.centralWarehouse;
  const m1 = await admin.rpc("delivery_mode_save", { p_id: null, p_name: `RLS5 mode ${RUN}`, p_is_active: true });
  if (m1.error) throw m1.error;
  mode = m1.data as string;
  const p1 = await admin.rpc("payment_term_save", { p_id: null, p_name: `RLS5 term ${RUN}`, p_advance_percent: 0, p_days_after_delivery: 30, p_is_active: true });
  if (p1.error) throw p1.error;
  payment = p1.data as string;

  await vendor("vendorA");
  await vendor("vendorB");
  await vendor("vendorC");

  const saved = await setCommittee(["cm1", "cm2", "cm3"], "cm1", 3);
  if (saved.error) throw saved.error;
}, 240_000);

afterAll(async () => {
  try {
    // the demo committee goes back exactly as it was, before the test users are removed
    if (committeeBackup) {
      await db.query("delete from public.committee_member");
      const committee = (await db.query("select id from public.committee where company_id = $1", [COMPANY_ID])).rows[0];
      for (const m of committeeBackup.members) {
        await db.query("insert into public.committee_member (committee_id, user_id, is_chair) values ($1, $2, $3)", [committee.id, m.user_id, m.is_chair]);
      }
      await db.query("update public.committee set voting_period_days = $1 where company_id = $2", [committeeBackup.days, COMPANY_ID]);
    }
    await removeTestData(db, service, "rls5");
  } finally {
    await db.end();
  }
}, 240_000);

describe("CMT-01 committee setup", () => {
  it("AC1: odd number of at least 3 and exactly one Chair; otherwise the backlog's message", async () => {
    for (const keys of [["cm1", "cm2"], ["cm1", "cm2", "cm3", "cm4"], ["cm1"]] as Internal[][]) {
      expect((await setCommittee(keys, "cm1")).error?.message, keys.join()).toBe("errors.committeeSize");
    }
    const noChair = await actors.admin.client.rpc("committee_save", { p_members: ["cm1", "cm2", "cm3"].map((k) => actors[k as Internal].id), p_chair: null, p_voting_days: 3 });
    expect(noChair.error?.message).toBe("errors.chairRequired");
    const outsider = await actors.admin.client.rpc("committee_save", {
      p_members: ["cm1", "cm2", "cm3"].map((k) => actors[k as Internal].id), p_chair: actors.cm4.id, p_voting_days: 3,
    });
    expect(outsider.error?.message).toBe("errors.chairRequired");
    const noRole = await setCommittee(["cm1", "cm2", "requester"], "cm1");
    expect(noRole.error?.message).toBe("errors.committeeMember");
    expect((await setCommittee(["cm1", "cm2", "cm3", "cm4", "specialist2"], "cm2")).error).toBeNull();
    expect(await members()).toHaveLength(5);
    expect((await db.query("select user_id from public.committee_member where is_chair")).rows[0].user_id).toBe(actors.cm2.id);
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1")).error).toBeNull();
    expect(await members()).toHaveLength(3);
  });

  it("AC2: the voting period is whole business days, 1 or more", async () => {
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1", 0)).error?.message).toBe("errors.votingPeriod");
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1", 5)).error).toBeNull();
    expect((await db.query("select voting_period_days from public.committee where company_id = $1", [COMPANY_ID])).rows[0].voting_period_days).toBe(5);
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1", 3)).error).toBeNull();
  });

  it("only the Admin saves; nobody writes the committee tables directly", async () => {
    const asSpecialist = await actors.specialist.client.rpc("committee_save", { p_members: [], p_chair: null, p_voting_days: 3 });
    expect(asSpecialist.error?.message).toBe("errors.noAccess");
    const direct = await actors.admin.client.from("committee_member").insert({ committee_id: randomUUID(), user_id: actors.cm4.id });
    expect(direct.error).not.toBeNull();
    const delete3 = await actors.admin.client.from("committee_member").delete().eq("user_id", actors.cm1.id).select();
    expect(delete3.data ?? []).toHaveLength(0);
    expect(await members()).toHaveLength(3);
  });

  it("AC3: a decision that is already open keeps its voters; the next one uses the new list", async () => {
    const sourcing = await startSourcing(10, 25.5);
    const first = await openWinner(sourcing);
    expect((await setCommittee(["cm2", "cm3", "cm4"], "cm4")).error).toBeNull();
    const old = await db.query("select user_id from public.decision_voter where decision_id = $1", [first]);
    expect(old.rows.map((r) => r.user_id).sort()).toEqual([actors.cm1.id, actors.cm2.id, actors.cm3.id].sort());
    await dueNow(first);
    const second = await openWinner(sourcing);
    const fresh = await db.query("select user_id, is_chair from public.decision_voter where decision_id = $1", [second]);
    expect(fresh.rows.map((r) => r.user_id).sort()).toEqual([actors.cm2.id, actors.cm3.id, actors.cm4.id].sort());
    expect(fresh.rows.find((r) => r.is_chair)?.user_id).toBe(actors.cm4.id);
    await dueNow(second);
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1")).error).toBeNull();
  }, 120_000);

  it("seed: the demo committee that db:seed left on vms-dev is Elchin Karimov (Chair), Sevinj Guliyeva, Tural Ismayilov", () => {
    expect(seededCommittee).toEqual([
      { name: "Elchin Karimov", chair: true },
      { name: "Sevinj Guliyeva", chair: false },
      { name: "Tural Ismayilov", chair: false },
    ]);
  });
});

describe("CMT-02 voting engine", () => {
  let sourcing = "";

  it("voting deadline: opening time + business days (Thu 12 Nov 2026 10:00 + 3 -> Tue 17 Nov 2026 10:00)", async () => {
    const at = async (from: string, days: number) =>
      (await db.query("select to_char(app.add_business_days($1::timestamptz, $2) at time zone 'Asia/Baku', 'YYYY-MM-DD HH24:MI') as t", [from, days])).rows[0].t;
    expect(await at("2026-11-12 10:00+04", 3)).toBe("2026-11-17 10:00");
    expect(await at("2026-11-14 09:00+04", 1)).toBe("2026-11-16 09:00");
    sourcing = await startSourcing(10, 25.5);
    const id = await openWinner(sourcing);
    const d = await decisionRow(id);
    const expected = (await db.query("select app.add_business_days($1::timestamptz, 3) as t", [d.opened_at])).rows[0].t as Date;
    expect(d.deadline.getTime()).toBe(expected.getTime());
    await dueNow(id);
  });

  it("AC1: eligible voters = members except the sourcing owner; each is notified, the owner is not", async () => {
    const owned = await startSourcing(10, 25.5, "specialist2");
    expect((await setCommittee(["cm1", "cm2", "cm3", "cm4", "specialist2"], "cm1")).error).toBeNull();
    const own = await openWinner(owned);
    const other = await openWinner(await startSourcing(10, 25.5, "specialist"));
    const voters = async (id: string) => (await db.query("select user_id from public.decision_voter where decision_id = $1", [id])).rows.map((r) => r.user_id as string);
    expect(await voters(own)).toHaveLength(4);
    expect(await voters(own)).not.toContain(actors.specialist2.id);
    expect(await voters(other)).toContain(actors.specialist2.id);
    const n = await db.query("select user_id from public.notification where event = 'decision.opened' and record_id = $1", [own]);
    expect(n.rows.map((r) => r.user_id).sort()).toEqual([actors.cm1.id, actors.cm2.id, actors.cm3.id, actors.cm4.id].sort());
    // #83: the owner is not a voter, even holding the Committee Member role
    expect((await vote("specialist2", own, "FOR")).error?.message).toBe("errors.noAccess");
    await dueNow(own);
    await dueNow(other);
    expect((await setCommittee(["cm1", "cm2", "cm3"], "cm1")).error).toBeNull();
  }, 120_000);

  it("AC4, AC6: Against needs a comment, a vote cannot be changed, votes stay hidden until the decision closes", async () => {
    const id = await openWinner(sourcing);
    expect((await vote("cm2", id, "AGAINST")).error?.message).toBe("errors.commentRequired");
    expect((await vote("cm2", id, "AGAINST", "Price too high")).error).toBeNull();
    expect((await vote("cm2", id, "FOR")).error?.message).toBe("errors.alreadyVoted");

    // cm3 sees that cm2 voted, not how; the table shows only cm3's own row
    const seen = await actors.cm3.client.rpc("decision_voters", { p_decision: id });
    const cm2 = (seen.data as { user_id: string; state: string; vote: string | null; comment: string | null }[]).find((v) => v.user_id === actors.cm2.id)!;
    expect(cm2).toMatchObject({ state: "VOTED", vote: null, comment: null });
    expect((await actors.cm3.client.from("decision_voter").select("user_id, vote").eq("decision_id", id)).data).toHaveLength(1);
    for (const key of ["specialist", "admin", "approver"] as const) {
      expect((await actors[key].client.from("decision_voter").select("vote").eq("decision_id", id)).data, key).toHaveLength(0);
      const view = await actors[key].client.rpc("decision_voters", { p_decision: id });
      expect((view.data as { vote: string | null }[]).every((v) => v.vote === null), key).toBe(true);
    }
    const own = await actors.cm2.client.rpc("decision_voters", { p_decision: id });
    expect((own.data as { user_id: string; vote: string | null }[]).find((v) => v.user_id === actors.cm2.id)?.vote).toBe("AGAINST");

    // only Committee Members vote; nobody writes votes directly
    expect((await vote("approver", id, "FOR")).error?.message).toBe("errors.noAccess");
    expect((await actors.vendorA.client.rpc("decision_vote", { p_decision: id, p_vote: "FOR", p_comment: "" })).error?.message).toBe("errors.noAccess");
    const direct = await actors.cm1.client.from("decision_voter").update({ vote: "FOR" }).eq("decision_id", id).select();
    expect(direct.data ?? []).toHaveLength(0);
    expect((await db.query("select vote from public.decision_voter where decision_id = $1 and user_id = $2", [id, actors.cm1.id])).rows[0].vote).toBe("NONE");
    await dueNow(id);
  }, 120_000);

  it("AC7: 2 For and 1 Against -> APPROVED by majority; minutes MIN-YYYY-NNN; audit, notifications; votes now visible", async () => {
    const id = await openWinner(sourcing);
    expect((await vote("cm1", id, "FOR")).error).toBeNull();
    expect((await vote("cm2", id, "FOR")).error).toBeNull();
    expect((await decisionRow(id)).status).toBe("VOTING");
    expect((await vote("cm3", id, "AGAINST", "Prefer the second bidder")).error).toBeNull();
    const d = await decisionRow(id);
    expect(d).toMatchObject({ status: "APPROVED", result_rule: "MAJORITY" });
    expect(d.closed_at).not.toBeNull();
    const minutes = await minutesOf(id);
    expect(minutes.number).toMatch(/^MIN-\d{4}-\d{3}$/);
    const audit = await db.query("select from_status, to_status, reason from public.audit_entry where record_type = 'decision' and record_id = $1 order by created_at", [id]);
    expect(audit.rows.map((r) => r.to_status)).toEqual(["VOTING", "APPROVED"]);
    expect(audit.rows[1].reason).toBe("Majority");
    const owner = await db.query("select params from public.notification where event = 'decision.closed' and record_id = $1 and user_id = $2", [id, actors.specialist.id]);
    expect(owner.rows[0].params).toMatchObject({ decisionType: "WINNER", result: "APPROVED", minutes: minutes.number });
    const visible = await actors.cm2.client.from("decision_voter").select("user_id, vote, comment").eq("decision_id", id);
    expect(visible.data).toHaveLength(3);
    expect(visible.data?.find((v) => v.user_id === actors.cm3.id)).toMatchObject({ vote: "AGAINST", comment: "Prefer the second bidder" });
    // the next minutes number is higher: sequential, never reused
    const next = await openWinner(sourcing);
    await dueNow(next);
    expect(Number((await minutesOf(next)).number.split("-")[2])).toBeGreaterThan(Number(minutes.number.split("-")[2]));
  }, 120_000);

  it("1 For and 2 Against -> REJECTED", async () => {
    const id = await openWinner(sourcing);
    await vote("cm1", id, "FOR");
    await vote("cm2", id, "AGAINST", "No");
    await vote("cm3", id, "AGAINST", "No");
    expect(await decisionRow(id)).toMatchObject({ status: "REJECTED", result_rule: "MAJORITY" });
  });

  it("AC5: a conflict of interest needs a comment, removes the member from the eligible voters and closes with the rest", async () => {
    const id = await openWinner(sourcing);
    expect((await actors.cm3.client.rpc("decision_declare_conflict", { p_decision: id, p_comment: " " })).error?.message).toBe("errors.commentRequired");
    expect((await conflict("cm3", id)).error).toBeNull();
    expect((await vote("cm3", id, "FOR")).error?.message).toBe("errors.alreadyVoted");
    expect((await vote("cm2", id, "FOR")).error).toBeNull();
    expect((await decisionRow(id)).status).toBe("VOTING");
    expect((await vote("cm1", id, "FOR")).error).toBeNull();
    expect(await decisionRow(id)).toMatchObject({ status: "APPROVED", result_rule: "MAJORITY" });
    const m = await actors.admin.client.rpc("minutes_view", { p_id: (await minutesOf(id)).id });
    expect(m.data).toMatchObject({ eligible: 2, for: 2, against: 0 });
    expect((m.data as { voters: { vote: string }[] }).voters.map((v) => v.vote).sort()).toEqual(["CONFLICT", "FOR", "FOR"]);
  });

  it("tie: the Chair's vote decides (For -> APPROVED, Against -> REJECTED); without it NO_DECISION", async () => {
    let id = await openWinner(sourcing);
    await conflict("cm3", id);
    await vote("cm2", id, "AGAINST", "No");
    await vote("cm1", id, "FOR");
    expect(await decisionRow(id)).toMatchObject({ status: "APPROVED", result_rule: "CHAIR_CASTING_VOTE" });

    id = await openWinner(sourcing);
    await conflict("cm3", id);
    await vote("cm2", id, "FOR");
    await vote("cm1", id, "AGAINST", "No");
    expect(await decisionRow(id)).toMatchObject({ status: "REJECTED", result_rule: "CHAIR_CASTING_VOTE" });

    id = await openWinner(sourcing);
    await conflict("cm1", id);
    await vote("cm2", id, "FOR");
    await vote("cm3", id, "AGAINST", "No");
    expect(await decisionRow(id)).toMatchObject({ status: "NO_DECISION", result_rule: "TIE_WITHOUT_CHAIR" });
  }, 120_000);

  it("no quorum: 1 vote of 3 when the voting period ends; a vote after the deadline is refused", async () => {
    const id = await openWinner(sourcing);
    await vote("cm1", id, "FOR");
    await db.query("update public.decision set deadline = now() - interval '1 second' where id = $1", [id]);
    expect((await vote("cm2", id, "FOR")).error?.message).toBe("errors.votingClosed");
    await db.query("select app.close_due_decisions()");
    expect(await decisionRow(id)).toMatchObject({ status: "NO_DECISION", result_rule: "NO_QUORUM" });
    const audit = await db.query("select user_id, reason from public.audit_entry where record_type = 'decision' and record_id = $1 and to_status = 'NO_DECISION'", [id]);
    expect(audit.rows[0]).toMatchObject({ user_id: null, reason: "No quorum" });
  });

  it("no eligible voter left (everyone declares a conflict) -> NO_DECISION, No quorum", async () => {
    const id = await openWinner(sourcing);
    for (const key of ["cm1", "cm2", "cm3"] as const) await conflict(key, id);
    expect(await decisionRow(id)).toMatchObject({ status: "NO_DECISION", result_rule: "NO_QUORUM" });
  });

  it("AC8: the owner reopens a NO_DECISION (same sourcing, new voters and period); nobody else; only once; not after REJECTED for WINNER", async () => {
    // Slice 6 sets IN_COMMITTEE when the owner sends the comparison to the committee; here it is set by hand
    await db.query("update public.sourcing set status = 'IN_COMMITTEE' where id = $1", [sourcing]);
    const id = await openWinner(sourcing);
    await dueNow(id);
    expect((await decisionRow(id)).status).toBe("NO_DECISION");
    expect((await actors.specialist2.client.rpc("decision_reopen", { p_decision: id, p_reason: "" })).error?.message).toBe("errors.noAccess");
    expect((await actors.cm1.client.rpc("decision_reopen", { p_decision: id, p_reason: "" })).error?.message).toBe("errors.noAccess");
    const reopened = await actors.specialist.client.rpc("decision_reopen", { p_decision: id, p_reason: "" });
    expect(reopened.error).toBeNull();
    const next = await decisionRow(reopened.data as string);
    expect(next).toMatchObject({ status: "VOTING", type: "WINNER", sourcing_id: sourcing, reopened_from_id: id });
    expect((await actors.specialist.client.rpc("decision_reopen", { p_decision: id, p_reason: "" })).error?.message).toBe("errors.statusChanged");

    await vote("cm1", next.id, "AGAINST", "No");
    await vote("cm2", next.id, "AGAINST", "No");
    await vote("cm3", next.id, "FOR");
    expect((await decisionRow(next.id)).status).toBe("REJECTED");
    expect((await actors.specialist.client.rpc("decision_reopen", { p_decision: next.id, p_reason: "Try again" })).error?.message).toBe("errors.statusChanged");
    await db.query("select app.close_due_decisions()");
  }, 120_000);

  it("vendors never read decisions, voters or minutes; a PO decision needs its PO", async () => {
    expect((await actors.vendorA.client.from("decision").select("id")).data).toHaveLength(0);
    expect((await actors.vendorA.client.from("minutes").select("id")).data).toHaveLength(0);
    const any = (await db.query("select id from public.decision where company_id = $1 limit 1", [COMPANY_ID])).rows[0];
    expect((await actors.vendorA.client.rpc("decision_package", { p_decision: any.id })).data).toBeNull();
    expect((await actors.vendorA.client.rpc("decision_voters", { p_decision: any.id })).data ?? []).toHaveLength(0);
    await expect(db.query("select app.open_decision($1, 'PO')", [sourcing])).rejects.toThrow();
  });
});

describe("CMT-03 minutes", () => {
  it("AC2: number, type, sourcing, times, voters with votes and comments, result and rule; readers by role", async () => {
    const sourcing = await startSourcing(10, 25.5);
    const id = await openWinner(sourcing);
    // the Chair does not vote: 1 For, 1 Against, tie without the Chair's vote
    await vote("cm2", id, "FOR");
    await vote("cm3", id, "AGAINST", "Too expensive");
    await dueNow(id);
    const row = await minutesOf(id);
    const view = await actors.specialist.client.rpc("minutes_view", { p_id: row.id });
    expect(view.data).toMatchObject({
      number: row.number, type: "WINNER", status: "NO_DECISION", resultRule: "TIE_WITHOUT_CHAIR", eligible: 3, for: 1, against: 1, poNumber: null,
    });
    const data = view.data as { sourcingNumber: string; voters: { name: string; isChair: boolean; vote: string; comment: string | null }[] };
    expect(data.sourcingNumber).toMatch(/^SRC-/);
    expect(data.voters.find((v) => v.name === "RLS5 cm3")).toMatchObject({ vote: "AGAINST", comment: "Too expensive" });
    expect(data.voters.find((v) => v.name === "RLS5 cm1")).toMatchObject({ vote: "NONE", isChair: true });
    for (const key of ["approver", "cm4", "admin", "specialist"] as const) {
      expect((await actors[key].client.rpc("minutes_view", { p_id: row.id })).data, key).not.toBeNull();
    }
    for (const key of ["requester", "vendorA"] as const) {
      expect((await actors[key].client.rpc("minutes_view", { p_id: row.id })).data, key).toBeNull();
      expect((await actors[key].client.from("minutes").select("id")).data ?? [], key).toHaveLength(0);
    }
  }, 120_000);

  it("AC4: minutes cannot be edited or deleted, not even by the service key or the database owner", async () => {
    const row = (await db.query("select m.id from public.minutes m join public.decision d on d.id = m.decision_id where d.company_id = $1 limit 1", [COMPANY_ID])).rows[0];
    expect((await service.from("minutes").update({ number: "MIN-1900-001" }).eq("id", row.id)).error).not.toBeNull();
    expect((await service.from("minutes").delete().eq("id", row.id)).error).not.toBeNull();
    expect((await actors.admin.client.from("minutes").delete().eq("id", row.id).select()).data ?? []).toHaveLength(0);
    await expect(db.query("update public.minutes set number = 'MIN-1900-001' where id = $1", [row.id])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("delete from public.minutes where id = $1", [row.id])).rejects.toThrow(/cannot be changed/);
  });
});

describe("CMT-04 opening of Tender bids", () => {
  it("AC1: a Tender that closes with the minimum met becomes AWAITING_OPENING and an OPENING decision opens; proposals counted, names for bid readers, no prices", async () => {
    const id = await tender();
    expect((await sourcingRow(id)).status).toBe("AWAITING_OPENING");
    const [opening] = await decisionsOf(id);
    expect(opening).toMatchObject({ type: "OPENING", status: "VOTING", purchase_order_id: null });
    expect((await db.query("select count(*)::int as n from public.decision_voter where decision_id = $1", [opening.id])).rows[0].n).toBe(3);
    expect((await sourcingRow(id)).bids_opened_at).toBeNull();

    const asMember = (await actors.cm1.client.rpc("decision_package", { p_decision: opening.id })).data as { proposalCount: number; bidders: string[] | null };
    expect(asMember.proposalCount).toBe(3);
    expect(asMember.bidders).toHaveLength(3);
    const asApprover = (await actors.approver.client.rpc("decision_package", { p_decision: opening.id })).data as { proposalCount: number; bidders: string[] | null };
    expect(asApprover.proposalCount).toBe(3);
    expect(asApprover.bidders).toBeNull();
    // no price anywhere before the technical evaluation is done
    for (const key of ["cm1", "specialist", "admin"] as const) {
      expect((await actors[key].client.from("proposal_line").select("unit_price")).data ?? [], key).toHaveLength(0);
    }
  }, 240_000);

  it("AC2, AC6: APPROVED moves the Tender to TECHNICAL_EVALUATION: names and technical documents open, prices stay sealed; minutes created", async () => {
    const id = await tender();
    const [opening] = await decisionsOf(id);
    const proposal = (await db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, actors.vendorA.vendorId])).rows[0];
    await db.query(
      `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
       values ($1, 'proposal', $2, 'technical_document', 'spec.pdf', 'application/pdf', 1000, $3)`,
      [COMPANY_ID, proposal.id, `rls5/${randomUUID()}.pdf`],
    );
    const files = async (key: Internal) => (await actors[key].client.from("file").select("id").eq("owner_type", "proposal").eq("owner_id", proposal.id)).data ?? [];
    expect(await files("cm1")).toHaveLength(0); // documents stay closed until the opening is approved

    await vote("cm1", opening.id, "FOR");
    await vote("cm2", opening.id, "FOR");
    await vote("cm3", opening.id, "AGAINST", "Check the bond first");
    expect(await decisionRow(opening.id)).toMatchObject({ status: "APPROVED", result_rule: "MAJORITY" });
    const s = await sourcingRow(id);
    expect(s.status).toBe("TECHNICAL_EVALUATION");
    expect(s.bids_opened_at).not.toBeNull();
    expect(s.prices_opened_at).toBeNull();
    expect((await minutesOf(opening.id)).number).toMatch(/^MIN-\d{4}-\d{3}$/);

    expect(await files("cm1")).toHaveLength(1);
    expect(await files("specialist")).toHaveLength(1);
    expect(((await actors.specialist.client.from("proposal").select("id").eq("sourcing_id", id)).data ?? [])).toHaveLength(3);
    for (const key of ["cm1", "specialist", "admin"] as const) {
      expect((await actors[key].client.from("proposal_line").select("unit_price")).data ?? [], key).toHaveLength(0);
    }
    const audit = await db.query("select reason from public.audit_entry where record_type = 'sourcing' and record_id = $1 and to_status = 'TECHNICAL_EVALUATION'", [id]);
    expect(audit.rows[0].reason).toBe("Opening approved");
  }, 240_000);

  it("AC4: REJECTED leaves the Tender at AWAITING_OPENING; Reopen vote needs a reason that the members see", async () => {
    const id = await tender();
    const [opening] = await decisionsOf(id);
    await vote("cm1", opening.id, "AGAINST", "Not yet");
    await vote("cm2", opening.id, "AGAINST", "Not yet");
    await vote("cm3", opening.id, "FOR");
    expect(await decisionRow(opening.id)).toMatchObject({ status: "REJECTED" });
    expect((await sourcingRow(id)).status).toBe("AWAITING_OPENING");

    expect((await actors.specialist.client.rpc("decision_reopen", { p_decision: opening.id, p_reason: "  " })).error?.message).toBe("errors.reasonRequired");
    expect((await actors.specialist2.client.rpc("decision_reopen", { p_decision: opening.id, p_reason: "Documents added" })).error?.message).toBe("errors.noAccess");
    const reopened = await actors.specialist.client.rpc("decision_reopen", { p_decision: opening.id, p_reason: "Documents added" });
    expect(reopened.error).toBeNull();
    const next = await decisionRow(reopened.data as string);
    expect(next).toMatchObject({ status: "VOTING", type: "OPENING", reopen_reason: "Documents added", reopened_from_id: opening.id });
    const seen = await actors.cm1.client.from("decision").select("reopen_reason").eq("id", next.id).single();
    expect(seen.data?.reopen_reason).toBe("Documents added");

    await vote("cm1", next.id, "FOR");
    await vote("cm2", next.id, "FOR");
    await vote("cm3", next.id, "FOR");
    expect((await sourcingRow(id)).status).toBe("TECHNICAL_EVALUATION");
  }, 240_000);

  it("AC4: NO_DECISION (no quorum) leaves the Tender at AWAITING_OPENING; Reopen without a reason; Cancel closes the open vote as 'Sourcing cancelled' with minutes (RFQ-04 AC6)", async () => {
    const id = await tender();
    const [opening] = await decisionsOf(id);
    await dueNow(opening.id);
    expect(await decisionRow(opening.id)).toMatchObject({ status: "NO_DECISION", result_rule: "NO_QUORUM" });
    expect((await sourcingRow(id)).status).toBe("AWAITING_OPENING");

    const reopened = await actors.specialist.client.rpc("decision_reopen", { p_decision: opening.id, p_reason: "" });
    expect(reopened.error).toBeNull();
    const open = await decisionRow(reopened.data as string);
    expect(open.status).toBe("VOTING");
    await vote("cm1", open.id, "FOR");

    const cancelled = await actors.specialist.client.rpc("sourcing_cancel", { p_id: id, p_reason: "Budget frozen" });
    expect(cancelled.error).toBeNull();
    expect((await sourcingRow(id)).status).toBe("CANCELLED");
    const closed = await decisionRow(open.id);
    expect(closed).toMatchObject({ status: "NO_DECISION", result_rule: "SOURCING_CANCELLED", close_reason: "Budget frozen" });
    const minutes = await minutesOf(open.id);
    expect(minutes.number).toMatch(/^MIN-\d{4}-\d{3}$/);
    const view = await actors.admin.client.rpc("minutes_view", { p_id: minutes.id });
    expect(view.data).toMatchObject({ resultRule: "SOURCING_CANCELLED", closeReason: "Budget frozen", status: "NO_DECISION" });
    const audit = await db.query("select reason from public.audit_entry where record_type = 'decision' and record_id = $1 and to_status = 'NO_DECISION'", [open.id]);
    expect(audit.rows[0].reason).toBe("Sourcing cancelled");
    expect((await vote("cm2", open.id, "FOR")).error?.message).toBe("errors.votingClosed");
    expect((await actors.specialist.client.rpc("decision_reopen", { p_decision: open.id, p_reason: "" })).error?.message).toBe("errors.statusChanged");
  }, 240_000);

  it("RFQ-04 AC2 / CMT-04 AC5: a Tender below the minimum gets its OPENING decision on Continue; an RFQ never gets one", async () => {
    const below = await tender(["vendorA"]);
    expect((await sourcingRow(below)).status).toBe("CLOSED");
    expect(await decisionsOf(below)).toHaveLength(0);
    expect((await actors.specialist.client.rpc("sourcing_continue", { p_id: below, p_reason: "Only one qualified bidder" })).error).toBeNull();
    expect((await sourcingRow(below)).status).toBe("AWAITING_OPENING");
    expect(await decisionsOf(below)).toHaveLength(1);

    const rfq = await startSourcing(10, 25.5);
    await publish(rfq);
    await offer("vendorA", rfq);
    await pastDeadline(rfq);
    const s = await sourcingRow(rfq);
    expect(s.status).toBe("COMPARISON");
    expect(s.prices_opened_at).not.toBeNull();
    expect((await db.query("select count(*)::int as n from public.decision where sourcing_id = $1", [rfq])).rows[0].n).toBe(0);
  }, 240_000);
});
