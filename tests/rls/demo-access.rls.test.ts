/**
 * DEMO-01 / D-022: the failed-attempt limit and who may call the demo gate functions (vms-dev).
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SECRET, opts);
const anon = createClient(URL, PUBLISHABLE, opts);
const KEY = `rls-test-${randomUUID()}`;

afterAll(async () => {
  await service.rpc("demo_attempt_clear", { p_ip_hash: KEY });
});

describe("demo attempt limit", () => {
  it("locks the IP after 5 failures and a correct code clears the counter", async () => {
    for (let i = 1; i <= 4; i++) {
      const { data, error } = await service.rpc("demo_attempt_fail", { p_ip_hash: KEY });
      expect(error).toBeNull();
      expect(data).toBe(0); // not locked yet
    }
    expect((await service.rpc("demo_attempt_status", { p_ip_hash: KEY })).data).toBe(0);

    const fifth = await service.rpc("demo_attempt_fail", { p_ip_hash: KEY });
    expect(fifth.data).toBeGreaterThan(0);
    expect(fifth.data).toBeLessThanOrEqual(900);
    expect((await service.rpc("demo_attempt_status", { p_ip_hash: KEY })).data).toBeGreaterThan(0);

    await service.rpc("demo_attempt_clear", { p_ip_hash: KEY });
    expect((await service.rpc("demo_attempt_status", { p_ip_hash: KEY })).data).toBe(0);
  });

  it("starts a new window after the lock has run out", async () => {
    const { Client } = await import("pg");
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
      for (let i = 0; i < 5; i++) await service.rpc("demo_attempt_fail", { p_ip_hash: KEY });
      await db.query("update public.demo_attempt set locked_until = now() - interval '1 minute', window_start = now() - interval '20 minutes' where ip_hash = $1", [KEY]);
      expect((await service.rpc("demo_attempt_status", { p_ip_hash: KEY })).data).toBe(0);
      const again = await service.rpc("demo_attempt_fail", { p_ip_hash: KEY });
      expect(again.data).toBe(0); // counter restarted at 1
      const { rows } = await db.query("select failures, locked_until from public.demo_attempt where ip_hash = $1", [KEY]);
      expect(rows[0].failures).toBe(1);
      expect(rows[0].locked_until).toBeNull();
    } finally {
      await db.end();
    }
  });
});

describe("demo gate access", () => {
  it("an authenticated user cannot call the attempt functions", async () => {
    const user = createClient(URL, PUBLISHABLE, opts);
    const { error: signInError } = await user.auth.signInWithPassword({
      email: "leyla@demo-agro.test",
      password: process.env.DEMO_SEED_PASSWORD!,
    });
    expect(signInError).toBeNull();
    for (const fn of ["demo_attempt_status", "demo_attempt_fail", "demo_attempt_clear"]) {
      const { error } = await user.rpc(fn, { p_ip_hash: KEY });
      expect(error?.code, fn).toBe("42501");
    }
    await user.auth.signOut();
  });

  it("anon cannot call the attempt functions or read the table", async () => {
    for (const fn of ["demo_attempt_status", "demo_attempt_fail", "demo_attempt_clear"]) {
      const { error } = await anon.rpc(fn, { p_ip_hash: KEY });
      expect(error?.code, fn).toBe("42501");
    }
    const { data, error } = await anon.from("demo_attempt").select("*");
    expect(error?.code === "42501" || (data ?? []).length === 0).toBe(true);
  });
});
