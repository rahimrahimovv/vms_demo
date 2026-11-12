/**
 * Test-only cleanup of throwaway data on vms-dev. The audit log is immutable (NFR-011), so rows of records that
 * a test created can only be removed with the immutability trigger switched off for a moment. That is allowed
 * here and nowhere else: it lives in test helpers and a dev-only script, never in a migration, it refuses to run
 * unless the database is the project of .env.local and not the production project, and the trigger is switched
 * back on in a finally block even when the cleanup fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import type { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

const dbRef = (url?: string) => /postgres\.([a-z0-9]+)[:@]/.exec(url ?? "")?.[1] ?? null;
const apiRef = (url?: string) => /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url ?? "")?.[1] ?? null;

/** Throws unless SUPABASE_DB_URL is the vms-dev project (same ref as the API URL, not the production ref). */
export function assertDevDatabase(env: NodeJS.ProcessEnv = process.env) {
  const db = dbRef(env.SUPABASE_DB_URL);
  const api = apiRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!db || !api || db !== api) throw new Error("Cleanup refused: database URL and API URL are not the same project");
  const prodFile = ".env.production.local";
  if (existsSync(prodFile)) {
    const prod = parse(readFileSync(prodFile));
    if (db === dbRef(prod.SUPABASE_DB_URL) || db === apiRef(prod.NEXT_PUBLIC_SUPABASE_URL)) {
      throw new Error("Cleanup refused: this is the production project");
    }
  }
}

/** Runs `work` with the audit immutability trigger off; switches it on again whatever happens. */
export async function withAuditTriggerOff(db: Client, work: () => Promise<void>) {
  assertDevDatabase();
  await db.query("alter table public.audit_entry disable trigger audit_entry_immutable");
  try {
    await work();
  } finally {
    await db.query("alter table public.audit_entry enable trigger audit_entry_immutable");
  }
}

/**
 * Removes everything a test run created for users whose e-mail matches `rls<n>-%@rls.test` and the records named
 * `RLS<n> ...` that belong to them (sourcing, PRs, plan lines, vendors, categories, items, dictionary entries).
 */
export async function removeTestData(db: Client, service: SupabaseClient, prefix: string) {
  assertDevDatabase();
  if (!/^rls\d+$/.test(prefix)) throw new Error("Cleanup refused: unexpected prefix");
  const label = prefix.toUpperCase();
  const ids = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows.map((r) => r.id as string);
  const users = await ids("select id from public.app_user where email like $1 and email like '%@rls.test'", [`${prefix}-%`]);
  const vendors = await ids("select id from public.vendor where legal_name like $1", [`${label} %`]);
  const sourcings = await ids("select id from public.sourcing where owner_id = any($1::uuid[])", [users]);
  const requisitions = await ids("select id from public.requisition where requester_id = any($1::uuid[])", [users]);
  const planLines = await ids("select id from public.plan_line where description like $1", [`${label} plan %`]);
  const related = [
    ...sourcings, ...requisitions, ...planLines, ...vendors,
    ...(await ids("select id from public.invitation where sourcing_id = any($1::uuid[])", [sourcings])),
    ...(await ids("select id from public.proposal where sourcing_id = any($1::uuid[])", [sourcings])),
    ...(await ids("select id from public.category_application where vendor_id = any($1::uuid[])", [vendors])),
    ...(await ids("select id from public.questionnaire_response where vendor_id = any($1::uuid[])", [vendors])),
  ];

  await db.query("delete from public.file where owner_id = any($1::uuid[])", [related]);
  await db.query("delete from public.sourcing where id = any($1::uuid[])", [sourcings]);
  await withAuditTriggerOff(db, async () => {
    await db.query("delete from public.audit_entry where record_id = any($1::uuid[]) or user_id = any($2::uuid[])", [related, users]);
    await db.query("delete from public.notification where user_id = any($1::uuid[])", [users]);
    await db.query("delete from public.requisition where id = any($1::uuid[])", [requisitions]);
    await db.query("delete from public.plan_line where id = any($1::uuid[])", [planLines]);
    await db.query("delete from public.item where code like $1", [`${label}-%`]);
    for (const id of users) await service.auth.admin.deleteUser(id);
    await db.query("delete from public.vendor where id = any($1::uuid[])", [vendors]);
    await db.query("delete from public.category where name like $1", [`${label} root %`]);
    await db.query("delete from public.payment_term where name like $1", [`${label} term %`]);
    await db.query("delete from public.delivery_mode where name like $1", [`${label} mode %`]);
  });
  return { users: users.length, vendors: vendors.length, sourcings: sourcings.length, requisitions: requisitions.length };
}
