// DEMO-03: `npm run demo:load`. Resets to the scenario start (the same shared module as demo:reset), then loads the
// Populated Data Catalogue through the application's own database functions. See docs/PROGRESS.md for the time-shift design.
import { SCENARIO_START_USERS, resetToUsers, type Context, type ResetSummary } from "../demo-data";
import { selfCheck } from "./checks";
import { buildVendors } from "./vendors";
import { createPlanLines, runStories, type Ctx } from "./stories";
import { EMAIL, as, attach, call, newWorld, userId, type Log, type World } from "./world";

/** One SUBMITTED change request (Bank accounts) by Mugan Irrigation Systems MMC: a second account in EUR next to the main one. */
export async function changeRequest(w: World): Promise<void> {
  const zeta = w.vendors.get("zeta")!;
  const id = await call<string>(w, zeta.email, "change_request_submit", {
    p_section: "BANK_ACCOUNTS",
    p_reason: "We opened a euro account for payments from our foreign suppliers",
    p_proposed: {
      accounts: [
        { bank_name: "Demo Bank Azerbaijan", iban: "AZ21DEMO00000000000000004002", swift: "DEMOAZ22", currency: "AZN", is_main: true },
        { bank_name: "Demo Euro Bank", iban: "AZ21DEMO00000000000000004102", swift: "DEMOEUIS", currency: "EUR", is_main: false },
      ],
    },
  });
  await attach(w, { type: "vendor_change_request", id }, "change_support", "bank-letter.pdf", zeta.userId, "Bank confirmation letter");
}

/**
 * Every user has at least 3 unread notifications and some read ones. The records above create almost all of them.
 * The Administrator is addressed by no workflow event, so three notices that fit the role (registrations waiting for the
 * specialist, which the Administrator can open on the vendor cards) are sent with app.notify, the function the app's own
 * functions use.
 */
export async function notifications(w: World): Promise<void> {
  const admin = await userId(w, EMAIL.admin);
  const { rows: waiting } = await w.db.query("select id, legal_name from public.vendor where status = 'SUBMITTED' order by legal_name limit 3");
  for (const v of waiting) {
    await w.db.query("select app.notify(array[$1::uuid], 'registration.submitted', 'vendor', $2::uuid, $3, '{}'::jsonb)", [admin, v.id, v.legal_name]);
  }
  // some read ones for variety: the older 40 % of each user's notices, never below 3 unread
  const { rows: users } = await w.db.query("select id, email from public.app_user where is_active");
  for (const u of users) {
    const { rows } = await w.db.query("select id from public.notification where user_id = $1 and not is_read order by created_at asc, id", [u.id]);
    const markable = Math.min(Math.floor(rows.length * 0.4), Math.max(0, rows.length - 3));
    if (markable === 0) continue;
    const client = await as(w, u.email);
    const { error } = await client.from("notification").update({ is_read: true }).in("id", rows.slice(0, markable).map((r) => r.id));
    if (error) throw new Error(`marking notices of ${u.email} as read: ${error.message}`);
  }
}

export type PopulateResult = { loaded: string; reset: ResetSummary; seconds: number };

export async function populate(ctx: Context, log: Log): Promise<PopulateResult> {
  const started = Date.now();
  log("Step 1 of 6: reset to the scenario start");
  const reset = await resetToUsers(ctx, SCENARIO_START_USERS, log);
  const w = newWorld({ db: ctx.db, admin: ctx.admin, password: ctx.password, log });

  log("Step 2 of 6: vendors (registration, approval, grade, categories, certificates)");
  await buildVendors(w);

  log("Step 3 of 6: plan lines");
  const plan = await createPlanLines(w);

  log("Step 4 of 6: requisitions, sourcings, committee decisions and purchase orders (one after another, oldest first)");
  const stories: Ctx = { w, plan, prs: {}, sourcings: {} };
  await runStories(stories, log);

  log("Step 5 of 6: change request and notifications");
  await changeRequest(w);
  await notifications(w);

  log("Step 6 of 6: self-check");
  const loaded = await selfCheck(w, stories.sourcings);

  await ctx.db.query("delete from auth.sessions"); // every user is signed out (the loader's own sessions included)
  return { loaded, reset, seconds: (Date.now() - started) / 1000 };
}
