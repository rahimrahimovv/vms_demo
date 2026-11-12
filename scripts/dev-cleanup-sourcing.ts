// Dev-only: removes one sourcing (with proposals, decisions, votes and minutes) from vms-dev.
// Usage: npx tsx scripts/dev-cleanup-sourcing.ts SRC-2026-0142
// Refuses to run on any database that is not the .env.local project (see tests/rls/helpers/dev-cleanup.ts).
import { config } from "dotenv";
import { Client } from "pg";
import { removeSourcingByNumber } from "../tests/rls/helpers/dev-cleanup";

async function main() {
  config({ path: ".env.local", quiet: true });
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    console.log(await removeSourcingByNumber(db, process.argv[2] ?? ""));
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
