# e-Procurement: rules for Claude Code

e-Procurement is a generic, 1C-free procurement platform. This repo holds the MVP for the management demo (target 13 Nov 2026).
The single source of truth for scope and acceptance criteria is `docs/backlog.md` (23 stories, Given/When/Then).
If this file and the backlog disagree, the backlog wins; ask the BA.

## Stack
- Next.js (App Router, TypeScript), deployed on Vercel from the `main` branch.
- Supabase: Postgres with row-level security, Auth (e-mail + password), Storage (private bucket), Realtime (notification bell), pg_cron (deadline and voting jobs).
- Tailwind CSS. npm as package manager.
- Database changes only as SQL migrations in `supabase/migrations/`, RLS policies in the same migration as the table.

## Non-negotiable rules
1. No 1C, ERP, e-mail, SMS or OTP integration in this release. No confirmation e-mails either: the server creates every account (Admin-created users and self-registered vendors) as already confirmed.
2. English UI only, but every UI string lives in `messages/en.json`; no hard-coded UI text.
3. Desktop only (1280 px and wider).
4. Row-level security on every table. A vendor reads only its own records (NFR-001).
5. Sealed proposals: before the deadline no internal user gets prices, vendor names or files from the UI or the API (NFR-002).
6. Secrets never go into git. `.env.local` is in `.gitignore`. The Supabase secret key is used only in server code.
7. Every top-level table has `company_id`.
8. Every status change writes an `audit_entry` row (NFR-011).
9. Status names exactly as in the backlog's Status Transition Model. Do not invent new statuses.
10. Separation of duties (#83): nobody approves their own PR or a PO for their own PR; the sourcing owner never votes in that sourcing's committee decisions.
11. Files: PDF, JPG, PNG, DOCX, XLSX only, max 10 MB, checked on the server.
12. Locale: Asia/Baku time zone, dates like `06 Nov 2026`, amounts like `60,000.00 AZN`, currency AZN only.
13. Demo tools (role switcher, Fill sample, End deadline now, Reset demo) work only when `DEMO_MODE=true`; otherwise their endpoints return "Not available".

## Design
- UI kit: shadcn/ui on Tailwind, lucide icons, Inter font. Clean enterprise look.
- Colors: white and light-grey surfaces, one brand colour (deep teal), neutral greys.
- Layout: left sidebar (logo "e-Procurement", menu by role), top bar (page title,
  bell with unread count, user name and role). Demo bar slot above the top bar.
- Home page for every role = "My tasks": cards with counts of items waiting for
  this user (e.g. "3 PRs to approve"), then the list.
- Record pages: header with number, status badge and main actions on the right;
  tabs Details, Files, History (audit), and Q&A where relevant.
- Status badges: grey = draft, blue = in progress or pending, amber = returned
  or waiting for a decision, green = approved or completed, red = rejected or cancelled.
- Tables: sortable columns, amounts right-aligned as 60,000.00 AZN.
- Forms: two columns, required fields marked, the backlog's exact error
  messages under the field.
- Vendor portal: same app, simpler menu, with a progress checklist
  (Registration, Questionnaire, Categories) and a Profile page.
- Every empty list shows one sentence and the main action button.

## Build order (vertical slices)
Each slice ends deployed and clickable on the Vercel link. Never break an earlier slice.

| Slice | Stories | Done when |
| --- | --- | --- |
| 0 | Setup | Next.js app runs locally and on Vercel; Supabase connected; migrations and seed scripts exist |
| 1 | PLT-01, PLT-02 | Sign-in, 6 roles, role-based menu, admin user management, audit trail, bell |
| 2 | REG-01 to REG-06 | Vendor registers, gets approved, fills questionnaire and gets an A–D grade, keeps a profile with certificates, applies for a category, joins the AVL; vendor card (categories seeded as a tree) |
| 3 | MDM-01, MDM-02, PLN-01, PR-01, PR-02 | Dictionaries as dropdowns, category tree and item catalogue, plan lines, PR from catalogue, PR approval |
| 4 | RFQ-01, RFQ-02, RFQ-04, RFQ-06 | Sourcing type by value or SSP, invitations, sealed proposals with Incoterm, terms and VAT, deadline job and its three actions |
| 5 | CMT-01 to CMT-04 | Committee setup, voting engine (opening, winner, PO decisions), numbered minutes PDF, tender opening approved by the committee |
| 6 | RFQ-03, RFQ-05, RFQ-07, RFQ-08 | Q&A, technical pass/fail (two envelopes), comparison with extra costs and evaluated price, final offer round, proposed winner and winner vote |
| 7 | PO-01 to PO-03 | PO per winning vendor, Approver then committee, vendor accepts or declines |
| 8 | DEMO-01, DEMO-02 | Demo bar, Fill sample, seed and reset; full scenario rehearsed |

The data model for every slice is in place from Slice 2 (all ERD tables, RLS and status audit); each slice adds its screens and the functions that change status.

Cut line when late: the "If time allows" list in the backlog's Scope section goes first.

## How to work
- Before a slice: read its stories in `docs/backlog.md`, list the acceptance criteria you will implement, and list any assumption you have to make. Do not invent business rules; ask.
- Formulas come from the backlog's Calculation Rules section, test values included.
- Tests per story: the happy path plus at least one negative case from its criteria. RLS tests with two vendor accounts.
- Commit per story with the story ID in the message, e.g. `PR-01: create PR from catalogue`.
- After each slice update `docs/PROGRESS.md`: story, status (done / partial / not started), open issues.
- Seed data must be synthetic only (see Demo Scenario Data in the backlog).

## Open questions (ask the BA before you depend on them)
- Product name (working name: e-Procurement).
- Tender threshold 50,000 AZN and RFQ bands 5,000 / 15,000 AZN still need client confirmation; keep them as Admin settings.
- Proposed rules not yet confirmed: plan overrun is a warning only; one category per PR; only the sourcing owner acts on a sourcing; committee members cannot see other votes until the decision closes; one PO per winning vendor.
