# Progress

Updated after each slice (CLAUDE.md "How to work").

## Slice 0: Setup (done, 06 Nov 2026)

- Next.js 16.4 (App Router, TypeScript), Tailwind 4, shadcn/ui (Radix, Nova), lucide, Inter, next-intl.
- Supabase: migration `20261106120000_platform.sql`, `seed.sql`, `scripts/seed-users.ts`; applied to vms-dev.
- Vitest: unit tests and RLS tests against vms-dev. Setup and deploy steps: `docs/SETUP.md`.
- Not yet deployed to Vercel (needs the steps in `docs/SETUP.md`).

## Slice 1

| Story | Status | Notes |
| --- | --- | --- |
| PLT-01 Sign in and see only your role's screens | done | AC1-AC7 covered; see tests below |
| PLT-02 In-app notifications and audit trail | done | AC1-AC6 covered at platform level; real events arrive from Slice 2 |

### Verified

- `npm test`: 27 unit tests (locale formats, Role Matrix menu, user form rules, message keys).
- `npm run test:rls`: 24 RLS tests on vms-dev with two vendor accounts, a Requester and an Admin
  (own-record isolation, no direct writes to notifications or audit, audit immutable even for the secret key,
  status trigger writes from/to/reason, sealed proposal history hidden, inactive users read nothing).
- Click-through in Edge at 1280 px against the production build: wrong password message, role menus,
  "You do not have access to this page" + API 403, live bell (+1) and mark-read on open, Admin creates a user,
  duplicate e-mail message, new user signs in.

### Open issues

1. **NFR-012 lint rule not active (deferred, decided 06 Nov 2026).** `eslint-plugin-i18next` is installed, but the `ecc`
   plugin's config-protection hook blocks edits to `eslint.config.mjs`; left for later on purpose. The rule to add (in a block for
   `src/app/**/*.tsx` and `src/components/**/*.tsx`, ignoring `src/components/ui/**`):
   `"i18next/no-literal-string": ["error", { mode: "jsx-text-only" }]` with `plugins: { i18next }`.
   Until then `tests/unit/messages.test.ts` checks labels and error keys only.
2. **No PLT-02 events yet.** The Notification table has no Slice 1 events; the bell, the History tab
   component (`src/components/history-tab.tsx`) and `app.audit_status_change()` are attached to real
   records from Slice 2.
3. **`app.can_read_record` hides all `invitation` and `proposal` history from internal users** until Slice 4
   adds the deadline check (NFR-002). Vendors read no history until Slice 2 adds their record types.
4. **Status-bearing child tables need `company_id`** (invitation, proposal, category_application,
   questionnaire_response), so jobs without a signed-in user can write their audit rows. Planned in their slices.
5. Deactivating a user also bans the Auth account, so open sessions end at the next token refresh (about 1 hour);
   pages already refuse them immediately.
