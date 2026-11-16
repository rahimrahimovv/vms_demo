/**
 * PLT-04 public.dashboard_summary against vms-dev with the demo accounts (the loaded demo data): the four roles may call
 * it; a Requester, a vendor and anon may not; "Needs action" equals the My tasks counts for the Specialist; the awarded
 * value equals an independent query over the award lines; the RFQ-10 saving works for a COMPLETED sourcing; the call is
 * fast (under 2 seconds). The accounts sign in with the demo password from the environment (never printed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { loadTasks, taskKeysFor } from "@/lib/home/tasks";
import { PERIODS, type DashboardSummary } from "@/lib/dashboard/calc";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PASSWORD = process.env.DEMO_SEED_PASSWORD!;
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const fresh = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = {
  requester: "leyla@demo-agro.test",
  approver: "rashad@demo-agro.test",
  specialist: "nigar@demo-agro.test",
  committee: "elchin@demo-agro.test",
  admin: "admin@demo-agro.test",
  vendor: "sales@beta-trade.test",
} as const;
const clients = {} as Record<keyof typeof accounts, SupabaseClient>;
const ids = {} as Record<keyof typeof accounts, string>;

const summary = async (who: keyof typeof accounts, period = "all") => {
  const r = await clients[who].rpc("dashboard_summary", { p_period: period });
  return { data: r.data as DashboardSummary | null, error: r.error };
};

beforeAll(async () => {
  await db.connect();
  for (const [key, email] of Object.entries(accounts) as [keyof typeof accounts, string][]) {
    const c = fresh();
    const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    clients[key] = c;
    ids[key] = data.user.id;
  }
}, 120_000);
afterAll(async () => {
  await db.end();
});

describe("PLT-04 access", () => {
  it("the Approver, the Specialist, the Committee Member and the Admin may call it", async () => {
    for (const who of ["approver", "specialist", "committee", "admin"] as const) {
      const r = await summary(who, "90d");
      expect(r.error, who).toBeNull();
      expect(r.data!.period).toBe("90d");
    }
  });

  it("a Requester, a vendor and anon may not", async () => {
    for (const who of ["requester", "vendor"] as const) {
      const r = await summary(who);
      expect(r.data, who).toBeNull();
      expect(r.error?.message, who).toBe("errors.noAccess");
    }
    const anon = await fresh().rpc("dashboard_summary", { p_period: "all" });
    expect(anon.error?.code).toBe("42501");
  });

  it("an unknown period is refused", async () => {
    expect((await clients.specialist.rpc("dashboard_summary", { p_period: "forever" })).error?.message).toBe("errors.invalidPeriod");
  });

  it("the internal saving functions stay unreachable for a vendor (D-026)", async () => {
    expect((await clients.vendor.rpc("sourcing_savings")).data ?? []).toEqual([]);
    expect((await clients.vendor.rpc("sourcing_saving" as never, { p_sourcing: ids.vendor } as never)).error).not.toBeNull();
  });
});

describe("PLT-04 figures", () => {
  it("returns every block for every period", async () => {
    for (const period of PERIODS) {
      const { data } = await summary("specialist", period);
      for (const key of ["awarded", "saving", "cycle", "bids", "stages", "categories", "grades", "topVendors", "needsAction", "committee"]) {
        expect(data, `${period} ${key}`).toHaveProperty(key);
      }
      expect(data!.stages.rows.map((r) => r.key)).toEqual(["draft", "open", "evaluation", "committee", "awarded", "completed", "cancelled"]);
      expect(data!.stages.rows.reduce((n, r) => n + r.count, 0)).toBe(data!.stages.total);
    }
  });

  it("a shorter period never has more sourcings than a longer one; 'all' counts every sourcing", async () => {
    const totals = await Promise.all(PERIODS.map(async (p) => (await summary("admin", p)).data!.stages.total));
    const [d30, d90, year, all] = totals;
    expect(d30).toBeLessThanOrEqual(d90);
    expect(d90).toBeLessThanOrEqual(all);
    expect(year).toBeLessThanOrEqual(all);
    expect(all).toBe(Number((await db.query("select count(*)::int n from public.sourcing")).rows[0].n));
  });

  it("awarded value equals an independent sum over the award lines of WINNER_APPROVED and COMPLETED sourcings", async () => {
    const { data } = await summary("admin", "all");
    const sql = await db.query(`
      select coalesce(sum(round(app.price_excl_vat(pl.unit_price, p.prices_include_vat, p.vat_rate) * a.quantity, 2)), 0)::numeric as v,
             count(distinct s.id)::int as n
        from public.sourcing s
        join public.sourcing_line sl on sl.sourcing_id = s.id and sl.status = 'ACTIVE'
        join public.award_line a on a.sourcing_line_id = sl.id and a.status = 'ACTIVE'
        join public.proposal_line pl on pl.id = a.proposal_line_id
        join public.proposal p on p.id = pl.proposal_id
       where s.status in ('WINNER_APPROVED', 'COMPLETED')`);
    expect(data!.awarded.value).toBe(Number(sql.rows[0].v));
    const wonCount = Number((await db.query("select count(*)::int n from public.sourcing where status in ('WINNER_APPROVED','COMPLETED')")).rows[0].n);
    expect(data!.awarded.sourcings).toBe(wonCount);
    // top vendors add up to no more than the awarded value, highest first
    const tops = data!.topVendors.map((v) => v.awarded);
    expect([...tops].sort((x, y) => y - x)).toEqual(tops);
    expect(tops.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(data!.awarded.value + 0.001);
  });

  it("RFQ-10 saving works for a COMPLETED sourcing too (its proposals are AWARDED, not SUBMITTED)", async () => {
    const rows = ((await clients.specialist.rpc("sourcing_savings")).data ?? []) as { sourcing_id: string; estimated: number }[];
    const completed = (await db.query("select id from public.sourcing where status = 'COMPLETED'")).rows.map((r) => r.id as string);
    if (completed.length === 0) return; // no loaded demo data: nothing to prove
    for (const id of completed) expect(rows.find((r) => r.sourcing_id === id)?.estimated, id).toBeGreaterThan(0);
  });

  it("the percent of the saving is consistent with its amounts", async () => {
    const { saving } = (await summary("admin", "all")).data!;
    if (saving.estimated > 0) expect(Math.abs(saving.percent - (saving.saving * 100) / saving.estimated)).toBeLessThanOrEqual(0.051);
    expect(saving.saving).toBeCloseTo(saving.estimated - saving.awarded, 2);
  });

  it("grades add up to the vendors; committee counts match the closed decisions", async () => {
    const { data } = await summary("admin", "all");
    const g = data!.grades;
    expect(g.a + g.b + g.c + g.d + g.notGraded).toBe(g.total);
    expect(g.total).toBe(Number((await db.query("select count(*)::int n from public.vendor")).rows[0].n));
    const c = data!.committee;
    const closed = await db.query("select status, count(*)::int n from public.decision where status in ('APPROVED','REJECTED','NO_DECISION') group by 1");
    const by = Object.fromEntries(closed.rows.map((r) => [r.status, r.n]));
    expect([c.approved, c.rejected, c.noDecision]).toEqual([by.APPROVED ?? 0, by.REJECTED ?? 0, by.NO_DECISION ?? 0]);
    expect(c.cast).toBeLessThanOrEqual(c.eligible);
  });
});

describe("PLT-04 Needs action equals My tasks", () => {
  it("the Specialist's counts equal the My tasks cards, key by key, in the same order", async () => {
    const user = { id: ids.specialist, roles: ["PROCUREMENT_SPECIALIST"] };
    const tasks = await loadTasks(clients.specialist, user);
    const { data } = await summary("specialist", "90d");
    expect(data!.needsAction.map((n) => n.key)).toEqual(taskKeysFor(user.roles));
    expect(data!.needsAction).toEqual(tasks.map((t) => ({ key: t.key, count: t.count })));
  });

  it("the same holds for the Approver and the Committee Member", async () => {
    for (const [who, roles] of [["approver", ["APPROVER"]], ["committee", ["COMMITTEE_MEMBER"]]] as const) {
      const user = { id: ids[who], roles: [...roles] };
      const tasks = await loadTasks(clients[who], user);
      const { data } = await summary(who, "all");
      expect(data!.needsAction, who).toEqual(tasks.map((t) => ({ key: t.key, count: t.count })));
    }
  });

  it("the Admin has no task cards", async () => {
    expect((await summary("admin")).data!.needsAction).toEqual([]);
  });
});

describe("PLT-04 speed", () => {
  it("answers in under 2 seconds on the loaded demo data (measured)", async () => {
    await summary("specialist", "all"); // warm-up
    const times: number[] = [];
    for (const period of PERIODS) {
      const t0 = performance.now();
      const r = await summary("specialist", period);
      times.push(performance.now() - t0);
      expect(r.error).toBeNull();
    }
    console.log(`dashboard_summary round trips (ms): ${times.map((t) => Math.round(t)).join(", ")}`);
    expect(Math.max(...times)).toBeLessThan(2000);
  });
});
