# Setup and deployment

No secrets in this file. Values live in `.env.local` (vms-dev), `.env.production.local` (vms-prod, optional)
and in Vercel. Every `.env*` file except `.env.example` is gitignored.

## Supabase projects

| Project | Used by |
| --- | --- |
| vms-dev | localhost and the RLS tests (`npm run test:rls` creates and deletes throwaway users) |
| vms-prod | the Vercel deployment |

## Local development

```bash
npm install
cp .env.example .env.local      # fill in the vms-dev values
npm run db:push                 # apply supabase/migrations
npm run db:seed                 # seed.sql (company, settings, dictionaries, categories, questionnaire,
                                #   Vendor B and C) + demo users (DEMO_SEED_PASSWORD)
npm run dev                     # http://localhost:3000 (uses .env.local = vms-dev)
```

`db:seed` runs `seed.sql` every time; it only calls `app.seed_base()` (the seed data lives in that function, in migration
`20261118120000_demo_reset.sql`, so `db:seed` and `demo:reset` share one source) and is idempotent (`on conflict do nothing`).
Change seed data with `create or replace function app.seed_base()` in a new migration.

Careful: `npm run build && npm start` also loads `.env.production.local` when that file exists, so a local
production build talks to **vms-prod**. Use `npm run dev` for local work and tests.

Docker is not needed: migrations go straight to the hosted database through `SUPABASE_DB_URL`
(the Supabase CLI is a dev dependency).

## Checks

```bash
npm run typecheck
npm run lint
npm test            # unit tests
npm run test:rls    # RLS tests against vms-dev (two vendor accounts + internal roles)
npm run build
```

## Migrating and seeding vms-prod

Put the vms-prod values in `.env.production.local` (same names as `.env.example`), then:

```bash
# Git Bash
ENV_FILE=.env.production.local npm run db:push
ENV_FILE=.env.production.local npm run db:seed
```

```powershell
# PowerShell
$env:ENV_FILE = ".env.production.local"; npm run db:push; npm run db:seed; Remove-Item Env:ENV_FILE
```

Run `db:push` after every new migration, before or together with the deploy that needs it.

## Vercel

1. New Project, import the GitHub repository `vms_demo`. Framework preset: Next.js (detected).
   Root directory `./`, build command `npm run build`, install command `npm install`.
2. Settings → General → Node.js version: 24.x. The function region comes from `vercel.json`
   (`bom1`, Mumbai, next to vms-prod in ap-south-1); no dashboard change is needed.
3. Settings → Environment Variables (Production, vms-prod values):

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | vms-prod project URL | |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | vms-prod publishable key | |
   | `SUPABASE_SECRET_KEY` | vms-prod secret key | mark as Sensitive; server only |

   Do **not** add `SUPABASE_DB_URL`, `DEMO_SEED_PASSWORD` or `DEMO_UNATTENDED_REF` to Vercel; only the local scripts use them. There is no
   `CRON_SECRET`: the release has no cron route (the staging clean-up is an open item in `docs/PROGRESS.md`).
4. Production branch: `main`. Every push to `main` deploys; a failed build keeps the previous version live.

## Supabase settings for vms-prod

- Authentication → URL Configuration → Site URL: the Vercel production URL.
- Authentication → Sign In / Providers → Email: e-mail + password on; turn **off** "Allow new users to sign up".
  Users are created by the Admin (and from Slice 2 by vendor registration) through the server, which
  still works with public sign-up off.
- Realtime needs nothing extra: the migration adds `notification` to the `supabase_realtime` publication.
- Storage needs nothing extra: the Slice 2 migration creates the private bucket `files` (10 MB, PDF, JPG,
  PNG, DOCX, XLSX). Only the server reads and writes it.
- pg_cron: the Slice 2 migration enables it and schedules `vms-daily` (00:05 Asia/Baku) for expiry and
  certificate reminders.
- Vendor self-registration works with public sign-up off: the server creates the account already confirmed.
- NFR-014: the free project pauses after about a week without use; open it the day before the demo.

## The reset and load commands (Slice 8a and 8b, D-023, D-024)

**In the browser** there are no demo tools (D-024): no demo page, no demo bar, no Switch user, no Lock, no Reset or Load button, and no
endpoint or server action that signs in as another user without a password. Resetting and loading are commands on your machine.

**Reset to scenario start** is a command on your machine:

```bash
npm run demo:reset                                  # .env.local (vms-dev)
ENV_FILE=.env.production.local npm run demo:reset   # another project (Git Bash); PowerShell: $env:ENV_FILE = "..."
```

It prints the target project reference and what it is about to delete, refuses if `demo_flag` is off, and waits until **you type the last
6 characters of the project reference**. It deletes every row of every table in `public` (audit trail and minutes included; only
`demo_flag` stays), all Auth users except the 9 seed users, every session (everyone is signed out) and every uploaded
file in the `files` bucket. It restores the scenario start (dictionaries, categories, items, the 500,000.00 AZN plan line, the 7 internal
users and the demo committee, Ege Tarim Kimya and Caspian Agrochem with owners, bank accounts and sample proof files, settings, vendor logins with
the demo password), restarts document numbers at 0001 and leaves one `RESET` line in the audit trail. Kura Agro Supply does not exist
afterwards, so its e-mail can register again. The database part is one transaction (`app.demo_reset`, TRUNCATE): a failure there changes
nothing; the Auth and Storage clean-up that follows can be repeated by running the command again. Immutability triggers are never
disabled or changed. The env file needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` and `DEMO_SEED_PASSWORD`.

**Database guard.** `public.demo_flag` has one row, `enabled = false` after every migration. `app.demo_reset()` and `app.demo_seed()`
refuse unless it is true, so a project that must never be reset stays safe even with a stray command. Enable it only where a reset is
wanted, in the Supabase SQL editor of that project or over any owner connection:

```sql
update public.demo_flag set enabled = true;     -- allow the reset in this database
update public.demo_flag set enabled = false;    -- forbid it again
```

It is **enabled on vms-dev**. vms-prod is **not** migrated and the flag is **not** enabled there; do both deliberately, when the
production reset is wanted.

**Load populated demo data** (`npm run demo:load`, DEMO-03, Slice 8b) runs the reset first and then loads the Populated Data Catalogue
through the application's own database functions, signed in as the right user (the vendor, the Specialist, the committee, ...). Same module
(`scripts/lib/demo-data.ts`), same typed confirmation, same flag as the reset. It takes up to 3 minutes, ends with the self-check and prints
`Loaded: N vendors, N PRs, N sourcings, N decisions, N POs` or the first failed check. It needs `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` too (the loader
signs in as the demo users with `DEMO_SEED_PASSWORD`). Migrations `20261119100000_demo_backdate` and `20261119120000_demo_backdate_dates`
(function `app.demo_backdate`) must be applied to the target database first.

**Unattended mode** (`npm run demo:reset -- --unattended`, `npm run demo:load -- --unattended`) skips the typed confirmation, only when
`DEMO_UNATTENDED_REF` in the env file equals the target project reference exactly (and the env file is not a production one). Set it in `.env.local`
to the vms-dev reference and nowhere else: **never** in `.env.production.local`, on Vercel or with a real value in `.env.example`. Without the variable, or with
another reference, the flag is refused and the typed confirmation stays mandatory (unit tests `unattended.test.ts`, command tests in `demo-reset.rls.test.ts`).
