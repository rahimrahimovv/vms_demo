// DEMO-02: `npm run demo:reset` puts the database, Auth and Storage back to the start of the demo scenario.
// A developer command (D-023): never a web endpoint. It reads ENV_FILE (default .env.local), prints the target
// project and what it is about to delete, refuses unless demo_flag is enabled in that database, and does nothing
// until the last 6 characters of the project reference are typed.
import {
  SCENARIO_START_USERS,
  closeContext,
  confirmByTyping,
  ENABLE_SQL,
  inventory,
  isFlagEnabled,
  openContext,
  resetToUsers,
} from "./lib/demo-data";

async function main() {
  const ctx = await openContext();
  try {
    console.log(`Target project reference: ${ctx.projectRef}   (env file: ${ctx.envFile})`);

    if (!(await isFlagEnabled(ctx))) {
      throw new Error(`Refused: demo_flag is not enabled in this database. To enable it, run: ${ENABLE_SQL}`);
    }

    const before = await inventory(ctx);
    console.log("About to delete:");
    console.log(`  ${before.rows} rows in ${before.tables} tables (audit trail and minutes included)`);
    console.log(`  ${before.authUsers} Auth users (all but the ${SCENARIO_START_USERS.length} seed users), ${before.sessions} sessions (everyone is signed out)`);
    console.log(`  ${before.storageObjects} uploaded files in Storage`);
    console.log("Then the scenario start is restored: dictionaries, categories, items, plan line, users, committee, Beta Trade and Gamma Supply.");

    await confirmByTyping(ctx, "reset this project");
    console.log("Resetting ...");

    const summary = await resetToUsers(ctx, SCENARIO_START_USERS, console.log);

    const after = await inventory(ctx);
    console.log("\nSeed counts after the reset:");
    for (const [key, value] of Object.entries(summary.counts)) console.log(`  ${key}: ${value}`);
    console.log(`  Auth users: ${after.authUsers}, Storage files: ${after.storageObjects}, sessions: ${after.sessions}`);
    console.log(`\nReset finished in ${summary.seconds.toFixed(1)} s.`);
  } finally {
    await closeContext(ctx);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
