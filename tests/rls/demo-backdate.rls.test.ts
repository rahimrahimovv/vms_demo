/**
 * DEMO-03: app.demo_backdate on vms-dev. Everything runs inside a transaction that is ALWAYS rolled back.
 * Rows are inserted by the table owner (this is a test of the function, not of the loader), then the function moves them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevDatabase } from "./helpers/dev-cleanup";

const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const COMPANY = "00000000-0000-4000-8000-000000000001";
const BETA = "00000000-0000-4000-8000-000000000502";
const FN = "app.demo_backdate(text, uuid, interval)";

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

async function user(email: string) {
  const { rows } = await db.query("select id from public.app_user where lower(email) = $1", [email]);
  if (!rows[0]) throw new Error(`seed user ${email} missing: run npm run db:seed`);
  return rows[0].id as string;
}

async function sourcing(owner: string, status: string, deadline: string, number: string) {
  const { rows } = await db.query(
    `insert into public.sourcing (company_id, number, owner_id, method, type, status, value, min_proposals, deadline, bids_opened_at)
     values ($1, $2, $3, 'COMPETITIVE', 'RFQ', $4, 1000, 1, $5::timestamptz, now()) returning id`,
    [COMPANY, number, owner, status, deadline],
  );
  return rows[0].id as string;
}

describe("who may call it", () => {
  it("no API role can execute app.demo_backdate", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') as ok", [role, FN]);
      expect(rows[0].ok, role).toBe(false);
    }
  });
});

describe("the guard", () => {
  it("refuses while demo_flag is not enabled, and refuses a zero, negative or huge shift", async () => {
    await rolledBack(async () => {
      const owner = await user("nigar@demo-agro.test");
      const id = await sourcing(owner, "COMPARISON", "2026-11-20T10:00:00Z", "SRC-TEST-0001");
      await db.query("update public.demo_flag set enabled = false");
      await db.query("savepoint a");
      await expect(db.query("select app.demo_backdate('sourcing', $1, interval '3 days')", [id])).rejects.toThrow(/demo_flag is not enabled/);
      await db.query("rollback to savepoint a");
      await db.query("update public.demo_flag set enabled = true");
      for (const bad of ["0 days", "-2 days", "900 days"]) {
        await db.query("savepoint b");
        await expect(db.query("select app.demo_backdate('sourcing', $1, $2::interval)", [id, bad])).rejects.toThrow(/shift must be/);
        await db.query("rollback to savepoint b");
      }
      await db.query("savepoint c");
      await expect(db.query("select app.demo_backdate('audit_entry', $1, interval '1 day')", [id])).rejects.toThrow(/unknown root type/);
      await db.query("rollback to savepoint c");
    });
  });
});

describe("what it moves and what it keeps", () => {
  it("moves a closed sourcing and its closed decision, keeps an OPEN sourcing and a VOTING decision, never touches audit or minutes", async () => {
    await rolledBack(async () => {
      const owner = await user("nigar@demo-agro.test");
      const voter = await user("elchin@demo-agro.test");
      const closed = await sourcing(owner, "COMPARISON", "2026-11-20T10:00:00Z", "SRC-TEST-0002");
      const open = await sourcing(owner, "OPEN", "2026-11-25T10:00:00Z", "SRC-TEST-0003");
      await db.query("insert into public.invitation (company_id, sourcing_id, vendor_id) values ($1, $2, $3), ($1, $4, $3)", [COMPANY, closed, BETA, open]);
      const dec = async (sid: string, status: string) => {
        const { rows } = await db.query(
          `insert into public.decision (company_id, type, sourcing_id, status, deadline, closed_at)
           values ($1, 'WINNER', $2, $3, now() + interval '2 days', case when $3 = 'VOTING' then null else now() end) returning id`,
          [COMPANY, sid, status],
        );
        await db.query("insert into public.decision_voter (decision_id, user_id, vote, voted_at) values ($1, $2, 'FOR', now())", [rows[0].id, voter]);
        return rows[0].id as string;
      };
      const closedDecision = await dec(closed, "APPROVED");
      const votingDecision = await dec(open, "VOTING");
      await db.query("insert into public.minutes (decision_id, number) values ($1, 'MIN-TEST-001')", [closedDecision]);

      const auditBefore = await db.query("select id, created_at from public.audit_entry where record_id = any($1) order by id", [[closed, open]]);
      const minutesBefore = await db.query("select created_at from public.minutes where decision_id = $1", [closedDecision]);
      const snap = async () => {
        const s = await db.query("select id, created_at, deadline, bids_opened_at from public.sourcing where id = any($1)", [[closed, open]]);
        const d = await db.query("select id, opened_at, deadline, closed_at from public.decision where id = any($1)", [[closedDecision, votingDecision]]);
        const v = await db.query("select decision_id, voted_at from public.decision_voter where decision_id = any($1)", [[closedDecision, votingDecision]]);
        const i = await db.query("select sourcing_id, created_at from public.invitation where sourcing_id = any($1)", [[closed, open]]);
        return { s: Object.fromEntries(s.rows.map((r) => [r.id, r])), d: Object.fromEntries(d.rows.map((r) => [r.id, r])),
                 v: Object.fromEntries(v.rows.map((r) => [r.decision_id, r])), i: Object.fromEntries(i.rows.map((r) => [r.sourcing_id, r])) };
      };
      const before = await snap();

      const result = await db.query("select app.demo_backdate('sourcing', $1, interval '10 days') as r", [closed]);
      expect(result.rows[0].r.sourcing).toBe(1);
      const skipped = await db.query("select app.demo_backdate('sourcing', $1, interval '10 days') as r", [open]);
      expect(skipped.rows[0].r.skipped).toMatch(/OPEN/);
      const open10 = await db.query("select app.demo_backdate('sourcing', $1, interval '10 days') as r", [open]); // idempotent no-op
      expect(open10.rows[0].r.skipped).toBeTruthy();
      const after = await snap();

      const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
      // closed side moved by exactly 10 days
      expect(days(before.s[closed].created_at, after.s[closed].created_at)).toBe(10);
      expect(days(before.s[closed].deadline, after.s[closed].deadline)).toBe(10);
      expect(days(before.s[closed].bids_opened_at, after.s[closed].bids_opened_at)).toBe(10);
      expect(days(before.i[closed].created_at, after.i[closed].created_at)).toBe(10);
      expect(days(before.d[closedDecision].opened_at, after.d[closedDecision].opened_at)).toBe(10);
      expect(days(before.d[closedDecision].closed_at, after.d[closedDecision].closed_at)).toBe(10);
      expect(days(before.v[closedDecision].voted_at, after.v[closedDecision].voted_at)).toBe(10);
      // open side untouched
      expect(after.s[open]).toEqual(before.s[open]);
      expect(after.i[open]).toEqual(before.i[open]);
      expect(after.d[votingDecision]).toEqual(before.d[votingDecision]);
      expect(after.v[votingDecision]).toEqual(before.v[votingDecision]);

      // status columns and immutable tables are untouched
      expect((await db.query("select status from public.sourcing where id = $1", [closed])).rows[0].status).toBe("COMPARISON");
      const auditAfter = await db.query("select id, created_at from public.audit_entry where record_id = any($1) order by id", [[closed, open]]);
      expect(auditAfter.rows).toEqual(auditBefore.rows);
      const minutesAfter = await db.query("select created_at from public.minutes where decision_id = $1", [closedDecision]);
      expect(minutesAfter.rows).toEqual(minutesBefore.rows);
    });
  });

  it("keeps the final-offer deadline of a running round, and moves it once the round is over", async () => {
    await rolledBack(async () => {
      const owner = await user("nigar@demo-agro.test");
      const running = await sourcing(owner, "FINAL_OFFER_ROUND", "2026-11-12T10:00:00Z", "SRC-TEST-0004");
      const over = await sourcing(owner, "COMPARISON", "2026-11-12T10:00:00Z", "SRC-TEST-0005");
      await db.query("update public.sourcing set final_offer_deadline = now() + interval '3 days' where id = any($1)", [[running, over]]);
      await db.query("insert into public.final_offer_request (sourcing_id, vendor_id, responded_at) values ($1, $3, now()), ($2, $3, now())", [running, over, BETA]);
      const before = await db.query("select id, final_offer_deadline from public.sourcing where id = any($1)", [[running, over]]);
      await db.query("select app.demo_backdate('sourcing', $1, interval '5 days')", [running]);
      await db.query("select app.demo_backdate('sourcing', $1, interval '5 days')", [over]);
      const after = await db.query("select id, final_offer_deadline, deadline from public.sourcing where id = any($1)", [[running, over]]);
      const get = (rows: { id: string }[], id: string) => rows.find((r) => r.id === id) as unknown as { final_offer_deadline: Date; deadline: Date };
      expect(get(after.rows, running).final_offer_deadline).toEqual(get(before.rows, running).final_offer_deadline);
      expect(get(before.rows, over).final_offer_deadline.getTime() - get(after.rows, over).final_offer_deadline.getTime()).toBe(5 * 86_400_000);
      const fo = await db.query("select sourcing_id, responded_at from public.final_offer_request where sourcing_id = any($1)", [[running, over]]);
      const resp = (id: string) => fo.rows.find((r) => r.sourcing_id === id)!.responded_at as Date;
      expect(Date.now() - resp(running).getTime()).toBeLessThan(60_000); // answer of the running round stays
      expect(Date.now() - resp(over).getTime()).toBeGreaterThan(4.9 * 86_400_000);
    });
  });

  it("moves a requisition and a vendor with their own rows, and the notices that point at them", async () => {
    await rolledBack(async () => {
      const requester = await user("leyla@demo-agro.test");
      const { rows: pl } = await db.query("select id from public.plan_line limit 1");
      const { rows: req } = await db.query(
        `insert into public.requisition (company_id, number, plan_line_id, requester_id, status, submitted_at)
         values ($1, 'PR-TEST-0001', $2, $3, 'PENDING_APPROVAL', now()) returning id`,
        [COMPANY, pl[0].id, requester],
      );
      await db.query(
        "insert into public.notification (company_id, user_id, event, record_type, record_id) values ($1, $2, 'pr.submitted', 'requisition', $3)",
        [COMPANY, requester, req[0].id],
      );
      await db.query("select app.demo_backdate('requisition', $1, interval '7 days')", [req[0].id]);
      const r = await db.query("select created_at, submitted_at from public.requisition where id = $1", [req[0].id]);
      expect(Date.now() - r.rows[0].created_at.getTime()).toBeGreaterThan(6.9 * 86_400_000);
      expect(Date.now() - r.rows[0].submitted_at.getTime()).toBeGreaterThan(6.9 * 86_400_000);
      const n = await db.query("select created_at from public.notification where record_id = $1", [req[0].id]);
      expect(Date.now() - n.rows[0].created_at.getTime()).toBeGreaterThan(6.9 * 86_400_000);

      const before = await db.query("select created_at, submitted_at from public.vendor where id = $1", [BETA]);
      await db.query("select app.demo_backdate('vendor', $1, interval '30 days')", [BETA]);
      const after = await db.query("select created_at, submitted_at from public.vendor where id = $1", [BETA]);
      expect(before.rows[0].created_at.getTime() - after.rows[0].created_at.getTime()).toBe(30 * 86_400_000);
    });
  });
});

describe("the immutability triggers", () => {
  it("both are still enabled, and the function does not mention them", async () => {
    const { rows } = await db.query(
      "select tgname, tgenabled from pg_trigger where tgname in ('audit_entry_immutable', 'minutes_immutable') and not tgisinternal order by tgname",
    );
    expect(rows).toEqual([
      { tgname: "audit_entry_immutable", tgenabled: "O" },
      { tgname: "minutes_immutable", tgenabled: "O" },
    ]);
    const { rows: src } = await db.query("select prosrc from pg_proc where proname = 'demo_backdate'");
    expect(src[0].prosrc).not.toMatch(/disable trigger|session_replication_role|alter table/i);
    expect(src[0].prosrc).not.toMatch(/update public\.audit_entry|update public\.minutes/i);
  });
});

describe("dates that depend on the decision moment", () => {
  it("a vendor shifted by 14 months has lapsed validity; the daily job then expires it with an audit entry", async () => {
    await rolledBack(async () => {
      const before = await db.query(
        "select valid_until from public.questionnaire_response where vendor_id = $1 and status = 'GRADED'", [BETA]);
      expect(before.rows).toHaveLength(1);
      const r = await db.query("select app.demo_backdate('vendor', $1, interval '430 days') as r", [BETA]);
      expect(r.rows[0].r.vendor).toBe(1);
      const after = await db.query(
        "select (($1::date - valid_until)) as days, valid_until < app.today() as lapsed from public.questionnaire_response where vendor_id = $2 and status = 'GRADED'",
        [before.rows[0].valid_until, BETA]);
      expect(after.rows[0].days).toBe(430);
      expect(after.rows[0].lapsed).toBe(true);
      await db.query("select app.run_daily_jobs()");
      const s = await db.query("select status from public.questionnaire_response where vendor_id = $1 order by created_at desc limit 1", [BETA]);
      expect(s.rows[0].status).toBe("EXPIRED");
      const a = await db.query(
        "select to_status, user_id from public.audit_entry where record_type = 'questionnaire_response' and to_status = 'EXPIRED' order by created_at desc limit 1");
      expect(a.rows[0]).toEqual({ to_status: "EXPIRED", user_id: null });
    });
  });
});
