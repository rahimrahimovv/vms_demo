# Progress

Updated after each slice (CLAUDE.md "How to work").

## Slice 0: Setup (done, 06 Nov 2026)

- Next.js 16.4 (App Router, TypeScript), Tailwind 4, shadcn/ui (Radix, Nova), lucide, Inter, next-intl.
- Supabase: migrations in `supabase/migrations/`, `seed.sql`, `scripts/seed-users.ts`; applied to vms-dev and vms-prod.
- Vitest: unit tests and RLS tests against vms-dev. Setup and deploy steps: `docs/SETUP.md`.
- Vercel: not confirmed deployed yet (steps in `docs/SETUP.md`).

## Slice 1

| Story | Status | Notes |
| --- | --- | --- |
| PLT-01 Sign in and see only your role's screens | done | AC1-AC7 covered |
| PLT-02 In-app notifications and audit trail | done | AC1-AC6; real events from Slice 2 on |

## Slice 2 (11 Nov 2026)

Backlog export of 11 Nov 2026 (30 stories, 41-table ERD), with three fixes agreed on 11 Nov:
REG-06 AC5 (EXPIRED from the day after the expiry date), REG-05 AC8 (new questionnaire allowed in the
last 30 days of a grade; the new grade replaces the old one), ERD (voting period only on `committee`).
Change of 11 Nov before production: several bank accounts per vendor (`vendor_bank_account`, exactly one
main; bank name, IBAN and SWIFT removed from `vendor`), REG-01 AC4 and REG-06 AC3 / AC7. vms-prod was not
migrated yet, so the table is part of the Slice 2 migration (42 tables).

| Story | Status | Notes |
| --- | --- | --- |
| REG-01 Vendor registers (local, individual, foreign) | done | AC1-AC10; account created confirmed by the server, no e-mail (CLAUDE.md rule 1); one or more bank accounts, one main |
| REG-02 Specialist approves, returns or rejects | done | AC1-AC6 |
| REG-03 Vendor applies for categories | done | AC1-AC5; licence required on Fertilisers and its children |
| REG-04 Specialist qualifies; AVL | done | AC1-AC4; expiry applied on read and by the daily job |
| REG-05 Questionnaire and A–D grade | done | AC1-AC9 incl. the D rule and the 30-day early retake |
| REG-06 Profile, certificates, vendor card | done | AC1-AC10; certificate reminders at once on save and daily; bank accounts kept on Profile, listed on the card |
| MDM-01, MDM-02 | data only | Dictionaries and category tree seeded; Admin screens in Slice 3 |

Data model for Slices 3-7 is in place (`20261111130000_procurement_model.sql`): tables, constraints,
read policies (sealed proposals, two envelopes, final-offer round hidden until it closes), status audit
on every entity of the Status Transition Model, document numbering. Status-changing functions come
with each slice.

### Verified

- `npm test`: 57 unit tests (Calculation Rules with the backlog's worked examples: score 76.0, grades,
  certificate status, years in business; registration rules; file type/size incl. a renamed .exe;
  category tree; bank account rules; Role Matrix menus; every error key and notification event has a text).
- `npm run test:rls`: 73 RLS tests on vms-dev (24 Slice 1 + 49 Slice 2) with two throwaway vendor accounts:
  isolation of every vendor table, no points or scores visible to vendors, transitions and required
  comments, D rule and HOLD, licence check, AVL parent/child, expiry by date, shared-owner flag,
  certificate notices, bank accounts (at least one, exactly one main, IBAN format, written only through
  functions, last account cannot be deleted), audit entries, document numbers.
- Click-through in Edge at 1280 px on the dev server (vms-dev), 39 checks: registration with field errors,
  return / resubmit / approve, questionnaire 78.0 -> B (backlog Scenario A answers), licence message,
  qualify, AVL with brand filter, two bank accounts on the card, main moved and an account removed on
  Profile, EXPIRING certificate warning, shared-owner flag on Beta Trade.

### Additions to the ERD (agreed 11 Nov 2026)

`company_id` on invitation, proposal, category_application, questionnaire_response; snapshot of weight
and maximum points on questionnaire_answer; `vendor_certificate.expired_notified_at`;
`invitation.reminder_sent_at`; `sourcing.ssp_vendor_id`, `excluded_vendor_ids`, `bids_opened_at`,
`prices_opened_at`; `proposal.passed_at`; `doc_counter` for document numbers.

### Open issues

1. **NFR-012 lint rule not active (deferred, decided 06 Nov 2026).** `eslint-plugin-i18next` is installed,
   but the `ecc` plugin's config-protection hook blocks edits to `eslint.config.mjs`. The rule to add (in a
   block for `src/app/**/*.tsx` and `src/components/**/*.tsx`, ignoring `src/components/ui/**`):
   `"i18next/no-literal-string": ["error", { mode: "jsx-text-only" }]` with `plugins: { i18next }`.
   Until then `tests/unit/messages.test.ts` checks labels, error keys (code and SQL) and notification texts.
2. vms-prod migrated and seeded for Slice 2 on 11 Nov 2026 (schema, policies and grants checked equal to
   vms-dev). Run `db:push` with `.env.production.local` before every push that brings a new migration.
3. **Vendor read access to sourcing details** (no PR estimates) and the published Q&A without the asker's
   name come as security-definer functions in Slices 4 and 6; until then vendors read no sourcing data.
4. Deactivating a user also bans the Auth account, so open sessions end at the next token refresh (about
   1 hour); pages already refuse them immediately.
5. Items (25 in the catalogue) are seeded with MDM-02 in Slice 3.
