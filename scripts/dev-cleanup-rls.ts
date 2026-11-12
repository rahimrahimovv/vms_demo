// Dev-only: removes leftovers of failed RLS test runs from vms-dev. Usage: npx tsx scripts/dev-cleanup-rls.ts rls4
// Refuses to run on any database that is not the .env.local project (see tests/rls/helpers/dev-cleanup.ts).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { removeTestData } from "../tests/rls/helpers/dev-cleanup";

async function main() {
  config({ path: ".env.local", quiet: true });
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await db.connect();
  try {
    console.log(await removeTestData(db, service, process.argv[2] ?? ""));
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
