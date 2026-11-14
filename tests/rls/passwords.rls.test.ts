/**
 * PLT-03 against vms-dev: who may reset whom, the "must change password" mark, ended sessions and the audit
 * events. Throwaway users (an Admin, a second Admin, a Procurement Specialist, a Requester and a vendor account);
 * everything they create is removed afterwards. No password appears in the audit trail.
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

type Actor = { id: string; email: string; client: SupabaseClient; refreshToken?: string; vendorId?: string };
const actors = {} as Record<"admin" | "admin2" | "specialist" | "requester" | "vendor", Actor>;

async function signIn(email: string, password = PASSWORD) {
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, refreshToken: data.session!.refresh_token };
}

async function internal(key: "admin" | "admin2" | "specialist" | "requester", role: string) {
  const email = `rls4-${key}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS4 ${key}`, email });
  await service.from("user_role").insert({ user_id: data.user.id, role });
  actors[key] = { id: data.user.id, email, ...(await signIn(email)) };
}

beforeAll(async () => {
  await db.connect();
  await internal("admin", "ADMIN");
  await internal("admin2", "ADMIN");
  await internal("specialist", "PROCUREMENT_SPECIALIST");
  await internal("requester", "REQUESTER");

  const email = `rls4-vendor-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const { data: vendorId, error: regError } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY",
      legal_name: `RLS4 vendor ${RUN}`,
      voen: `96${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
      country_code: "AZ",
      contact_person: "Contact",
      contact_email: email,
      phone: "+994500000000",
    },
  });
  if (regError) throw regError;
  actors.vendor = { id: data.user.id, email, vendorId, ...(await signIn(email)) };
}, 90_000);

afterAll(async () => {
  const ids = Object.values(actors).map((a) => a.id);
  await withAuditTriggerOff(db, async () => {
    await db.query("delete from public.audit_entry where record_id = any($1::uuid[]) or user_id = any($1::uuid[])", [
      [...ids, actors.vendor?.vendorId].filter(Boolean),
    ]);
  });
  await db.query("delete from public.notification where user_id = any($1::uuid[])", [ids]);
  for (const a of Object.values(actors)) if (a) await service.auth.admin.deleteUser(a.id);
  if (actors.vendor?.vendorId) await db.query("delete from public.vendor where id = $1", [actors.vendor.vendorId]);
  await db.end();
}, 60_000);

const authorize = (who: Actor, args: { target?: string; vendor?: string }) =>
  who.client.rpc("password_reset_authorize", { p_target: args.target ?? null, p_vendor: args.vendor ?? null });

describe("PLT-03 AC4, AC5: who may reset whom", () => {
  it("an Admin may reset an internal user", async () => {
    const { data, error } = await authorize(actors.admin, { target: actors.requester.id });
    expect(error).toBeNull();
    expect(data).toBe(actors.requester.id);
  });

  it("an Admin cannot reset their own password, and the second Admin may reset the first", async () => {
    expect((await authorize(actors.admin, { target: actors.admin.id })).error?.message).toBe("errors.noAccess");
    expect((await authorize(actors.admin2, { target: actors.admin.id })).data).toBe(actors.admin.id);
  });

  it("an Admin cannot reset a vendor account, by id or by vendor", async () => {
    expect((await authorize(actors.admin, { target: actors.vendor.id })).error?.message).toBe("errors.noAccess");
    expect((await authorize(actors.admin, { vendor: actors.vendor.vendorId })).error?.message).toBe("errors.noAccess");
  });

  it("a Procurement Specialist resets a vendor account (by vendor), but no internal user", async () => {
    expect((await authorize(actors.specialist, { vendor: actors.vendor.vendorId })).data).toBe(actors.vendor.id);
    expect((await authorize(actors.specialist, { target: actors.vendor.id })).data).toBe(actors.vendor.id);
    expect((await authorize(actors.specialist, { target: actors.requester.id })).error?.message).toBe("errors.noAccess");
    expect((await authorize(actors.specialist, { target: actors.admin.id })).error?.message).toBe("errors.noAccess");
  });

  it("nobody else resets anyone: a Requester and a vendor are refused", async () => {
    expect((await authorize(actors.requester, { target: actors.admin.id })).error?.message).toBe("errors.noAccess");
    expect((await authorize(actors.requester, { target: actors.vendor.id })).error?.message).toBe("errors.noAccess");
    expect((await authorize(actors.vendor, { target: actors.requester.id })).error?.message).toBe("errors.noAccess");
  });

  it("an unknown user is refused", async () => {
    expect((await authorize(actors.admin, { target: randomUUID() })).error?.message).toBe("errors.noAccess");
  });

  it("a direct apply by someone who may not reset is refused and changes nothing", async () => {
    const { error } = await actors.requester.client.rpc("password_reset_apply", { p_target: actors.admin.id });
    expect(error?.message).toBe("errors.noAccess");
    const { rows } = await db.query("select must_change_password from public.app_user where id = $1", [actors.admin.id]);
    expect(rows[0].must_change_password).toBe(false);
  });
});

describe("PLT-03 AC4, AC6, AC8: the reset marks the user, ends the sessions and is audited without a password", () => {
  it("an Admin reset: mark set, refresh token dead, audit entry PASSWORD_RESET by the Admin for the user", async () => {
    const target = actors.requester;
    const temp = `Tmp-${randomUUID()}`;
    const { error: setError } = await service.auth.admin.updateUserById(target.id, { password: temp });
    expect(setError).toBeNull();
    const { error } = await actors.admin.client.rpc("password_reset_apply", { p_target: target.id });
    expect(error).toBeNull();

    const { rows } = await db.query("select must_change_password from public.app_user where id = $1", [target.id]);
    expect(rows[0].must_change_password).toBe(true);
    const sessions = await db.query("select count(*)::int as n from auth.sessions where user_id = $1", [target.id]);
    expect(sessions.rows[0].n).toBe(0);

    // the old session cannot be renewed
    const renewed = await createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } }).auth.refreshSession({
      refresh_token: target.refreshToken!,
    });
    expect(renewed.error).not.toBeNull();

    // the temporary password signs in, and the user is marked (the app then shows only the change-password form)
    const fresh = await signIn(target.email, temp);
    const { data: me } = await fresh.client.from("app_user").select("must_change_password").eq("id", target.id).single();
    expect(me).toEqual({ must_change_password: true });
    target.client = fresh.client;

    const audit = await db.query(
      "select user_id, to_status, from_status, reason, record_type from public.audit_entry where record_id = $1 and to_status = 'PASSWORD_RESET'",
      [target.id],
    );
    expect(audit.rows).toEqual([
      { user_id: actors.admin.id, to_status: "PASSWORD_RESET", from_status: null, reason: null, record_type: "user" },
    ]);
    const leaked = await db.query("select count(*)::int as n from public.audit_entry where reason like $1 or reason like $2", [`%${temp}%`, `%${PASSWORD}%`]);
    expect(leaked.rows[0].n).toBe(0);
  });

  it("a user cannot clear the mark by writing it, but the password change function clears it and audits PASSWORD_CHANGED", async () => {
    const target = actors.requester;
    const direct = await target.client.from("app_user").update({ must_change_password: false }).eq("id", target.id);
    expect(direct.error).not.toBeNull();
    const still = await db.query("select must_change_password from public.app_user where id = $1", [target.id]);
    expect(still.rows[0].must_change_password).toBe(true);

    expect((await target.client.rpc("password_change_done")).error).toBeNull();
    const after = await db.query("select must_change_password from public.app_user where id = $1", [target.id]);
    expect(after.rows[0].must_change_password).toBe(false);
    const audit = await db.query("select user_id, reason from public.audit_entry where record_id = $1 and to_status = 'PASSWORD_CHANGED'", [target.id]);
    expect(audit.rows).toEqual([{ user_id: target.id, reason: null }]);
  });

  it("a Procurement Specialist reset of a vendor account marks the vendor user and is audited", async () => {
    const { error } = await actors.specialist.client.rpc("password_reset_apply", { p_target: actors.vendor.id });
    expect(error).toBeNull();
    const { rows } = await db.query("select must_change_password from public.app_user where id = $1", [actors.vendor.id]);
    expect(rows[0].must_change_password).toBe(true);
    const audit = await db.query("select user_id from public.audit_entry where record_id = $1 and to_status = 'PASSWORD_RESET'", [actors.vendor.id]);
    expect(audit.rows).toEqual([{ user_id: actors.specialist.id }]);
  });
});

describe("PLT-03: who reads the password events", () => {
  it("the user, an Admin and a Procurement Specialist read them; another Requester-level user does not", async () => {
    const own = await actors.requester.client.from("audit_entry").select("to_status").eq("record_type", "user").eq("record_id", actors.requester.id);
    expect(own.data?.map((r) => r.to_status).sort()).toEqual(["PASSWORD_CHANGED", "PASSWORD_RESET"]);
    const admin = await actors.admin2.client.from("audit_entry").select("id").eq("record_type", "user").eq("record_id", actors.requester.id);
    expect(admin.data).toHaveLength(2);
    const other = await actors.requester.client.from("audit_entry").select("id").eq("record_type", "user").eq("record_id", actors.admin.id);
    expect(other.data).toEqual([]);
    const vendorView = await actors.vendor.client.from("audit_entry").select("id").eq("record_type", "user").eq("record_id", actors.requester.id);
    expect(vendorView.data).toEqual([]);
  });
});
