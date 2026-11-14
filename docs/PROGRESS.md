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
5. Items (25 in the catalogue) are seeded with MDM-02 in Slice 3 (done).

## Slice 3 (11 Nov 2026)

Changes agreed on 11 Nov 2026: a Currencies dictionary (ISO code, name, active; seed AZN, USD, EUR, TRY,
RUB, GBP, CNY) feeds every currency dropdown (vendor bank accounts, bank guarantee) instead of a fixed list
(MDM-01 AC4, ERD `currency`, 43 tables); a PR draft may be saved without lines, "Add at least one line" is
checked on Submit only (PR-01 AC5-AC6); a plan line's category is fixed once a PR uses it, a RETURNED PR
keeps its plan line even when the line was closed, PRs and plan lines are never deleted (PLN-01 AC2).
Seed: 25 items plus 3 under Irrigation systems; "Ammonium nitrate 34.4%, 50 kg bag" under Mineral
fertilisers and "Foliar fertiliser, 1 L" under Foliar fertilisers; plan line 2026 / Fertilisers /
"Spring fertiliser programme" / 500,000.00 AZN / Q1.

| Story | Status | Notes |
| --- | --- | --- |
| MDM-01 Dictionaries | done | AC1-AC6; Admin → Dictionaries with five tabs; Incoterms rename and deactivate only |
| MDM-02 Category tree and item catalogue | done | AC1-AC6; Admin → Categories (tree, add child, licence flag) and Items (search, category filter) |
| PLN-01 Plan lines | done | AC1-AC5; planned, committed, remaining; add, edit, close for the Admin only |
| PR-01 Create a PR from the catalogue | done | AC1-AC7; items of the plan line's category and its children; live estimated value; plan warning |
| PR-02 Approve, return or reject | done | AC1-AC5; no decision on one's own PR (#83); comment in History; PS notified on approval |

Master data, plan lines and PRs are written only through database functions (the Slice 2 direct-write
policies were dropped), so each rule and message is checked in one place. Home cards: "N PRs to approve"
(Approver, own PRs excluded), "N PRs returned to you" (Requester), "N approved PRs ready for sourcing" (PS).

### Verified

- `npm test`: 70 unit tests (adds dictionary, item and plan-line checks, PR line rules, estimated value
  with the demo figures, plan excess, Role Matrix menus for the new sections).
- `npm run test:rls`: 94 tests on vms-dev (21 new): Admin-only writes and no direct writes; name and code
  uniqueness in any case; entries in use cannot be deleted; deactivated currency kept only where already
  used (bank account and guarantee); category with children; plan readers (not the Committee Member or a
  vendor); draft privacy; line rules on Save; Submit notifications; committed and remaining; return with
  comment in History; closed plan line; own-PR refusal; approve, reject final; plan excess 510.00.
- Click-through in Edge at 1280 px on the dev server (vms-dev), 42 checks across the five stories; the
  Slice 2 click-through (39 checks) passes again with the currency dropdowns from the dictionary.
- Slice 2 click-through on the production URL (12 checks): register, approve as Nigar, Beta Trade's card.

### Open issues

6. **Test vendor left on vms-prod.** The Slice 2 production click-through registered "Alpha Agro UI …"
   (e-mail `ui2-alpha-…@rls.test`, status APPROVED). Its login is banned, but the vendor row and its user
   stay, because their audit entries reference them and the audit log is immutable. Removing them means
   deleting those audit rows on vms-prod. **Decision of 12 Nov 2026:** keep the test vendor on vms-prod; DEMO-02's
   reset removes it later; no audit rows are deleted on vms-prod.

## Slice 4 (12 Nov 2026)

Changes agreed on 12 Nov 2026: every upload goes browser to Storage with a signed upload URL (the file body no longer
passes through a Vercel function); the server then checks first bytes, type and size and writes the file row (all Slice 2
uploads retrofitted); RFQ-01 AC4: the deadline is prefilled at creation and, if the specialist did not change it,
recalculated at Publish from the publish time, a deadline set by hand must be later than now; new error texts
(RFQ-01 AC4/AC5, RFQ-02 AC3/AC5, RFQ-06 AC1/AC2) and the SSP limit taken from the setting. The deadline job runs every
minute. The reason entered on Continue is stored in `sourcing.low_competition_reason`.

| Story | Status | Notes |
| --- | --- | --- |
| RFQ-01 Start sourcing, RFQ or Tender by value | done | AC1-AC7; Start sourcing on an APPROVED PR, type and minimum from the Admin settings, invitations from the AVL (standing, grade, category or parent), vendors may be removed |
| RFQ-02 Vendor answers, sealed proposal | done | AC1-AC9; invitation list and page, decline with a reason, proposal with Incoterm, terms and VAT, resubmit, withdraw; vendors read only through functions |
| RFQ-04 Deadline below the minimum | done | AC1-AC6; job closes within 1 minute, Tender goes to AWAITING_OPENING, RFQ and SSP to COMPARISON; Extend (max 2), Continue (reason), Cancel |
| RFQ-06 Single Source Purchase | partial | AC1-AC5 done; AC6-AC7 (comparison, committee label) come with Slices 5-6 |

### Verified

- `npm test`: 70 unit tests.
- `npm run test:rls`: 122 tests on vms-dev, 28 new: signed-URL upload with a 9 MB file, 11 MB, a renamed .exe and a token
  outside staging/; bands and the Tender threshold at their boundaries; deadline rules; invitations only to the AVL; vendor
  isolation; decline, price, VAT and submit rules; resubmit and withdraw; sealed proposals per internal role while OPEN and
  for a Tender at AWAITING_OPENING; the job, locking after the deadline, extend (limit 2), continue, cancel, the 24-hour
  reminder; SSP rules; audit entries, with System for the job.
- Click-through on vms-dev, done by the BA on 12 Nov 2026: start sourcing as a Tender, publish, Beta Trade accepted and
  submitted, Gamma declined, the specialist sees the count only. The deadline actions are covered by the workflow test.
- vms-prod: migrations `20261112100000` and `20261112110000` applied on 12 Nov 2026; read-only check shows the same
  15 public and 10 internal functions, the `deadline_prefilled` column, the `vms-sourcing` (every minute) and `vms-daily`
  jobs and no `anon` grants as on vms-dev. Vercel deploy of `main` answers on the production URL.

### Open issues

7. **Test cleanup on vms-dev.** Tests remove their throwaway users with the audit trigger switched off for a moment
   (`tests/rls/helpers/dev-cleanup.ts`, `scripts/dev-cleanup-rls.ts`). Guards: only the .env.local project, never the
   production project; trigger switched back on in a finally block; never in a migration.
8. **A Tender waits at AWAITING_OPENING until Slice 5 (CMT-04).** Cancel works from there; Slice 5 must close an open
   OPENING vote when the sourcing is cancelled.
9. Staged uploads that no action claims stay under `staging/` in the bucket; no cleanup job is built.
10. vms-prod migrated for Slice 4 on 12 Nov 2026. Run `db:push` with `.env.production.local` before every push that
    brings a new migration.

## Slice 5 (13 Nov 2026)

Answers of 12 Nov 2026 that shaped the slice, and the backlog patched to match (CMT-02 AC7-AC8, CMT-03 AC2, CMT-04 AC4,
RFQ-04 AC6, committee decision status table, ERD): a sourcing cancelled while its OPENING vote is open closes that decision
as NO_DECISION with `result_rule` SOURCING_CANCELLED (a rule value, not a status), the cancellation reason kept in
`decision.close_reason`, minutes created, audit reason "Sourcing cancelled"; no eligible voter left gives NO_DECISION
"No quorum"; Reopen vote works after NO_DECISION and after a REJECTED OPENING decision (reason required, shown to the
members, stored in `decision.reopen_reason`); WINNER and PO reopen only after NO_DECISION; a decision closed by a cancelled
sourcing cannot be reopened. New columns on `decision`: `reopened_from_id`, `reopen_reason`, `close_reason`.

| Story | Status | Notes |
| --- | --- | --- |
| CMT-01 Admin configures the committee | done | AC1-AC3; Admin → Committee (members from the Committee Member users, one Chair, voting period in business days); demo committee seeded by `db:seed` (Elchin Karimov Chair, Sevinj Guliyeva, Tural Ismayilov) |
| CMT-02 Committee votes | done for OPENING, engine ready for WINNER and PO | AC1, AC4-AC8; package for WINNER and PO comes with Slices 6 and 7 (AC2, AC3, AC9, AC10 not started: their triggers and outcomes live there) |
| CMT-03 Numbered minutes | done | AC1-AC5; MIN-YYYY-NNN on every closed decision, screen, English PDF download |
| CMT-04 Tender opening | done except AC3 | AC1, AC2, AC4-AC6; AC3 (technical pass/fail, second envelope) is RFQ-05 in Slice 6 |

Decisions page (Committee Member, Procurement Specialist, Approver, Admin), "N decisions waiting for your vote" on the
Committee Member's home, Minutes list and record, Proposals tab on a Tender once the bids are open (names and technical
documents, no prices). Notifications `decision.opened` and `decision.closed`; job `vms-decisions` (every minute).
Outcome hook `app.apply_decision_outcome`: OPENING is real, WINNER and PO do nothing yet (Slices 6 and 7).

### Verified

- `npm test`: 84 unit tests (adds the committee rules with the Calculation Rules examples: eligible voters, quorum 2 of 3 and
  1 of 3, 2-1 majority, 2-2 with the Chair, tie without the Chair, business-day deadline Thu 12 Nov 10:00 -> Tue 17 Nov 10:00,
  odd committee size; the PDF builds with Azerbaijani letters and long comments).
- `npm run test:rls`: 23 new tests on vms-dev (committee_save rules and roles; AC3 voter snapshot; owner never a voter;
  Against needs a comment; vote cannot change; votes hidden from members, owner, Admin, Approver until close; majority, conflict,
  Chair's casting vote, tie without the Chair, no quorum at the deadline, no eligible voter; vote after the deadline; Reopen
  rules; minutes numbers, content, roles, immutability even for the service key; Tender at AWAITING_OPENING with a decision,
  package without prices, approved opening opens names and documents but not prices, rejected opening reopened with a reason,
  cancel closes the open vote with minutes, Continue below the minimum, an RFQ never gets an opening decision).
  The demo committee is backed up before the test run and put back afterwards.

Committee Member read access to sourcing records (read-only, confirmed 12 Nov 2026): section `sourcing` now lists the Committee Member;
the Role Matrix has the row "View a sourcing record, read-only". Deployed: `main` at f95b096, Vercel deployment completed (green).

### Production check (12 Nov 2026)

- API as `anon`: decision, voter, minutes and committee tables and the committee, vote and minutes functions refused.
- Vendor Beta Trade: 0 decisions, 0 minutes. Elchin: sees the 3 committee members, 0 decisions (none opened on production yet).
- Browser smoke check of the production pages (Admin → Committee, Decisions, Minutes) not done: the production URL is not in the
  repo and the Vercel preview hostnames sit behind SSO.

### Open issues

11. **Committee tests touch the live demo committee on vms-dev** (saved and restored in `beforeAll` / `afterAll`). If a run is
    killed half-way, run `npm run db:seed` to restore Elchin, Sevinj and Tural.
12. **Cleanup of test decisions** also switches off the minutes immutability trigger for a moment, in the same dev-only helper
    and under the same guards as the audit trigger (issue 7).
13. vms-prod migrated and seeded for Slice 5 on 12 Nov 2026 (the 4 migrations, then `ENV_FILE=.env.production.local npm run db:seed`;
    note that `db:seed` needs `ENV_FILE` too, otherwise it seeds vms-dev). Read-only check: committee Elchin (Chair), Sevinj, Tural with 3 business
    days; jobs `vms-decisions`, `vms-sourcing` (every minute, succeeding) and `vms-daily` active; the 17 committee, decision and minutes
    functions and their grants equal to vms-dev, none executable by `anon`. Run `db:push` with `.env.production.local` before every push
    that brings a new migration.
14. WINNER and PO decisions open only from Slices 6 and 7; until then a closed WINNER or PO decision changes nothing else
    (`app.apply_decision_outcome`).
15. A Tender already at AWAITING_OPENING from Slice 4 gets its OPENING decision in the CMT-04 migration only where a committee
    exists at that moment. Without a decision it cannot be opened (Reopen needs a decision); the owner can cancel it.

## Slice 2b: short account form and registration in steps (13 Nov 2026)

Backlog export of 31 stories (REG-01 short form, REG-07 new, REG-06 AC3 / AC6 / AC7, ERD `vendor_contact`, file kind
`proof_of_authority`). REG-02 and REG-05 keep their earlier wording. Migrations `20261114100000` (vendor_contact, RLS, file
kind, draft-friendly bank accounts, `register_vendor` without owners and accounts, contact functions, `registration_submit`
with the step rules), `20261114110000` (an ID card number already used is refused, REG-01 AC4) and `20261114120000` (the
per-type vendor field rules apply from SUBMITTED on).

| Story | Status | Notes |
| --- | --- | --- |
| REG-01 Vendor creates an account (short form) | done | AC1-AC8; 6 visible fields; confirmed by the server, signed in, DRAFT; "Incomplete registrations" tab for the specialist (read-only; DRAFT never in the review queue) |
| REG-07 Vendor completes the registration in steps | done | AC1-AC11; checklist with progress bar and Continue; Company details, Owners, Contact persons, Bank accounts, Documents, Review and submit; read-only when SUBMITTED; RETURNED comment on top |
| REG-06 contact persons (AC3, AC6, AC7) | done | contact persons on Profile (add, edit, remove, always one legal representative with a proof file for companies); vendor card shows them with the proof file |

Existing vendors got their first contact person (primary) from `contact_person`, `phone` and `contact_email`. Beta Trade and
Gamma Supply have a legal representative with a sample proof file (`db:seed` uploads it). The legal-representative rule applies
at Submit; SUBMITTED and APPROVED vendors keep working.

### Decisions and deviations to confirm

- Answered 13 Nov 2026 (REG-07 AC8 patched in the backlog): Save and continue opens the next step even if the step is incomplete
  (it stays In progress and shows its messages when opened again); Back saves the same way. Owner or bank rows that cannot be
  stored (incomplete, IBAN format, shares over 100%) ask "Some rows are incomplete and will not be saved. Continue?" first; only
  complete rows are stored. A rejected file (type or size) keeps the vendor on the Documents step.
- Additional contact persons are information only (no logins). Editing the primary contact keeps the sign-in e-mail; its name
  and phone also update `vendor.contact_person` and `vendor.phone`.
- Contact changes write no `audit_entry` (it records status changes only; no new statuses, CLAUDE.md rule 9).
- Labels "Qualification" and "Categories" on the locked cards: accepted 13 Nov 2026.
- Every step form uses plain named fields, JSON for owners and bank accounts, and the signed-URL file inputs, so Slice 8's
  Fill sample can prefill them.

### Verified

- `npm test`: 95 unit tests (adds the account form and the REG-07 step rules: legal representative, Individual exception, bank
  account, owners, documents, statuses and progress).
- `npm run test:rls`: 165 tests on vms-dev, all pass (13 Nov 2026, after the fix below). New file `registration.rls.test.ts` (21 tests, two vendors): short-form
  account, DRAFT never in the review queue, `vendor_contact` and proof files isolated per vendor, no direct writes, contact rules,
  draft bank saves, Submit step by step, read-only after Submit, Individual exception, last legal representative after approval.
  The sealed-proposals test (`sourcing.rls.test.ts`, RFQ-02 AC8) failed on leftover data (two submitted proposals of the opened
  tender SRC-2026-0142 from the 12 Nov click-through). It now looks only at its own sourcing and proposals, and the leftover
  tender with its decision and minutes was removed from vms-dev with the guarded helper (`removeSourcingByNumber`, script
  `scripts/dev-cleanup-sourcing.ts`, dev project only). The PR it came from was not touched.
- Click-through in Edge at 1280 px on the dev server (vms-dev): create account, warning and checklist, empty step shows messages,
  company details, owners, legal representative refused without proof then saved with a PDF, bank account, charter, Submit,
  read-only steps, as Nigar: not under Incomplete registrations, vendor card shows the contact and proof file, Approve.
  The click-through found and fixed one bug (controlled checkbox and radios lost their state after a failed save).
- vms-prod: 3 migrations and the seed applied; 6 vendors, 6 primary contacts; Beta Trade and Gamma Supply have a legal
  representative with a proof file; RLS on; no `anon` access to the table or the new functions.

- Vercel: https://vms-demo-rho.vercel.app/register answers 200 and shows the short form (checked read-only, 13 Nov 2026).
- The click-through was repeated after the AC8 change (next step opens while incomplete, messages on return, confirmation for an
  incomplete bank row, only the complete account saved).

### Open issues

16. Test vendors of the click-through were removed from vms-dev. The helper `removeTestData` does not delete `file` rows that
    real uploads attach to a test user (`uploaded_by`); that was done by hand this time.

## Slice 6 (13 Nov 2026)

Backlog export of 13 Nov 2026 (e-Procurement rename), patched to match the answers of 13 Nov: `decision.package` in the ERD,
the tie rule (RFQ-05 AC4), one low-competition reason per sourcing (RFQ-05 AC5, demo step 7), the Q&A file stays with the
specialist (RFQ-03 AC2), the shared-owner flag in the comparison header (RFQ-05 AC3), REG-07 AC8 worded as the code works.
Migrations `20261115100000_qa`, `20261115110000_evaluation`, `20261115120000_extra_costs`, `20261115130000_final_offer`.

| Story | Status | Notes |
| --- | --- | --- |
| RFQ-03 Q&A | done | AC1-AC6; vendor asks (2,000 characters, optional file for the specialist only), specialist publishes with an editable text, clarification without a question, original in History (audit reason) |
| RFQ-05 Evaluation, comparison, proposed winner | done | AC1-AC7; pass/fail without prices, last mark confirms and opens PASSED prices; comparison as in the BA mockup; default winner, justification, tie rule; line cancel; low-competition reason; Send to committee |
| RFQ-06 SSP | done | AC6-AC7 added: the vendor wins every priced line, unpriced lines are cancelled; "Single Source Purchase" label, justification and files in the winner decision |
| RFQ-07 Extra costs | done | AC1-AC5; Customs, Delivery, Insurance, Other per unit; recalculated default winner and "No longer the lowest evaluated price"; locked from IN_COMMITTEE |
| RFQ-08 Final offer | done | AC1-AC7; chosen vendors only, never higher, no response keeps the price, hidden until the round closes (deadline job), one round |
| CMT-02 WINNER decision | AC2, AC9 done | package frozen in `decision.package` at Send and shown as frozen (Reopen keeps it); APPROVED -> WINNER_APPROVED; REJECTED -> COMPARISON with comments, rejected winners excluded per line. PO decisions (AC3, AC10) come with Slice 7 |
| CMT-04 AC3 | done | second envelope at the end of the technical evaluation |

### Decisions and deviations to confirm

- A DISQUALIFIED mark is final (the Status Transition Model has no DISQUALIFIED -> PASSED); PASSED can still become DISQUALIFIED.
- Prices of a proposal disqualified in COMPARISON are hidden from then on (`app.prices_visible` checks the status).
- `decision.package` is readable only through `decision_package`, and only by Procurement Specialist, Committee Member and Admin
  (column grants on `decision`); the Approver sees the decision without the comparison.
- Submit on the vendor's final-offer form needs at least one price; "Keep my previous prices" is the explicit no-change answer.
- After the last technical mark the page stays on the Proposals tab; the Comparison tab appears next to it.

### Verified

- `npm test`: 100 unit tests (adds comparison helpers with the backlog values and the 2-day default final-offer deadline).
- `npm run test:rls`: 181 tests on vms-dev, all pass. New file `comparison.rls.test.ts` (16 tests, four vendors, a throwaway
  committee, the demo committee restored): Q&A visibility and notifications; sealed prices per role during the technical
  evaluation and the final-offer round; 33.04 with 18% VAT -> 28.00; 29.50 + 1.00 = 30.50; 28.00 -> 28.50 refused, -> 27.50 allowed;
  tie -> earlier proposal; frozen package; Approver without prices; costs locked; APPROVED 2-1; REJECTED with exclusion; SSP.
- Click-through in Edge at 1280 px on the dev server (vms-dev), demo users: Q&A, Continue below the minimum, technical
  evaluation, comparison (Different terms, shared-owner flag, low-competition box), delivery cost, justification, final offer
  (higher price refused, 28.90 accepted, hidden until the round closes), Send to committee, WINNER package, vote 2-1 ->
  WINNER_APPROVED. It found two bugs, both fixed: empty optional values were sent as missing parameters, and React's form
  reset after a refused final offer emptied the typed price.
- vms-prod (13 Nov 2026): target checked as the production project (DB and API refs equal, not vms-dev), the 4 migrations
  applied; read-only check shows the same 12 new functions as vms-dev (authenticated only, no `anon`), `decision.package` not
  selectable, jobs `vms-sourcing`, `vms-decisions`, `vms-daily` active, `question_audit` trigger present.
- Vercel: `main` at e9cb23f, deployment completed (green). Production smoke check (read-only): /sign-in and /register 200
  with "e-Procurement", /sourcing and /decisions redirect to sign-in, `anon` refused on `sourcing_comparison`, `vendor_qa`,
  `final_offer_submit` and `award_line` (42501).

Confirmed by the BA on 13 Nov 2026: DISQUALIFIED is final (backlog RFQ-05 AC2 patched); the Approver sees the WINNER decision
but not the comparison.

### Open issues

17. Click-through sourcings SRC-2026-0209, 0243 and 0244 were removed from vms-dev with the guarded helper (13 Nov 2026). Their
    three PRs stay as they were (IN_SOURCING), as with the Slice 2b cleanup, until DEMO-02's reset.
18. `.claude/settings.local.json` (not in git): `GATEGUARD_EXEMPT_GLOBS` = `src/**,tests/**,docs/**`.

## Slice 7 (13 Nov 2026)

Backlog patched to match the answers of 13 Nov: PO-01 AC3 and the "PO created" notification (every Approver except the PR's
Requester **and the sourcing owner**), PO-02 AC3 and the Role Matrix row (message "You cannot approve a PO for your own request or
sourcing"), RFQ-04 AC6 (a sourcing that has a PO other than REJECTED or DECLINED_BY_VENDOR cannot be cancelled: "This sourcing already
has purchase orders; cancel its open lines instead"). Migration `20261116100000_purchase_orders` (ERD: `purchase_order.proposal_id`,
`vat_rate`, `winner_decision_id`).

| Story | Status | Notes |
| --- | --- | --- |
| PO-01 One PO per winning vendor | done | AC1-AC4; created by the WINNER APPROVED outcome from the ACTIVE award lines not yet on a PO; vendor's own price excluding VAT, VAT at the vendor's rate, no extra costs; PO list, record, Purchase orders tab on the sourcing |
| PO-02 Approver, then committee | done | AC1-AC4; own-PR and own-sourcing refusal; PO decision package with differences or "Same as the approved winner decision"; committee rejection returns only that PO's lines; Reopen after NO_DECISION only |
| PO-03 Vendor accepts or declines | done | AC1-AC5; own POs only, English PDF (e-Procurement header), Accept, Decline with a reason; completion and result notices |
| CMT-02 AC3, AC9, AC10 | done | WINNER and PO outcomes in `app.apply_decision_outcome` |

Rules as built (BA answers of 13 Nov): an ACCEPTED PO is never touched when another PO is rejected or declined; lines on a live PO are
locked in COMPARISON (no new winner, no cancel, no extra costs) and left out of the next winner package; Send to committee, the
frozen package and the next POs cover only the returned lines. Notification events added: `po.created`, `po.rejected`, `po.fullyApproved`,
`po.accepted`, `po.declined`, `sourcing.completed` (lines won) and `sourcing.notAwarded` (two events for the one "result notice").
Home: "N POs to approve" (Approver, own PRs and sourcings excluded), "N POs to accept" (vendor). The Requester reads the POs of own PRs.

### Decisions and deviations to confirm

- **COMPARISON -> COMPLETED** (confirmed by the BA on 13 Nov 2026, backlog Status Transition Model and PO-03 AC4 patched): the sourcing completes from COMPARISON when the owner cancels the last open line, or the last pending PO is accepted, with at least one ACCEPTED PO.
- Two result events (`sourcing.completed`, `sourcing.notAwarded`) accepted by the BA.
- Migration `20261116110000_po_respond_released`: a vendor answering its own PO that is not released yet gets `errors.noAccess`, like an unknown PO (it first got `statusChanged`, which told the vendor that the PO existed).
- A WINNER decision that closes while an earlier PO of the same sourcing was rejected sends lines without a winner straight back to COMPARISON.
- The PO's History tab is not shown to vendors (it would list internal steps).

### Verified

- `npm test`: 106 unit tests (adds PO totals 56,000.00 + 10,080.00 = 66,080.00, notification total as AZN, decision buttons for Requester and
  owner, PO PDF with Azerbaijani letters, menus per role).
- `npm run test:rls`: 201 tests on vms-dev, all pass. New `po.rls.test.ts` (19 tests, four vendors, three flows): PO per vendor with
  quantities, 20.00 not 21.00 (extra cost not used), VAT 36.00, terms, minutes link; notices without the Requester and the owner; no direct
  writes; readers per role; vendors see nothing before release and only their own after; own-PR and own-sourcing refusal; PO decision package
  (same, and forced differences); committee approve, reject (2-1) and NO_DECISION with Reopen (same package, REJECTED not reopenable);
  accept, decline with reason, re-award creating a PO only for the returned line; accepted PO untouched; locked lines; cancel refused with a
  live PO; completion by accepting and by cancelling the last open line; AWARDED / NOT_AWARDED and notices; audit entries.
- Click-through in Edge at 1280 px on the dev server (vms-dev, SRC-2026-0291, since removed): Approver card and PO (2,800.00 + 504.00 =
  3,304.00 AZN, vendor price 28.00, minutes link, no edit), Approve, committee vote on the PO decision, vendor card, own PO list, PDF
  download, Accept, other vendor sees none, sourcing and PR Completed. It found one bug, fixed: the new `purchase_order.winner_decision_id`
  made the `decision` -> `purchase_order` embed ambiguous, so the decision and minutes pages showed "no access"; the embeds now name their
  foreign key. The "result notice" text was not clicked (covered by the RLS test).
- vms-dev migrated. vms-prod migrated on 13 Nov 2026 (target checked first: DB and API ref `bxomavkbdppdbpdklkeg`, not the vms-dev ref): `20261116100000_purchase_orders` and `20261116110000_po_respond_released`.
- Vercel: `main` pushed (77c4431); production smoke check (read-only, https://vms-demo-rho.vercel.app): /sign-in and /register 200; /purchase-orders, /vendor/purchase-orders and /decisions redirect to sign-in (307); the PO PDF route answers 401 without a session; as `anon`, `po_list`, `po_view`, `po_decide` and `po_respond` and a direct read of `purchase_order` are refused (42501).

### Open issues

19. `removeTestData` now also removes POs (links to winner decisions cut first); the click-through sourcing was removed with
    `scripts/dev-cleanup-sourcing.ts`. The Slice 7 test data left on vms-dev: none.

## Style change: dark sidebar and compact density (13 Nov 2026)

Done through shared tokens and components, no behaviour, text or test change. Tokens `--sidebar*` and `--density-*`, `--control-h` in
`globals.css`; the `Table` components, `SidebarNav`, `AppSidebar`, `LogoMark` use, the main layout, the top bar, the comparison table,
`StatusBadge` (h-5, so a row with a badge is 37 px) and the form controls read them. One unlayered rule gives page stacks and tab panels the
14 px gap. CLAUDE.md Design has the new rules.

- Sidebar contrast: text 11.2:1, section labels 6.3:1, active item 7.9:1, product name 14.4:1. The white shield on the logo square
  (#2E8F85) is 3.9:1: a graphic, above the 3:1 that applies to graphics, below 4.5:1; the colours are the BA's.
- Form fields, buttons and selects were 32 px high; they are now 36 px (`--control-h`), the large button 40 px. Button sizes `xs` and `sm`
  (inline row actions, sort buttons in table headers) stay small.
- Verified: typecheck, 106 unit tests, production build; click-through in Edge at 1280 px on 12 pages (home, PO list and record, sourcing list
  and record with the comparison, vendors, decisions, minutes, decision record, vendor home and invitations): sidebar #0E2F2C, no right
  border, active item #1D5A54 white 600, rows 37 px, text 13 px, cells 8 x 12 px, page padding 16 / 32 px, prices 18 px, no horizontal
  overflow, nothing cut off.

## Vendor menu and bell badge (13 Nov 2026)

Commit 8c34814. REG-07 AC11 and REG-06 AC3 patched in the backlog. No change to the steps, the data or the RLS rules.

- The vendor menu shows "Registration" only while the registration is DRAFT, SUBMITTED, RETURNED or REJECTED (`sectionsFor(roles, vendorStatus)`
  in `src/lib/auth/sections.ts`, status read in the app layout). For an APPROVED vendor `/vendor/registration` redirects to the Profile, and the
  Registration step on the vendor home links to the Profile.
- The Profile has a "Registration history" tab that reuses `HistoryTab` (record type `vendor`).
- The bell badge shows "99+" above 99 unread (`bellBadge()`, unit-tested).
- Verified: typecheck, 108 unit tests, production build; click-through in Edge on the dev server (DRAFT vendor sees Registration; APPROVED vendor
  does not, is redirected to the Profile and finds the history there); production check as Beta Trade after the deploy: menu without
  Registration, redirect to `/vendor/profile`, history tab present. The 99+ badge was not seen on screen (needs more than 99 unread).
- Open: the click-through registered a throwaway vendor, "Click Test LLC …", on vms-dev.

## Redesign: light glass, Midnight Navy (14 Nov 2026)

Mockups: the design canvas boards "Midnight navy: Comparison / My tasks (specialist) / Vendor cabinet (draft) / Vendor home (approved) / Sign in".
Staged; each stage is committed so a new session can resume from here.

| Stage | Content | Status |
| --- | --- | --- |
| 1 | Tokens, fixed page layer, floating sidebar and top bar, logo, favicon, PDF accent #1D4E89 | done |
| 2 | Shared components: card, tabs (segmented), buttons, badges (sky for pending), table, dialog, popovers, inputs, alert, panels | done |
| 3 | Pages: sign-in and register, vendor home (draft and approved), My tasks per role (Specialist, Requester, Approver, Committee Member, Admin), comparison and record header (type pill) | done |
| 4 | Remaining screens through shared components, final sweep, screenshots against the boards, CLAUDE.md Design section, build and push | done (see Verified below) |

Contrast (computed, worst case = the surface over the lightest page colour #EDE9F8 and the darkest #A3BFE3, plus a dark brand button for
surfaces that sit over content):

- Sidebar rgba(15,32,56,0.84): text #E1E9F5 8.5:1, labels #A9BBD8 5.4:1, active item white 6.1:1. No change needed.
- Cards white 0.58: ink 12.1:1, muted #4A5961 5.65:1, brand ink 8.9:1, link 6.5:1. No change needed.
- Top bar: the mockup's 0.52 gives the role text 3.6:1 over a dark button (it is sticky over content). Raised to 0.72: 5.5:1.
- Dialog: the mockup's 0.5 gives muted text 2.7:1 over a dark button. Raised to 0.78: muted 4.9:1, ink 10.6:1.
- Popovers 0.88: muted 5.9:1. Solid table panels 0.88: muted 6.0:1.
- Badges: sky 7.3, amber 7.9, green 6.6, grade blue 7.5, grey 8.1, red 7.6. Button text white on #2A62A8 6.2:1.
- Fallbacks (prefers-reduced-transparency, prefers-contrast: more, no backdrop-filter): every glass token becomes a solid colour; no blur.

New UI strings (existing ones unchanged except one agreed rename): home greeting and waiting count, card labels and links, record-type pills,
Admin shortcut cards, Recent notifications; vendor home count-card hints, stage counts, grade validity sentence; registration approval note.
Rename: vendorHome.steps.questionnaire "Questionnaire" -> "Qualification". VOTING moved from amber to the sky tone (pending), as the brief lists it.
The status tone key `blue` is now `sky` in `src/lib/status.ts`.

Kept differences from the boards (and why):
- Top bar white 0.72 instead of 0.52 and dialogs 0.78 instead of 0.5: the mockup values fail 4.5:1 over content (numbers above).
- Input border rgba(23,38,43,0.45) instead of 0.2: 0.2 is 1.5:1; 0.45 is 2.7:1, the closest that still looks like glass.
- Sidebar keeps its menu icons (the boards have none): they are part of the existing menu.
- My tasks for the Specialist has five count cards (the boards show four): the extra card is Category applications, an existing story card.
  The unread-notification card is now the number in the greeting (its test id and text stay, visually hidden).
- Vendor draft cabinet shows two locked cards (Qualification, Categories), as the brief says; the board also shows Invitations and Purchase orders.
- Solid panels (tables, lists) use no blur at all instead of "little blur": at 88 % white it is invisible and costs scrolling frames.
- Page background blobs are radial gradients, not blur filters: same look, no GPU cost.
- The sticky top bar stays sticky (existing behaviour) so it needs the higher alpha above.

## Docs sync with the new backlog export (14 Nov 2026)

Docs only; no code, test or database change. `docs/backlog.md` replaced by the BA's latest export (32 stories: DEMO-03 added; new section
"Decisions, Assumptions And Open Questions": D-001 to D-019, A-014 and A-020 to A-025, Q-001 to Q-008). Other differences (RFQ-03 AC2, RFQ-04 AC6,
RFQ-05 AC2 to AC5, REG-06 AC3, REG-07 AC8, PO-03 AC4 and the COMPLETED row of the Status Transition Model, role matrix wording, scenario step 7,
ERD note) are wording or looser text; the code already behaves that way. DEMO-01 and DEMO-02 now name the buttons "Reset to scenario start"
and "Load populated demo data"; Slice 8 is not started, so nothing to change yet.

- PO-02 AC3 patched by hand in `docs/backlog.md`: the export had "You cannot approve a PO for your own request"; the file now reads "You cannot
  approve a PO for your own request or sourcing", which is what the code shows (`errors.ownPurchaseOrder`). The BA fixed this in the source and
  **will re-export later**; after that export, check that PO-02 AC3 keeps the "or sourcing" wording.

### Status summary

- Slices 0 to 7 done and live. Slice 7 went to production on 13 Nov 2026: vms-prod migrated (`20261116100000_purchase_orders`,
  `20261116110000_po_respond_released`), `main` deployed, read-only smoke check passed (commits 77c4431, 273a8b0).
- Vendor menu change (8c34814) and the redesign (stages 1 to 4, contrast numbers above) done.

### Open items

1. **Slice 8a** (DEMO-01, DEMO-02): demo bar, Fill sample, seed and reset: not started. **Slice 8b** (DEMO-03, populated demo data): not started.
2. **Node.js version on Vercel** should be 24.x; check the project setting (and `engines` in `package.json`, none today).
3. **Staged uploads**: files nobody claims stay under `staging/` in the bucket; no cleanup job (see Slice 5 open issue 9).
4. **Full RLS suite after the last migration** (`20261116110000_po_respond_released`) has not been run as one pass; run it on vms-dev.
5. **Throwaway vendor on vms-dev**: "Click Test LLC …" from the vendor menu click-through; delete it.
6. Re-export of the backlog by the BA (PO-02 AC3 message, above).
7. Confirm A-020 to A-025 and the open questions Q-001 to Q-008 with the client before a real roll-out.
