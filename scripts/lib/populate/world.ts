// Shared helpers of `npm run demo:load` (DEMO-03): users act through their own signed-in sessions, files take the app's
// own upload path, and dates are relative to the load time. Nothing here writes a business table directly.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";
import { storeStagedFile, BUCKET, type FileKind, type FileOwnerType } from "../../../src/lib/files/store";

export const COMPANY = "00000000-0000-4000-8000-000000000001";

/** Ids of the base seed (app.seed_base): categories, delivery place, delivery mode, payment term. */
export const CAT = {
  fertilisers: "00000000-0000-4000-8000-000000000101",
  seeds: "00000000-0000-4000-8000-000000000102",
  plantProtection: "00000000-0000-4000-8000-000000000103",
  irrigation: "00000000-0000-4000-8000-000000000104",
  spareParts: "00000000-0000-4000-8000-000000000111",
  office: "00000000-0000-4000-8000-000000000112",
} as const;
export const PLACE = "00000000-0000-4000-8000-000000000301";
export const MODE = "00000000-0000-4000-8000-000000000401";
export const PAYMENT = "00000000-0000-4000-8000-000000000203";
export const itemId = (n: number) => `00000000-0000-4000-8000-000000000${700 + n}`; // 701 ... 728

export const EMAIL = {
  requester: "leyla@demo-agro.test",
  approver: "rashad@demo-agro.test",
  specialist: "nigar@demo-agro.test",
  chair: "elchin@demo-agro.test",
  member2: "sevinj@demo-agro.test",
  member3: "tural@demo-agro.test",
  admin: "admin@demo-agro.test",
};
export const COMMITTEE = [EMAIL.chair, EMAIL.member2, EMAIL.member3];

export type Log = (message: string) => void;
export type VendorRef = { id: string; email: string; userId: string; legalName: string };
export type World = {
  db: pg.Client;
  admin: SupabaseClient;
  apiUrl: string;
  publishableKey: string;
  password: string;
  log: Log;
  sessions: Map<string, SupabaseClient>;
  userIds: Map<string, string>;
  vendors: Map<string, VendorRef>;
};

export function newWorld(base: Pick<World, "db" | "admin" | "password" | "log">): World {
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!apiUrl || !publishableKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");
  return { ...base, apiUrl, publishableKey, sessions: new Map(), userIds: new Map(), vendors: new Map() };
}

/** The user's own session (signed in with the demo password), cached. */
export async function as(w: World, email: string): Promise<SupabaseClient> {
  const key = email.toLowerCase();
  const cached = w.sessions.get(key);
  if (cached) return cached;
  const client = createClient(w.apiUrl, w.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: key, password: w.password });
  if (error || !data.user) throw new Error(`sign-in of ${email} failed: ${error?.message}`);
  w.sessions.set(key, client);
  w.userIds.set(key, data.user.id);
  return client;
}

export async function userId(w: World, email: string): Promise<string> {
  await as(w, email);
  return w.userIds.get(email.toLowerCase())!;
}

/** Calls a database function as the given user and throws with the function name when it answers an error. */
export async function call<T = unknown>(w: World, email: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = await as(w, email);
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} as ${email}: ${error.message}`);
  return data as T;
}

/** Same, with the secret key (only for what the app itself does with it: End deadline now). */
export async function callAdmin<T = unknown>(w: World, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await w.admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ---- dates (Asia/Baku, relative to the load time) ----
export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
export function bakuDate(offsetDays = 0): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baku" });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ---- files: small generated PDFs through the app's own upload path ----
function samplePdf(title: string): Buffer {
  const text = title.replace(/[^\x20-\x7e]/g, "?").replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 20 60 Td (${text}) Tj ET`;
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      `4 0 obj<</Length ${stream.length}>>stream`,
      stream,
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "trailer<</Root 1 0 R>>",
      "%%EOF",
      "",
    ].join("\n"),
  );
}

export async function attach(
  w: World,
  owner: { type: FileOwnerType; id: string },
  kind: FileKind,
  fileName: string,
  byUserId: string,
  title = "Synthetic demo document",
): Promise<void> {
  const path = `staging/${randomUUID()}/${fileName}`;
  const { error } = await w.admin.storage.from(BUCKET).upload(path, samplePdf(`${title} - ${fileName}`), { contentType: "application/pdf" });
  if (error) throw new Error(`upload ${fileName}: ${error.message}`);
  const stored = await storeStagedFile(w.admin, {
    companyId: COMPANY,
    ownerType: owner.type,
    ownerId: owner.id,
    kind,
    file: JSON.stringify({ path, name: fileName }),
    userId: byUserId,
  });
  if (stored.error) throw new Error(`store ${fileName}: ${stored.error}`);
}

/** Moves a closed story into the past (app.demo_backdate: guarded by demo_flag, owner connection only). */
export async function backdate(
  w: World,
  rootType: "requisition" | "sourcing" | "vendor",
  id: string,
  days: number,
  hours = 0,
  /** Only for a requisition: a second offset that moves the requisition side further back (approval to release gap). */
  requisitionExtraDays = 0,
): Promise<void> {
  await w.db.query(
    "select app.demo_backdate($1, $2, ($3::int * interval '1 day') + ($4::int * interval '1 hour'), $5::int * interval '1 day')",
    [rootType, id, days, hours, requisitionExtraDays],
  );
}

/** The jobs pg_cron runs every minute (the app's own functions), run at once. */
export async function runJobs(w: World): Promise<void> {
  await w.db.query("select app.close_due_sourcings()");
  await w.db.query("select app.close_due_decisions()");
}
