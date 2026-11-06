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
npm run db:seed                 # seed.sql (company, settings) + demo users (DEMO_SEED_PASSWORD)
npm run dev                     # http://localhost:3000
```

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
2. Settings → General → Node.js version: 24.x.
3. Settings → Environment Variables (Production, vms-prod values):

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | vms-prod project URL | |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | vms-prod publishable key | |
   | `SUPABASE_SECRET_KEY` | vms-prod secret key | mark as Sensitive; server only |
   | `DEMO_MODE` | `false` | `true` only for rehearsal and demo day |

   Do **not** add `SUPABASE_DB_URL` or `DEMO_SEED_PASSWORD` to Vercel; only the local scripts use them.
4. Production branch: `main`. Every push to `main` deploys; a failed build keeps the previous version live.

## Supabase settings for vms-prod

- Authentication → URL Configuration → Site URL: the Vercel production URL.
- Authentication → Sign In / Providers → Email: e-mail + password on; turn **off** "Allow new users to sign up".
  Users are created by the Admin (and from Slice 2 by vendor registration) through the server, which
  still works with public sign-up off.
- Realtime needs nothing extra: the migration adds `notification` to the `supabase_realtime` publication.
- NFR-014: the free project pauses after about a week without use; open it the day before the demo.
