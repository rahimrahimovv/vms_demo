// Applies supabase/migrations to the database in SUPABASE_DB_URL; with --seed it then runs
// supabase/seed.sql every time (the seed is idempotent; the CLI's --include-seed skips a seed it has
// seen before and only updates its hash).
// Usage: npm run db:push   |   npm run db:seed
// Reads .env.local (or ENV_FILE); the connection string is never printed. No shell, so passwords with
// special characters are passed through unchanged.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config } from "dotenv";
import pg from "pg";

// ENV_FILE picks another env file, e.g. ENV_FILE=.env.production.local for vms-prod.
const envFile = process.env.ENV_FILE || ".env.local";
config({ path: envFile, quiet: true });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(`SUPABASE_DB_URL is not set in ${envFile}`);
  process.exit(1);
}

const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const result = spawnSync(process.execPath, [cli, "db", "push", `--remote=${dbUrl}`, "--yes"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.argv.includes("--seed")) {
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(readFileSync("supabase/seed.sql", "utf8"));
    await client.query("commit");
    console.log("seed.sql applied");
  } catch (error) {
    await client.query("rollback");
    console.error(`seed.sql failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
