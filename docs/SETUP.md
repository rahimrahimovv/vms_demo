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
   | `DEMO_MODE` | `false` | `true` only for rehearsal and demo day |
   | `DEMO_ACCESS_CODE` | the demo code | mark as Sensitive; at least 6 characters; the presenter types it at `/demo-access` |
   | `DEMO_SESSION_SECRET` | 16+ random characters | mark as Sensitive; signs the 8-hour unlock cookie |

   Do **not** add `SUPABASE_DB_URL` or `DEMO_SEED_PASSWORD` to Vercel; only the local scripts use them. There is no
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

## Demo tools and the reset command (Slice 8a, D-022, D-023)

**In the browser** (Vercel and local): demo tools need `DEMO_MODE=true` **and** an unlocked browser. Open `/demo-access` (the sign-in
page links to it while demo mode is on) and type `DEMO_ACCESS_CODE`; the signed httpOnly cookie lasts 8 hours. Five wrong codes from one IP
lock it for 15 minutes. The demo bar then shows **Switch user** (any active user, no password), **End deadline now** (only on a sourcing
record whose deadline can be ended: an OPEN sourcing or a running final-offer round; it takes effect within seconds) and **Lock**.
Without both conditions no control is rendered and every demo action answers "Not available". The browser has **no** Reset button, **no**
Load button and no endpoint for either.

**Reset to scenario start** is a command on your machine:

```bash
npm run demo:reset                                  # .env.local (vms-dev)
ENV_FILE=.env.production.local npm run demo:reset   # another project (Git Bash); PowerShell: $env:ENV_FILE = "..."
```

It prints the target project reference and what it is about to delete, refuses if `demo_flag` is off, and waits until **you type the last
6 characters of the project reference**. It deletes every row of every table in `public` (audit trail and minutes included; only
`demo_flag` and `demo_attempt` stay), all Auth users except the 9 seed users, every session (everyone is signed out) and every uploaded
file in the `files` bucket. It restores the scenario start (dictionaries, categories, items, the 500,000.00 AZN plan line, the 7 internal
users and the demo committee, Beta Trade and Gamma Supply with owners, bank accounts and sample proof files, settings, vendor logins with
the demo password), restarts document numbers at 0001 and leaves one `RESET` line in the audit trail. Alpha Agro does not exist
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

**Load populated demo data** (`npm run demo:load`, DEMO-03, Slice 8b) is a placeholder that prints "not built yet" and changes nothing.
It will reuse the same module (`scripts/lib/demo-data.ts`), the same typed confirmation and the same flag.
