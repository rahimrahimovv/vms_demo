// Applies supabase/migrations (and, with --seed, supabase/seed.sql) to the database in SUPABASE_DB_URL.
// Usage: npm run db:push   |   npm run db:seed
// Reads .env.local (or ENV_FILE); the connection string is never printed. No shell, so passwords with
// special characters are passed through unchanged.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { config } from "dotenv";

// ENV_FILE picks another env file, e.g. ENV_FILE=.env.production.local for vms-prod.
const envFile = process.env.ENV_FILE || ".env.local";
config({ path: envFile, quiet: true });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(`SUPABASE_DB_URL is not set in ${envFile}`);
  process.exit(1);
}

const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const args = [cli, "db", "push", `--remote=${dbUrl}`, "--yes"];
if (process.argv.includes("--seed")) args.push("--include-seed");

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
