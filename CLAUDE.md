# e-Procurement: rules for Claude Code

e-Procurement is a generic, 1C-free procurement platform. The product is called e-Procurement; the look is the Midnight Navy palette in the
light glass style (see Design). This repo holds the MVP for the management demo (date to confirm, Q-003).
The single source of truth for scope and acceptance criteria is `docs/backlog.md` (34 stories, Given/When/Then).
If this file and the backlog disagree, the backlog wins; ask the BA.
Confirmed decisions (D-), assumptions in force (A-) and open questions (Q-) are in the backlog section "Decisions, Assumptions And Open Questions".

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
- Colors: light glass surfaces on a pale blue page, one brand colour (Midnight Navy #1D4E89), neutral greys.
- Layout: floating left sidebar (logo "e-Procurement", menu by role), top bar (page title,
  bell with unread count, user name and role). Demo bar slot above the top bar.
- Home page for every role = "My tasks": cards with counts of items waiting for
  this user (e.g. "3 PRs to approve"), then the list.
- Record pages: header with number, status badge and main actions on the right;
  tabs Details, Files, History (audit), and Q&A where relevant.
- Status badges: grey = draft, sky = in progress or pending, amber = returned
  or waiting for a decision, green = approved or completed, red = rejected or cancelled.
- Tables: sortable columns, amounts right-aligned as 60,000.00 AZN.
- Forms: two columns, required fields marked, the backlog's exact error
  messages under the field.
- Vendor portal: same app, simpler menu, with a progress checklist
  (Registration, Qualification, Categories) and a Profile page.
- Every empty list shows one sentence and the main action button.
- Style (14 Nov 2026): "light glass", Midnight Navy palette, applied through shared tokens and components in `globals.css`, never
  screen by screen. The boards "Midnight navy: ..." on the design canvas are the reference for look and layout.
  - Palette tokens: primary #1D4E89; button gradient #2A62A8 to #1D4E89 with glow rgba(29,78,137,0.35); links #1D4E89; dark text on tint
    #143A68; tint #E4EEFB; focus ring #3E78C2 (2 px, offset 2 px); muted text #4A5961. Page background is a fixed layer
    (`body::before`): gradient 135deg #DCE7F6 to #E6EEFB to #EDE9F8 plus three soft blobs. No teal anywhere (favicon, logo, PDFs use #1D4E89).
  - Glass (translucent, blurred, thin light border, soft shadow, faint inner highlight) is for: the floating sidebar (16 px from the edges,
    224 px wide, radius 26, rgba(15,32,56,0.84), labels #A9BBD8, text #E1E9F5, active item rgba(255,255,255,0.18)), the top bar pill (radius
    22, white 0.72), cards (radius 22, white 0.58, class `surface-glass` or the `Card` component), notice banners (`surface-warning`),
    tabs (segmented control), dialogs (radius 28, white 0.78), popovers (white 0.88) and the demo bar slot. Content starts 256 px from the left
    and keeps 16 px from the other edges.
  - Solid (about 88 % white, no blur) is for data tables and lists (`surface-solid`), and form inputs (86 % white, border rgba(23,38,43,0.45)).
    Never put `backdrop-filter` on table rows, cells or long scrolling lists; blur radii stay 20 to 30 px.
  - Buttons: primary = gradient with glow (`brand-button`), secondary = glass pill (`surface-pill`); radius 20 px, height 36 px (40 px large).
    Sizes `xs` and `sm` stay small for inline row actions.
  - Status badges: pending / in progress (PENDING_APPROVAL, SUBMITTED, COMPARISON, TECHNICAL_EVALUATION, VOTING and the like) are sky
    (#E0F2F7 on #0B5566), never the brand blue; draft grey, returned and waiting amber, approved green, rejected red; grade badges brand blue.
  - Contrast: every text keeps 4.5:1 over the worst case of its surface (the lightest and the darkest page colour, and a dark button for
    surfaces that sit over content). The alphas above are measured values; do not lower them. Fallbacks are in `globals.css`:
    `prefers-reduced-transparency`, `prefers-contrast: more` and no `backdrop-filter` turn every glass token into a solid colour.
  - Compact density stays, tokens `--density-*`: table rows about 36 px, table text 13 px, cell padding 8 x 12 px, gap between cards, tables and
    panels 14 px, big prices in the comparison table 18 px. A page stack `main > .flex-col` and tab panels get the 14 px gap from one rule, so do
    not set another gap on them. Form fields and buttons stay at least 36 px high (`--control-h`).

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
| 7b | PLT-03, REG-08 | Change and reset passwords (temporary password shown once, must change password); vendor change requests for core company data approved by a Procurement Specialist; "Registration rejected" page and Reopen; "Profile updated" log |
| 8a | DEMO-01, DEMO-02 | Demo bar, Fill sample, seed and reset to scenario start; full scenario rehearsed |
| 8b | DEMO-03 | Second load mode: populated demo data, created through the application's own functions, with a self-check |

Status (17 Nov 2026): Slices 0 to 7 done and live on Vercel; the light glass redesign done; Slice 7b (PLT-03, REG-08) done on vms-dev and deployed after the production step in `docs/PROGRESS.md`; Slice 8a (DEMO-01, DEMO-02) and 8b (DEMO-03) not
started. Open items are in `docs/PROGRESS.md`.

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
The full list is Q-001 to Q-008 in the backlog. Main ones:
- Product name e-Procurement: chosen, management to confirm (Q-002).
- Tender threshold 50,000 AZN, RFQ bands 5,000 / 15,000 AZN, single-source limit 1,000 AZN and grade bands need client confirmation; keep them as Admin settings (Q-004).
- Assumptions A-020 to A-025 (plan overrun is a warning only; one category per PR; only the sourcing owner acts; committee members see who voted but not how until the decision closes; voting business days are Monday to Friday; an Individual vendor needs no legal representative) are in force but unconfirmed.
