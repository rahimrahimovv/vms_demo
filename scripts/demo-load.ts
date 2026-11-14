// DEMO-03: `npm run demo:load` loads the populated demo data: the Populated Data Catalogue of the backlog, created through
// the application's own database functions. A developer command (D-023), never a web endpoint. Same guards as the reset:
// it reads ENV_FILE (default .env.local), prints the target project and what it is about to delete, refuses unless
// demo_flag is enabled in that database, and does nothing until the last 6 characters of the project reference are typed.
import { SCENARIO_START_USERS, closeContext, confirmByTyping, ENABLE_SQL, inventory, isFlagEnabled, openContext } from "./lib/demo-data";
import { populate } from "./lib/populate";

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
    console.log("Then the populated demo data is loaded: 15 vendors, 19 requisitions, 12 sourcings, committee decisions with minutes, purchase orders.");

    await confirmByTyping(ctx, "reset this project and load the populated demo data");
    console.log("Loading ... (a few minutes)");

    const result = await populate(ctx, console.log);
    const after = await inventory(ctx);
    console.log(`\n${result.loaded}`);
    console.log(`Auth users: ${after.authUsers}, Storage files: ${after.storageObjects}, sessions: ${after.sessions}`);
    console.log(`Load finished in ${result.seconds.toFixed(1)} s. Every user was signed out; sign in with the demo password.`);
  } finally {
    await closeContext(ctx);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
