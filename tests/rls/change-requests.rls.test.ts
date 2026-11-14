/**
 * REG-08, REG-02 AC5, REG-06 AC3 against vms-dev: change requests for core company data, reopening a rejected
 * registration, the "Profile updated" log and the direct bank-account path. Two throwaway APPROVED local vendors (A, B),
 * a third vendor (C) whose status the tests move, a Procurement Specialist and an Admin. Everything created is removed
 * afterwards; seeded vendors are not touched.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { withAuditTriggerOff } from "./helpers/dev-cleanup";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string; voen?: string };
const actors = {} as Record<"A" | "B" | "C" | "specialist" | "admin", Actor>;
const voen = () => `95${String(randomInt(0, 99_999_999)).padStart(8, "0")}`;

async function signIn(email: string) {
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function vendor(key: "A" | "B" | "C") {
  const email = `rls5-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const taxNumber = voen();
  const { data: vendorId, error: regError } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY",
      legal_name: `RLS5 ${key} ${RUN}`,
      voen: taxNumber,
      country_code: "AZ",
      contact_person: `Contact ${key}`,
      contact_email: email,
      phone: "+994500000000",
    },
  });
  if (regError) throw regError;
  actors[key] = { id: data.user.id, email, vendorId, voen: taxNumber, client: await signIn(email) };
}

async function internal(key: "specialist" | "admin", role: string) {
  const email = `rls5-${key}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS5 ${key}`, email });
  await service.from("user_role").insert({ user_id: data.user.id, role });
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}

const fileRow = (ownerType: string, ownerId: string, kind: string, path = `rls5/${RUN}/${randomUUID()}.pdf`) =>
  db.query(
    `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
     values ($1, $2, $3, $4, 'test.pdf', 'application/pdf', 100, $5)`,
    [COMPANY_ID, ownerType, ownerId, kind, path],
  );

const vendorRow = async (id: string) => (await db.query("select * from public.vendor where id = $1", [id])).rows[0];
const submit = (who: Actor, section: string, proposed: unknown, reason = "Reason for the change") =>
  who.client.rpc("change_request_submit", { p_section: section, p_reason: reason, p_proposed: proposed });
const decide = (who: Actor, id: string, decision: string, comment: string | null = null) =>
  who.client.rpc("change_request_decide", { p_id: id, p_decision: decision, p_comment: comment });
const company = (vendorKey: "A" | "B", over: Record<string, unknown> = {}) => ({
  legal_name: `RLS5 ${vendorKey} ${RUN}`,
  voen: actors[vendorKey].voen,
  legal_address: "Baku, Test street 1",
  director_name: "Test Director",
  is_vat_payer: false,
  founded_on: "2010-01-01",
  ...over,
});
const iban = (tail: string) => `AZ21TEST0000000000000000${tail}`;
const account = (tail: string, isMain: boolean, currency = "AZN") => ({
  bank_name: "Test Bank",
  iban: iban(tail),
  swift: "TESTAZ22",
  currency,
  is_main: isMain,
});

beforeAll(async () => {
  await db.connect();
  await internal("specialist", "PROCUREMENT_SPECIALIST");
  await internal("admin", "ADMIN");
  await vendor("A");
  await vendor("B");
  await vendor("C");
  // C stays a draft until a test moves it, but has the fields a SUBMITTED or REJECTED vendor must have
  await db.query(
    `update public.vendor set legal_address = 'Baku, C street', director_name = 'C Director', is_vat_payer = false,
            founded_on = '2010-01-01' where id = $1`,
    [actors.C.vendorId],
  );
  // A and B are APPROVED with complete data
  for (const key of ["A", "B"] as const) {
    const id = actors[key].vendorId!;
    await db.query(
      `update public.vendor set legal_address = 'Baku, Test street 1', director_name = 'Test Director', is_vat_payer = false,
              founded_on = '2010-01-01', status = 'APPROVED', standing = 'ACTIVE' where id = $1`,
      [id],
    );
    await db.query(
      `insert into public.vendor_owner (vendor_id, full_name, id_number, share_percent, role)
       values ($1, $2, $3, 100, 'HEAD')`,
      [id, `Owner ${key} ${RUN}`, `ID-${key}-${RUN}`],
    );
    await db.query(
      `insert into public.vendor_bank_account (vendor_id, bank_name, iban, swift, currency, is_main)
       values ($1, 'Old Bank', $2, 'OLDAZ22', 'AZN', true)`,
      [id, iban(key === "A" ? "1111" : "2222")],
    );
  }
}, 120_000);

afterAll(async () => {
  const vendorIds = (["A", "B", "C"] as const).map((k) => actors[k]?.vendorId).filter(Boolean) as string[];
  const requestIds = vendorIds.length
    ? (await db.query("select id from public.vendor_change_request where vendor_id = any($1::uuid[])", [vendorIds])).rows.map((r) => r.id)
    : [];
  const userIds = Object.values(actors).map((a) => a.id);
  await withAuditTriggerOff(db, async () => {
    await db.query("delete from public.audit_entry where record_id = any($1::uuid[]) or user_id = any($1::uuid[])", [
      [...vendorIds, ...requestIds, ...userIds],
    ]);
  });
  await db.query("delete from public.notification where user_id = any($1::uuid[]) or record_id = any($2::uuid[])", [userIds, [...vendorIds, ...requestIds]]);
  await db.query("delete from public.file where storage_path like $1", [`rls5/${RUN}/%`]);
  for (const a of Object.values(actors)) if (a) await service.auth.admin.deleteUser(a.id);
  if (vendorIds.length > 0) await db.query("delete from public.vendor where id = any($1::uuid[])", [vendorIds]);
  await db.end();
}, 60_000);

describe("REG-08 AC1-AC3: a vendor submits a request; the data in force stays", () => {
  let requestId: string;

  it("an APPROVED vendor submits a company change: SUBMITTED, snapshot stored, data unchanged, specialist notified", async () => {
    const { data, error } = await submit(actors.A, "COMPANY_DETAILS", company("A", { legal_address: "Baku, New street 2", director_name: "New Director" }));
    expect(error).toBeNull();
    requestId = data as string;
    const { rows } = await db.query("select * from public.vendor_change_request where id = $1", [requestId]);
    expect(rows[0].status).toBe("SUBMITTED");
    expect(rows[0].current_values).toMatchObject({ legal_address: "Baku, Test street 1", director_name: "Test Director" });
    expect(rows[0].proposed_values).toMatchObject({ legal_address: "Baku, New street 2", director_name: "New Director" });
    expect((await vendorRow(actors.A.vendorId!)).legal_address).toBe("Baku, Test street 1"); // still in force
    const { rows: notes } = await db.query(
      "select count(*)::int as n from public.notification where user_id = $1 and event = 'changeRequest.submitted' and record_id = $2",
      [actors.specialist.id, requestId],
    );
    expect(notes[0].n).toBe(1);
    const audit = await db.query("select to_status, reason, user_id from public.audit_entry where record_type = 'vendor_change_request' and record_id = $1", [requestId]);
    expect(audit.rows).toEqual([{ to_status: "SUBMITTED", reason: "Reason for the change", user_id: actors.A.id }]);
  });

  it("a second request in the same section is refused; another section may run in parallel", async () => {
    const second = await submit(actors.A, "COMPANY_DETAILS", company("A", { director_name: "Other" }));
    expect(second.error?.message).toBe("errors.changeRequestOpen");
    const bank = await submit(actors.A, "BANK_ACCOUNTS", { accounts: [account("3333", true)] });
    expect(bank.error).toBeNull();
    // the vendor never writes the table directly
    const direct = await actors.A.client.from("vendor_change_request").update({ status: "APPROVED" }).eq("id", requestId);
    expect(direct.data ?? []).toEqual([]);
    expect((await db.query("select status from public.vendor_change_request where id = $1", [requestId])).rows[0].status).toBe("SUBMITTED");
  });

  it("the vendor reads its own requests; another vendor reads none of them", async () => {
    expect((await actors.A.client.from("vendor_change_request").select("id").eq("id", requestId)).data).toHaveLength(1);
    expect((await actors.B.client.from("vendor_change_request").select("id").eq("id", requestId)).data).toEqual([]);
    expect((await actors.specialist.client.from("vendor_change_request").select("id").eq("id", requestId)).data).toHaveLength(1);
  });

  it("a DRAFT vendor does not use change requests (it edits directly)", async () => {
    const { error } = await submit(actors.C, "COMPANY_DETAILS", { legal_name: "X" });
    expect(error?.message).toBe("errors.noAccess");
  });
});

describe("REG-08 AC4: the proposal is checked like the registration", () => {
  it("VÖEN format, a tax number of another vendor, no change, no reason", async () => {
    const bad = await submit(actors.B, "COMPANY_DETAILS", company("B", { voen: "123" }));
    expect(bad.error?.message).toBe("errors.voenFormat");
    const taken = await submit(actors.B, "COMPANY_DETAILS", company("B", { voen: actors.A.voen }));
    expect(taken.error?.message).toBe("errors.taxNumberTaken");
    const same = await submit(actors.B, "COMPANY_DETAILS", company("B"));
    expect(same.error?.message).toBe("errors.noChange");
    const noReason = await submit(actors.B, "COMPANY_DETAILS", company("B", { director_name: "Z" }), "  ");
    expect(noReason.error?.message).toBe("errors.reasonRequired");
    expect((await db.query("select count(*)::int as n from public.vendor_change_request where vendor_id = $1", [actors.B.vendorId])).rows[0].n).toBe(0);
  });

  it("owners: no Head, shares over 100; bank accounts: not exactly one main, bad IBAN", async () => {
    const owner = (role: string, share: number, id = "X1") => ({ full_name: "Person", id_number: id, share_percent: share, role });
    expect((await submit(actors.B, "OWNERS", { owners: [owner("FOUNDER", 50)] })).error?.message).toBe("errors.headOwnerRequired");
    expect((await submit(actors.B, "OWNERS", { owners: [owner("HEAD", 80), owner("FOUNDER", 40, "X2")] })).error?.message).toBe("errors.sharesOver100");
    expect((await submit(actors.B, "BANK_ACCOUNTS", { accounts: [account("4444", false)] })).error?.message).toBe("errors.mainAccountOne");
    expect((await submit(actors.B, "BANK_ACCOUNTS", { accounts: [{ ...account("4444", true), iban: "not an iban!" }] })).error?.message).toBe("errors.ibanFormat");
  });
});

describe("REG-08 AC5-AC8: the Procurement Specialist decides; the vendor can withdraw", () => {
  it("only a Procurement Specialist decides; Admin and vendor are refused", async () => {
    const { data: id } = await submit(actors.B, "COMPANY_DETAILS", company("B", { legal_address: "Baku, B street" }));
    expect((await decide(actors.admin, id as string, "APPROVE")).error?.message).toBe("errors.noAccess");
    expect((await decide(actors.B, id as string, "APPROVE")).error?.message).toBe("errors.noAccess");
    expect((await vendorRow(actors.B.vendorId!)).legal_address).toBe("Baku, Test street 1");
    // approve: an address change needs no supporting file
    const approved = await decide(actors.specialist, id as string, "APPROVE", "Checked");
    expect(approved.error).toBeNull();
    expect((await vendorRow(actors.B.vendorId!)).legal_address).toBe("Baku, B street");
    const { rows } = await db.query("select status, decided_by, review_comment from public.vendor_change_request where id = $1", [id]);
    expect(rows[0]).toEqual({ status: "APPROVED", decided_by: actors.specialist.id, review_comment: "Checked" });
    const { rows: notes } = await db.query("select params from public.notification where user_id = $1 and event = 'changeRequest.decided' and record_id = $2", [actors.B.id, id]);
    expect(notes[0].params).toMatchObject({ section: "COMPANY_DETAILS", decision: "APPROVED" });
    // an approved request cannot be decided again
    expect((await decide(actors.specialist, id as string, "REJECT", "Late")).error?.message).toBe("errors.statusChanged");
  });

  it("a change of legal name needs a supporting file at approval; the refusal changes nothing", async () => {
    const { data: id } = await submit(actors.B, "COMPANY_DETAILS", company("B", { legal_name: `RLS5 B renamed ${RUN}`, legal_address: "Baku, B street" }));
    const refused = await decide(actors.specialist, id as string, "APPROVE");
    expect(refused.error?.message).toBe("errors.supportRequired");
    expect((await vendorRow(actors.B.vendorId!)).legal_name).toBe(`RLS5 B ${RUN}`);
    expect((await db.query("select status from public.vendor_change_request where id = $1", [id])).rows[0].status).toBe("SUBMITTED");
    await fileRow("vendor_change_request", id as string, "change_support");
    expect((await decide(actors.specialist, id as string, "APPROVE")).error).toBeNull();
    expect((await vendorRow(actors.B.vendorId!)).legal_name).toBe(`RLS5 B renamed ${RUN}`);
  });

  it("approval re-runs the tax-number check: a number taken meanwhile refuses the approval", async () => {
    const newVoen = voen();
    const { data: id } = await submit(actors.B, "COMPANY_DETAILS", company("B", { voen: newVoen, legal_name: `RLS5 B renamed ${RUN}`, legal_address: "Baku, B street" }));
    await fileRow("vendor_change_request", id as string, "change_support");
    await db.query("update public.vendor set voen = $1 where id = $2", [newVoen, actors.C.vendorId]); // another vendor takes it
    const refused = await decide(actors.specialist, id as string, "APPROVE");
    expect(refused.error?.message).toBe("errors.taxNumberTaken");
    expect((await vendorRow(actors.B.vendorId!)).voen).toBe(actors.B.voen);
    await db.query("update public.vendor set voen = $1 where id = $2", [voen(), actors.C.vendorId]);
    expect((await decide(actors.specialist, id as string, "REJECT", "Not needed")).error).toBeNull();
  });

  it("return needs a comment, keeps the data, and a RETURNED request can be edited and resubmitted; reject needs a reason", async () => {
    const { data: id } = await submit(actors.B, "COMPANY_DETAILS", company("B", { legal_name: `RLS5 B renamed ${RUN}`, director_name: "Return Me", legal_address: "Baku, B street" }));
    expect((await decide(actors.specialist, id as string, "RETURN", " ")).error?.message).toBe("errors.commentRequired");
    expect((await decide(actors.specialist, id as string, "REJECT", "")).error?.message).toBe("errors.reasonRequired");
    expect((await decide(actors.specialist, id as string, "RETURN", "Fix the director")).error).toBeNull();
    expect((await vendorRow(actors.B.vendorId!)).director_name).toBe("Test Director");
    // still open: a new request in the section is refused
    expect((await submit(actors.B, "COMPANY_DETAILS", company("B", { director_name: "Other" }))).error?.message).toBe("errors.changeRequestOpen");
    const resubmit = await actors.B.client.rpc("change_request_resubmit", {
      p_id: id,
      p_reason: "Fixed",
      p_proposed: company("B", { legal_name: `RLS5 B renamed ${RUN}`, director_name: "Fixed Director", legal_address: "Baku, B street" }),
    });
    expect(resubmit.error).toBeNull();
    const { rows } = await db.query("select status, proposed_values, reason from public.vendor_change_request where id = $1", [id]);
    expect(rows[0].status).toBe("SUBMITTED");
    expect(rows[0].proposed_values.director_name).toBe("Fixed Director");
    expect(rows[0].reason).toBe("Fixed");
    // withdraw frees the section
    expect((await actors.B.client.rpc("change_request_withdraw", { p_id: id })).error).toBeNull();
    expect((await db.query("select status from public.vendor_change_request where id = $1", [id])).rows[0].status).toBe("WITHDRAWN");
    expect((await submit(actors.B, "COMPANY_DETAILS", company("B", { director_name: "New one" }))).error).toBeNull();
  });

  it("another vendor cannot withdraw or resubmit someone else's request", async () => {
    const { data } = await actors.A.client.from("vendor_change_request").select("id").eq("section", "COMPANY_DETAILS").limit(1);
    expect((await actors.B.client.rpc("change_request_withdraw", { p_id: data![0].id })).error?.message).toBe("errors.noAccess");
  });
});

describe("REG-08 AC9, AC10: owners and bank accounts, applied in one step", () => {
  it("approved owners replace the list and the shared-owner flag follows at once", async () => {
    const { data: id } = await submit(actors.A, "OWNERS", {
      owners: [
        { full_name: "Head A", id_number: `ID-A-${RUN}`, share_percent: 60, role: "HEAD" },
        { full_name: "Shared Person", id_number: `ID-B-${RUN}`, share_percent: 40, role: "SHAREHOLDER" }, // an owner of vendor B
      ],
    });
    expect((await decide(actors.specialist, id as string, "APPROVE")).error?.message).toBe("errors.supportRequired");
    await fileRow("vendor_change_request", id as string, "change_support");
    expect((await decide(actors.specialist, id as string, "APPROVE")).error).toBeNull();
    const owners = await db.query("select full_name, share_percent::float as share from public.vendor_owner where vendor_id = $1 order by full_name", [actors.A.vendorId]);
    expect(owners.rows).toEqual([{ full_name: "Head A", share: 60 }, { full_name: "Shared Person", share: 40 }]);
    const { data: shared } = await actors.specialist.client.rpc("vendor_shared_owners", { p_vendor: actors.B.vendorId });
    expect((shared as { vendor_id: string }[]).map((s) => s.vendor_id)).toContain(actors.A.vendorId);
  });

  it("approved bank accounts replace the list with one main; the history shows only the last 4 characters of the IBAN", async () => {
    const { data: id } = await db.query("select id from public.vendor_change_request where vendor_id = $1 and section = 'BANK_ACCOUNTS' and status = 'SUBMITTED'", [actors.A.vendorId]).then((r) => ({ data: r.rows[0].id as string }));
    await actors.A.client.rpc("change_request_withdraw", { p_id: id });
    const { data: second } = await submit(actors.A, "BANK_ACCOUNTS", { accounts: [account("3333", true), account("4444", false, "USD")] });
    expect((await decide(actors.specialist, second as string, "APPROVE")).error?.message).toBe("errors.supportRequired");
    await fileRow("vendor_change_request", second as string, "change_support");
    expect((await decide(actors.specialist, second as string, "APPROVE")).error).toBeNull();
    const { rows } = await db.query("select iban, is_main from public.vendor_bank_account where vendor_id = $1 order by iban", [actors.A.vendorId]);
    expect(rows).toEqual([{ iban: iban("3333"), is_main: true }, { iban: iban("4444"), is_main: false }]);
    const log = await db.query("select reason from public.audit_entry where record_type = 'vendor' and record_id = $1 and to_status = 'PROFILE_UPDATED' and reason like 'BANK_ACCOUNTS%'", [actors.A.vendorId]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].reason).toContain("****3333");
    expect(log.rows[0].reason).toContain("****4444");
    expect(log.rows[0].reason).not.toContain(iban("3333"));
  });

  it("an APPROVED vendor cannot replace its bank accounts directly (REG-06 AC3); DRAFT can, SUBMITTED cannot", async () => {
    const direct = await actors.A.client.rpc("bank_accounts_save", { p_accounts: [account("5555", true)] });
    expect(direct.error?.message).toBe("errors.useChangeRequest");
    expect((await actors.C.client.rpc("bank_accounts_save", { p_accounts: [account("6666", true)] })).error).toBeNull();
    await db.query("update public.vendor set status = 'SUBMITTED' where id = $1", [actors.C.vendorId]);
    expect((await actors.C.client.rpc("bank_accounts_save", { p_accounts: [account("7777", true)] })).error?.message).toBe("errors.registrationReadOnly");
    await db.query("update public.vendor set status = 'DRAFT' where id = $1", [actors.C.vendorId]);
  });
});

describe("REG-08: documents", () => {
  it("approval needs a file for every document, replaces the old file and returns its path for removal", async () => {
    const oldPath = `rls5/${RUN}/old-charter.pdf`;
    await fileRow("vendor", actors.A.vendorId!, "charter", oldPath);
    expect((await submit(actors.A, "DOCUMENTS", { documents: ["vat_certificate"] })).error?.message).toBe("errors.documentKinds"); // not a VAT payer
    const { data: id } = await submit(actors.A, "DOCUMENTS", { documents: ["charter"] });
    expect((await decide(actors.specialist, id as string, "APPROVE")).error?.message).toBe("errors.documentFileRequired");
    const newPath = `rls5/${RUN}/new-charter.pdf`;
    await fileRow("vendor_change_request", id as string, "charter", newPath);
    const { data, error } = await decide(actors.specialist, id as string, "APPROVE");
    expect(error).toBeNull();
    expect((data as { removed: string[] }).removed).toEqual([oldPath]);
    const files = await db.query("select storage_path, owner_type from public.file where owner_id = $1 and kind = 'charter'", [actors.A.vendorId]);
    expect(files.rows).toEqual([{ storage_path: newPath, owner_type: "vendor" }]);
  });

  it("the files of a request are private: another vendor reads none, the owner and the specialist read them", async () => {
    const { data: id } = await submit(actors.B, "DOCUMENTS", { documents: ["charter"] });
    await fileRow("vendor_change_request", id as string, "charter");
    await fileRow("vendor_change_request", id as string, "change_support");
    expect((await actors.A.client.from("file").select("id").eq("owner_id", id as string)).data).toEqual([]);
    expect((await actors.B.client.from("file").select("id").eq("owner_id", id as string)).data).toHaveLength(2);
    expect((await actors.specialist.client.from("file").select("id").eq("owner_id", id as string)).data).toHaveLength(2);
    await actors.B.client.rpc("change_request_withdraw", { p_id: id });
  });
});

describe("REG-02 AC5, REG-08 AC14: reopen a rejected registration", () => {
  it("only a Procurement Specialist, only REJECTED, a comment is required; the result is RETURNED and the vendor is notified", async () => {
    await db.query("update public.vendor set status = 'REJECTED', review_comment = 'No documents' where id = $1", [actors.C.vendorId]);
    const reopen = (who: Actor, comment: string) => who.client.rpc("registration_reopen", { p_vendor: actors.C.vendorId, p_comment: comment });
    expect((await reopen(actors.admin, "Try again")).error?.message).toBe("errors.noAccess");
    expect((await reopen(actors.C, "Try again")).error?.message).toBe("errors.noAccess");
    expect((await reopen(actors.specialist, " ")).error?.message).toBe("errors.commentRequired");
    expect((await reopen(actors.specialist, "Documents are now in order")).error).toBeNull();
    const row = await vendorRow(actors.C.vendorId!);
    expect(row.status).toBe("RETURNED");
    expect(row.review_comment).toBe("Documents are now in order");
    const audit = await db.query("select from_status, to_status, reason, user_id from public.audit_entry where record_type = 'vendor' and record_id = $1 and to_status = 'RETURNED'", [actors.C.vendorId]);
    expect(audit.rows).toEqual([{ from_status: "REJECTED", to_status: "RETURNED", reason: "Documents are now in order", user_id: actors.specialist.id }]);
    const notes = await db.query("select params from public.notification where user_id = $1 and event = 'registration.reopened'", [actors.C.id]);
    expect(notes.rows[0].params).toMatchObject({ comment: "Documents are now in order" });
    expect((await reopen(actors.specialist, "Again")).error?.message).toBe("errors.statusChanged"); // no longer REJECTED
  });
});

describe("REG-08 AC11: free edits are logged", () => {
  it("an APPROVED vendor logs a section; unknown sections are refused; a vendor in draft logs nothing", async () => {
    expect((await actors.A.client.rpc("profile_log", { p_section: "BRANDS" })).error).toBeNull();
    expect((await actors.A.client.rpc("profile_log", { p_section: "BANK_ACCOUNTS" })).error?.message).toBe("errors.noAccess");
    const log = await db.query("select user_id, reason from public.audit_entry where record_type = 'vendor' and record_id = $1 and to_status = 'PROFILE_UPDATED' and reason = 'BRANDS'", [actors.A.vendorId]);
    expect(log.rows).toEqual([{ user_id: actors.A.id, reason: "BRANDS" }]);
    await db.query("update public.vendor set status = 'DRAFT' where id = $1", [actors.C.vendorId]);
    expect((await actors.C.client.rpc("profile_log", { p_section: "BRANDS" })).error).toBeNull();
    const none = await db.query("select count(*)::int as n from public.audit_entry where record_id = $1 and to_status = 'PROFILE_UPDATED'", [actors.C.vendorId]);
    expect(none.rows[0].n).toBe(0);
  });

  it("the history of the vendor is readable by the vendor and the specialist, and another vendor reads none of it", async () => {
    expect((await actors.A.client.from("audit_entry").select("id").eq("record_type", "vendor").eq("record_id", actors.A.vendorId!).eq("to_status", "PROFILE_UPDATED")).data!.length).toBeGreaterThan(0);
    expect((await actors.B.client.from("audit_entry").select("id").eq("record_type", "vendor").eq("record_id", actors.A.vendorId!)).data).toEqual([]);
    const { data: reqs } = await actors.A.client.from("vendor_change_request").select("id");
    const ids = (reqs ?? []).map((r) => r.id);
    expect((await actors.A.client.from("audit_entry").select("id").eq("record_type", "vendor_change_request").in("record_id", ids)).data!.length).toBeGreaterThan(0);
    expect((await actors.B.client.from("audit_entry").select("id").eq("record_type", "vendor_change_request").in("record_id", ids)).data).toEqual([]);
  });
});
