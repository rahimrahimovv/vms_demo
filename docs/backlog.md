# VMS Core (1C-free): E2E Procurement User Story Backlog

Nov 6, 2026 · @Rahim Rahimov

VMS Core is a generic, 1C-free procurement platform; this backlog covers the MVP that runs one complete procurement, from vendor registration to a vendor-accepted purchase order, for the management demo.

**Document type:** User Story Backlog · **Audience:** Developers, QA, Designers, Sprint Team · **Owner:** @Rahim Rahimov · **Last updated:** Nov 6, 2026

## Epic Overview

### Backlog Hierarchy

```
VMS-CORE (Epic) - E2E procurement MVP, 30 stories
├── PLT  Platform
│   ├── PLT-01  Sign in and see only your role's screens
│   └── PLT-02  Get in-app notifications; keep an audit trail
├── MDM  Master data
│   ├── MDM-01  Admin maintains Incoterms, payment terms, delivery places, modes, currencies
│   └── MDM-02  Admin maintains the category tree and item catalogue
├── REG  Vendor onboarding
│   ├── REG-01  Vendor registers (local, individual, foreign)
│   ├── REG-02  Specialist approves, returns or rejects registration
│   ├── REG-03  Vendor applies for categories
│   ├── REG-04  Specialist qualifies category; vendor joins AVL
│   ├── REG-05  Vendor fills questionnaire; specialist confirms A–D grade
│   └── REG-06  Vendor keeps a company profile; buyers see the vendor card
├── PLN  Planning
│   └── PLN-01  Admin maintains annual plan lines
├── PR   Purchase requisition
│   ├── PR-01   Requester creates a PR from the catalogue
│   └── PR-02   Approver approves, returns or rejects the PR
├── RFQ  Sourcing (RFQ and Tender)
│   ├── RFQ-01  Specialist starts sourcing; type set by value
│   ├── RFQ-02  Vendor answers invitation, submits sealed proposal
│   ├── RFQ-03  Vendors ask, specialist answers to all (Q&A)
│   ├── RFQ-04  Specialist handles a deadline below minimum
│   ├── RFQ-05  Specialist evaluates and proposes the winner
│   ├── RFQ-06  Specialist runs a Single Source Purchase (SSP)
│   ├── RFQ-07  Specialist adds extra costs (landed price)
│   └── RFQ-08  Specialist requests a final (discounted) offer
├── CMT  Committee
│   ├── CMT-01  Admin configures the committee
│   ├── CMT-02  Committee votes on a winner or a PO decision
│   ├── CMT-03  System generates numbered minutes
│   └── CMT-04  Committee approves the opening of tender bids
├── PO   Purchase order
│   ├── PO-01   System creates one PO per winning vendor
│   ├── PO-02   Approver, then committee, approve the PO
│   └── PO-03   Vendor accepts or declines the PO
└── DEMO Demo mode
    ├── DEMO-01 Presenter uses demo tools
    └── DEMO-02 System seeds and resets the demo scenario
```

## Context & Goal

The MVP proves that a client without 1C can run a full, auditable procurement inside one platform.

|  |  |
| --- | --- |
| Problem | The current VMS depends on 1C for requisitions, master data and PO hand-off, and carries PrimeCotton-specific rules, so it cannot be offered to clients without 1C. The client's gap analysis lists 114 requirements; 46 are marked High-Urgent and many are not covered (Q&A, committee minutes, decline of invitations, disqualification). Today clarifications and comparisons happen in e-mail and Excel, outside the audit trail. |
| Success metric | On the management demo (target Nov 13, 2026), one seeded scenario (2,000 bags of fertiliser, 60,000.00 AZN, Tender) runs on the public link from vendor registration to a vendor-accepted PO with zero errors, and each of the 6 roles works in its own account and screen. Measured by a full rehearsal on demo day minus 1 and the live run. Adoption and time-saved metrics are deferred to a pilot. |

## Scope

The release covers one end-to-end path with two sourcing types (RFQ and Tender); everything else is listed below as later or out.

**In scope (this release)**

- Platform: e-mail and password sign-in, 5 internal roles plus Vendor, role-based screens, in-app notifications, audit trail of every status change.
- Vendor onboarding: self-registration for local companies, individuals and foreign companies; specialist review (approve, return for correction, reject); a qualification questionnaire with scoring and an A–D grade; a company profile with owners, founding date, activity, brands, main goods, bank guarantee and a certificate register with 30-day expiry reminders, shown on one vendor card; category applications with licence proof where the category requires it; category qualification valid for 12 months; the Approved Vendor List (AVL) per category.
- Planning: annual plan lines; every PR is linked to a plan line and shows the remaining amount.
- Purchase requisition: lines picked from the item catalogue; single-level approval.
- Sourcing: Competitive bidding (RFQ or Tender chosen by value against a threshold) or Single Source Purchase (SSP) to one AVL vendor, with a justification above 1,000 AZN; invitations to AVL vendors; accept or decline with a reason; sealed proposals with Incoterm, delivery and payment terms picked from Admin dictionaries, and VAT basis; Q\&A; deadline handling (extend, continue with a reason, cancel); Tender bid opening approved by the committee and two envelopes (prices open after the technical pass or fail); default deadlines of 3 days (RFQ, SSP) and 14 days (Tender) with a 24-hour reminder; price comparison on the evaluated price with extra costs (customs, delivery); one final (discounted) offer round; proposed winner.
- Committee: configuration, a winner vote and a PO vote, numbered minutes for each decision.
- Purchase order: one PO per winning vendor; Approver, then committee, then vendor acceptance.
- Demo mode: role switcher, sample fill, end-deadline-now, reset; one seeded scenario.
- High-urgency items delivered (23 of 46): #1 (plan lines only), #9, #15, #16 (limit and justification; the committee approves it in the winner vote), #26, #29, #30, #31, #33, #34, #41 (result notice only, no debrief), #46 (minutes in English, no chair sign-off yet), #55 (grade and category valid 12 months, then re-qualification), #83, #86, #90, #91 (format, VAT status, duplicates; no Tax Service lookup), #105, #106 (certificate register with 30-day reminders), #110, plus #54 (owners), #97 (bank guarantee) and #100 (activity and brands).

**If time allows (cut first when late)**

- \#53 critical supplier flag, #12 lead-time warning per category, #49 non-voting observers, #40 committee returns the evaluation.

**Out of scope (non-goals)**

- 1C or any other ERP integration.
- Price Agreements (PA); every award is a purchase order.
- Budget check, warehouse receipt, invoice and payment (#6, #7, #73, #77).
- Automatic RFQ-to-Tender conversion when bids exceed the threshold.
- E-mail and SMS notifications, OTP sign-in.
- Mobile layouts and the Azerbaijani UI.
- Real client or vendor data; the demo uses synthetic data only.

**Later phases**

- Screens for several PRs in one sourcing, splitting a line's quantity across vendors, the blacklist workflow and department review of the questionnaire (the data model already supports them); e-mail notifications (#114); Azerbaijani UI; bilingual minutes and chair sign-off (#46).
- Committee approval of method, justifications, strategy, documents and extensions (#18, #17, #21, #25, #35); approval routing by amount (#43).
- Due diligence (#52), bank-detail change approval (#99), performance actions and blacklist (#57, #59), committee and compliance reports (#81, #82), plan versus actual and method in the plan (#2, #4).

**Platforms & languages**

- Desktop web only, screens 1280 px and wider, latest Chrome and Edge.
- English UI only; every UI string sits in a translation file so Azerbaijani can be added without code changes.
- Hosting on Vercel, database, authentication and file storage on Supabase, code in a private GitHub repository (`vms-demo`).

## Example Sketch

TBD

## Stories

### PLT-01 - Sign In And See Only Your Role's Screens

| Field | Value |
| --- | --- |
| **Story ID** | PLT-01 |
| **Story title** | A user signs in with e-mail and password and sees only the screens their roles allow. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Requester, Approver, Procurement Specialist, Committee Member, Admin or Vendor |
| **I want to...** | sign in with my e-mail and password |
| **So that...** | I reach only the work my role allows and nothing else |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an Admin on Users, **When** they create a user with name, e-mail, an initial password of at least 8 characters and one or more of the roles Requester, Approver, Procurement Specialist, Committee Member, Admin, **Then** that user can sign in with that e-mail and password.
2. **Given** an e-mail that already belongs to a user, **When** the Admin saves a new user with it, **Then** "This e-mail is already in use" appears and no user is created.
3. **Given** the sign-in page, **When** a wrong e-mail or password is submitted, **Then** "Incorrect e-mail or password" appears and no session starts.
4. **Given** a signed-in user, **When** the main menu renders, **Then** it shows only the sections the Role Matrix allows for that user's roles.
5. **Given** a signed-in user, **When** they open the URL of a section their roles do not allow, **Then** the page shows "You do not have access to this page" and no data of that section is returned.
6. **Given** a signed-in Vendor, **When** any list or record is requested, **Then** only records of the Vendor's own company are returned (registration, applications, invitations, proposals, own questions, published answers, own POs).
7. **Given** any record created in the system, **When** it is saved, **Then** it carries the company identifier of the buying company, so a second buying company can be added later without data changes.

---

### PLT-02 - Get In-App Notifications And Keep An Audit Trail

| Field | Value |
| --- | --- |
| **Story ID** | PLT-02 |
| **Story title** | The system notifies each user in-app about events that need them and records every status change. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | any signed-in user |
| **I want to...** | see a bell with the events that need my action, and a history of status changes on every record |
| **So that...** | no step waits unseen and every decision can be traced |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an event listed in the Notification table (Flow & Notifications), **When** it is saved, **Then** each listed recipient sees a new item under the bell with the event text, the record number and a link, and the unread counter rises by 1.
2. **Given** an unread notification, **When** the user opens it, **Then** the linked record opens and the notification is marked read.
3. **Given** a user with no access to a record, **When** an event occurs on that record, **Then** no notification is created for that user.
4. **Given** any status change on a vendor registration, category application, plan line, PR, sourcing, invitation, proposal, committee decision or PO, **When** it is saved, **Then** an audit entry stores the user, the date and time (Asia/Baku), the previous status, the new status and the reason or comment when one was required.
5. **Given** a record a user can open, **When** they open its History tab, **Then** its audit entries are listed newest first.
6. **Given** any audit entry, **When** any user, including the Admin, tries to change or delete it, **Then** the action is refused.

---

### MDM-01 - Admin Maintains Procurement Dictionaries

| Field | Value |
| --- | --- |
| **Story ID** | MDM-01 |
| **Story title** | The Admin keeps the lists of Incoterms, payment terms, delivery places, delivery modes and currencies that every dropdown uses. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Admin |
| **I want to...** | maintain the dictionaries behind the Incoterm, payment term, delivery place, delivery mode and currency dropdowns |
| **So that...** | buyers and vendors pick the same standard terms and proposals can be compared term by term |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a new system, **When** it is seeded, **Then** the Incoterms dictionary holds the 11 Incoterms 2020 rules (EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF) with code and name, all active; codes cannot be edited.
2. **Given** the Admin on Dictionaries, **When** they add or edit a payment term with name, advance % (0 to 100) and days after delivery (0 or more), **Then** it is saved and appears in payment-term dropdowns; the seed holds "100% prepayment", "50% advance, 50% after delivery", "30 days after delivery" and "60 days after delivery".
3. **Given** the Admin on Dictionaries, **When** they add a delivery place with name, type (Warehouse, Port or City) and address, **Then** it appears in the delivery-place and named-place dropdowns.
4. **Given** the Admin on Dictionaries, **When** they add a delivery mode with a name, **Then** it appears in delivery-mode dropdowns; the seed holds "Single delivery", "Partial deliveries allowed" and "Per delivery schedule". **When** they add a currency with ISO code (3 capital letters, cannot be edited later), name and active flag, **Then** it appears in every currency dropdown (vendor bank accounts, bank guarantee capacity) instead of a fixed list; the seed holds AZN, USD, EUR, TRY, RUB, GBP and CNY, all active. PR, proposal and PO amounts stay in AZN (NFR-005).
5. **Given** an entry in any dictionary, **When** the Admin deactivates it, **Then** it no longer appears in dropdowns for new records, records that already use it keep showing it, and an entry in use cannot be deleted.
6. **Given** a dictionary, **When** the Admin saves a name that already exists in it, **Then** "This name already exists" appears and nothing is saved.

---

### MDM-02 - Admin Maintains The Category Tree And Item Catalogue

| Field | Value |
| --- | --- |
| **Story ID** | MDM-02 |
| **Story title** | The Admin keeps categories as a tree and the item catalogue that PRs pick from. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Admin |
| **I want to...** | maintain parent and child categories, mark the ones that need a licence, and keep the item catalogue |
| **So that...** | vendors qualify in the right groups and requesters pick standard items |

**Acceptance Criteria** (Given / When / Then)

1. **Given** the Admin on Categories, **When** they add a category with a name and an optional parent, **Then** it appears in the tree; categories can be nested to any depth.
2. **Given** a category, **When** the Admin ticks "Licence proof required", **Then** applications to it and to its child categories need a licence file (REG-03).
3. **Given** a vendor QUALIFIED in a parent category, **When** the AVL of one of its child categories is read, **Then** the vendor is included; a qualification in a child category covers neither its parent nor its siblings.
4. **Given** the Admin on Items, **When** they add an item with a unique code, name, unit and category, **Then** it can be picked on PR lines whose plan line category is that category or one of its parents.
5. **Given** a category or item in use, **When** the Admin deactivates it, **Then** it leaves dropdowns for new records, existing records keep it, and it cannot be deleted.
6. **Given** a category with child categories, **When** the Admin tries to delete it, **Then** "Remove or move its child categories first" appears.

---

### REG-01 - Vendor Registers As A Local Company, Individual Or Foreign Company

| Field | Value |
| --- | --- |
| **Story ID** | REG-01 |
| **Story title** | A vendor creates an account and submits its registration for review. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor (local company, individual or foreign company) |
| **I want to...** | register on the portal with the data and documents of my type |
| **So that...** | I can apply for categories and be invited to procurements |

**Acceptance Criteria** (Given / When / Then)

1. **Given** the public Register page, **When** the vendor picks Local company, **Then** the form requires legal name, VÖEN, legal address, director's name, "VAT payer: Yes / No" and a charter or state-registry extract file (#86).
2. **Given** the vendor picks Individual, **When** the form renders, **Then** it requires full name, ID card number and an ID card file, and shows VÖEN as optional (#86).
3. **Given** the vendor picks Foreign company, **When** the form renders, **Then** it requires legal name, country, home tax or registration number (3 to 30 characters), legal address and a registration certificate file, and does not ask for a VÖEN (#90).
4. **Given** any type, **When** the form renders, **Then** it also requires contact person, contact e-mail (used to sign in), phone, password of at least 8 characters, and at least one bank account (bank name, IBAN of up to 34 letters and digits, SWIFT, currency); the vendor can add more accounts and marks exactly one as main. Messages: "Add at least one bank account", "IBAN must be up to 34 letters and digits", "Mark exactly one account as main".
5. **Given** a phone number that is not "+" followed by 8 to 15 digits, **When** the vendor submits, **Then** "Enter the phone with country code, e.g. +994501234567" appears; any country code is accepted (#90).
6. **Given** a VÖEN that is not exactly 10 digits, **When** the vendor submits, **Then** "VÖEN must be 10 digits" appears and nothing is saved (#91).
7. **Given** a VÖEN or foreign tax number already used by another vendor, **When** the vendor submits, **Then** "A vendor with this tax number is already registered" appears and no account is created (#91).
8. **Given** "VAT payer: Yes", **When** the vendor submits without a VAT certificate file, **Then** "Upload the VAT payer certificate" appears (#91).
9. **Given** a file that is not PDF, JPG, PNG, DOCX or XLSX, or is larger than 10 MB, **When** it is uploaded, **Then** "Use PDF, JPG, PNG, DOCX or XLSX up to 10 MB" appears and the file is not stored.
10. **Given** a filled form, **When** the vendor clicks Save, **Then** the account exists with registration status DRAFT and the vendor can sign in and continue; **When** they click Submit, **Then** the status becomes SUBMITTED, the form becomes read-only and every Procurement Specialist is notified.

---

### REG-02 - Specialist Approves, Returns Or Rejects A Registration

| Field | Value |
| --- | --- |
| **Story ID** | REG-02 |
| **Story title** | A Procurement Specialist reviews a submitted registration and decides on it. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | approve a registration, return it for correction or reject it |
| **So that...** | only verified vendors can apply for categories |

**Acceptance Criteria** (Given / When / Then)

1. **Given** registrations in SUBMITTED, **When** the specialist opens Vendor registrations, **Then** the list shows name, type, tax number and submitted date, oldest first, with all uploaded files viewable.
2. **Given** a SUBMITTED registration, **When** the specialist clicks Approve, **Then** the status becomes APPROVED and the vendor is notified and can open the qualification questionnaire (REG-05). \[revised\]
3. **Given** a SUBMITTED registration, **When** the specialist clicks Return for correction, **Then** a comment is required; on confirm the status becomes RETURNED, the vendor is notified and sees the comment.
4. **Given** a RETURNED registration, **When** the vendor edits it and clicks Submit, **Then** the status becomes SUBMITTED again and the specialist's earlier comment stays visible in History.
5. **Given** a SUBMITTED registration, **When** the specialist clicks Reject, **Then** a reason is required; on confirm the status becomes REJECTED, the vendor is notified with the reason and the registration can no longer be edited or resubmitted.
6. **Given** a vendor whose registration is not APPROVED or who has no valid grade A, B or C, **When** they open Categories, **Then** "Your registration must be approved first" or "Complete the qualification questionnaire first" appears. \[revised\]

---

### REG-03 - Vendor Applies For Categories

| Field | Value |
| --- | --- |
| **Story ID** | REG-03 |
| **Story title** | An approved vendor applies to be qualified in one or more categories. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor with an APPROVED registration |
| **I want to...** | apply for the procurement categories I can supply |
| **So that...** | I am invited to procurements in those categories |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a vendor with an APPROVED registration and a valid grade A, B or C on Categories, **When** they select one or more categories and click Apply, **Then** one application per category is created in PENDING and every Procurement Specialist is notified. \[revised\]
2. **Given** a category marked "Licence proof required" by the Admin, **When** the vendor applies without attaching a file to that category, **Then** "This category requires a licence or certificate file" appears and that application is not created (#105).
3. **Given** a category with a PENDING or QUALIFIED application, **When** the vendor tries to apply again, **Then** the category is not selectable.
4. **Given** a REJECTED or EXPIRED application, **When** the vendor applies again, **Then** a new PENDING application is created and the old one stays in History.
5. **Given** the Categories page, **When** it renders, **Then** each application shows its status (PENDING, QUALIFIED with "Valid until" date, REJECTED with reason, EXPIRED).

---

### REG-04 - Specialist Qualifies A Category And The Vendor Joins The AVL

| Field | Value |
| --- | --- |
| **Story ID** | REG-04 |
| **Story title** | A Procurement Specialist qualifies or rejects each category application, which builds the AVL. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | approve or reject each category application and see the AVL per category |
| **So that...** | only qualified vendors are invited in each category |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a PENDING application, **When** the specialist clicks Qualify, **Then** the status becomes QUALIFIED, "Valid until" is set to the approval date plus 12 months (Admin setting), the vendor appears in the AVL of that category and is notified.
2. **Given** a PENDING application, **When** the specialist clicks Reject, **Then** a reason is required; on confirm the status becomes REJECTED and the vendor is notified with the reason.
3. **Given** a QUALIFIED application whose "Valid until" date has passed, **When** the AVL, an invitation list or the vendor's Categories page is read, **Then** the application shows EXPIRED and the vendor is not in that category's AVL (#55).
4. **Given** the AVL page, **When** the specialist filters by category, **Then** it lists only vendors with standing ACTIVE, a valid grade A, B or C and a QUALIFIED, unexpired application in that category or a parent category, with vendor name, type, country, grade and "Valid until". \[revised\]

---

### REG-05 - Vendor Fills The Qualification Questionnaire And Gets An A–D Grade

| Field | Value |
| --- | --- |
| **Story ID** | REG-05 |
| **Story title** | An approved vendor answers the qualification questionnaire; the system scores it and a specialist confirms the grade. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor with an APPROVED registration, and Procurement Specialist |
| **I want to...** | answer the qualification questionnaire and receive a confirmed A–D grade |
| **So that...** | only vendors graded A, B or C can apply for categories and reach the AVL; this step comes before REG-03 in the flow |

**Acceptance Criteria** (Given / When / Then)

1. **Given** the Admin on Questionnaire, **When** they add a question with text, answer type (single choice or Yes / No), answer options with points from 0 to 10, a weight from 1 to 5 and "Evidence file required: Yes / No", **Then** the question applies to questionnaires started after the save.
2. **Given** a vendor with an APPROVED registration, **When** they open Qualification, **Then** they see every active question, can save answers as DRAFT, and must answer every question and attach a file where evidence is required before Submit is enabled.
3. **Given** a complete questionnaire, **When** the vendor clicks Submit, **Then** it becomes SUBMITTED, the system calculates the score (Calculation Rules), every Procurement Specialist is notified, and the vendor does not see the score.
4. **Given** a SUBMITTED questionnaire, **When** the specialist reviews it, **Then** they see each answer with its points and evidence files, and may change an answer's points only with a comment; the score and the proposed grade recalculate at once.
5. **Given** a SUBMITTED questionnaire, **When** the specialist clicks Confirm grade, **Then** it becomes GRADED with grade A (85.0 and above), B (70.0 to 84.9), C (50.0 to 69.9) or D (below 50.0), valid until the confirmation date plus 12 months, and the vendor is notified with the grade and score.
6. **Given** a SUBMITTED questionnaire, **When** the specialist clicks Return for correction with a comment, **Then** it becomes RETURNED and the vendor can edit and resubmit it.
7. **Given** a vendor whose first attempt is graded D, **When** they open Qualification, **Then** they may start one new attempt at once; **Given** the second consecutive attempt is also graded D, **Then** the vendor's standing becomes HOLD until 6 months after that confirmation date, it drops out of every AVL, and the page shows "You can apply again on \<date>". \[revised\]
8. **Given** a grade A, B or C, **When** its valid-until date passes, **Then** the questionnaire becomes EXPIRED, the vendor leaves the AVL in every category, and a new questionnaire is needed (#55); the vendor may also start a new questionnaire in the last 30 days before the valid-until date, and the new grade replaces the old one when it is confirmed.
9. **Given** a vendor, **When** they use the portal, **Then** they never see another vendor's grade or score.

---

### REG-06 - Vendor Keeps A Company Profile; Buyers See The Vendor Card

| Field | Value |
| --- | --- |
| **Story ID** | REG-06 |
| **Story title** | The vendor's profile holds owners, founding date, activity, brands, main goods, bank guarantee and certificates with expiry dates, and buyers see it all on one vendor card. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor, and Procurement Specialist |
| **I want to...** | keep my company profile complete, and see a supplier's full card in one place |
| **So that...** | buyers know who they buy from and expiring certificates are caught in time (#54, #97, #100, #106) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a local or foreign company registering (REG-01), **When** it fills the form, **Then** it must also give the founding date and at least one owner record for the company head, and may add founders and shareholders above 10% (full name, ID or registration number, share %, role Founder, Shareholder or Head); individuals skip this section (#54).
2. **Given** owner records, **When** their shares add up to more than 100%, **Then** "Shares cannot exceed 100% in total" appears and nothing is saved.
3. **Given** the vendor on Profile, **When** it edits the profile at any time, **Then** it can set the main activity (Manufacturer, Distributor, Official dealer, Service provider, Trader, Other), brands represented (each with "Official dealer: Yes / No" and an optional dealer letter), up to 20 main goods, and bank guarantee capacity (Yes / No; types Bid, Advance payment, Performance; maximum amount and currency) (#97, #100); it can also add, edit or remove bank accounts, keeping at least one and exactly one main (same rules and messages as REG-01 AC4).
4. **Given** the Certificates section, **When** the vendor adds a certificate with type (ISO 9001, ISO 14001, ISO 45001, HSE policy, Product certificate, Licence, Reference letter, Catalogue, Other), number, issuer, issue date, an optional expiry date and a file, **Then** it shows with the status VALID, EXPIRING or EXPIRED from the Calculation Rules (#106).
5. **Given** a certificate that expires in 30 days, **When** the daily job runs, **Then** the vendor and every Procurement Specialist are notified once ("\<type> certificate of \<vendor> expires on \<date>"); from the day after the expiry date it is EXPIRED and both are notified again.
6. **Given** the vendor's home page, **When** it loads, **Then** it shows the grade with its valid-until date, the qualified categories, and a warning for every EXPIRING or EXPIRED certificate.
7. **Given** a Procurement Specialist, Committee Member or Admin, **When** they open a vendor card from the AVL, a registration or a comparison table, **Then** it shows name, type, country, founding date and years in business, standing, grade with valid-until date, qualified categories, activity, brands, main goods, bank guarantee, all bank accounts with the main one marked, certificates with status badges, owners and History.
8. **Given** two vendors with an owner of the same ID or registration number, **When** either card, or a comparison table with both, is opened, **Then** the flag "Shares an owner with \<vendor>" is shown (#54).
9. **Given** the AVL page, **When** the specialist filters, **Then** the filters include activity, brand, "Bank guarantee available" and "Valid certificate of type X" (#97, #100).
10. **Given** a vendor, **When** it uses the portal, **Then** it never sees another vendor's profile, owners or certificates.

---

### PLN-01 - Admin Maintains Annual Plan Lines

| Field | Value |
| --- | --- |
| **Story ID** | PLN-01 |
| **Story title** | The Admin keeps the annual procurement plan as lines that every PR is linked to. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Admin |
| **I want to...** | maintain plan lines with category, planned amount and quarter |
| **So that...** | every PR is tied to planned money and the remaining amount is visible (#1, simplified) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** the Admin on Plan, **When** they add a line with year, category, description, planned amount in AZN greater than 0 and planned quarter (Q1 to Q4), **Then** the line is saved as ACTIVE.
2. **Given** an ACTIVE line, **When** the Admin closes it, **Then** it becomes CLOSED and can no longer be picked on a new PR; PRs already linked keep the link, and a RETURNED PR stays on its line even if the line was closed meanwhile. The Admin may edit an ACTIVE line, but its category is fixed once a PR is linked to it. Plan lines are never deleted, only closed.
3. **Given** the Plan page, **When** any internal user opens it, **Then** each line shows planned amount, committed amount and remaining amount, where committed is the sum of estimated values of linked PRs in PENDING\_APPROVAL, APPROVED, IN\_SOURCING or COMPLETED, and remaining is planned minus committed.
4. **Given** a PR whose estimated value is larger than the remaining amount of its plan line, **When** the Requester submits it, **Then** "This PR exceeds the remaining plan amount by X AZN" appears and the Requester may still submit; the warning is shown to the Approver too.
5. **Given** a Requester, Approver or Procurement Specialist, **When** they open Plan, **Then** they can read it but see no add, edit or close actions.

---

### PR-01 - Requester Creates A PR From The Catalogue

| Field | Value |
| --- | --- |
| **Story ID** | PR-01 |
| **Story title** | A Requester creates a complete, priced purchase requisition linked to a plan line. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Requester |
| **I want to...** | create a PR by picking items from the catalogue and pricing them |
| **So that...** | procurement receives a complete request that suppliers can price exactly (#9) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a Requester on New PR, **When** they pick an ACTIVE plan line, **Then** only catalogue items of that plan line's category can be added as lines.
2. **Given** a PR line, **When** the Requester picks a catalogue item, **Then** item code, name, category and unit fill in from the catalogue and cannot be edited, and the Requester enters quantity (greater than 0), estimated unit price in AZN excluding VAT (greater than 0, 2 decimals), required delivery date, a delivery place picked from the Delivery places dictionary and an optional specification text of up to 2,000 characters. \[revised\]
3. **Given** a required delivery date earlier than tomorrow, **When** the Requester saves, **Then** "Delivery date must be in the future" appears on that line.
4. **Given** lines with quantity and price, **When** any of them changes, **Then** the estimated value (sum of quantity × estimated unit price) updates on screen, formatted like 60,000.00 AZN.
5. **Given** a PR, **When** the Requester clicks Save, **Then** it is stored as DRAFT with a number PR-YYYY-NNNN; a draft may be incomplete or have no lines yet, but every line that exists must pass the rules above; **When** they click Submit, **Then** it becomes PENDING\_APPROVAL, read-only for the Requester, and every Approver except the Requester is notified.
6. **Given** a PR with no lines, **When** the Requester clicks Submit, **Then** "Add at least one line" appears; this check runs on Submit only. PRs are never deleted.
7. **Given** a RETURNED PR, **When** the Requester edits and submits it, **Then** it becomes PENDING\_APPROVAL again and the Approver's comment stays in History.

---

### PR-02 - Approver Approves, Returns Or Rejects The PR

| Field | Value |
| --- | --- |
| **Story ID** | PR-02 |
| **Story title** | An Approver decides on a submitted PR in one step. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Approver |
| **I want to...** | approve, return or reject a submitted PR |
| **So that...** | only justified needs reach procurement |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a PR in PENDING\_APPROVAL, **When** an Approver clicks Approve, **Then** it becomes APPROVED, the Requester and every Procurement Specialist are notified.
2. **Given** a PR in PENDING\_APPROVAL, **When** the Approver clicks Return, **Then** a comment is required; on confirm the PR becomes RETURNED and the Requester is notified.
3. **Given** a PR in PENDING\_APPROVAL, **When** the Approver clicks Reject, **Then** a reason is required; on confirm the PR becomes REJECTED, which is final, and the Requester is notified.
4. **Given** an Approver who is also the PR's Requester, **When** they open the PR, **Then** no decision buttons are shown and a direct request is refused with "You cannot approve your own request" (#83).
5. **Given** a PR over its remaining plan amount, **When** the Approver opens it, **Then** the plan warning from PLN-01 is shown above the decision buttons.

---

### RFQ-01 - Specialist Starts Sourcing And The System Sets RFQ Or Tender

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-01 |
| **Story title** | A Procurement Specialist turns an approved PR into an RFQ or a Tender, chosen by value, and invites the AVL. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | start sourcing from an approved PR and publish it to qualified vendors |
| **So that...** | the right method applies automatically and only qualified vendors are invited |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an APPROVED PR, **When** the specialist clicks Start sourcing, **Then** a sourcing SRC-YYYY-NNNN is created in DRAFT with the PR lines copied, the specialist recorded as its owner, and the PR becomes IN\_SOURCING.
2. **Given** a new sourcing, **When** it is created, **Then** with the method Competitive bidding (the default; Single Source Purchase is RFQ-06) its type is TENDER if the PR's estimated value is at or above the threshold (Admin setting, default 50,000.00 AZN) and RFQ otherwise, and the screen shows the reason, e.g. "Value 60,000.00 AZN ≥ threshold 50,000.00 AZN: Tender". \[revised\]
3. **Given** the sourcing type, **When** it is set, **Then** the minimum number of proposals is 3 for a Tender (#26) and, for an RFQ, comes from the Admin value bands: 1 up to 5,000 AZN, 2 above 5,000 up to 15,000 AZN, 3 above 15,000 AZN (#15).
4. **Given** a DRAFT sourcing, **When** the specialist edits it, **Then** they must set a proposal deadline (date and time, Asia/Baku; prefilled at creation from the Admin defaults of 3 days for an RFQ or SSP and 14 days for a Tender; if the specialist did not change the prefilled value it is recalculated at Publish from the publish time, and a deadline the specialist set by hand must be later than now, otherwise "Set a deadline later than now" appears), and pick from dropdowns the required Incoterm (default DDP), the named place (default: the PR's delivery place), the delivery mode and the payment term (MDM-01); a Tender also has "Technical document required: Yes / No", default Yes. \[revised\]
5. **Given** a DRAFT sourcing, **When** it opens, **Then** the invitation list holds every vendor with standing ACTIVE, a valid grade A, B or C and a QUALIFIED, unexpired application in the PR's category or one of its parent categories; the specialist may remove vendors, and a warning shows when fewer vendors remain than the minimum number of proposals; Publish with no vendor left shows "Invite at least one vendor". \[revised\]
6. **Given** a category with no qualified vendors, **When** the specialist clicks Publish, **Then** "No qualified vendors in this category" appears and the sourcing stays DRAFT.
7. **Given** a complete DRAFT, **When** the specialist clicks Publish, **Then** the sourcing becomes OPEN, each listed vendor gets an invitation in INVITED and an in-app notification with the deadline.

---

### RFQ-02 - Vendor Answers The Invitation And Submits A Sealed Proposal

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-02 |
| **Story title** | An invited vendor accepts or declines, then submits a proposal no one else can see before the deadline. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor |
| **I want to...** | see my invitations, accept or decline them and submit a proposal before the deadline |
| **So that...** | I compete on equal terms without anyone seeing my prices early (#110, #31) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an invitation in INVITED, **When** the vendor opens it, **Then** they see sourcing number, type, lines (item, quantity, unit, delivery date, delivery place, specification), the required Incoterm, named place, delivery mode and payment term, deadline and time remaining. \[revised\]
2. **Given** an INVITED invitation, **When** the vendor clicks Decline, **Then** a reason is required; on confirm the invitation becomes DECLINED, the specialist sees the reason and the vendor can no longer submit (#110).
3. **Given** an INVITED invitation, **When** the vendor clicks Accept, **Then** it becomes ACCEPTED and the vendor can fill one proposal: unit price in AZN per line (greater than 0, 2 decimals, otherwise "Enter a price greater than 0 with up to 2 decimals"; a line may be left without an offer), Incoterm, named place, delivery mode and payment term (each preset to the required value and changeable from the same dropdowns), "Prices include VAT: Yes / No" with the VAT rate in % (required when Yes, otherwise "Enter the VAT rate when prices include VAT"), delivery lead time in days, validity in days and a comment. \[revised\]
4. **Given** a Tender with "Technical document required: Yes", **When** the vendor submits without a technical document file, **Then** "Attach the technical document" appears.
5. **Given** a proposal with at least one priced line, **When** the vendor clicks Submit before the deadline, **Then** it becomes SUBMITTED and its total (sum of quantity × unit price over priced lines) is shown to the vendor; with no priced line "Enter a price for at least one line" appears.
6. **Given** a SUBMITTED proposal before the deadline, **When** the vendor edits and resubmits or clicks Withdraw, **Then** the latest version is kept, or the proposal becomes WITHDRAWN and can be submitted again before the deadline.
7. **Given** the deadline has passed, **When** the vendor tries to submit, edit or withdraw, **Then** "The deadline has passed" appears and nothing changes.
8. **Given** an OPEN sourcing, **When** any internal user opens it, **Then** they see only the number of submitted proposals, with no vendor names, prices or files (#31).
9. **Given** any time, **When** a vendor uses the portal, **Then** they never see another vendor's proposal, invitation or decline reason.

---

### RFQ-03 - Vendors Ask Questions And The Specialist Answers To All (Q&A)

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-03 |
| **Story title** | Clarifications run inside the sourcing and every answer reaches all invited vendors without the asker's name. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor and Procurement Specialist |
| **I want to...** | ask and answer clarification questions inside the sourcing |
| **So that...** | every bidder gets the same information and nothing happens by private e-mail (#30) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an OPEN sourcing and a vendor whose invitation is INVITED or ACCEPTED, **When** the vendor sends a question of up to 2,000 characters with an optional file, **Then** it is stored as UNANSWERED, the sourcing owner is notified and the vendor sees it as "Awaiting answer".
2. **Given** an UNANSWERED question, **When** the specialist writes an answer and clicks Publish, **Then** the question and answer become visible to every vendor whose invitation is not DECLINED, without the asker's company name, and those vendors are notified.
3. **Given** an UNANSWERED question, **When** the specialist edits the question text before publishing, **Then** the edited text is published and the original stays visible only to the specialist and in History.
4. **Given** an OPEN sourcing, **When** the specialist publishes a clarification without a question, **Then** it appears in the Q&A list and the same vendors are notified.
5. **Given** a sourcing that is no longer OPEN, **When** a vendor opens Q&A, **Then** asking is disabled with "Questions are closed" and published items stay readable.
6. **Given** an OPEN sourcing, **When** a vendor looks for a way to message the specialist privately, **Then** none exists; Q&A is the only channel until the sourcing is completed or cancelled.

---

### RFQ-04 - Specialist Handles A Deadline Below The Minimum

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-04 |
| **Story title** | At the deadline the system closes receipt, and the specialist extends, continues with a reason or cancels when proposals are below the minimum. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | decide what happens when fewer proposals arrive than the minimum |
| **So that...** | the sourcing gets more time, or goes on with a recorded reason, or stops with a recorded reason |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an OPEN sourcing, **When** its deadline passes, **Then** within 1 minute it becomes CLOSED and all proposals are locked.
2. **Given** a CLOSED sourcing with submitted proposals at or above the minimum, **When** it closes, **Then** a Tender moves to AWAITING\_OPENING (CMT-04) and an RFQ or SSP to COMPARISON, the owner is notified, and for an RFQ or SSP prices become visible to the owner, the committee members and the Admin; a Tender's prices open only after its technical evaluation. \[revised\]
3. **Given** a CLOSED sourcing below the minimum, **When** the owner opens it, **Then** it shows "Below minimum: N of M proposals" with three actions: Extend, Continue, Cancel.
4. **Given** Extend, **When** the owner sets a new deadline later than now and a reason, **Then** the sourcing returns to OPEN, invited vendors that have not declined are notified of the new deadline, and the extension count rises by 1; after 2 extensions (Admin setting) Extend is disabled with "Maximum number of extensions reached".
5. **Given** Continue, **When** the owner enters a reason, **Then** the sourcing moves on as in criterion 2 and the reason is stored for the committee package (#26); with 0 proposals Continue is not offered.
6. **Given** a sourcing in DRAFT, OPEN, CLOSED, TECHNICAL\_EVALUATION or COMPARISON, **When** the owner clicks Cancel and enters a reason, **Then** it becomes CANCELLED, invited vendors that have not declined are notified with the reason (#34), and the PR returns to APPROVED; an open OPENING decision of that sourcing closes as NO\_DECISION with the rule "Sourcing cancelled" and minutes that record the reason (CMT-02, CMT-03). \[revised\]

---

### RFQ-05 - Specialist Evaluates Proposals And Proposes The Winner

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-05 |
| **Story title** | The specialist runs the Tender pass or fail check, compares prices and sends a winner per line to the committee. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | evaluate proposals, compare prices and propose a winner for each line |
| **So that...** | the committee votes on a documented recommendation |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a Tender in TECHNICAL\_EVALUATION, **When** the owner, seeing the technical documents but no prices, marks each submitted proposal PASSED or DISQUALIFIED, **Then** DISQUALIFIED requires a reason (e.g. "Missing certificate"), and once every proposal is marked the sourcing moves to COMPARISON and the prices of PASSED proposals open (#33). \[revised\]
2. **Given** an RFQ or Tender in COMPARISON, **When** the owner disqualifies a proposal with a reason, **Then** it leaves the comparison and the reason is kept (#33).
3. **Given** COMPARISON, **When** the owner opens the comparison table, **Then** rows are the lines, columns are the eligible vendors, each cell shows unit price and line total excluding VAT (a price entered with VAT is divided by 1 + VAT rate) and the evaluated unit price with extra costs (RFQ-07), with the vendor's Incoterm, named place, delivery mode and payment term and a "Different terms" warning naming each one that differs from the required value, the lowest evaluated unit price per line is highlighted, delivery days, validity and grade show per vendor, and disqualified proposals are listed below with their reasons. \[revised\]
4. **Given** the comparison table, **When** it loads, **Then** each line's proposed winner defaults to the lowest eligible evaluated unit price (RFQ-07); choosing another vendor requires a justification, and a line with no eligible offer can only be cancelled with a reason. \[revised\]
5. **Given** a line with fewer eligible proposals than the minimum and no reason stored yet, **When** the owner clicks Send to committee, **Then** a low-competition reason is required (#26).
6. **Given** every line has a proposed winner or is cancelled, **When** the owner clicks Send to committee, **Then** the sourcing becomes IN\_COMMITTEE and a winner decision opens (CMT-02) with the comparison table, disqualifications, justifications and any low-competition reason.
7. **Given** lines sent back after a rejection (winner decision rejected, PO rejected or declined), **When** the owner opens COMPARISON, **Then** the previous winner of those lines is marked and excluded, and the owner proposes the next vendor or cancels the line with a reason.

---

### RFQ-06 - Specialist Runs A Single Source Purchase (SSP)

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-06 |
| **Story title** | A Procurement Specialist buys from one chosen AVL vendor, with a justification above the single-source limit, and the committee still decides. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | send an approved PR to one vendor I choose from the category's AVL instead of a competition |
| **So that...** | purchases that only one supplier can serve go through the system with a recorded reason (#16) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** an APPROVED PR, **When** the specialist clicks Start sourcing and picks the method Single Source Purchase, **Then** they must pick exactly one vendor from the AVL of the PR's category (standing ACTIVE, valid grade A, B or C and a QUALIFIED, unexpired application in the category or a parent category), and the sourcing type is SSP whatever the value; with no vendor "Pick one vendor for a single source purchase" appears, and a vendor outside the AVL is refused with "This vendor is not qualified in this category".
2. **Given** an SSP whose PR value is above the single-source limit (Admin setting, default 1,000.00 AZN), **When** the specialist clicks Publish without a justification text and at least one justification file, **Then** "A single source purchase above 1,000.00 AZN needs a justification and a file" (the limit comes from the setting) appears and the sourcing stays DRAFT (#16).
3. **Given** an SSP whose value is at or below the limit, **When** the specialist publishes, **Then** the justification is optional.
4. **Given** a published SSP, **When** it becomes OPEN, **Then** only the chosen vendor gets an invitation and a notification, the minimum number of proposals is 1, and Q&A works as in RFQ-03.
5. **Given** an OPEN SSP, **When** the deadline passes with the proposal submitted, **Then** it moves straight to COMPARISON with no technical stage; with no proposal, only Extend or Cancel are offered (RFQ-04).
6. **Given** an SSP in COMPARISON, **When** the specialist opens it, **Then** the vendor is the proposed winner of every line it priced, lines it did not price can only be cancelled with a reason, and Send to committee opens the winner decision (CMT-02).
7. **Given** the winner decision of an SSP, **When** a committee member opens it, **Then** it carries the label "Single Source Purchase" with the justification and its files, so the vote also approves the single source.

---

### RFQ-07 - Specialist Adds Extra Costs To Compare Landed Prices

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-07 |
| **Story title** | In the comparison, the specialist adds customs, delivery and other costs per unit so vendors are compared on the evaluated price. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | add extra costs per unit that the company will pay on top of a vendor's price, such as customs or delivery |
| **So that...** | offers with different Incoterms are compared on what the company will really pay |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a sourcing in COMPARISON, **When** the owner adds an extra cost to a vendor's line with a type (Customs, Delivery, Insurance, Other), an amount per unit in AZN (0 or more) and a note, **Then** it is saved and the line's evaluated unit price becomes the unit price excluding VAT plus all its extra costs per unit.
2. **Given** extra costs exist, **When** the comparison table renders, **Then** each cell shows the unit price excluding VAT, the extra costs and the evaluated unit price, and the lowest evaluated unit price per line is highlighted.
3. **Given** extra costs change, **When** they are saved, **Then** the default winner per line is recalculated on the evaluated price; a manually chosen winner keeps its justification and is flagged "No longer the lowest evaluated price" if that is now true.
4. **Given** a sourcing in IN\_COMMITTEE or later, **When** anyone tries to change its extra costs, **Then** the action is refused.
5. **Given** the winner and PO decisions, **When** committee members open them, **Then** the extra costs and their notes are shown; the PO keeps the vendor's own prices and does not include the extra costs.

---

### RFQ-08 - Specialist Requests A Final (Discounted) Offer

| Field | Value |
| --- | --- |
| **Story ID** | RFQ-08 |
| **Story title** | The specialist asks chosen vendors for a final, lower offer, and the comparison is rebuilt on the new prices. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist and Vendor |
| **I want to...** | request, and give, a final discounted offer before the winner is proposed |
| **So that...** | vendors can improve their prices and the company gets a better price (best and final offer) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a sourcing in COMPARISON with no final-offer round yet, **When** the owner clicks Request final offer, picks one or more eligible vendors (default: all) and sets a deadline (default 2 days, Admin setting) and an optional message, **Then** the sourcing becomes FINAL\_OFFER\_ROUND and the chosen vendors are notified.
2. **Given** a FINAL\_OFFER\_ROUND, **When** a chosen vendor opens its proposal, **Then** it sees its previous prices and can enter a new unit price per line or confirm the previous prices unchanged; all other fields stay as submitted.
3. **Given** a final-offer form, **When** the vendor enters a unit price higher than its previous price for that line, **Then** "A final offer cannot be higher than your previous price" appears and nothing is saved.
4. **Given** an open final-offer round, **When** an internal user opens the sourcing, **Then** they see which chosen vendors have responded, but no new prices until the round closes.
5. **Given** the final-offer deadline passes, **When** the round closes, **Then** the sourcing returns to COMPARISON, vendors that did not respond keep their previous prices, and each cell shows the previous price next to the final price.
6. **Given** a sourcing whose final-offer round has been used, **When** the owner looks for Request final offer, **Then** it is disabled with "The final-offer round has been used" (Admin setting: 1 round).
7. **Given** a vendor not chosen for the round, **When** the round runs, **Then** it is not notified and its prices stay in the comparison unchanged.

---

### CMT-01 - Admin Configures The Committee

| Field | Value |
| --- | --- |
| **Story ID** | CMT-01 |
| **Story title** | The Admin sets the committee members, the chair and the voting period. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Admin |
| **I want to...** | define who sits on the procurement committee, who chairs it and how long a vote stays open |
| **So that...** | every decision follows the committee regulation (#29) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** the Admin on Committee, **When** they add members from users who hold the Committee Member role and mark exactly one as Chair, **Then** Save is allowed only with an odd number of members, at least 3; otherwise "The committee needs an odd number of at least 3 members" appears.
2. **Given** the Committee page, **When** the Admin sets the voting period, **Then** it is stored in business days (Monday to Friday, default 3); public holidays are not counted in this release.
3. **Given** a saved change, **When** decisions are already open, **Then** they keep the voter list they opened with and only new decisions use the new list.

---

### CMT-02 - Committee Votes On A Winner Or A PO Decision

| Field | Value |
| --- | --- |
| **Story ID** | CMT-02 |
| **Story title** | Committee members vote on each winner decision and each PO decision, and the system closes the vote by quorum and majority. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Committee Member (including the Chair) |
| **I want to...** | vote For or Against a winner decision and, later, the PO that follows it |
| **So that...** | both the winner and the purchase order carry a formal committee decision |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a decision opens (type OPENING, WINNER or PO), **When** it is created, **Then** its eligible voters are the committee members at that moment except the sourcing owner, each is notified, and it stays VOTING until the voting period ends. \[revised\]
2. **Given** a WINNER decision, **When** a member opens it, **Then** they see the comparison table, disqualifications with reasons, justifications for non-lowest winners, any low-competition reason and, for an SSP, the Single Source Purchase label with its justification and files. \[revised\]
3. **Given** a PO decision, **When** a member opens it, **Then** they see the PO and every difference from the approved winner decision in vendor, item, quantity, unit price, total, Incoterm, named place, delivery mode or payment term, or "Same as the approved winner decision" when there is none. \[revised\]
4. **Given** a VOTING decision, **When** a member votes Against, **Then** a comment is required; a vote For needs none; a submitted vote cannot be changed.
5. **Given** a VOTING decision, **When** a member clicks Declare conflict of interest and enters a comment, **Then** they cannot vote on it and are removed from its eligible voters.
6. **Given** a VOTING decision, **When** a member looks at it, **Then** they see who has voted but not how, until the decision closes.
7. **Given** every eligible voter has voted or the voting period has ended, **When** the decision closes, **Then** with votes cast not more than half of eligible voters it becomes NO\_DECISION ("No quorum"); otherwise more For than Against makes it APPROVED, more Against than For makes it REJECTED, and a tie follows the Chair's vote, or becomes NO\_DECISION ("Tie without the Chair's vote") if the Chair has not voted; with no eligible voter left it becomes NO\_DECISION ("No quorum"). A VOTING OPENING decision of a sourcing that is cancelled closes at once as NO\_DECISION with the rule "Sourcing cancelled" and the cancellation reason. \[revised\]
8. **Given** a NO\_DECISION decision, or a REJECTED OPENING decision, **When** the sourcing owner clicks Reopen vote, **Then** a new VOTING decision with the same package and a new voting period opens; after a REJECTED OPENING decision the owner must enter a reason, and the new decision shows that reason to the members. WINNER and PO decisions reopen only after NO\_DECISION, and a decision closed by a cancelled sourcing cannot be reopened. \[revised\]
9. **Given** a WINNER decision becomes APPROVED, **When** it closes, **Then** the sourcing becomes WINNER\_APPROVED and POs are created (PO-01); if it becomes REJECTED, the sourcing returns to COMPARISON with the members' comments and the rejected winners excluded.
10. **Given** a PO decision becomes APPROVED, **When** it closes, **Then** the PO becomes FULLY\_APPROVED and is sent to the vendor; if it becomes REJECTED, the PO becomes REJECTED and its lines return to the sourcing's COMPARISON.

---

### CMT-03 - System Generates Numbered Minutes For Each Decision

| Field | Value |
| --- | --- |
| **Story ID** | CMT-03 |
| **Story title** | Every closed committee decision produces numbered, read-only minutes. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Committee Chair, Committee Member or Procurement Specialist |
| **I want to...** | get numbered minutes for every closed decision |
| **So that...** | there is official proof of who decided what (#46) |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a decision becomes APPROVED, REJECTED or NO\_DECISION, **When** it closes, **Then** minutes are created with a number MIN-YYYY-NNN, sequential within the calendar year and never reused.
2. **Given** minutes, **When** they are opened, **Then** they show the number, decision type, sourcing and PO numbers, opening and closing time, eligible voters, each member's vote (For, Against, Conflict of interest, Did not vote) with comments, the result and the rule applied (majority, Chair's casting vote, no quorum, tie without the Chair's vote, sourcing cancelled with the cancellation reason). \[revised\]
3. **Given** minutes on screen, **When** the user clicks Download, **Then** a PDF in English with the same content is downloaded.
4. **Given** minutes, **When** anyone tries to edit or delete them, **Then** the action is refused.
5. **Given** a Vendor, **When** they use the portal, **Then** minutes are never visible to them.

---

### CMT-04 - Committee Approves The Opening Of Tender Bids

| Field | Value |
| --- | --- |
| **Story ID** | CMT-04 |
| **Story title** | A Tender's bids are opened only after the committee approves, and prices stay sealed until the technical check is done (two envelopes). |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Committee Member |
| **I want to...** | approve the opening of a closed Tender |
| **So that...** | no single person opens the bids and every opening is on record |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a Tender that closes with the minimum met, or after Continue, **When** it closes, **Then** it becomes AWAITING\_OPENING and an OPENING decision opens for the committee under the CMT-02 rules (quorum, majority, the Chair on a tie), showing the number of proposals and the bidders' names but no prices.
2. **Given** the OPENING decision is APPROVED, **When** it closes, **Then** the Tender moves to TECHNICAL\_EVALUATION and the owner and the committee see vendor names and technical documents, still without prices.
3. **Given** every proposal is marked PASSED or DISQUALIFIED, **When** the technical evaluation ends, **Then** the prices of PASSED proposals become visible (second envelope) and the Tender moves to COMPARISON; prices of disqualified proposals are never shown.
4. **Given** the OPENING decision is REJECTED or NO\_DECISION, **When** it closes, **Then** the Tender stays AWAITING\_OPENING and the owner can reopen the vote (after REJECTED with a reason that the members see) or cancel the Tender with a reason. \[revised\]
5. **Given** an RFQ or an SSP, **When** it closes, **Then** there is no opening decision: it moves to COMPARISON and its prices open at once.
6. **Given** an OPENING decision closes, **When** it closes, **Then** numbered minutes are created as in CMT-03.

---

### PO-01 - System Creates One PO Per Winning Vendor

| Field | Value |
| --- | --- |
| **Story ID** | PO-01 |
| **Story title** | When the winner decision is approved, the system creates one purchase order per winning vendor. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Procurement Specialist |
| **I want to...** | get the purchase orders created from the approved winner decision |
| **So that...** | no one retypes prices and every PO matches what the committee approved |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a WINNER decision becomes APPROVED, **When** it closes, **Then** one PO PO-YYYY-NNNN is created per winning vendor, holding an award line with its quantity for every line, or part of a line, that vendor won. \[revised\]
2. **Given** a new PO, **When** it is opened, **Then** it shows vendor, lines (item, quantity, unit, unit price, line total, delivery date, delivery place), total in AZN excluding VAT, VAT amount, total including VAT, Incoterm, named place, delivery mode and payment term from the winning proposal and links to the sourcing and the winner decision's minutes. \[revised\]
3. **Given** a new PO, **When** it is created, **Then** its status is PENDING\_APPROVAL and every Approver except the PR's Requester is notified.
4. **Given** any PO, **When** any user tries to edit its lines, prices or vendor, **Then** no edit action exists; a change is made only by rejecting it and re-awarding the lines.

---

### PO-02 - Approver, Then Committee, Approve The PO

| Field | Value |
| --- | --- |
| **Story ID** | PO-02 |
| **Story title** | A PO is fully approved only after the Approver and then the committee approve it. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Approver |
| **I want to...** | approve or reject a PO before it goes to the committee |
| **So that...** | the PO is checked internally and then decided by the committee before the vendor sees it |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a PO in PENDING\_APPROVAL, **When** an Approver clicks Approve, **Then** it becomes PENDING\_COMMITTEE and a PO decision opens (CMT-02).
2. **Given** a PO in PENDING\_APPROVAL, **When** the Approver clicks Reject, **Then** a reason is required; on confirm the PO becomes REJECTED, the owner is notified, and its lines return to the sourcing's COMPARISON (RFQ-05).
3. **Given** an Approver who is the Requester of the PR behind the PO, **When** they open it, **Then** no decision buttons are shown and a direct request is refused with "You cannot approve a PO for your own request" (#83).
4. **Given** the PO decision becomes APPROVED, **When** it closes, **Then** the PO becomes FULLY\_APPROVED, and the vendor, the owner and the Requester are notified.

---

### PO-03 - Vendor Accepts Or Declines The PO

| Field | Value |
| --- | --- |
| **Story ID** | PO-03 |
| **Story title** | The winning vendor accepts or declines a fully approved PO in its cabinet. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Vendor |
| **I want to...** | see my fully approved POs and accept or decline each one |
| **So that...** | the order is confirmed by both sides inside the system |

**Acceptance Criteria** (Given / When / Then)

1. **Given** a PO in FULLY\_APPROVED, **When** the vendor opens Purchase orders, **Then** it is listed with its lines and total and can be downloaded as a PDF in English.
2. **Given** a FULLY\_APPROVED PO, **When** the vendor clicks Accept, **Then** it becomes ACCEPTED and the owner and the Requester are notified.
3. **Given** a FULLY\_APPROVED PO, **When** the vendor clicks Decline, **Then** a reason is required; on confirm the PO becomes DECLINED\_BY\_VENDOR, the owner is notified and its lines return to the sourcing's COMPARISON.
4. **Given** every line of a sourcing is either on an ACCEPTED PO or cancelled, **When** the last such change is saved, **Then** the sourcing becomes COMPLETED, the PR becomes COMPLETED and every vendor with a submitted proposal gets a result notice listing the lines it won, or "Not awarded" (#41).
5. **Given** a vendor, **When** they open Purchase orders, **Then** only their own company's POs are listed.

---

### DEMO-01 - Presenter Uses Demo Tools

| Field | Value |
| --- | --- |
| **Story ID** | DEMO-01 |
| **Story title** | In demo mode the presenter switches users, fills forms and ends deadlines with one click. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Presenter (the Business Analyst running the demo) |
| **I want to...** | switch between the seeded users, fill forms with scenario data and end a deadline on demand |
| **So that...** | the whole scenario runs live in minutes with clicks only, no typing and no waiting |

**Acceptance Criteria** (Given / When / Then)

1. **Given** demo mode is switched on by an environment setting, **When** any page loads, **Then** a demo bar shows Switch user and Reset demo.
2. **Given** the demo bar, **When** the presenter picks a seeded user from Switch user, **Then** the session changes to that user without a password and the page reloads with that user's menu.
3. **Given** a scenario form (registration, category application, PR, sourcing, proposal, question, answer, vote, decline reason), **When** the presenter clicks Fill sample, **Then** the form fills with the values in Demo Scenario Data and nothing is saved until the presenter clicks Save or Submit.
4. **Given** an OPEN sourcing, **When** the presenter clicks End deadline now, **Then** the deadline becomes the current time and the sourcing closes within 10 seconds as in RFQ-04.
5. **Given** demo mode is switched off, **When** any page loads, **Then** no demo control is shown and every demo endpoint answers "Not available" with no effect.

---

### DEMO-02 - System Seeds And Resets The Demo Scenario

| Field | Value |
| --- | --- |
| **Story ID** | DEMO-02 |
| **Story title** | A reset puts the system back to the exact starting point of the demo scenario. |

**Story Description**

|  |  |
| --- | --- |
| **As a...** | Presenter |
| **I want to...** | reset all data to the scenario's starting point |
| **So that...** | every rehearsal and the live demo start from the same state |

**Acceptance Criteria** (Given / When / Then)

1. **Given** demo mode, **When** the presenter clicks Reset demo, **Then** a dialog says "This deletes all data and restores the demo scenario" and needs a confirm click.
2. **Given** the presenter confirms, **When** the reset runs, **Then** within 30 seconds all data is deleted and the seed in Demo Scenario Data is restored, and every user is signed out.
3. **Given** a finished reset, **When** the presenter signs in as Vendor A, **Then** Vendor A does not exist yet and the registration page opens empty, so the scenario starts at step 1.
4. **Given** the seed, **When** it is loaded, **Then** it holds no real person, company, VÖEN or bank account; all values are synthetic.

---

## Role Matrix

Six roles act in the scenario; separation of duties blocks self-approval at every step (#83).

| Action | Requester | Approver | Procurement Specialist | Committee Member | Admin | Vendor |
| --- | --- | --- | --- | --- | --- | --- |
| Register, edit and submit own registration | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approve, return or reject a registration | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Build the qualification questionnaire | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Fill and submit the questionnaire | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Review answers, adjust points with a comment, confirm the grade or return | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Apply for categories | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Qualify or reject a category application; view the AVL | ❌ | ❌ | ✅ | ❌ | ✅ (view) | ❌ |
| Add or close plan lines | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View the plan | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Create, edit and submit own PR | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve, return or reject a PR (not own) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Start, publish, extend, continue or cancel a sourcing | ❌ | ❌ | ✅ (owner) | ❌ | ❌ | ❌ |
| Answer questions, publish clarifications | ❌ | ❌ | ✅ (owner) | ❌ | ❌ | ❌ |
| Accept or decline an invitation, ask a question, submit a proposal | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| See proposal prices before the deadline | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own only) |
| See proposal prices after the deadline | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (own only) |
| Disqualify, compare, propose the winner | ❌ | ❌ | ✅ (owner) | ❌ | ❌ | ❌ |
| Vote on winner and PO decisions | ❌ | ❌ | ❌ | ✅ (not the sourcing owner) | ❌ | ❌ |
| Approve or reject a PO (not for own PR) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Accept or decline a PO | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own only) |
| View minutes | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage users, catalogue, categories, dictionaries, settings, committee | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Approve the opening of tender bids | ❌ | ❌ | ❌ | ✅ (not the sourcing owner) | ❌ | ❌ |
| Add extra costs; request a final offer | ❌ | ❌ | ✅ (owner) | ❌ | ❌ | ❌ |
| Submit a final offer | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if chosen) |
| Keep own company profile, owners, brands and certificates | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View a vendor card, including owners | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (own only) |

Owner means the Procurement Specialist who started the sourcing; other specialists can read it. Demo tools (DEMO-01) are open to everyone, and only while demo mode is on.

## Status Transition Model

Eleven entities carry a status; the sourcing is the one with loops, so it is drawn, and every entity's allowed transitions are listed below.

&#91;embedded content: sourcing lifecycle · 11 statuses, opening and final-offer steps\]

A rejected winner, a rejected PO or a declined PO sends only the affected lines back to COMPARISON; the other lines keep their POs.

**Sourcing**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | DRAFT | Start sourcing on an APPROVED PR | Procurement Specialist | Method Competitive (type by value) or Single Source (SSP) |
| DRAFT | OPEN | Publish | Owner | At least one invitee; an SSP above the limit needs a justification and a file |
| OPEN | CLOSED | Deadline passes | System | Within 1 minute; vendors reminded 24 hours before |
| CLOSED | OPEN | Extend | Owner | Reason; at most 2 times |
| CLOSED | AWAITING\_OPENING | Minimum reached, or Continue | System or Owner | Tender only; an OPENING decision opens |
| CLOSED | COMPARISON | Minimum reached, or Continue | System or Owner | RFQ and SSP; prices open; Continue needs a reason |
| AWAITING\_OPENING | TECHNICAL\_EVALUATION | OPENING decision APPROVED | System | Names and technical documents visible, prices still sealed |
| TECHNICAL\_EVALUATION | COMPARISON | Every proposal marked PASSED or DISQUALIFIED | Owner | Prices of PASSED proposals open |
| COMPARISON | FINAL\_OFFER\_ROUND | Request final offer | Owner | Once per sourcing |
| FINAL\_OFFER\_ROUND | COMPARISON | Final-offer deadline passes | System | Each vendor's latest prices are used |
| COMPARISON | IN\_COMMITTEE | Send to committee | Owner | Every line has a winner or is cancelled |
| IN\_COMMITTEE | WINNER\_APPROVED | Winner decision APPROVED | System | POs created |
| IN\_COMMITTEE | COMPARISON | Winner decision REJECTED | System | Rejected winners excluded |
| WINNER\_APPROVED | COMPARISON | A PO is REJECTED or DECLINED\_BY\_VENDOR | System | Only that PO's lines |
| WINNER\_APPROVED | COMPLETED | Every line is on an ACCEPTED PO or cancelled | System | PR becomes COMPLETED |
| DRAFT, OPEN, CLOSED, AWAITING\_OPENING, TECHNICAL\_EVALUATION, COMPARISON, FINAL\_OFFER\_ROUND | CANCELLED | Cancel | Owner | Reason; vendors notified; PR back to APPROVED |

**Vendor standing**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | ACTIVE | Registration APPROVED | System |  |
| ACTIVE | HOLD | Second consecutive D grade | System | Until the confirmation date + 6 months; out of every AVL |
| HOLD | ACTIVE | Hold period ends | System | The vendor may start a new questionnaire |
| ACTIVE, HOLD | BLACKLISTED | Committee decision | Committee Member | Data ready now; the workflow comes in a later phase (#59) |

**Vendor certificate** (status computed from dates)

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | VALID | Certificate added | Vendor | No expiry date, or more than 30 days away |
| VALID | EXPIRING | 30 days before the expiry date | System | Vendor and specialists notified once |
| EXPIRING | EXPIRED | The day after the expiry date | System | Vendor and specialists notified |
| EXPIRING, EXPIRED | VALID | Vendor uploads a renewed certificate with a later expiry date | Vendor |  |

**Vendor registration**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | DRAFT | Save | Vendor | Account created |
| DRAFT, RETURNED | SUBMITTED | Submit | Vendor | All required fields and files |
| SUBMITTED | APPROVED | Approve | Procurement Specialist |  |
| SUBMITTED | RETURNED | Return for correction | Procurement Specialist | Comment required |
| SUBMITTED | REJECTED | Reject | Procurement Specialist | Reason required; final |

**Qualification questionnaire**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | DRAFT | Start or save | Vendor | Registration APPROVED; not blocked after a second D |
| DRAFT, RETURNED | SUBMITTED | Submit | Vendor | Every question answered; evidence files attached |
| SUBMITTED | RETURNED | Return for correction | Procurement Specialist | Comment required |
| SUBMITTED | GRADED | Confirm grade | Procurement Specialist | Grade A to D; valid 12 months |
| GRADED | EXPIRED | Valid-until date passes | System | Vendor leaves the AVL in every category |

**Category application**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | PENDING | Apply | Vendor | Licence file if the category requires it |
| PENDING | QUALIFIED | Qualify | Procurement Specialist | Valid until approval date + 12 months |
| PENDING | REJECTED | Reject | Procurement Specialist | Reason required |
| QUALIFIED | EXPIRED | Valid-until date passes | System | Vendor leaves that category's AVL |

**Purchase requisition (PR)**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | DRAFT | Save | Requester |  |
| DRAFT, RETURNED | PENDING\_APPROVAL | Submit | Requester | At least one line |
| PENDING\_APPROVAL | APPROVED | Approve | Approver | Not own PR |
| PENDING\_APPROVAL | RETURNED | Return | Approver | Comment required |
| PENDING\_APPROVAL | REJECTED | Reject | Approver | Reason required; final |
| APPROVED | IN\_SOURCING | Start sourcing | Procurement Specialist |  |
| IN\_SOURCING | APPROVED | Sourcing cancelled | System |  |
| IN\_SOURCING | COMPLETED | Sourcing completed | System |  |

**Invitation and proposal**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | INVITED | Publish | System | Invitation |
| INVITED | ACCEPTED | Accept | Vendor | Invitation |
| INVITED | DECLINED | Decline | Vendor | Invitation; reason required |
| (none) | DRAFT | Save | Vendor | Proposal; invitation ACCEPTED |
| DRAFT, WITHDRAWN | SUBMITTED | Submit before the deadline | Vendor | Proposal |
| SUBMITTED | WITHDRAWN | Withdraw before the deadline | Vendor | Proposal |
| SUBMITTED | PASSED | Technical check | Owner | Proposal; Tender only |
| SUBMITTED, PASSED | DISQUALIFIED | Disqualify | Owner | Proposal; reason required |
| SUBMITTED, PASSED | AWARDED or NOT\_AWARDED | Sourcing completed | System | Proposal; AWARDED if it won at least one line |

**Committee decision**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | VOTING | Tender closed (opening), Send to committee, PO approved by the Approver, or Reopen vote | Owner or System | Type OPENING, WINNER or PO |
| VOTING | APPROVED | All voted or period ended; quorum; more For, or tie with the Chair For | System | Minutes created |
| VOTING | REJECTED | All voted or period ended; quorum; more Against, or tie with the Chair Against | System | Minutes created |
| VOTING | NO\_DECISION | No quorum, or tie without the Chair's vote, or the sourcing was cancelled (OPENING only; rule "Sourcing cancelled") | System | Minutes created; owner may reopen, except after a cancellation |
| REJECTED, NO\_DECISION | (new VOTING decision) | Reopen vote | Owner | REJECTED only for OPENING and with a reason shown to the members; WINNER and PO reopen only after NO\_DECISION |

**Purchase order (PO)**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | PENDING\_APPROVAL | Winner decision APPROVED | System | One PO per winning vendor |
| PENDING\_APPROVAL | PENDING\_COMMITTEE | Approve | Approver | Not for own PR; PO decision opens |
| PENDING\_APPROVAL | REJECTED | Reject | Approver | Reason; lines back to COMPARISON |
| PENDING\_COMMITTEE | FULLY\_APPROVED | PO decision APPROVED | System | Sent to the vendor |
| PENDING\_COMMITTEE | REJECTED | PO decision REJECTED | System | Lines back to COMPARISON |
| FULLY\_APPROVED | ACCEPTED | Accept | Vendor |  |
| FULLY\_APPROVED | DECLINED\_BY\_VENDOR | Decline | Vendor | Reason; lines back to COMPARISON |

## Flow & Notifications

The demo scenario walks all 15 steps once; the loops show where work goes back, and every hand-off raises an in-app notification.

&#91;embedded content: end-to-end flow · 15 steps, 6 roles, 3 loops\]

Rejections at steps 11, 13 and 14 and a vendor decline at step 15 all return only the affected lines to step 10.

| Event | Recipient | Channel | Content | Can opt out? |
| --- | --- | --- | --- | --- |
| Registration submitted | All Procurement Specialists | In-app | Vendor name, type, link | No |
| Registration approved, returned or rejected | Vendor | In-app | Decision and comment or reason | No |
| Questionnaire submitted | All Procurement Specialists | In-app | Vendor name, link | No |
| Grade confirmed or questionnaire returned | Vendor | In-app | Grade, score and valid-until date, or the comment | No |
| Category application submitted | All Procurement Specialists | In-app | Vendor, category, link | No |
| Category qualified or rejected | Vendor | In-app | Category, decision, valid-until date or reason | No |
| PR submitted | Approvers except the Requester | In-app | PR number, value, plan warning if any | No |
| PR approved | Requester, all Procurement Specialists | In-app | PR number, value | No |
| PR returned or rejected | Requester | In-app | PR number, comment or reason | No |
| Sourcing published | Invited vendors | In-app | Sourcing number, type, deadline | No |
| Question received | Sourcing owner | In-app | Sourcing number, question text | No |
| Answer or clarification published | Invited vendors not declined | In-app | Sourcing number, question and answer, no asker name | No |
| Deadline extended | Invited vendors not declined | In-app | New deadline | No |
| Sourcing closed | Sourcing owner | In-app | Proposals received versus minimum | No |
| Sourcing cancelled | Invited vendors not declined | In-app | Sourcing number, reason | No |
| Committee decision opened | Eligible committee members | In-app | Decision type (opening, winner or PO), sourcing, voting deadline | No |
| Committee decision closed | Sourcing owner, committee members | In-app | Result, minutes number | No |
| PO created | Approvers except the PR's Requester | In-app | PO number, vendor, total | No |
| PO rejected by the Approver | Sourcing owner | In-app | PO number, reason | No |
| PO fully approved | Vendor, sourcing owner, Requester | In-app | PO number, total | No |
| PO accepted | Sourcing owner, Requester | In-app | PO number | No |
| PO declined by the vendor | Sourcing owner | In-app | PO number, reason | No |
| Sourcing completed | Every vendor with a submitted proposal | In-app | Lines won, or "Not awarded" (#41) | No |
| Deadline in 24 hours | Invited vendors that have neither declined nor submitted | In-app | Sourcing number, deadline | No |
| Final offer requested | Chosen vendors | In-app | Sourcing number, final-offer deadline, message | No |
| Final-offer round closed | Sourcing owner | In-app | Responses received versus vendors chosen | No |
| Certificate expires in 30 days | Vendor, all Procurement Specialists | In-app | Vendor, certificate type, expiry date | No |
| Certificate expired | Vendor, all Procurement Specialists | In-app | Vendor, certificate type | No |

## Non-Functional Requirements

Security of bids and vendor data is the hard line; speed, locale and demo readiness are proposed defaults.

| ID | Requirement | Measurable threshold | How it is verified |
| --- | --- | --- | --- |
| NFR-001 | Vendor data isolation | A vendor session reads 0 records of another vendor through the UI or the API | Automated test with two vendor accounts against every table |
| NFR-002 | Sealed proposals (#31) | Before the deadline, 0 price, vendor name or file fields reach any internal user through the UI or the API | Automated test per internal role |
| NFR-003 | Access control | A forbidden section is hidden in the menu, its URL shows "You do not have access to this page" and its API returns 403 | Automated test per role and section |
| NFR-004 | Page speed (proposed) | Every screen loads in under 2 s with the demo data on office broadband | Timed during the rehearsal |
| NFR-005 | Locale | Times in Asia/Baku (UTC+4); dates like 06 Nov 2026; amounts like 60,000.00 AZN; currency AZN only | UI review against this table |
| NFR-006 | No double submission | A second click on any submit button while a request runs creates 0 extra records | Automated test |
| NFR-007 | Desktop layout | Correct from 1280 px width in the latest Chrome and Edge | Manual check |
| NFR-008 | Secrets | 0 keys or passwords in the repository; the Supabase secret key lives only in Vercel and local environment variables | Secret scan on every push |
| NFR-009 | File rules on the server | PDF, JPG, PNG, DOCX, XLSX only, at most 10 MB each, checked by the server and not only the UI | Upload test with an 11 MB file and an .exe file |
| NFR-010 | Timed jobs | A sourcing closes and a vote closes within 1 minute of its deadline | Automated test |
| NFR-011 | Audit completeness | 100% of status changes listed in the Status Transition Model write an audit entry | Automated test across all transitions |
| NFR-012 | Translation-ready UI (proposed) | 0 UI strings outside the translation file | Lint rule in the build |
| NFR-013 | Demo reset | Reset completes in under 30 s | Timed during the rehearsal |
| NFR-014 | Demo readiness | The free Supabase project pauses after about a week without use; it is opened and checked the day before the demo | Pre-demo checklist |

## Integrations & Interfaces

The release has no ERP, e-mail or SMS integration; every interface below runs inside the platform's own stack.

| Interface | Type (event / API / job / UI) | Trigger or input | Output | Failure behaviour |
| --- | --- | --- | --- | --- |
| Supabase Auth | API | Sign-in with e-mail and password; user creation by the Admin; vendor self-registration | Session for the user's roles | Wrong credentials: message, no session; service down: "Sign-in is unavailable, try again" |
| Supabase database with row-level security | API | Every read and write | Rows filtered by company, role and vendor | Refused write: error message, nothing saved |
| Supabase Storage (private bucket) | API | File upload and download | Stored file; time-limited download link | Wrong type or size: message, file not stored |
| Deadline and voting job | Job, every minute | OPEN sourcing past its deadline; VOTING decision past its period | Status change, notifications, minutes | A failed run is caught by the next run; demo mode also has End deadline now |
| Qualification expiry | Job, daily, plus a check on read | QUALIFIED application past its valid-until date | EXPIRED status, vendor out of the AVL | The read-time check keeps the AVL correct even if the job fails |
| PDF generation | API (server function) | Download of minutes or a PO | PDF in English | "The PDF could not be generated, try again"; data unchanged |
| In-app notifications | Event | Any event in the Notification table | Bell item for each recipient, pushed live | If live push fails, the bell refreshes on the next page load |
| Vercel hosting | Job (deploy) | Push to the main branch of the GitHub repository | New production version on the public link | Failed build: the previous version stays live |

## Calculation Rules

Every number the system computes follows one of these rules; the examples are the test values.

| Rule | Formula | Worked example |
| --- | --- | --- |
| PR estimated value | Sum over lines of quantity × estimated unit price (excluding VAT) | 2,000 × 30.00 = 60,000.00 AZN |
| Sourcing type | TENDER if value ≥ threshold, otherwise RFQ (threshold default 50,000.00 AZN) | 60,000.00 → Tender; 50,000.00 → Tender; 49,999.99 → RFQ |
| Minimum proposals | Tender: 3. SSP: 1. RFQ: 1 if value ≤ 5,000.00; 2 if above 5,000.00 and ≤ 15,000.00; 3 if above 15,000.00 | RFQ 3,000.00 → 1; 15,000.00 → 2; 40,000.00 → 3 |
| Plan remaining | Planned amount − committed amount (PRs in PENDING\_APPROVAL, APPROVED, IN\_SOURCING, COMPLETED) | 500,000.00 − 60,000.00 = 440,000.00 AZN |
| Proposal total | Sum over priced lines of quantity × unit price | 2,000 × 28.00 = 56,000.00 AZN |
| Default winner per line | Lowest evaluated unit price (excluding VAT, plus extra costs per unit) among eligible proposals | C 27.00 disqualified → A 28.00 proposed |
| Eligible voters | Committee members − sourcing owner − members who declared a conflict | 3 members, owner not a member, 0 conflicts → 3 |
| Quorum | Votes cast > eligible voters ÷ 2 | 3 eligible: 2 votes = quorum; 1 vote = NO\_DECISION |
| Decision result | More For → APPROVED; more Against → REJECTED; tie → the Chair's vote; tie and no Chair vote → NO\_DECISION | 2 For, 1 Against → APPROVED; 2 For, 2 Against, Chair For → APPROVED |
| Voting deadline | Opening time + voting period in business days (Monday to Friday) | Opened Thu 12 Nov 2026 10:00 → closes Tue 17 Nov 2026 10:00 |
| Qualification validity | Approval date + 12 months; EXPIRED from the next day | Qualified 10 Nov 2026 → valid until 10 Nov 2027; EXPIRED on 11 Nov 2027 |
| Document numbers | PREFIX-YYYY-sequence, restarting each calendar year, never reused | PR-2026-0001, SRC-2026-0001, PO-2026-0001, MIN-2026-001 |
| Questionnaire score | Sum over questions of weight × points ÷ that question's maximum points, divided by the sum of weights, × 100, rounded to 1 decimal | Weights 3 and 2; points 8 of 10 and 7 of 10 → (3 × 0.8 + 2 × 0.7) ÷ 5 × 100 = 76.0 |
| Grade | A from 85.0; B 70.0 to 84.9; C 50.0 to 69.9; D below 50.0; only A, B and C may apply for categories | 76.0 → B; 85.0 → A; 49.9 → D |
| D rule | First D: one new attempt at once; second consecutive D: next attempt 6 months after that confirmation | Second D confirmed 10 Nov 2026 → may apply again on 10 May 2027 |
| Grade validity | Confirmation date + 12 months; EXPIRED from the next day | Confirmed 10 Nov 2026 → valid until 10 Nov 2027 |
| Unit price excluding VAT | If "Prices include VAT" is Yes: entered price ÷ (1 + VAT rate ÷ 100), rounded to 2 decimals; otherwise the entered price. Comparison, default winner and threshold all use this value | 33.04 with 18% VAT → 28.00 |
| PO VAT | VAT amount = total excluding VAT × the vendor's VAT rate ÷ 100; total including VAT = total excluding VAT + VAT amount | 56,000.00 × 18% = 10,080.00 → 66,080.00 AZN |
| Different terms warning | Shown when a proposal's Incoterm, named place, delivery mode or payment term differs from the sourcing's required value; prices are not adjusted | Required DDP Central warehouse; Beta Trade CIP Baku port → warning on Incoterm and named place |
| Single-source justification | SSP with PR value above the single-source limit (default 1,000.00 AZN) needs a justification text and at least one file; at or below the limit it is optional | SSP 800.00 → optional; SSP 1,000.00 → optional; SSP 4,000.00 → required |
| Evaluated unit price | Unit price excluding VAT + sum of the extra costs per unit added by the specialist (RFQ-07); the default winner and the comparison use it, the PO does not | Beta Trade 29.50 + delivery 1.00 = 30.50 |
| Final offer | New unit price ≤ previous price per line; no response keeps the previous price; one round per sourcing (setting) | Alpha Agro 28.00 → 27.50 allowed; 28.00 → 28.50 refused |
| Default deadlines | Prefilled at creation and recalculated at Publish as publish time + 3 days (RFQ, SSP) or + 14 days (Tender) unless the specialist changed it; final offer + 2 days; all Admin settings, the specialist may change them | Tender published Mon 16 Nov 2026 10:00 → deadline Mon 30 Nov 2026 10:00 |
| Deadline reminder | Sent once, 24 hours before the deadline, to invited vendors that have neither declined nor submitted | Deadline Mon 30 Nov 2026 10:00 → reminder Sun 29 Nov 2026 10:00 |
| Certificate status | VALID when there is no expiry date or it is more than 30 days away; EXPIRING within 30 days; EXPIRED from the day after the expiry date | Today 10 Nov 2026: expiry 30 Nov 2026 → EXPIRING; 15 Jan 2027 → VALID; 09 Nov 2026 → EXPIRED |
| Years in business | Full years between the founding date and today | Founded 15 Mar 2012, today 10 Nov 2026 → 14 years |

## Demo Scenario Data

The seed and the Fill sample values tell one story: a fertiliser Tender in which the cheapest bid is disqualified and the committee approves the next one 2 to 1.

**Seeded accounts** (passwords are kept in the repository's private setup notes, not here)

| Role | Name | E-mail |
| --- | --- | --- |
| Requester | Leyla Mammadova, Agronomist | leyla@demo-agro.test |
| Approver | Rashad Aliyev, Head of Operations | rashad@demo-agro.test |
| Procurement Specialist | Nigar Huseynova | nigar@demo-agro.test |
| Committee Member (Chair) | Elchin Karimov | elchin@demo-agro.test |
| Committee Member | Sevinj Guliyeva | sevinj@demo-agro.test |
| Committee Member | Tural Ismayilov | tural@demo-agro.test |
| Admin | Demo Admin | admin@demo-agro.test |
| Vendor B (foreign, Türkiye) | Beta Trade Ltd, grade A, already QUALIFIED in Fertilisers | sales@beta-trade.test |
| Vendor C (local) | Gamma Supply LLC, grade C, already QUALIFIED in Fertilisers; shares the owner Rauf Mammadov with Beta Trade, so both cards show the "Shares an owner" flag | office@gamma-supply.test |
| Vendor A (local) | Alpha Agro LLC, not seeded: registers live | info@alpha-agro.test |

**Master data and settings**

- Buying company: Demo Agro LLC. Dictionaries: the 11 Incoterms 2020; payment terms "100% prepayment", "50% advance, 50% after delivery", "30 days after delivery", "60 days after delivery"; delivery places "Central warehouse" and "North warehouse" (Warehouse) and "Baku port" (Port); delivery modes "Single delivery", "Partial deliveries allowed", "Per delivery schedule"; currencies AZN, USD, EUR, TRY, RUB, GBP, CNY.
- Catalogue: 25 items in 5 categories (Fertilisers, Seeds, Plant protection, Spare parts, Office supplies) plus 3 items under Irrigation systems; Fertilisers is marked "Licence proof required"; demo item "Ammonium nitrate 34.4%, 50 kg bag", unit bag, under Mineral fertilisers, and "Foliar fertiliser, 1 L", unit litre, under Foliar fertilisers, so the Fertilisers plan line accepts both through the category tree.
- Plan line: 2026, Fertilisers, "Spring fertiliser programme", 500,000.00 AZN, Q1, ACTIVE.
- Settings: threshold 50,000.00 AZN; single-source limit 1,000.00 AZN; default deadlines 3 days (RFQ, SSP) and 14 days (Tender); one final-offer round with a 2-day default deadline; RFQ bands 1 / 2 / 3; at most 2 extensions; grade and category qualification valid 12 months; grade bands A 85+, B 70+, C 50+, D below 50; a 6-month wait after a second D; a 10-question qualification questionnaire with points and weights; voting period 3 business days.

**Scenario values (Fill sample)**

1. Alpha Agro LLC registers as a local company, VAT payer, founded 15 Mar 2012, owned by Kamran Aliyev (head, 60%) and Sabina Huseynova (40%), with sample charter and VAT certificate PDFs; the specialist approves. Alpha Agro then fills the qualification questionnaire, scores 78.0, and the specialist confirms grade B. Its profile lists the activity Distributor, the fictional brands AgroMax and NitroGrow, and an ISO 9001 certificate that expires in 20 days, so the EXPIRING badge and the reminder show at once.
2. Alpha Agro applies for Fertilisers with a sample licence PDF; the specialist qualifies it.
3. Leyla creates a PR on the plan line: 2,000 bags × 30.00 AZN, delivery in 30 days to "Central warehouse"; value 60,000.00 AZN. Rashad approves.
4. Nigar starts sourcing: Tender (60,000.00 ≥ 50,000.00), minimum 3 proposals, required Incoterm DDP, named place Central warehouse, delivery mode "Single delivery", payment term "30 days after delivery", technical document required.
5. Beta Trade asks "Can delivery be split into two shipments?"; Nigar answers "Yes, two shipments before the delivery date."
6. Proposals: Alpha Agro 33.04 AZN/bag including 18% VAT, DDP Central warehouse (28.00 excluding VAT, 56,000.00, 20 days); Beta Trade 29.50 without VAT, CIP Baku port (59,000.00, 15 days, flagged "Different terms: Incoterm, named place"); Gamma Supply 27.00 without VAT, DDP Central warehouse (54,000.00, 25 days, technical document without the product certificate). The presenter clicks End deadline now.
7. The committee approves the opening 3 to 0 (minutes MIN-2026-001). Nigar sees the technical documents without prices and disqualifies Gamma Supply ("Missing product certificate"); the prices of Alpha Agro and Beta Trade open. Nigar adds a delivery cost of 1.00 AZN per bag to Beta Trade (port to warehouse), so its evaluated price is 30.50, and requests a final offer from both: Alpha Agro lowers to 27.50 excluding VAT (32.45 with VAT), Beta Trade keeps 29.50. Alpha Agro is the lowest evaluated bid and is sent to the committee.
8. Winner vote: Elchin For, Sevinj For, Tural Against ("Beta Trade delivers 5 days faster") → APPROVED 2 to 1, minutes MIN-2026-002.
9. PO-2026-0001 to Alpha Agro, 55,000.00 AZN excluding VAT, 64,900.00 AZN with 18% VAT; Rashad approves; PO vote 3 to 0, "Same as the approved winner decision", minutes MIN-2026-003.
10. Alpha Agro accepts the PO; the sourcing and the PR become COMPLETED; Beta Trade and Gamma Supply receive "Not awarded".

**Scenario B: Single Source Purchase (optional, about 3 minutes)**

1. Leyla creates a PR on the same plan line: 100 litres of "Foliar fertiliser, 1 L" × 40.00 AZN = 4,000.00 AZN; Rashad approves.
2. Nigar starts sourcing with the method Single Source Purchase, picks Beta Trade from the Fertilisers AVL and, because 4,000.00 is above 1,000.00, adds the justification "Only official distributor of the registered brand" with a sample dealer letter PDF.
3. Beta Trade submits 39.00 AZN per litre; the presenter ends the deadline; the committee sees the "Single Source Purchase" label and approves 3 to 0; the PO follows the same path as Scenario A.

## Figma

TBD

## ERD

Forty-three tables cover the release; every top-level table carries `company_id` so more buying companies can be added later, except the two global ISO dictionaries `incoterm` and `currency`. Paste the block into dbdiagram.io.

```dbml
// VMS Core MVP - paste into https://dbdiagram.io
Table company {
  id uuid [primary key]
  name varchar [not null]
  created_at timestamp
}

Table app_user {
  id uuid [primary key, note: 'same id as the Supabase auth user']
  company_id uuid [ref: > company.id, not null]
  vendor_id uuid [ref: > vendor.id, note: 'set only for vendor users']
  full_name varchar [not null]
  email varchar [unique, not null]
  is_active boolean [default: true]
  created_at timestamp
}

Table user_role {
  id uuid [primary key]
  user_id uuid [ref: > app_user.id, not null]
  role varchar [not null, note: 'REQUESTER | APPROVER | PROCUREMENT_SPECIALIST | COMMITTEE_MEMBER | ADMIN | VENDOR']
}

Table setting {
  company_id uuid [ref: > company.id, not null]
  key varchar [not null, note: 'tender_threshold | rfq_bands | max_extensions | qualification_months | grade_bands | d_block_months | single_source_limit | rfq_days | tender_days | final_offer_days | final_offer_rounds']
  value text [not null]
  indexes {
    (company_id, key) [pk]
  }
}

Table incoterm {
  code varchar(3) [primary key, note: 'Incoterms 2020: EXW FCA CPT CIP DAP DPU DDP FAS FOB CFR CIF']
  name varchar [not null]
  is_active boolean [default: true]
}

Table payment_term {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  name varchar [not null]
  advance_percent decimal(5,2) [default: 0]
  days_after_delivery integer [default: 0]
  is_active boolean [default: true]
}

Table delivery_place {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  name varchar [not null]
  type varchar [not null, note: 'WAREHOUSE | PORT | CITY']
  address text
  is_active boolean [default: true]
}

Table delivery_mode {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  name varchar [not null, note: 'Single delivery | Partial deliveries allowed | Per delivery schedule']
  is_active boolean [default: true]
}

Table currency {
  code varchar(3) [primary key, note: 'ISO 4217, cannot be edited; seed AZN USD EUR TRY RUB GBP CNY']
  name varchar [unique, not null]
  is_active boolean [default: true]
}

Table vendor {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  vendor_type varchar [not null, note: 'LOCAL_COMPANY | INDIVIDUAL | FOREIGN_COMPANY']
  legal_name varchar [not null]
  voen varchar(10) [unique]
  foreign_tax_number varchar(30) [unique]
  country_code varchar(2) [not null]
  id_card_number varchar
  legal_address text
  director_name varchar
  is_vat_payer boolean
  contact_person varchar [not null]
  contact_email varchar [not null]
  phone varchar [not null]
  status varchar [not null, note: 'registration: DRAFT | SUBMITTED | RETURNED | APPROVED | REJECTED']
  standing varchar [note: 'ACTIVE | HOLD | BLACKLISTED; set once APPROVED']
  standing_until date [note: 'end of a HOLD']
  standing_reason text
  founded_on date
  main_activity varchar [note: 'MANUFACTURER | DISTRIBUTOR | OFFICIAL_DEALER | SERVICE_PROVIDER | TRADER | OTHER']
  main_goods text[] [note: 'up to 20']
  bank_guarantee_available boolean
  bank_guarantee_types text[] [note: 'BID | ADVANCE | PERFORMANCE']
  bank_guarantee_max decimal(14,2)
  bank_guarantee_currency varchar(3) [ref: > currency.code]
  review_comment text
  submitted_at timestamp
  created_at timestamp
}

Table vendor_bank_account {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  bank_name varchar [not null]
  iban varchar(34) [not null, note: 'up to 34 letters and digits, stored without spaces']
  swift varchar [not null]
  currency varchar(3) [ref: > currency.code, not null]
  is_main boolean [not null, note: 'exactly one main account per vendor; at least one account']
}

Table vendor_owner {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  full_name varchar [not null]
  id_number varchar [not null, note: 'person ID or company registration number; used for the shared-owner flag']
  share_percent decimal(5,2)
  role varchar [not null, note: 'FOUNDER | SHAREHOLDER | HEAD']
}

Table vendor_brand {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  brand varchar [not null]
  is_official_dealer boolean [default: false]
}

Table vendor_certificate {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  type varchar [not null, note: 'ISO_9001 | ISO_14001 | ISO_45001 | HSE_POLICY | PRODUCT | LICENCE | REFERENCE | CATALOGUE | OTHER']
  number varchar
  issuer varchar
  issued_on date
  expires_on date [note: 'empty = no expiry']
  reminder_sent_at timestamp
  created_at timestamp
}

Table file {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  owner_type varchar [not null, note: 'vendor | vendor_brand | vendor_certificate | questionnaire_answer | category_application | requisition | sourcing | proposal | question | minutes | purchase_order']
  owner_id uuid [not null]
  kind varchar [note: 'charter | id_card | registration_certificate | vat_certificate | licence | technical_document | justification | attachment | pdf']
  file_name varchar [not null]
  mime_type varchar [not null]
  size_bytes integer [not null, note: 'max 10485760']
  storage_path varchar [not null]
  uploaded_by uuid [ref: > app_user.id]
  uploaded_at timestamp
}

Table questionnaire_question {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  section varchar [note: 'e.g. General, Finance, Quality, HSE']
  reviewer_role varchar [note: 'department that reviews this section; review screen in a later phase']
  text text [not null]
  answer_type varchar [not null, note: 'SINGLE_CHOICE | YES_NO']
  weight integer [not null, note: '1 to 5']
  evidence_required boolean [default: false]
  sort_order integer
  is_active boolean [default: true]
}

Table questionnaire_option {
  id uuid [primary key]
  question_id uuid [ref: > questionnaire_question.id, not null]
  label varchar [not null]
  points integer [not null, note: '0 to 10']
}

Table questionnaire_response {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  attempt_no integer [not null]
  status varchar [not null, note: 'DRAFT | SUBMITTED | RETURNED | GRADED | EXPIRED']
  score decimal(4,1)
  grade varchar(1) [note: 'A | B | C | D']
  valid_until date
  review_comment text
  reviewed_by uuid [ref: > app_user.id]
  reviewed_at timestamp
  submitted_at timestamp
}

Table questionnaire_answer {
  id uuid [primary key]
  response_id uuid [ref: > questionnaire_response.id, not null]
  question_id uuid [ref: > questionnaire_question.id, not null]
  option_id uuid [ref: > questionnaire_option.id]
  points_awarded integer [not null]
  adjust_comment text
}

Table category {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  parent_id uuid [ref: > category.id, note: 'empty for a top-level group']
  name varchar [not null]
  licence_required boolean [default: false]
  is_active boolean [default: true]
}

Table item {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  category_id uuid [ref: > category.id, not null]
  code varchar [unique, not null]
  name varchar [not null]
  unit varchar [not null]
  is_active boolean [default: true]
}

Table category_application {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  category_id uuid [ref: > category.id, not null, note: 'a parent covers its child categories']
  status varchar [not null, note: 'PENDING | QUALIFIED | REJECTED | EXPIRED']
  valid_until date
  reason text
  decided_by uuid [ref: > app_user.id]
  decided_at timestamp
  created_at timestamp
}

Table plan_line {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  year integer [not null]
  category_id uuid [ref: > category.id, not null]
  description varchar [not null]
  planned_amount decimal(14,2) [not null]
  quarter varchar(2) [not null, note: 'Q1 | Q2 | Q3 | Q4']
  status varchar [not null, note: 'ACTIVE | CLOSED']
}

Table requisition {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  number varchar [unique, not null, note: 'PR-YYYY-NNNN']
  plan_line_id uuid [ref: > plan_line.id, not null]
  requester_id uuid [ref: > app_user.id, not null]
  status varchar [not null, note: 'DRAFT | PENDING_APPROVAL | RETURNED | APPROVED | REJECTED | IN_SOURCING | COMPLETED']
  estimated_value decimal(14,2) [not null, note: 'excluding VAT']
  decision_comment text
  submitted_at timestamp
  created_at timestamp
}

Table requisition_line {
  id uuid [primary key]
  requisition_id uuid [ref: > requisition.id, not null]
  item_id uuid [ref: > item.id, not null]
  quantity decimal(14,3) [not null]
  estimated_unit_price decimal(14,2) [not null, note: 'excluding VAT']
  delivery_date date [not null]
  delivery_place_id uuid [ref: > delivery_place.id, not null]
  specification text
}

Table sourcing {
  id uuid [primary key, note: 'PRs are linked through sourcing_line, so one sourcing can hold lines of several PRs']
  company_id uuid [ref: > company.id, not null]
  number varchar [unique, not null, note: 'SRC-YYYY-NNNN']
  owner_id uuid [ref: > app_user.id, not null]
  method varchar [not null, note: 'COMPETITIVE | SINGLE_SOURCE']
  type varchar [not null, note: 'RFQ | TENDER | SSP']
  status varchar [not null, note: 'DRAFT | OPEN | CLOSED | AWAITING_OPENING | TECHNICAL_EVALUATION | COMPARISON | FINAL_OFFER_ROUND | IN_COMMITTEE | WINNER_APPROVED | COMPLETED | CANCELLED']
  value decimal(14,2) [not null]
  min_proposals integer [not null]
  deadline timestamp
  extension_count integer [default: 0]
  final_offer_deadline timestamp
  final_offer_rounds_used integer [default: 0]
  required_incoterm varchar(3) [ref: > incoterm.code, note: 'default DDP']
  named_place_id uuid [ref: > delivery_place.id]
  delivery_mode_id uuid [ref: > delivery_mode.id]
  payment_term_id uuid [ref: > payment_term.id]
  tech_doc_required boolean [default: false]
  ssp_justification text [note: 'required above single_source_limit, with a file']
  low_competition_reason text
  cancel_reason text
  created_at timestamp
}

Table sourcing_line {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  requisition_line_id uuid [ref: > requisition_line.id, not null]
  status varchar [not null, note: 'ACTIVE | CANCELLED']
  cancel_reason text
}

Table invitation {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  vendor_id uuid [ref: > vendor.id, not null]
  status varchar [not null, note: 'INVITED | ACCEPTED | DECLINED']
  decline_reason text
}

Table proposal {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  vendor_id uuid [ref: > vendor.id, not null]
  status varchar [not null, note: 'DRAFT | SUBMITTED | WITHDRAWN | PASSED | DISQUALIFIED | AWARDED | NOT_AWARDED']
  incoterm varchar(3) [ref: > incoterm.code, not null]
  named_place_id uuid [ref: > delivery_place.id, not null]
  delivery_mode_id uuid [ref: > delivery_mode.id, not null]
  payment_term_id uuid [ref: > payment_term.id, not null]
  prices_include_vat boolean [not null]
  vat_rate decimal(5,2) [default: 0]
  delivery_days integer
  validity_days integer
  comment text
  disqualify_reason text
  submitted_at timestamp
  indexes {
    (sourcing_id, vendor_id) [unique]
  }
}

Table proposal_line {
  id uuid [primary key]
  proposal_id uuid [ref: > proposal.id, not null]
  sourcing_line_id uuid [ref: > sourcing_line.id, not null]
  round integer [not null, default: 1, note: '1 = first offer, 2 = final offer']
  unit_price decimal(14,2) [not null, note: 'as entered by the vendor']
  indexes {
    (proposal_id, sourcing_line_id, round) [unique]
  }
}

Table final_offer_request {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  vendor_id uuid [ref: > vendor.id, not null]
  message text
  responded_at timestamp
}

Table comparison_cost {
  id uuid [primary key]
  sourcing_line_id uuid [ref: > sourcing_line.id, not null]
  proposal_id uuid [ref: > proposal.id, not null]
  type varchar [not null, note: 'CUSTOMS | DELIVERY | INSURANCE | OTHER']
  amount_per_unit decimal(14,2) [not null]
  note text
  created_by uuid [ref: > app_user.id]
  created_at timestamp
}

Table award_line {
  id uuid [primary key, note: 'a line can be split across vendors; MVP awards the full quantity']
  sourcing_line_id uuid [ref: > sourcing_line.id, not null]
  proposal_line_id uuid [ref: > proposal_line.id, not null, note: 'the winning vendor latest round']
  quantity decimal(14,3) [not null]
  justification text [note: 'required when not the lowest evaluated price']
  status varchar [not null, note: 'ACTIVE | REJECTED | CANCELLED']
  created_at timestamp
}

Table question {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  vendor_id uuid [ref: > vendor.id, note: 'empty for a clarification without a question']
  question_text text
  published_question_text text
  answer_text text
  status varchar [not null, note: 'UNANSWERED | PUBLISHED']
  asked_at timestamp
  published_at timestamp
}

Table committee {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  voting_period_days integer [default: 3]
}

Table committee_member {
  id uuid [primary key]
  committee_id uuid [ref: > committee.id, not null]
  user_id uuid [ref: > app_user.id, not null]
  is_chair boolean [default: false]
}

Table decision {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  type varchar [not null, note: 'OPENING | WINNER | PO']
  sourcing_id uuid [ref: > sourcing.id, not null]
  purchase_order_id uuid [ref: > purchase_order.id, note: 'set for PO decisions']
  status varchar [not null, note: 'VOTING | APPROVED | REJECTED | NO_DECISION']
  result_rule varchar [note: 'MAJORITY | CHAIR_CASTING_VOTE | NO_QUORUM | TIE_WITHOUT_CHAIR | SOURCING_CANCELLED']
  reopened_from_id uuid [ref: > decision.id, note: 'set on a reopened decision']
  reopen_reason text [note: 'required when reopened after REJECTED; shown to the members']
  close_reason text [note: 'cancellation reason when result_rule is SOURCING_CANCELLED']
  opened_at timestamp
  deadline timestamp
  closed_at timestamp
}

Table decision_voter {
  id uuid [primary key]
  decision_id uuid [ref: > decision.id, not null]
  user_id uuid [ref: > app_user.id, not null]
  is_chair boolean [default: false]
  vote varchar [not null, note: 'NONE | FOR | AGAINST | CONFLICT']
  comment text
  voted_at timestamp
}

Table minutes {
  id uuid [primary key]
  decision_id uuid [ref: - decision.id, not null]
  number varchar [unique, not null, note: 'MIN-YYYY-NNN']
  created_at timestamp
}

Table purchase_order {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  number varchar [unique, not null, note: 'PO-YYYY-NNNN']
  sourcing_id uuid [ref: > sourcing.id, not null]
  vendor_id uuid [ref: > vendor.id, not null]
  status varchar [not null, note: 'PENDING_APPROVAL | PENDING_COMMITTEE | FULLY_APPROVED | ACCEPTED | DECLINED_BY_VENDOR | REJECTED']
  incoterm varchar(3) [ref: > incoterm.code]
  named_place_id uuid [ref: > delivery_place.id]
  delivery_mode_id uuid [ref: > delivery_mode.id]
  payment_term_id uuid [ref: > payment_term.id]
  total decimal(14,2) [not null, note: 'excluding VAT']
  vat_amount decimal(14,2)
  total_incl_vat decimal(14,2)
  reason text
  created_at timestamp
}

Table purchase_order_line {
  id uuid [primary key]
  purchase_order_id uuid [ref: > purchase_order.id, not null]
  award_line_id uuid [ref: > award_line.id, not null]
  quantity decimal(14,3) [not null]
  unit_price decimal(14,2) [not null, note: 'excluding VAT, the vendor price without extra costs']
  line_total decimal(14,2) [not null, note: 'excluding VAT']
}

Table notification {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  user_id uuid [ref: > app_user.id, not null]
  event varchar [not null, note: 'message key in messages/en.json, e.g. pr.submitted']
  record_type varchar [not null]
  record_id uuid [not null]
  params jsonb [note: 'values for the message, e.g. PR number; no stored wording']
  is_read boolean [default: false]
  created_at timestamp
}

Table audit_entry {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  record_type varchar [not null]
  record_id uuid [not null]
  from_status varchar
  to_status varchar [not null]
  user_id uuid [ref: > app_user.id]
  reason text
  created_at timestamp [not null]
}
```
