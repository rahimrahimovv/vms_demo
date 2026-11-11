/**
 * Workflow and RLS tests for Slice 3 (MDM-01, MDM-02, PLN-01, PR-01, PR-02) against vms-dev.
 * Throwaway users (two Requesters, an Approver, an Approver who is also a Requester, a Procurement
 * Specialist, a Committee Member, an Admin and a vendor) work on their own test category, item,
 * plan line and dictionary entries; all of it is removed afterwards. Seeded data is only read.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const SEED = {
  fertilisers: "00000000-0000-4000-8000-000000000101",
  ammoniumNitrate: "00000000-0000-4000-8000-000000000701",
  foliar: "00000000-0000-4000-8000-000000000704",
  copyPaper: "00000000-0000-4000-8000-000000000721",
  centralWarehouse: "00000000-0000-4000-8000-000000000301",
};
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CURRENCY = `Q${LETTERS[randomInt(26)]}${LETTERS[randomInt(26)]}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Key = "requester" | "requester2" | "approver" | "approverRequester" | "specialist" | "committee" | "admin" | "vendor";
type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<Key, Actor>;
const recordIds: string[] = []; // requisitions, plan lines, vendor: notification / audit cleanup
const created = { categories: [] as string[], items: [] as string[], paymentTerms: [] as string[], modes: [] as string[] };
let today = "";
let root = ""; // test category, the plan line's category
let child = ""; // its child, where the test item lives
let item = "";
let planLine = "";

const plusDays = (n: number) => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);

function anon() {
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function internal(key: Exclude<Key, "vendor">, roles: string[]) {
  const email = `rls3-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS3 ${key}`, email });
  await service.from("user_role").insert(roles.map((role) => ({ user_id: data.user.id, role })));
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}

async function vendor() {
  const email = `rls3-vendor-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const { data: vendorId, error: regError } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY",
      legal_name: `RLS3 vendor ${RUN}`,
      voen: `96${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ",
      legal_address: "Test street 3",
      director_name: "Test Director",
      is_vat_payer: true,
      contact_person: "Test Contact",
      contact_email: email,
      phone: "+994500000003",
      founded_on: "2015-05-01",
    },
    p_owners: [{ full_name: "Head Person", id_number: `HEAD3-${RUN}`, share_percent: 100, role: "HEAD" }],
    p_accounts: [{ bank_name: "Test Bank", iban: "AZ00TEST0003", swift: "TESTAZ22", currency: "AZN", is_main: true }],
  });
  if (regError) throw regError;
  recordIds.push(vendorId);
  actors.vendor = { id: data.user.id, email, client: await signIn(email), vendorId };
}

const line = (patch: Record<string, unknown> = {}) => ({
  item_id: item,
  quantity: 10,
  estimated_unit_price: 25.5,
  delivery_date: plusDays(14),
  delivery_place_id: SEED.centralWarehouse,
  specification: "Delivered on pallets",
  ...patch,
});

async function savePr(actor: Actor, id: string | null, lines: unknown[], submit: boolean, plan = planLine) {
  const result = await actor.client.rpc("requisition_save", { p_id: id, p_plan_line_id: plan, p_lines: lines, p_submit: submit });
  if (result.data) recordIds.push(result.data as string);
  return result;
}

async function prRow(id: string) {
  return (await db.query("select number, status, estimated_value::text v, decision_comment from public.requisition where id = $1", [id]))
    .rows[0];
}

async function notified(userId: string, event: string, recordId: string) {
  const { rows } = await db.query("select params from public.notification where user_id = $1 and event = $2 and record_id = $3", [
    userId,
    event,
    recordId,
  ]);
  return rows;
}

beforeAll(async () => {
  await db.connect();
  today = (await db.query("select app.today()::text as d")).rows[0].d;
  await internal("requester", ["REQUESTER"]);
  await internal("requester2", ["REQUESTER"]);
  await internal("approver", ["APPROVER"]);
  await internal("approverRequester", ["APPROVER", "REQUESTER"]);
  await internal("specialist", ["PROCUREMENT_SPECIALIST"]);
  await internal("committee", ["COMMITTEE_MEMBER"]);
  await internal("admin", ["ADMIN"]);
  await vendor();

  const admin = actors.admin.client;
  const r1 = await admin.rpc("category_save", { p_id: null, p_parent_id: null, p_name: `RLS3 root ${RUN}`, p_licence_required: false, p_is_active: true });
  if (r1.error) throw r1.error;
  root = r1.data as string;
  const r2 = await admin.rpc("category_save", { p_id: null, p_parent_id: root, p_name: "RLS3 child", p_licence_required: false, p_is_active: true });
  if (r2.error) throw r2.error;
  child = r2.data as string;
  created.categories.push(child, root);
  const r3 = await admin.rpc("item_save", {
    p_id: null,
    p_category_id: child,
    p_code: `RLS3-${RUN}`,
    p_name: "RLS3 test item",
    p_unit: "piece",
    p_is_active: true,
  });
  if (r3.error) throw r3.error;
  item = r3.data as string;
  created.items.push(item);
  const r4 = await admin.rpc("plan_line_save", {
    p_id: null,
    p_year: 2026,
    p_category_id: root,
    p_description: `RLS3 plan ${RUN}`,
    p_planned_amount: 1000,
    p_quarter: "Q4",
  });
  if (r4.error) throw r4.error;
  planLine = r4.data as string;
  recordIds.push(planLine);
}, 120_000);

afterAll(async () => {
  await db.query("begin");
  await db.query("alter table public.audit_entry disable trigger audit_entry_immutable");
  await db.query("delete from public.audit_entry where record_id = any($1::uuid[])", [recordIds]);
  await db.query("alter table public.audit_entry enable trigger audit_entry_immutable");
  await db.query("commit");
  await db.query("delete from public.notification where record_id = any($1::uuid[])", [recordIds]);
  await db.query("delete from public.requisition where id = any($1::uuid[])", [recordIds]);
  await db.query("delete from public.plan_line where id = any($1::uuid[])", [recordIds]);
  await db.query("delete from public.item where id = any($1::uuid[])", [created.items]);
  for (const id of created.categories) await db.query("delete from public.category where id = $1", [id]);
  await db.query("delete from public.payment_term where id = any($1::uuid[])", [created.paymentTerms]);
  await db.query("delete from public.delivery_mode where id = any($1::uuid[])", [created.modes]);
  if (actors.vendor) await service.auth.admin.deleteUser(actors.vendor.id);
  if (actors.vendor?.vendorId) await db.query("delete from public.vendor where id = $1", [actors.vendor.vendorId]);
  await db.query("delete from public.currency where code = $1", [CURRENCY]);
  for (const key of Object.keys(actors) as Key[]) {
    if (key === "vendor") continue;
    const { error } = await service.auth.admin.deleteUser(actors[key].id);
    if (error) throw new Error(`cleanup: ${key} not deleted (${error.message})`);
  }
  await db.end();
}, 120_000);

describe("MDM-01 dictionaries", () => {
  it("only the Admin writes dictionaries, and only through the functions", async () => {
    const { error } = await actors.requester.client.rpc("delivery_mode_save", { p_id: null, p_name: "Nope", p_is_active: true });
    expect(error?.message).toBe("errors.noAccess");
    const direct = await actors.admin.client.from("delivery_mode").insert({ company_id: COMPANY_ID, name: `Direct ${RUN}` });
    expect(direct.error).not.toBeNull();
    const currency = await actors.admin.client.from("currency").insert({ code: "QQQ", name: "Direct" });
    expect(currency.error).not.toBeNull();
  });

  it("AC2 payment term: advance outside 0-100 % is refused; a valid one is saved", async () => {
    const bad = await actors.admin.client.rpc("payment_term_save", {
      p_id: null, p_name: `RLS3 term ${RUN}`, p_advance_percent: 120, p_days_after_delivery: 0, p_is_active: true,
    });
    expect(bad.error?.message).toBe("errors.advancePercentRange");
    const ok = await actors.admin.client.rpc("payment_term_save", {
      p_id: null, p_name: `RLS3 term ${RUN}`, p_advance_percent: 20, p_days_after_delivery: 45, p_is_active: true,
    });
    expect(ok.error).toBeNull();
    created.paymentTerms.push(ok.data as string);
  });

  it("AC6 the same name twice (any case) -> 'This name already exists'", async () => {
    const first = await actors.admin.client.rpc("delivery_mode_save", { p_id: null, p_name: `RLS3 mode ${RUN}`, p_is_active: true });
    expect(first.error).toBeNull();
    created.modes.push(first.data as string);
    const again = await actors.admin.client.rpc("delivery_mode_save", { p_id: null, p_name: `rls3 MODE ${RUN}`, p_is_active: true });
    expect(again.error?.message).toBe("errors.nameExists");
  });

  it("AC1 Incoterms: rename and deactivate only, never delete", async () => {
    const del = await actors.admin.client.rpc("dictionary_delete", { p_kind: "incoterm", p_key: "EXW" });
    expect(del.error?.message).toBe("errors.noAccess");
    const { rows } = await db.query("select name from public.incoterm where code = 'EXW'");
    const rename = await actors.admin.client.rpc("incoterm_save", { p_code: "EXW", p_name: `Ex Works ${RUN}`, p_is_active: true });
    expect(rename.error).toBeNull();
    await actors.admin.client.rpc("incoterm_save", { p_code: "EXW", p_name: rows[0].name, p_is_active: true });
  });

  it("AC4 currencies: ISO code of 3 capitals, unique; AC5 an entry in use cannot be deleted", async () => {
    const bad = await actors.admin.client.rpc("currency_save", { p_code: "Q1", p_name: "Bad", p_is_active: true, p_is_new: true });
    expect(bad.error?.message).toBe("errors.currencyCodeFormat");
    const ok = await actors.admin.client.rpc("currency_save", { p_code: CURRENCY, p_name: `Test money ${RUN}`, p_is_active: true, p_is_new: true });
    expect(ok.error).toBeNull();
    const dupCode = await actors.admin.client.rpc("currency_save", { p_code: CURRENCY, p_name: "Other", p_is_active: true, p_is_new: true });
    expect(dupCode.error?.message).toBe("errors.codeExists");
    const dupName = await actors.admin.client.rpc("currency_save", { p_code: "QZZ", p_name: "us dollar", p_is_active: true, p_is_new: true });
    expect(dupName.error?.message).toBe("errors.nameExists");
    const inUse = await actors.admin.client.rpc("dictionary_delete", { p_kind: "currency", p_key: "AZN" });
    expect(inUse.error?.message).toBe("errors.inUse");
    // every signed-in user reads the list for the dropdowns
    const { data } = await actors.vendor.client.from("currency").select("code").eq("code", CURRENCY);
    expect(data).toHaveLength(1);
  });

  it("AC4-AC5 bank accounts take a currency from the dictionary; a deactivated one only where already used", async () => {
    const account = (currency: string) => [{ bank_name: "Test Bank", iban: "AZ00TEST0003", swift: "TESTAZ22", currency, is_main: true }];
    expect((await actors.vendor.client.rpc("bank_accounts_save", { p_accounts: account(CURRENCY) })).error).toBeNull();
    await actors.admin.client.rpc("currency_save", { p_code: CURRENCY, p_name: `Test money ${RUN}`, p_is_active: false, p_is_new: false });
    // the account that already uses it keeps it
    expect((await actors.vendor.client.rpc("bank_accounts_save", { p_accounts: account(CURRENCY) })).error).toBeNull();
    expect((await actors.vendor.client.rpc("bank_accounts_save", { p_accounts: account("XXX") })).error?.message).toBe("errors.currencyInvalid");
    expect((await actors.vendor.client.rpc("bank_accounts_save", { p_accounts: account("TRY") })).error).toBeNull();
    // gone from the vendor now: a new use of the deactivated currency is refused
    expect((await actors.vendor.client.rpc("bank_accounts_save", { p_accounts: account(CURRENCY) })).error?.message).toBe("errors.currencyInvalid");
    const guarantee = await actors.vendor.client
      .from("vendor")
      .update({ bank_guarantee_available: true, bank_guarantee_max: 1000, bank_guarantee_currency: CURRENCY })
      .eq("id", actors.vendor.vendorId!);
    expect(guarantee.error?.message).toBe("errors.currencyInvalid");
    const del = await actors.admin.client.rpc("dictionary_delete", { p_kind: "currency", p_key: CURRENCY });
    expect(del.error).toBeNull();
  });
});

describe("MDM-02 categories and items", () => {
  it("AC6 a category with children cannot be deleted", async () => {
    const { error } = await actors.admin.client.rpc("category_delete", { p_id: root });
    expect(error?.message).toBe("errors.categoryHasChildren");
  });

  it("AC4 item codes are unique in any case", async () => {
    const { error } = await actors.admin.client.rpc("item_save", {
      p_id: null, p_category_id: child, p_code: "frt-001", p_name: "Copy", p_unit: "bag", p_is_active: true,
    });
    expect(error?.message).toBe("errors.codeExists");
  });

  it("only the Admin maintains the catalogue", async () => {
    const { error } = await actors.specialist.client.rpc("item_delete", { p_id: item });
    expect(error?.message).toBe("errors.noAccess");
  });
});

describe("PLN-01 plan", () => {
  it("AC1 planned amount must be greater than 0", async () => {
    const { error } = await actors.admin.client.rpc("plan_line_save", {
      p_id: null, p_year: 2026, p_category_id: root, p_description: "Zero", p_planned_amount: 0, p_quarter: "Q1",
    });
    expect(error?.message).toBe("errors.amountPositive");
  });

  it("AC5 Requester, Approver and Specialist read the plan; the Committee Member and vendor do not; only the Admin writes", async () => {
    for (const key of ["requester", "approver", "specialist", "admin"] as const) {
      const { data } = await actors[key].client.from("plan_line_summary").select("id, remaining_amount").eq("id", planLine);
      expect(data, key).toHaveLength(1);
    }
    for (const key of ["committee", "vendor"] as const) {
      const { data } = await actors[key].client.from("plan_line_summary").select("id");
      expect(data, key).toEqual([]);
    }
    const { error } = await actors.requester.client.rpc("plan_line_close", { p_id: planLine });
    expect(error?.message).toBe("errors.noAccess");
  });
});

describe("PR-01 and PR-02", () => {
  let draft = "";

  it("AC5 Save stores a DRAFT with a PR-YYYY-NNNN number, even without lines", async () => {
    const { data, error } = await savePr(actors.requester, null, [], false);
    expect(error).toBeNull();
    draft = data as string;
    const pr = await prRow(draft);
    expect(pr.status).toBe("DRAFT");
    expect(pr.number).toMatch(/^PR-\d{4}-\d{4}$/);
  });

  it("AC6 Submit without lines -> 'Add at least one line'", async () => {
    const { error } = await savePr(actors.requester, draft, [], true);
    expect(error?.message).toBe("errors.lineRequired");
  });

  it("every existing line is checked on Save: AC3 date, AC2 price, AC1 / MDM-02 AC4 item of the plan line's category", async () => {
    expect((await savePr(actors.requester, draft, [line({ delivery_date: today })], false)).error?.message).toBe("errors.deliveryDateFuture");
    expect((await savePr(actors.requester, draft, [line({ estimated_unit_price: 1.234 })], false)).error?.message).toBe("errors.pricePositive");
    expect((await savePr(actors.requester, draft, [line({ quantity: 0 })], false)).error?.message).toBe("errors.quantityPositive");
    expect((await savePr(actors.requester, draft, [line({ item_id: SEED.copyPaper })], false)).error?.message).toBe(
      "errors.itemNotInPlanCategory",
    );
  });

  it("drafts are private: other Requesters, Approvers and vendors do not see them", async () => {
    for (const key of ["requester2", "approver", "specialist", "vendor"] as const) {
      const { data } = await actors[key].client.from("requisition").select("id").eq("id", draft);
      expect(data, key).toEqual([]);
    }
    const { error } = await savePr(actors.requester2, draft, [line()], false);
    expect(error?.message).toBe("errors.noAccess");
  });

  it("AC5 Submit -> PENDING_APPROVAL, read-only, every Approver but the Requester notified; plan committed", async () => {
    const { error } = await savePr(actors.requester, draft, [line(), line({ quantity: 2, estimated_unit_price: 10 })], true);
    expect(error).toBeNull();
    const pr = await prRow(draft);
    expect(pr.status).toBe("PENDING_APPROVAL");
    expect(pr.v).toBe("275.00");
    expect(await notified(actors.approver.id, "pr.submitted", draft)).toHaveLength(1);
    expect(await notified(actors.approverRequester.id, "pr.submitted", draft)).toHaveLength(1);
    expect((await savePr(actors.requester, draft, [line()], false)).error?.message).toBe("errors.statusChanged");
    const { data } = await actors.specialist.client.from("plan_line_summary").select("committed_amount, remaining_amount").eq("id", planLine);
    expect(data?.[0]).toEqual({ committed_amount: 275, remaining_amount: 725 });
    const { data: visible } = await actors.approver.client.from("requisition").select("id").eq("id", draft);
    expect(visible).toHaveLength(1);
    const { data: vendorView } = await actors.vendor.client.from("requisition").select("id");
    expect(vendorView).toEqual([]);
  });

  it("PR-02 AC2 Return needs a comment; the Requester is notified and the comment stays in History", async () => {
    expect((await actors.approver.client.rpc("requisition_decide", { p_id: draft, p_decision: "RETURN", p_comment: " " })).error?.message).toBe(
      "errors.commentRequired",
    );
    const { error } = await actors.approver.client.rpc("requisition_decide", {
      p_id: draft, p_decision: "RETURN", p_comment: "Split the delivery dates",
    });
    expect(error).toBeNull();
    expect((await prRow(draft)).status).toBe("RETURNED");
    expect((await notified(actors.requester.id, "pr.returned", draft))[0].params).toEqual({ comment: "Split the delivery dates" });
    const { rows } = await db.query("select reason from public.audit_entry where record_id = $1 and to_status = 'RETURNED'", [draft]);
    expect(rows[0].reason).toBe("Split the delivery dates");
  });

  it("PLN-01 AC2 a closed line keeps its RETURNED PR; a new PR cannot pick it", async () => {
    const other = await actors.admin.client.rpc("plan_line_save", {
      p_id: null, p_year: 2026, p_category_id: root, p_description: `RLS3 closed ${RUN}`, p_planned_amount: 100, p_quarter: "Q4",
    });
    recordIds.push(other.data as string);
    expect((await actors.admin.client.rpc("plan_line_close", { p_id: other.data })).error).toBeNull();
    expect((await savePr(actors.requester2, null, [], false, other.data as string)).error?.message).toBe("errors.planLineClosed");
    // PR-01 AC7: the returned PR is edited and submitted again
    const { error } = await savePr(actors.requester, draft, [line({ delivery_date: plusDays(20) })], true);
    expect(error).toBeNull();
    expect((await prRow(draft)).status).toBe("PENDING_APPROVAL");
    // the Admin may not move a line with PRs to another category
    const move = await actors.admin.client.rpc("plan_line_save", {
      p_id: planLine, p_year: 2026, p_category_id: SEED.fertilisers, p_description: `RLS3 plan ${RUN}`, p_planned_amount: 1000, p_quarter: "Q4",
    });
    expect(move.error?.message).toBe("errors.inUse");
  });

  it("PR-02 AC4 nobody approves their own PR (#83)", async () => {
    const own = await savePr(actors.approverRequester, null, [line()], true);
    expect(own.error).toBeNull();
    expect(await notified(actors.approverRequester.id, "pr.submitted", own.data as string)).toHaveLength(0);
    const { error } = await actors.approverRequester.client.rpc("requisition_decide", { p_id: own.data, p_decision: "APPROVE" });
    expect(error?.message).toBe("errors.ownRequest");
    const requesterOnly = await actors.requester.client.rpc("requisition_decide", { p_id: draft, p_decision: "APPROVE" });
    expect(requesterOnly.error?.message).toBe("errors.noAccess");
  });

  it("PR-02 AC1 Approve -> APPROVED; Requester and every Specialist notified; MDM-02 AC5 its item is now in use", async () => {
    const { error } = await actors.approver.client.rpc("requisition_decide", { p_id: draft, p_decision: "APPROVE" });
    expect(error).toBeNull();
    expect((await prRow(draft)).status).toBe("APPROVED");
    expect(await notified(actors.requester.id, "pr.approved", draft)).toHaveLength(1);
    expect(await notified(actors.specialist.id, "pr.readyForSourcing", draft)).toHaveLength(1);
    expect((await actors.admin.client.rpc("item_delete", { p_id: item })).error?.message).toBe("errors.inUse");
    expect((await actors.admin.client.rpc("category_delete", { p_id: child })).error?.message).toBe("errors.inUse");
  });

  it("PR-02 AC3 Reject needs a reason and is final; PLN-01 AC4 the plan excess is shown on an over-plan PR", async () => {
    const big = await savePr(actors.requester2, null, [line({ quantity: 100, estimated_unit_price: 10 })], true);
    expect(big.error).toBeNull();
    // 1,000.00 planned; the approved PR (255.00) and the pending own PR (255.00) are committed, so
    // 490.00 is left and this 1,000.00 PR exceeds it by 510.00 (the PR itself is not counted)
    const { data: excess } = await actors.approver.client.rpc("requisition_plan_excess", { p_id: big.data });
    expect(Number(excess)).toBe(510);
    expect((await actors.approver.client.rpc("requisition_decide", { p_id: big.data, p_decision: "REJECT" })).error?.message).toBe(
      "errors.reasonRequired",
    );
    expect(
      (await actors.approver.client.rpc("requisition_decide", { p_id: big.data, p_decision: "REJECT", p_comment: "Over budget" })).error,
    ).toBeNull();
    expect((await prRow(big.data as string)).status).toBe("REJECTED");
    expect((await notified(actors.requester2.id, "pr.rejected", big.data as string))[0].params).toEqual({ comment: "Over budget" });
    const again = await actors.approver.client.rpc("requisition_decide", { p_id: big.data, p_decision: "APPROVE" });
    expect(again.error?.message).toBe("errors.statusChanged");
  });
});
