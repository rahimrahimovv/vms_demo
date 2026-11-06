/**
 * RLS tests for Slice 1 (PLT-01, PLT-02, NFR-001, NFR-011) against the vms-dev project.
 * Creates throwaway users (two vendors, a requester, an admin) and deletes them afterwards.
 * Owner-level SQL (app.notify, audit inserts, the audit trigger) runs through SUPABASE_DB_URL.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;

type TestUser = { id: string; email: string; client: SupabaseClient };

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const users: Record<"vendorA" | "vendorB" | "requester" | "admin", TestUser> = {} as never;
const auditRecordIds: string[] = [];

function anonClient() {
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function makeUser(key: keyof typeof users, role: string) {
  const email = `rls-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  const { error: e1 } = await service
    .from("app_user")
    .insert({ id, company_id: COMPANY_ID, full_name: `RLS ${key} ${RUN}`, email });
  if (e1) throw e1;
  const { error: e2 } = await service.from("user_role").insert({ user_id: id, role });
  if (e2) throw e2;

  const client = anonClient();
  const { error: e3 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e3) throw e3;
  users[key] = { id, email, client };
}

async function notify(userIds: string[], number: string) {
  await db.query(
    `select app.notify($1::uuid[], 'test.ping', 'test_record', gen_random_uuid(), $2, '{}'::jsonb)`,
    [userIds, number],
  );
}

beforeAll(async () => {
  await db.connect();
  await makeUser("vendorA", "VENDOR");
  await makeUser("vendorB", "VENDOR");
  await makeUser("requester", "REQUESTER");
  await makeUser("admin", "ADMIN");
});

afterAll(async () => {
  if (auditRecordIds.length > 0) {
    // Test cleanup only: the owner lifts the immutability trigger inside one transaction.
    await db.query("begin");
    await db.query("alter table public.audit_entry disable trigger audit_entry_immutable");
    await db.query("delete from public.audit_entry where record_id = any($1::uuid[])", [auditRecordIds]);
    await db.query("alter table public.audit_entry enable trigger audit_entry_immutable");
    await db.query("commit");
  }
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id);
  await db.end();
});

describe("PLT-01 sign-in and access", () => {
  it("AC1: a user created with e-mail, password and role can sign in", async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: users.requester.email,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
  });

  it("AC3: a wrong password starts no session", async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: users.requester.email,
      password: "wrong-password",
    });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("AC6 / NFR-001: each vendor reads only its own user record", async () => {
    for (const key of ["vendorA", "vendorB"] as const) {
      const { data, error } = await users[key].client.from("app_user").select("id");
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toEqual([users[key].id]);
    }
  });

  it("AC6 / NFR-001: a vendor reads no other user's roles and no settings", async () => {
    const { data: roles } = await users.vendorA.client.from("user_role").select("user_id");
    expect(new Set(roles?.map((r) => r.user_id))).toEqual(new Set([users.vendorA.id]));
    const { data: settings } = await users.vendorA.client.from("setting").select("key");
    expect(settings).toEqual([]);
  });

  it("internal users read the company's users and settings", async () => {
    const { data: people } = await users.requester.client.from("app_user").select("id");
    const ids = people?.map((r) => r.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining([users.vendorA.id, users.admin.id]));
    const { data: settings } = await users.requester.client.from("setting").select("key");
    expect(settings?.map((s) => s.key)).toContain("tender_threshold");
  });

  it("AC5 (data side): a Requester cannot create users or roles", async () => {
    const { error: e1 } = await users.requester.client
      .from("app_user")
      .insert({ id: randomUUID(), company_id: COMPANY_ID, full_name: "X", email: `x-${RUN}@rls.test` });
    expect(e1).not.toBeNull();
    const { error: e2 } = await users.requester.client
      .from("user_role")
      .insert({ user_id: users.requester.id, role: "ADMIN" });
    expect(e2).not.toBeNull();
  });

  it("a Requester cannot change settings (0 rows updated)", async () => {
    const { data } = await users.requester.client
      .from("setting")
      .update({ value: 1 })
      .eq("key", "tender_threshold")
      .select();
    expect(data ?? []).toEqual([]);
  });

  it("the Admin can assign internal roles but never VENDOR", async () => {
    const { error: ok } = await users.admin.client
      .from("user_role")
      .insert({ user_id: users.requester.id, role: "APPROVER" });
    expect(ok).toBeNull();
    const { error: vendor } = await users.admin.client
      .from("user_role")
      .insert({ user_id: users.requester.id, role: "VENDOR" });
    expect(vendor).not.toBeNull();
    await users.admin.client.from("user_role").delete().eq("user_id", users.requester.id).eq("role", "APPROVER");
  });

  it("the Admin cannot remove their own Admin role", async () => {
    await users.admin.client.from("user_role").delete().eq("user_id", users.admin.id).eq("role", "ADMIN");
    const { data } = await service.from("user_role").select("role").eq("user_id", users.admin.id);
    expect(data?.map((r) => r.role)).toContain("ADMIN");
  });

  it("a vendor account cannot also hold an internal role", async () => {
    const { error } = await service.from("user_role").insert({ user_id: users.vendorA.id, role: "REQUESTER" });
    expect(error?.message).toMatch(/cannot hold internal roles/);
  });

  it("a deactivated user reads nothing", async () => {
    await db.query("update public.app_user set is_active = false where id = $1", [users.requester.id]);
    try {
      const { data } = await users.requester.client.from("setting").select("key");
      expect(data).toEqual([]);
    } finally {
      await db.query("update public.app_user set is_active = true where id = $1", [users.requester.id]);
    }
  });

  it("anonymous requests read nothing", async () => {
    const { data } = await anonClient().from("app_user").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("AC7: every top-level table has company_id", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'company_id'`,
    );
    const withCompany = rows.map((r) => r.table_name);
    expect(withCompany).toEqual(expect.arrayContaining(["app_user", "setting", "audit_entry", "notification"]));
  });
});

describe("PLT-02 notifications", () => {
  beforeAll(async () => {
    await notify([users.vendorA.id], `TST-A-${RUN}`);
    await notify([users.vendorB.id], `TST-B-${RUN}`);
  });

  it("AC1 / NFR-001: each user sees only their own notifications", async () => {
    const { data: a } = await users.vendorA.client.from("notification").select("user_id, record_number, is_read");
    expect(a).toEqual([{ user_id: users.vendorA.id, record_number: `TST-A-${RUN}`, is_read: false }]);
    const { data: b } = await users.vendorB.client.from("notification").select("user_id");
    expect(b?.map((n) => n.user_id)).toEqual([users.vendorB.id]);
  });

  it("a user cannot mark someone else's notification read", async () => {
    const { data } = await users.vendorA.client
      .from("notification")
      .update({ is_read: true })
      .eq("record_number", `TST-B-${RUN}`)
      .select();
    expect(data ?? []).toEqual([]);
    const { data: still } = await service.from("notification").select("is_read").eq("record_number", `TST-B-${RUN}`);
    expect(still?.[0]?.is_read).toBe(false);
  });

  it("AC2: a user can mark their own notification read, and change nothing else", async () => {
    const { data } = await users.vendorA.client
      .from("notification")
      .update({ is_read: true })
      .eq("record_number", `TST-A-${RUN}`)
      .select("is_read");
    expect(data).toEqual([{ is_read: true }]);

    const { error } = await users.vendorA.client
      .from("notification")
      .update({ event: "hacked" })
      .eq("record_number", `TST-A-${RUN}`);
    expect(error).not.toBeNull();
  });

  it("users cannot create notifications directly", async () => {
    const { error } = await users.vendorA.client.from("notification").insert({
      company_id: COMPANY_ID,
      user_id: users.vendorB.id,
      event: "spoof",
      record_type: "x",
      record_id: randomUUID(),
    });
    expect(error).not.toBeNull();
  });

  it("app.notify skips inactive users", async () => {
    await db.query("update public.app_user set is_active = false where id = $1", [users.vendorB.id]);
    try {
      await notify([users.vendorB.id], `TST-INACTIVE-${RUN}`);
      const { data } = await service.from("notification").select("id").eq("record_number", `TST-INACTIVE-${RUN}`);
      expect(data).toEqual([]);
    } finally {
      await db.query("update public.app_user set is_active = true where id = $1", [users.vendorB.id]);
    }
  });
});

describe("PLT-02 audit trail", () => {
  it("AC4 / NFR-011: a status change writes one audit entry with from, to and reason", async () => {
    // Runs in a rolled-back transaction on a temp table, so nothing is left behind.
    await db.query("begin");
    try {
      await db.query("create temp table t_status (id uuid primary key, company_id uuid, status text)");
      await db.query(
        `create trigger t_status_audit after insert or update of status on t_status
         for each row execute function app.audit_status_change('test_record')`,
      );
      const id = randomUUID();
      await db.query("insert into t_status values ($1, $2, 'DRAFT')", [id, COMPANY_ID]);
      await db.query("select set_config('app.audit_reason', 'Missing certificate', true)");
      await db.query("update t_status set status = 'RETURNED' where id = $1", [id]);
      await db.query("select set_config('app.audit_reason', '', true)");
      await db.query("update t_status set status = 'RETURNED' where id = $1", [id]); // no change: no entry

      const { rows } = await db.query(
        `select from_status, to_status, reason, user_id from public.audit_entry
         where record_id = $1 order by created_at, to_status`,
        [id],
      );
      expect(rows).toEqual([
        { from_status: null, to_status: "DRAFT", reason: null, user_id: null },
        { from_status: "DRAFT", to_status: "RETURNED", reason: "Missing certificate", user_id: null },
      ]);
    } finally {
      await db.query("rollback");
    }
  });

  describe("visibility and immutability", () => {
    const visible = randomUUID();
    const sealed = randomUUID();

    beforeAll(async () => {
      auditRecordIds.push(visible, sealed);
      await db.query(
        `insert into public.audit_entry (company_id, record_type, record_id, from_status, to_status, created_at) values
           ($1, 'test_record', $2, null, 'DRAFT', now() - interval '1 minute'),
           ($1, 'test_record', $2, 'DRAFT', 'SUBMITTED', now()),
           ($1, 'proposal', $3, null, 'SUBMITTED', now())`,
        [COMPANY_ID, visible, sealed],
      );
    });

    it("AC5: an internal user reads a record's history newest first", async () => {
      const { data } = await users.requester.client
        .from("audit_entry")
        .select("to_status")
        .eq("record_id", visible)
        .order("created_at", { ascending: false });
      expect(data?.map((r) => r.to_status)).toEqual(["SUBMITTED", "DRAFT"]);
    });

    it("NFR-002: proposal history is hidden from internal users (until Slice 4 adds the deadline check)", async () => {
      const { data } = await users.requester.client.from("audit_entry").select("id").eq("record_id", sealed);
      expect(data).toEqual([]);
    });

    it("NFR-001: a vendor reads no internal audit entries", async () => {
      const { data } = await users.vendorA.client.from("audit_entry").select("id").eq("record_id", visible);
      expect(data).toEqual([]);
    });

    it("AC6: nobody can change or delete an audit entry, not even the Admin or the secret key", async () => {
      const { error: adminUpdate } = await users.admin.client
        .from("audit_entry")
        .update({ to_status: "APPROVED" })
        .eq("record_id", visible);
      expect(adminUpdate).not.toBeNull();

      const { error: adminDelete } = await users.admin.client.from("audit_entry").delete().eq("record_id", visible);
      expect(adminDelete).not.toBeNull();

      const { error: serviceDelete } = await service.from("audit_entry").delete().eq("record_id", visible);
      expect(serviceDelete).not.toBeNull();

      await expect(
        db.query("update public.audit_entry set reason = 'x' where record_id = $1", [visible]),
      ).rejects.toThrow(/cannot be changed or deleted/);

      const { rows } = await db.query("select count(*)::int as n from public.audit_entry where record_id = $1", [
        visible,
      ]);
      expect(rows[0].n).toBe(2);
    });

    it("users cannot write audit entries directly", async () => {
      const { error } = await users.admin.client.from("audit_entry").insert({
        company_id: COMPANY_ID,
        record_type: "test_record",
        record_id: randomUUID(),
        to_status: "APPROVED",
      });
      expect(error).not.toBeNull();
    });
  });
});
