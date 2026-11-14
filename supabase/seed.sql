-- Demo seed (synthetic data only, backlog "Demo Scenario Data"). Safe to run more than once.
-- The seed data lives in app.seed_base() (migration 20261118120000_demo_reset.sql); this file only calls it, so
-- `npm run db:seed` and `npm run demo:reset` share one source. Users come from scripts/seed-users.ts.
select app.seed_base();
