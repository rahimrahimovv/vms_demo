# e-Procurement: rules for Claude Code

e-Procurement is a generic, 1C-free procurement platform. The product is called e-Procurement; the look is the shadcn/ui new-york style,
monochrome (see Design). This repo holds the MVP for the management demo (date to confirm, Q-003).
The single source of truth for scope and acceptance criteria is `docs/backlog.md` (39 stories, Given/When/Then).
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
7. Every top-level table has `company_id`. One deliberate exception: the one-row `demo_flag` (the guard of the developer commands `demo:reset` and
   `demo:load`) carries none; it is infrastructure, not business data.
8. Every status change writes an `audit_entry` row (NFR-011).
9. Status names exactly as in the backlog's Status Transition Model. Do not invent new statuses.
10. Separation of duties (#83): nobody approves their own PR or a PO for their own PR; the sourcing owner never votes in that sourcing's committee decisions.
11. Files: PDF, JPG, PNG, DOCX, XLSX only, max 10 MB, checked on the server.
12. Locale: Asia/Baku time zone, dates like `06 Nov 2026`, amounts like `60,000.00 AZN`, currency AZN only.
13. There are no demo tools in the app (D-024): no demo page, bar, Switch user or Lock, no endpoint or server action that signs in without a password.
    Resetting and loading demo data are developer commands (`npm run demo:reset`, `npm run demo:load`), never a web button, endpoint or server action
    (D-023); each needs `demo_flag` enabled in that database and the last 6 characters of the project reference typed (or `--unattended` when
    `DEMO_UNATTENDED_REF` in `.env.local` equals the development project reference; never in production files or on Vercel).

## Design
- Style (D-015): the shadcn/ui "new-york" design system, `docs/DESIGN.md` is the specification and the nine "shadcn style" boards on the
  design canvas are the reference for layout and look. Monochrome and flat: a black primary button, white cards with a 1 px border and a
  soft shadow, a light sidebar fixed to the left edge, Geist type, blue only in charts, statuses as outline badges with a small coloured dot.
  Light theme only; no dark theme.
- UI kit: shadcn/ui on Tailwind, lucide icons (16 px, stroke 1.5, no emoji), Geist and Geist Mono (`next/font/google`).
- Everything goes through shared tokens and components in `src/app/globals.css` and `src/components/ui`, never screen by screen. No hard-coded
  colours in pages, except the chart ramp.
- Tokens use the shadcn names (background, foreground, card, popover, muted, muted-foreground, primary, secondary, accent, destructive,
  border, input, ring, sidebar-*). Page background white, text #0A0A0A, primary #000000 with #FAFAFA text. Radius base 10 px: cards 14 px,
  buttons and inputs 8 px, tab track 10 px, badges full. Shadows: xs on controls, sm on cards, md on popovers, lg on dialogs. No gradients, no
  glow, no blur, no translucent surfaces, no coloured shadows.
- Contrast decisions (measured): muted text #737373 on white (4.74:1); on a muted fill (table header, tab track) use `--muted-on-muted`
  #666666 (5.27:1, #737373 gives 4.35:1). Focus ring #525252 (7.8:1 against white), drawn 3 px at 50% with the border shift to the ring colour.
  Field border `--input` #8F8F8F (3.23:1 against white). Colour is never the only signal: a status dot always comes with its word.
- Type: body 14 px, inputs 16 px, card titles 16 px/600, page titles 24 px/600, KPI values 30 px; weights 400, 500 and 600 only; no italics in
  the chrome; tracking-tight only on large display headings.
- Layout: sidebar fixed to the left edge, 256 px, #FAFAFA with a right border, group labels in muted text, the active item with the muted fill.
  Top bar: a plain 56 px row with a bottom border, breadcrumb on the left, bell and user on the right. Content padding 32 px on a white page.
- Home page for every role = "My tasks": cards with counts of items waiting for this user (e.g. "3 PRs to approve"), then the list.
- Record pages: header with number, status badge and main actions on the right; tabs Details, Files, History (audit), and Q&A where relevant.
- Buttons: primary (black), secondary, outline, ghost, link, destructive; heights 32, 36 and 40 px (`xs` stays for inline row actions).
  Inputs 36 px, 1 px `input` border, shadow-xs, 16 px text; invalid = destructive border and ring.
- Status badges (`StatusBadge`, `ToneChip`): an outline badge with a 6 px dot. Dot colours: green (approved, active, qualified, valid,
  completed, awarded), blue #155DFC (pending, open, in progress, voting, comparison), amber #D97706 (waiting, expiring, warning, below minimum),
  grey #A3A3A3 (draft, cancelled, not graded). The destructive (red) badge only for rejected, disqualified and expired. Grade and type badges
  are secondary or outline badges without a dot.
- Tables: muted header fill with muted text, 40 px header row, 44 px rows, 1 px row borders, numbers tabular and right-aligned as
  60,000.00 AZN; sortable columns. Tabs: the muted track, the active trigger a white pill with shadow-sm. Cards: title 16/24 600, description
  14 muted, padding 24 px (16 to 20 px on the Dashboard and the vendor card so that they fit one screen at 1440 x 900).
- Alerts and banners: the `Alert` component (border, a leading icon, title and description); chips inside it are outline badges.
- Charts and the grade ring: only the blue ramp #8EC5FF, #3080FF, #155DFC, #1447E6, #193CB8 plus neutral greys; in the comparison the proposed
  winner is #155DFC, the other offers #8EC5FF and the estimate a dashed line.
- Logo and PDFs: a monochrome mark (white "e" on a black square); the accent of the minutes, PO and receipt PDFs is #171717.
- Forms: two columns, required fields marked, the backlog's exact error messages under the field.
- Vendor portal: same app, simpler menu, with a progress checklist (Registration, Qualification, Categories) and a Profile page.
- Every empty list shows one sentence and the main action button.
- Desktop only; `prefers-contrast: more` and forced colours darken the borders; `prefers-reduced-motion` stops dialog animation.

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
| 8a | DEMO-01, DEMO-02 | `npm run demo:reset` (seed and reset to scenario start, a developer command); full scenario rehearsed |
| 8b | DEMO-03 | `npm run demo:load`: populated demo data, created through the application's own functions, with a self-check |

Status (18 Nov 2026): Slices 0 to 7 done and live on Vercel; the shadcn/ui redesign (D-015 changed, docs/DESIGN.md) in progress, see `docs/PROGRESS.md`; Slice 7b (PLT-03, REG-08) done on vms-dev and deployed after the production step in `docs/PROGRESS.md`; Slice 8a (DEMO-01, DEMO-02) built on vms-dev,
not yet on vms-prod or `main` on Vercel (see `docs/PROGRESS.md`); 8b (DEMO-03, `npm run demo:load`) built on vms-dev, first real run pending. Open items are in `docs/PROGRESS.md`.

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
