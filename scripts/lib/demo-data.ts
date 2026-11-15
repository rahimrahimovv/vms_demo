// Shared logic of the developer commands `npm run demo:reset` (Slice 8a) and `npm run demo:load` (Slice 8b).
// Nothing here is reachable from the web (D-023): it runs on a developer's machine with the owner connection
// (SUPABASE_DB_URL) and the server key, after the developer typed the last 6 characters of the project reference.
import { createInterface } from "node:readline";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { unattendedRefusal, wantsUnattended } from "./unattended";

export const COMPANY_ID = "00000000-0000-4000-8000-000000000001"; // Agro Holding MMC, see app.seed_base()
export const BETA_TRADE_ID = "00000000-0000-4000-8000-000000000502";
export const GAMMA_SUPPLY_ID = "00000000-0000-4000-8000-000000000503";
const BUCKET = "files";

export type Role = "REQUESTER" | "APPROVER" | "PROCUREMENT_SPECIALIST" | "COMMITTEE_MEMBER" | "ADMIN" | "VENDOR";
export type SeedUser = {
  email: string;
  fullName: string;
  roles: Role[];
  vendorId?: string;
  committee?: "CHAIR" | "MEMBER";
};

/** Backlog "Seeded accounts": the scenario start keeps exactly these 9 users (Kura Agro Supply is not seeded). */
export const SCENARIO_START_USERS: SeedUser[] = [
  { email: "leyla@demo-agro.test", fullName: "Leyla Mammadova", roles: ["REQUESTER"] },
  { email: "rashad@demo-agro.test", fullName: "Rashad Aliyev", roles: ["APPROVER"] },
  { email: "nigar@demo-agro.test", fullName: "Nigar Huseynova", roles: ["PROCUREMENT_SPECIALIST"] },
  { email: "elchin@demo-agro.test", fullName: "Elchin Karimov", roles: ["COMMITTEE_MEMBER"], committee: "CHAIR" },
  { email: "sevinj@demo-agro.test", fullName: "Sevinj Guliyeva", roles: ["COMMITTEE_MEMBER"], committee: "MEMBER" },
  { email: "tural@demo-agro.test", fullName: "Tural Ismayilov", roles: ["COMMITTEE_MEMBER"], committee: "MEMBER" },
  { email: "admin@demo-agro.test", fullName: "Aygun Rzayeva", roles: ["ADMIN"] },
  { email: "sales@beta-trade.test", fullName: "Selin Demir", roles: ["VENDOR"], vendorId: BETA_TRADE_ID },
  { email: "office@gamma-supply.test", fullName: "Orkhan Valiyev", roles: ["VENDOR"], vendorId: GAMMA_SUPPLY_ID },
];

export type Context = {
  envFile: string;
  projectRef: string;
  password: string;
  db: pg.Client;
  admin: SupabaseClient;
};

function requireEnv(name: string, envFile: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in ${envFile}`);
  return value;
}

const apiRef = (url: string) => /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? null;
const dbRef = (url: string) => /postgres\.([a-z0-9]+)[:@]/.exec(url)?.[1] ?? null;

/** Reads ENV_FILE (default .env.local), checks that the API URL and the database URL are one project, connects. */
export async function openContext(): Promise<Context> {
  const envFile = process.env.ENV_FILE || ".env.local";
  config({ path: envFile, quiet: true });
  const apiUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", envFile);
  const dbUrl = requireEnv("SUPABASE_DB_URL", envFile);
  const secret = requireEnv("SUPABASE_SECRET_KEY", envFile);
  const password = requireEnv("DEMO_SEED_PASSWORD", envFile);
  if (password.length < 8) throw new Error("DEMO_SEED_PASSWORD must have at least 8 characters");

  const a = apiRef(apiUrl);
  const d = dbRef(dbUrl);
  if (!a || !d || a !== d) throw new Error(`Refused: the API URL and the database URL in ${envFile} are not the same project`);

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const admin = createClient(apiUrl, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  return { envFile, projectRef: a, password, db, admin };
}

export async function closeContext(ctx: Context) {
  await ctx.db.end();
}

/** The database-level guard: demo_flag.enabled must be true (docs/SETUP.md has the SQL). */
export async function isFlagEnabled(ctx: Context): Promise<boolean> {
  const { rows } = await ctx.db.query("select enabled from public.demo_flag");
  return rows[0]?.enabled === true;
}

export const ENABLE_SQL = "update public.demo_flag set enabled = true;";

async function publicTables(ctx: Context): Promise<string[]> {
  const { rows } = await ctx.db.query(
    "select tablename from pg_tables where schemaname = 'public' and tablename not in ('demo_flag', 'demo_attempt') order by 1",
  );
  return rows.map((r) => r.tablename as string);
}

export type Inventory = { rows: number; tables: number; authUsers: number; storageObjects: number; sessions: number };

/** What the command is about to delete: rows in every public table (except the flag and attempt counter), Auth users, files. */
export async function inventory(ctx: Context): Promise<Inventory> {
  let rows = 0;
  const tables = await publicTables(ctx);
  for (const t of tables) {
    rows += Number((await ctx.db.query(`select count(*) from public."${t}"`)).rows[0].count);
  }
  const one = async (sql: string) => Number((await ctx.db.query(sql)).rows[0].count);
  return {
    rows,
    tables: tables.length,
    authUsers: await one("select count(*) from auth.users"),
    storageObjects: await one(`select count(*) from storage.objects where bucket_id = '${BUCKET}'`),
    sessions: await one("select count(*) from auth.sessions"),
  };
}

/** Asks for the last 6 characters of the project reference. Refuses on a wrong answer or when stdin ends. */
export async function confirmByTyping(ctx: Context, action: string): Promise<void> {
  const expected = ctx.projectRef.slice(-6);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string | null>((resolve) => {
    let answered = false;
    rl.on("close", () => !answered && resolve(null));
    rl.question(`Type the last 6 characters of the project reference to ${action}: `, (a) => {
      answered = true;
      resolve(a);
      rl.close();
    });
  });
  if (answer === null) throw new Error("Cancelled: no confirmation was typed. Nothing was changed.");
  if (answer.trim() !== expected) throw new Error("Cancelled: the characters do not match. Nothing was changed.");
}

/**
 * The confirmation of both commands: the typed characters, or --unattended when DEMO_UNATTENDED_REF in the env file equals the
 * target project reference (scripts/lib/unattended.ts). A refused --unattended never falls back silently: it stops the command.
 */
export async function confirmRun(ctx: Context, action: string, argv: string[] = process.argv.slice(2)): Promise<void> {
  if (!wantsUnattended(argv)) return confirmByTyping(ctx, action);
  const refusal = unattendedRefusal(argv, process.env, ctx.projectRef, ctx.envFile);
  if (refusal) throw new Error(refusal);
  console.log("Unattended run: DEMO_UNATTENDED_REF equals the target project reference, the typed confirmation is skipped.");
}

type Log = (message: string) => void;

async function listAllAuthUsers(ctx: Context) {
  const all: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await ctx.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) return all;
  }
}

/** Creates (or refreshes) the Auth users as already confirmed with the demo password; no e-mail is sent. Returns id by e-mail. */
async function ensureAuthUsers(ctx: Context, users: SeedUser[]): Promise<Map<string, string>> {
  const existing = new Map((await listAllAuthUsers(ctx)).map((u) => [u.email?.toLowerCase(), u.id]));
  const ids = new Map<string, string>();
  for (const user of users) {
    let id = existing.get(user.email);
    if (id) {
      const { error } = await ctx.admin.auth.admin.updateUserById(id, { password: ctx.password, email_confirm: true, ban_duration: "none" });
      if (error) throw error;
    } else {
      const { data, error } = await ctx.admin.auth.admin.createUser({ email: user.email, password: ctx.password, email_confirm: true });
      if (error) throw error;
      id = data.user.id;
    }
    ids.set(user.email, id);
  }
  return ids;
}

async function removeExtraAuthUsers(ctx: Context, keep: Set<string>): Promise<number> {
  let removed = 0;
  for (const u of await listAllAuthUsers(ctx)) {
    if (u.email && keep.has(u.email.toLowerCase())) continue;
    const { error } = await ctx.admin.auth.admin.deleteUser(u.id);
    if (error) throw error;
    removed++;
  }
  return removed;
}

async function removeAllStorageObjects(ctx: Context): Promise<number> {
  const { rows } = await ctx.db.query("select name from storage.objects where bucket_id = $1", [BUCKET]);
  const names = rows.map((r) => r.name as string);
  for (let i = 0; i < names.length; i += 500) {
    const { error } = await ctx.admin.storage.from(BUCKET).remove(names.slice(i, i + 500));
    if (error) throw error;
  }
  return names.length;
}

const SAMPLE_PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n"),
);

/** REG-07 AC4: each seeded vendor's legal representative keeps a sample proof-of-authority file (needs Storage). */
export async function seedProofFiles(ctx: Context, vendorIds: string[] = [BETA_TRADE_ID, GAMMA_SUPPLY_ID]): Promise<number> {
  let created = 0;
  for (const vendorId of vendorIds) {
    const { data: contact, error } = await ctx.admin
      .from("vendor_contact")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("is_primary", true)
      .maybeSingle();
    if (error) throw error;
    if (!contact) continue;
    const { data: existing } = await ctx.admin
      .from("file")
      .select("id")
      .eq("owner_type", "vendor_contact")
      .eq("owner_id", contact.id)
      .eq("kind", "proof_of_authority");
    if (existing && existing.length > 0) continue;
    const path = `${COMPANY_ID}/vendor_contact/${contact.id}/sample-power-of-attorney.pdf`;
    const { error: uploadError } = await ctx.admin.storage.from(BUCKET).upload(path, SAMPLE_PDF, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: fileError } = await ctx.admin.from("file").insert({
      company_id: COMPANY_ID,
      owner_type: "vendor_contact",
      owner_id: contact.id,
      kind: "proof_of_authority",
      file_name: "sample-power-of-attorney.pdf",
      mime_type: "application/pdf",
      size_bytes: SAMPLE_PDF.length,
      storage_path: path,
    });
    if (fileError) throw fileError;
    created++;
  }
  return created;
}

export type ResetSummary = { counts: Record<string, number>; seconds: number; steps: { name: string; seconds: number }[] };

/**
 * Puts the database, Auth and Storage back to the scenario start for the given users (a parameter, so Slice 8b can pass
 * more vendor logins). Order: Auth users first (the seed needs their ids), then ONE database transaction (app.demo_reset),
 * then the clean-up that needs the Auth and Storage APIs. A failure in the transaction changes no data; the clean-up
 * steps can simply be run again (run the command again).
 */
export async function resetToUsers(ctx: Context, users: SeedUser[], log: Log): Promise<ResetSummary> {
  const started = Date.now();
  const steps: ResetSummary["steps"] = [];
  const step = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    log(`- ${name} ...`);
    const result = await work();
    const seconds = (Date.now() - t) / 1000;
    steps.push({ name, seconds });
    log(`  done in ${seconds.toFixed(1)} s`);
    return result;
  };

  if (!(await isFlagEnabled(ctx))) {
    throw new Error(`Refused: demo_flag is not enabled in this database. To enable it, run: ${ENABLE_SQL}`);
  }

  const ids = await step("Create or refresh the seed Auth users", () => ensureAuthUsers(ctx, users));

  const payload = users.map((u) => ({
    id: ids.get(u.email),
    email: u.email,
    full_name: u.fullName,
    roles: u.roles,
    vendor_id: u.vendorId ?? null,
    committee: u.committee ?? null,
  }));
  const counts = await step("Truncate, seed and end all sessions (one database transaction)", async () => {
    const { rows } = await ctx.db.query("select app.demo_reset($1::jsonb) as result", [JSON.stringify(payload)]);
    return rows[0].result as Record<string, number>;
  });

  const removed = await step("Delete Auth users that are not in the seed list", () =>
    removeExtraAuthUsers(ctx, new Set(users.map((u) => u.email.toLowerCase()))),
  );
  log(`  ${removed} Auth user(s) deleted`);
  const files = await step("Delete all uploaded files from Storage", () => removeAllStorageObjects(ctx));
  log(`  ${files} file(s) deleted`);
  const proofs = await step("Restore the sample proof files of the seed vendors", () => seedProofFiles(ctx));
  log(`  ${proofs} proof file(s) created`);

  return { counts, seconds: (Date.now() - started) / 1000, steps };
}
