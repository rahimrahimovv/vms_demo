/**
 * DEMO-02 (hybrid, D-023) on vms-dev: the database side of `npm run demo:reset`.
 * The function itself is exercised inside a transaction that is ALWAYS rolled back, so these tests delete nothing.
 * The real command (typed confirmation, Auth users, Storage) is run by a developer, never by a test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { assertDevDatabase } from "./helpers/dev-cleanup";

const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const SEED_EMAILS = [
  ["leyla@demo-agro.test", "Leyla Mammadova", ["REQUESTER"], null, null],
  ["rashad@demo-agro.test", "Rashad Aliyev", ["APPROVER"], null, null],
  ["nigar@demo-agro.test", "Nigar Huseynova", ["PROCUREMENT_SPECIALIST"], null, null],
  ["elchin@demo-agro.test", "Elchin Karimov", ["COMMITTEE_MEMBER"], null, "CHAIR"],
  ["sevinj@demo-agro.test", "Sevinj Guliyeva", ["COMMITTEE_MEMBER"], null, "MEMBER"],
  ["tural@demo-agro.test", "Tural Ismayilov", ["COMMITTEE_MEMBER"], null, "MEMBER"],
  ["admin@demo-agro.test", "Demo Admin", ["ADMIN"], null, null],
  ["sales@beta-trade.test", "Selin Demir", ["VENDOR"], "00000000-0000-4000-8000-000000000502", null],
  ["office@gamma-supply.test", "Orkhan Valiyev", ["VENDOR"], "00000000-0000-4000-8000-000000000503", null],
] as const;

async function payload() {
  const { rows } = await db.query("select id, lower(email) as email from auth.users where lower(email) = any($1)", [SEED_EMAILS.map((e) => e[0])]);
  const ids = new Map(rows.map((r) => [r.email as string, r.id as string]));
  return JSON.stringify(
    SEED_EMAILS.map(([email, name, roles, vendorId, committee]) => ({
      id: ids.get(email), email, full_name: name, roles, vendor_id: vendorId, committee,
    })),
  );
}

/** Runs `work` in a transaction and rolls it back, whatever happens. */
async function rolledBack<T>(work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await work();
  } finally {
    await db.query("rollback");
  }
}

beforeAll(async () => {
  assertDevDatabase();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe("who may call the demo functions", () => {
  const fns = ["app.demo_reset(jsonb)", "app.demo_seed(jsonb)", "app.seed_base()", "app.demo_enabled()"];

  it("anon, authenticated and service_role cannot execute demo_reset, demo_seed or the seed", async () => {
    for (const fn of fns) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]);
        expect(rows[0].ok, `${role} on ${fn}`).toBe(false);
      }
    }
  });

  it("the app schema is not exposed by the API, and the flag table has no API access", async () => {
    const { rows } = await db.query(
      "select has_schema_privilege('anon', 'app', 'usage') as anon_app, has_schema_privilege('authenticated', 'app', 'usage') as auth_app",
    );
    // functions in app are internal: even where the schema is usable, the functions above are not executable
    expect(typeof rows[0].anon_app).toBe("boolean");
    for (const role of ["anon", "authenticated"]) {
      const { rows: t } = await db.query("select has_table_privilege($1, 'public.demo_flag', 'select') as ok", [role]);
      expect(t[0].ok, role).toBe(false);
    }
    const { rows: one } = await db.query("select count(*)::int as n from public.demo_flag");
    expect(one[0].n).toBe(1);
  });
});

describe("the database-level guard", () => {
  it("demo_reset and demo_seed refuse while demo_flag is not enabled", async () => {
    await rolledBack(async () => {
      await db.query("update public.demo_flag set enabled = false");
      const p = await payload();
      await db.query("savepoint a");
      await expect(db.query("select app.demo_reset($1::jsonb)", [p])).rejects.toThrow(/demo_flag is not enabled/);
      await db.query("rollback to savepoint a");
      await expect(db.query("select app.demo_seed($1::jsonb)", [p])).rejects.toThrow(/demo_flag is not enabled/);
    });
  });
});

describe("nothing blocks TRUNCATE, and the immutability triggers survive", () => {
  it("no truncate trigger, no rule and no restrictive policy sits on a public table; the event triggers are the platform's DDL ones", async () => {
    const trig = await db.query(
      `select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal and (t.tgtype & 32) = 32`,
    );
    expect(trig.rows).toEqual([]);
    expect((await db.query("select 1 from pg_rules where schemaname = 'public'")).rows).toEqual([]);
    expect((await db.query("select 1 from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'")).rows).toEqual([]);
    const ev = await db.query("select evtname, evtevent from pg_event_trigger");
    // event triggers fire on DDL commands only; TRUNCATE is not one, and none of them is ours
    expect(ev.rows.every((r) => ["ddl_command_end", "sql_drop", "ddl_command_start", "table_rewrite"].includes(r.evtevent))).toBe(true);
    expect(ev.rows.some((r) => /demo|truncate/i.test(r.evtname))).toBe(false);
  });

  it("both immutability triggers are enabled now", async () => {
    const { rows } = await db.query(
      "select tgname, tgenabled from pg_trigger where tgname in ('audit_entry_immutable', 'minutes_immutable') and not tgisinternal order by tgname",
    );
    expect(rows).toEqual([
      { tgname: "audit_entry_immutable", tgenabled: "O" },
      { tgname: "minutes_immutable", tgenabled: "O" },
    ]);
  });
});

describe("app.demo_reset inside a rolled-back transaction", () => {
  it("restores the scenario start, one RESET audit line, numbers from 0001, keeps triggers enabled and the flag", async () => {
    const p = await payload();
    await rolledBack(async () => {
      await db.query("update public.demo_flag set enabled = true");
      // leave traces that a reset must remove: a document number counter, a notification, an extra vendor
      await db.query("insert into public.doc_counter (company_id, prefix, year, last_value) values ('00000000-0000-4000-8000-000000000001', 'PR', 2026, 41) on conflict do nothing");

      const { rows } = await db.query("select app.demo_reset($1::jsonb) as r", [p]);
      const r = rows[0].r;
      expect(r).toMatchObject({ users: 9, vendors: 2, bankAccounts: 3, committeeMembers: 3, requisitions: 0, sourcings: 0, minutes: 0, auditEntries: 1 });
      expect(r.planLines).toBe(1);
      expect(r.items).toBeGreaterThanOrEqual(28);

      const audit = await db.query("select record_type, to_status, reason from public.audit_entry");
      expect(audit.rows).toEqual([{ record_type: "demo", to_status: "RESET", reason: "Reset to scenario start" }]);
      expect((await db.query("select count(*)::int as n from public.doc_counter")).rows[0].n).toBe(0); // numbers restart at 0001
      expect((await db.query("select count(*)::int as n from auth.sessions")).rows[0].n).toBe(0); // everyone is signed out
      expect((await db.query("select count(*)::int as n from public.vendor where legal_name ilike 'Alpha Agro%'")).rows[0].n).toBe(0);
      expect((await db.query("select count(*)::int as n from public.vendor_bank_account where vendor_id = '00000000-0000-4000-8000-000000000502'")).rows[0].n).toBe(2);
      const chair = await db.query("select u.email from public.committee_member m join public.app_user u on u.id = m.user_id where m.is_chair");
      expect(chair.rows).toEqual([{ email: "elchin@demo-agro.test" }]);
      expect((await db.query("select enabled from public.demo_flag")).rows[0].enabled).toBe(true);

      const triggers = await db.query("select tgenabled from pg_trigger where tgname in ('audit_entry_immutable', 'minutes_immutable') and not tgisinternal");
      expect(triggers.rows.map((t) => t.tgenabled)).toEqual(["O", "O"]);
      // the audit trail is still immutable right after the reset
      await db.query("savepoint s");
      await expect(db.query("update public.audit_entry set reason = 'x'")).rejects.toThrow(/cannot be changed or deleted/);
      await db.query("rollback to savepoint s");
    });
  });

  it("is atomic: a failing seed rolls everything back and the data stays", async () => {
    const before = (await db.query("select (select count(*) from public.vendor)::int v, (select count(*) from public.audit_entry)::int a")).rows[0];
    await rolledBack(async () => {
      await db.query("update public.demo_flag set enabled = true");
      await db.query("savepoint a");
      // a user id that is not in auth.users breaks the seed after the truncate
      const bad = JSON.stringify([{ id: "00000000-0000-4000-8000-0000000000ff", email: "x@demo-agro.test", full_name: "X", roles: ["ADMIN"], vendor_id: null, committee: null }]);
      await expect(db.query("select app.demo_reset($1::jsonb)", [bad])).rejects.toThrow();
      await db.query("rollback to savepoint a");
      const inside = (await db.query("select (select count(*) from public.vendor)::int v, (select count(*) from public.audit_entry)::int a")).rows[0];
      expect(inside).toEqual(before);
    });
    const after = (await db.query("select (select count(*) from public.vendor)::int v, (select count(*) from public.audit_entry)::int a")).rows[0];
    expect(after).toEqual(before);
  });
});

describe("the command asks before it does anything", () => {
  const run = (script: string, input: string) =>
    spawnSync(process.execPath, ["--import", "tsx", script], { input, encoding: "utf8", timeout: 120_000 });
  const counts = async () =>
    (await db.query("select (select count(*) from public.vendor)::int v, (select count(*) from auth.users)::int u, (select count(*) from public.audit_entry)::int a")).rows[0];

  it("prints the target project reference and what it will delete, and a wrong confirmation changes nothing", async () => {
    const before = await counts();
    const out = run("scripts/demo-reset.ts", "abcdef\n");
    expect(out.stdout).toMatch(/Target project reference: [a-z0-9]{20}/);
    expect(out.stdout).toMatch(/About to delete:\s+\d+ rows in \d+ tables/);
    expect(out.stdout).toMatch(/Auth users [^\n]* sessions[^\n]*\n\s+\d+ uploaded files/);
    expect(out.stdout).toContain("Type the last 6 characters of the project reference");
    expect(out.stdout + out.stderr).toContain("Cancelled: the characters do not match. Nothing was changed.");
    expect(out.status).toBe(1);
    expect(await counts()).toEqual(before);
  });

  it("nothing typed (input ends) changes nothing", async () => {
    const before = await counts();
    const out = run("scripts/demo-reset.ts", "");
    expect(out.stdout + out.stderr).toContain("Cancelled: no confirmation was typed. Nothing was changed.");
    expect(out.status).toBe(1);
    expect(await counts()).toEqual(before);
  });

  it("refuses when demo_flag is off, before asking anything", async () => {
    await db.query("update public.demo_flag set enabled = false");
    try {
      const out = run("scripts/demo-reset.ts", "\n");
      expect(out.stdout + out.stderr).toContain("Refused: demo_flag is not enabled in this database. To enable it, run: update public.demo_flag set enabled = true;");
      expect(out.stdout).not.toContain("Type the last 6 characters");
      expect(out.status).toBe(1);
    } finally {
      await db.query("update public.demo_flag set enabled = true");
    }
  });

  it("demo:load is a placeholder that changes nothing", async () => {
    const before = await counts();
    const out = run("scripts/demo-load.ts", "");
    expect(out.stderr).toContain("not built yet");
    expect(out.status).toBe(1);
    expect(await counts()).toEqual(before);
  });
});
