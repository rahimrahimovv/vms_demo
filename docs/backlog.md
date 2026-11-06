# VMS Core (1C-free): E2E Procurement User Story Backlog

Nov 6, 2026 · @Rahim Rahimov

VMS Core is a generic, 1C-free procurement platform; this backlog covers the MVP that runs one complete procurement, from vendor registration to a vendor-accepted purchase order, for the management demo.

**Document type:** User Story Backlog · **Audience:** Developers, QA, Designers, Sprint Team · **Owner:** @Rahim Rahimov · **Last updated:** Nov 6, 2026

## Epic Overview

### Backlog Hierarchy

```
VMS-CORE (Epic) - E2E procurement MVP, 23 stories
├── PLT  Platform
│   ├── PLT-01  Sign in and see only your role's screens
│   └── PLT-02  Get in-app notifications; keep an audit trail
├── REG  Vendor onboarding
│   ├── REG-01  Vendor registers (local, individual, foreign)
│   ├── REG-02  Specialist approves, returns or rejects registration
│   ├── REG-03  Vendor applies for categories
│   ├── REG-04  Specialist qualifies category; vendor joins AVL
│   └── REG-05  Vendor fills questionnaire; specialist confirms A–D grade
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
│   └── RFQ-05  Specialist evaluates and proposes the winner
├── CMT  Committee
│   ├── CMT-01  Admin configures the committee
│   ├── CMT-02  Committee votes on a winner or a PO decision
│   └── CMT-03  System generates numbered minutes
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
- Vendor onboarding: self-registration for local companies, individuals and foreign companies; specialist review (approve, return for correction, reject); a qualification questionnaire with scoring and an A–D grade; category applications with licence proof where the category requires it; category qualification valid for 12 months; the Approved Vendor List (AVL) per category.
- Planning: annual plan lines; every PR is linked to a plan line and shows the remaining amount.
- Purchase requisition: lines picked from the item catalogue; single-level approval.
- Sourcing: RFQ or Tender chosen by value against a threshold; invitations to AVL vendors; accept or decline with a reason; sealed proposals; Q\&A; deadline handling (extend, continue with a reason, cancel); Tender technical pass or fail; price comparison; proposed winner.
- Committee: configuration, a winner vote and a PO vote, numbered minutes for each decision.
- Purchase order: one PO per winning vendor; Approver, then committee, then vendor acceptance.
- Demo mode: role switcher, sample fill, end-deadline-now, reset; one seeded scenario.
- High-urgency items delivered (18 of 46): #1 (plan lines only), #9, #15, #26, #29, #30, #31, #33, #34, #41 (result notice only, no debrief), #46 (minutes in English, no chair sign-off yet), #55 (grade and category valid 12 months, then re-qualification), #83, #86, #90, #91 (format, VAT status, duplicates; no Tax Service lookup), #105, #110.

**If time allows (cut first when late)**

- \#54 owners and shareholders, #97 bank guarantee capacity, #100 activity and brands, #106 certificates with expiry, #53 critical supplier flag, #12 lead-time warning per category, #16 single-source limit and justification, #49 non-voting observers, #40 committee returns the evaluation.

**Out of scope (non-goals)**

- 1C or any other ERP integration.
- Price Agreements (PA); every award is a purchase order.
- Budget check, warehouse receipt, invoice and payment (#6, #7, #73, #77).
- Automatic RFQ-to-Tender conversion when bids exceed the threshold.
- E-mail and SMS notifications, OTP sign-in.
- Mobile layouts and the Azerbaijani UI.
- Real client or vendor data; the demo uses synthetic data only.

**Later phases**

- E-mail notifications (#114); Azerbaijani UI; bilingual minutes and chair sign-off (#46).
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
4. **Given** any type, **When** the form renders, **Then** it also requires contact person, contact e-mail (used to sign in), phone, password of at least 8 characters, bank name, IBAN and SWIFT.
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
4. **Given** the AVL page, **When** the specialist filters by category, **Then** it lists only vendors with a valid grade A, B or C and a QUALIFIED, unexpired application in that category, with vendor name, type, country, grade and "Valid until". \[revised\]

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
7. **Given** a vendor whose first attempt is graded D, **When** they open Qualification, **Then** they may start one new attempt at once; **Given** the second consecutive attempt is also graded D, **Then** new attempts are blocked for 6 months from that confirmation date and the page shows "You can apply again on \<date>".
8. **Given** a grade A, B or C, **When** its valid-until date passes, **Then** the questionnaire becomes EXPIRED, the vendor leaves the AVL in every category, and a new questionnaire is needed (#55).
9. **Given** a vendor, **When** they use the portal, **Then** they never see another vendor's grade or score.

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
2. **Given** an ACTIVE line, **When** the Admin closes it, **Then** it becomes CLOSED and can no longer be picked on a new PR; PRs already linked keep the link.
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
2. **Given** a PR line, **When** the Requester picks a catalogue item, **Then** item code, name, category and unit fill in from the catalogue and cannot be edited, and the Requester enters quantity (greater than 0), estimated unit price in AZN (greater than 0, 2 decimals), required delivery date, delivery place and an optional specification text of up to 2,000 characters.
3. **Given** a required delivery date earlier than tomorrow, **When** the Requester saves, **Then** "Delivery date must be in the future" appears on that line.
4. **Given** lines with quantity and price, **When** any of them changes, **Then** the estimated value (sum of quantity × estimated unit price) updates on screen, formatted like 60,000.00 AZN.
5. **Given** a PR with at least one valid line, **When** the Requester clicks Save, **Then** it is stored as DRAFT with a number PR-YYYY-NNNN; **When** they click Submit, **Then** it becomes PENDING\_APPROVAL, read-only for the Requester, and every Approver except the Requester is notified.
6. **Given** a PR with no lines, **When** the Requester clicks Submit, **Then** "Add at least one line" appears.
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
2. **Given** a new sourcing, **When** it is created, **Then** its type is TENDER if the PR's estimated value is at or above the threshold (Admin setting, default 50,000.00 AZN) and RFQ otherwise, and the screen shows the reason, e.g. "Value 60,000.00 AZN ≥ threshold 50,000.00 AZN: Tender".
3. **Given** the sourcing type, **When** it is set, **Then** the minimum number of proposals is 3 for a Tender (#26) and, for an RFQ, comes from the Admin value bands: 1 up to 5,000 AZN, 2 above 5,000 up to 15,000 AZN, 3 above 15,000 AZN (#15).
4. **Given** a DRAFT sourcing, **When** the specialist edits it, **Then** they must set a proposal deadline (date and time, Asia/Baku, later than now), delivery terms and payment terms; a Tender also has "Technical document required: Yes / No", default Yes.
5. **Given** a DRAFT sourcing, **When** it opens, **Then** the invitation list holds every vendor with a valid grade A, B or C and a QUALIFIED, unexpired application in the PR's category; the specialist may remove vendors, and a warning shows when fewer vendors remain than the minimum number of proposals. \[revised\]
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

1. **Given** an invitation in INVITED, **When** the vendor opens it, **Then** they see sourcing number, type, lines (item, quantity, unit, delivery date, delivery place, specification), delivery and payment terms, deadline and time remaining.
2. **Given** an INVITED invitation, **When** the vendor clicks Decline, **Then** a reason is required; on confirm the invitation becomes DECLINED, the specialist sees the reason and the vendor can no longer submit (#110).
3. **Given** an INVITED invitation, **When** the vendor clicks Accept, **Then** it becomes ACCEPTED and the vendor can fill one proposal: unit price in AZN per line (greater than 0, 2 decimals; a line may be left without an offer), delivery lead time in days, validity in days and a comment.
4. **Given** a Tender with "Technical document required: Yes", **When** the vendor submits without a technical document file, **Then** "Attach the technical document" appears.
5. **Given** a proposal with at least one priced line, **When** the vendor clicks Submit before the deadline, **Then** it becomes SUBMITTED and its total (sum of quantity × unit price over priced lines) is shown to the vendor.
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
2. **Given** a CLOSED sourcing with submitted proposals at or above the minimum, **When** it closes, **Then** a Tender moves to TECHNICAL\_EVALUATION and an RFQ to COMPARISON, the owner is notified, and prices become visible to the owner, the committee members and the Admin.
3. **Given** a CLOSED sourcing below the minimum, **When** the owner opens it, **Then** it shows "Below minimum: N of M proposals" with three actions: Extend, Continue, Cancel.
4. **Given** Extend, **When** the owner sets a new deadline later than now and a reason, **Then** the sourcing returns to OPEN, invited vendors that have not declined are notified of the new deadline, and the extension count rises by 1; after 2 extensions (Admin setting) Extend is disabled with "Maximum number of extensions reached".
5. **Given** Continue, **When** the owner enters a reason, **Then** the sourcing moves on as in criterion 2 and the reason is stored for the committee package (#26); with 0 proposals Continue is not offered.
6. **Given** a sourcing in DRAFT, OPEN, CLOSED, TECHNICAL\_EVALUATION or COMPARISON, **When** the owner clicks Cancel and enters a reason, **Then** it becomes CANCELLED, invited vendors that have not declined are notified with the reason (#34), and the PR returns to APPROVED.

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

1. **Given** a Tender in TECHNICAL\_EVALUATION, **When** the owner marks each submitted proposal PASSED or DISQUALIFIED, **Then** DISQUALIFIED requires a reason (e.g. "Missing certificate"), and once every proposal is marked the sourcing moves to COMPARISON (#33).
2. **Given** an RFQ or Tender in COMPARISON, **When** the owner disqualifies a proposal with a reason, **Then** it leaves the comparison and the reason is kept (#33).
3. **Given** COMPARISON, **When** the owner opens the comparison table, **Then** rows are the lines, columns are the eligible vendors, each cell shows unit price and line total, the lowest unit price per line is highlighted, delivery days, validity and grade show per vendor, and disqualified proposals are listed below with their reasons. \[revised\]
4. **Given** the comparison table, **When** it loads, **Then** each line's proposed winner defaults to the lowest eligible unit price; choosing another vendor requires a justification, and a line with no eligible offer can only be cancelled with a reason.
5. **Given** a line with fewer eligible proposals than the minimum and no reason stored yet, **When** the owner clicks Send to committee, **Then** a low-competition reason is required (#26).
6. **Given** every line has a proposed winner or is cancelled, **When** the owner clicks Send to committee, **Then** the sourcing becomes IN\_COMMITTEE and a winner decision opens (CMT-02) with the comparison table, disqualifications, justifications and any low-competition reason.
7. **Given** lines sent back after a rejection (winner decision rejected, PO rejected or declined), **When** the owner opens COMPARISON, **Then** the previous winner of those lines is marked and excluded, and the owner proposes the next vendor or cancels the line with a reason.

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

1. **Given** a decision opens (type WINNER or PO), **When** it is created, **Then** its eligible voters are the committee members at that moment except the sourcing owner, each is notified, and it stays VOTING until the voting period ends.
2. **Given** a WINNER decision, **When** a member opens it, **Then** they see the comparison table, disqualifications with reasons, justifications for non-lowest winners and any low-competition reason.
3. **Given** a PO decision, **When** a member opens it, **Then** they see the PO and every difference from the approved winner decision in vendor, item, quantity, unit price, total, delivery terms or payment terms, or "Same as the approved winner decision" when there is none.
4. **Given** a VOTING decision, **When** a member votes Against, **Then** a comment is required; a vote For needs none; a submitted vote cannot be changed.
5. **Given** a VOTING decision, **When** a member clicks Declare conflict of interest and enters a comment, **Then** they cannot vote on it and are removed from its eligible voters.
6. **Given** a VOTING decision, **When** a member looks at it, **Then** they see who has voted but not how, until the decision closes.
7. **Given** every eligible voter has voted or the voting period has ended, **When** the decision closes, **Then** with votes cast not more than half of eligible voters it becomes NO\_DECISION ("No quorum"); otherwise more For than Against makes it APPROVED, more Against than For makes it REJECTED, and a tie follows the Chair's vote, or becomes NO\_DECISION ("Tie without the Chair's vote") if the Chair has not voted.
8. **Given** a NO\_DECISION decision, **When** the sourcing owner clicks Reopen vote, **Then** a new VOTING decision with the same package and a new voting period opens.
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
2. **Given** minutes, **When** they are opened, **Then** they show the number, decision type, sourcing and PO numbers, opening and closing time, eligible voters, each member's vote (For, Against, Conflict of interest, Did not vote) with comments, the result and the rule applied (majority, Chair's casting vote, no quorum, tie without the Chair's vote).
3. **Given** minutes on screen, **When** the user clicks Download, **Then** a PDF in English with the same content is downloaded.
4. **Given** minutes, **When** anyone tries to edit or delete them, **Then** the action is refused.
5. **Given** a Vendor, **When** they use the portal, **Then** minutes are never visible to them.

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

1. **Given** a WINNER decision becomes APPROVED, **When** it closes, **Then** one PO PO-YYYY-NNNN is created per winning vendor, holding every line that vendor won.
2. **Given** a new PO, **When** it is opened, **Then** it shows vendor, lines (item, quantity, unit, unit price, line total, delivery date, delivery place), total in AZN, delivery terms, payment terms and links to the sourcing and the winner decision's minutes.
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
| Manage users, catalogue, categories, settings, committee | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

Owner means the Procurement Specialist who started the sourcing; other specialists can read it. Demo tools (DEMO-01) are open to everyone, and only while demo mode is on.

## Status Transition Model

Nine entities carry a status; the sourcing is the one with loops, so it is drawn, and every entity's allowed transitions are listed below.

&#91;embedded content: sourcing lifecycle · 9 statuses, 4 loops\]

A rejected winner, a rejected PO or a declined PO sends only the affected lines back to COMPARISON; the other lines keep their POs.

**Sourcing**

| From | To | Trigger | Allowed roles | Notes |
| --- | --- | --- | --- | --- |
| (none) | DRAFT | Start sourcing on an APPROVED PR | Procurement Specialist | Type set by value |
| DRAFT | OPEN | Publish | Owner | At least one invitee |
| OPEN | CLOSED | Deadline passes | System | Within 1 minute |
| CLOSED | OPEN | Extend | Owner | Reason; at most 2 times |
| CLOSED | TECHNICAL\_EVALUATION | Minimum reached, or Continue | System or Owner | Tender only |
| CLOSED | COMPARISON | Minimum reached, or Continue | System or Owner | RFQ only; Continue needs a reason |
| TECHNICAL\_EVALUATION | COMPARISON | Every proposal marked PASSED or DISQUALIFIED | Owner |  |
| COMPARISON | IN\_COMMITTEE | Send to committee | Owner | Every line has a winner or is cancelled |
| IN\_COMMITTEE | WINNER\_APPROVED | Winner decision APPROVED | System | POs created |
| IN\_COMMITTEE | COMPARISON | Winner decision REJECTED | System | Rejected winners excluded |
| WINNER\_APPROVED | COMPARISON | A PO is REJECTED or DECLINED\_BY\_VENDOR | System | Only that PO's lines |
| WINNER\_APPROVED | COMPLETED | Every line is on an ACCEPTED PO or cancelled | System | PR becomes COMPLETED |
| DRAFT, OPEN, CLOSED, TECHNICAL\_EVALUATION, COMPARISON | CANCELLED | Cancel | Owner | Reason; vendors notified; PR back to APPROVED |

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
| (none) | VOTING | Send to committee, PO approved by the Approver, or Reopen vote | Owner or System | Type WINNER or PO |
| VOTING | APPROVED | All voted or period ended; quorum; more For, or tie with the Chair For | System | Minutes created |
| VOTING | REJECTED | All voted or period ended; quorum; more Against, or tie with the Chair Against | System | Minutes created |
| VOTING | NO\_DECISION | No quorum, or tie without the Chair's vote | System | Minutes created; owner may reopen |

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
| Committee decision opened | Eligible committee members | In-app | Decision type (winner or PO), sourcing, voting deadline | No |
| Committee decision closed | Sourcing owner, committee members | In-app | Result, minutes number | No |
| PO created | Approvers except the PR's Requester | In-app | PO number, vendor, total | No |
| PO rejected by the Approver | Sourcing owner | In-app | PO number, reason | No |
| PO fully approved | Vendor, sourcing owner, Requester | In-app | PO number, total | No |
| PO accepted | Sourcing owner, Requester | In-app | PO number | No |
| PO declined by the vendor | Sourcing owner | In-app | PO number, reason | No |
| Sourcing completed | Every vendor with a submitted proposal | In-app | Lines won, or "Not awarded" (#41) | No |

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
| PR estimated value | Sum over lines of quantity × estimated unit price | 2,000 × 30.00 = 60,000.00 AZN |
| Sourcing type | TENDER if value ≥ threshold, otherwise RFQ (threshold default 50,000.00 AZN) | 60,000.00 → Tender; 50,000.00 → Tender; 49,999.99 → RFQ |
| Minimum proposals | Tender: 3. RFQ: 1 if value ≤ 5,000.00; 2 if above 5,000.00 and ≤ 15,000.00; 3 if above 15,000.00 | RFQ 3,000.00 → 1; 15,000.00 → 2; 40,000.00 → 3 |
| Plan remaining | Planned amount − committed amount (PRs in PENDING\_APPROVAL, APPROVED, IN\_SOURCING, COMPLETED) | 500,000.00 − 60,000.00 = 440,000.00 AZN |
| Proposal total | Sum over priced lines of quantity × unit price | 2,000 × 28.00 = 56,000.00 AZN |
| Default winner per line | Lowest unit price among eligible (not disqualified) proposals | C 27.00 disqualified → A 28.00 proposed |
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
| Vendor C (local) | Gamma Supply LLC, grade C, already QUALIFIED in Fertilisers | office@gamma-supply.test |
| Vendor A (local) | Alpha Agro LLC, not seeded: registers live | info@alpha-agro.test |

**Master data and settings**

- Buying company: Demo Agro LLC.
- Catalogue: 25 items in 5 categories (Fertilisers, Seeds, Plant protection, Spare parts, Office supplies); Fertilisers is marked "Licence proof required"; demo item "Ammonium nitrate 34.4%, 50 kg bag", unit bag.
- Plan line: 2026, Fertilisers, "Spring fertiliser programme", 500,000.00 AZN, Q1, ACTIVE.
- Settings: threshold 50,000.00 AZN; RFQ bands 1 / 2 / 3; at most 2 extensions; grade and category qualification valid 12 months; grade bands A 85+, B 70+, C 50+, D below 50; a 6-month wait after a second D; a 10-question qualification questionnaire with points and weights; voting period 3 business days.

**Scenario values (Fill sample)**

1. Alpha Agro LLC registers as a local company, VAT payer, with sample charter and VAT certificate PDFs; the specialist approves. Alpha Agro then fills the qualification questionnaire, scores 78.0, and the specialist confirms grade B.
2. Alpha Agro applies for Fertilisers with a sample licence PDF; the specialist qualifies it.
3. Leyla creates a PR on the plan line: 2,000 bags × 30.00 AZN, delivery in 30 days to "Central warehouse"; value 60,000.00 AZN. Rashad approves.
4. Nigar starts sourcing: Tender (60,000.00 ≥ 50,000.00), minimum 3 proposals, delivery "Delivered to Central warehouse", payment "30 days after delivery", technical document required.
5. Beta Trade asks "Can delivery be split into two shipments?"; Nigar answers "Yes, two shipments before the delivery date."
6. Proposals: Alpha Agro 28.00 AZN/bag (56,000.00, 20 days); Beta Trade 29.50 (59,000.00, 15 days); Gamma Supply 27.00 (54,000.00, 25 days, technical document without the product certificate). The presenter clicks End deadline now.
7. Nigar disqualifies Gamma Supply ("Missing product certificate"); Alpha Agro is the lowest eligible bid and is sent to the committee.
8. Winner vote: Elchin For, Sevinj For, Tural Against ("Beta Trade delivers 5 days faster") → APPROVED 2 to 1, minutes MIN-2026-001.
9. PO-2026-0001 to Alpha Agro, 56,000.00 AZN; Rashad approves; PO vote 3 to 0, "Same as the approved winner decision", minutes MIN-2026-002.
10. Alpha Agro accepts the PO; the sourcing and the PR become COMPLETED; Beta Trade and Gamma Supply receive "Not awarded".

## Figma

TBD

## ERD

Thirty-one tables cover the release; every top-level table carries `company_id` so more buying companies can be added later. Paste the block into dbdiagram.io.

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
  key varchar [not null, note: 'tender_threshold | rfq_bands | max_extensions | qualification_months | voting_period_days | grade_bands | d_block_months']
  value text [not null]
  indexes {
    (company_id, key) [pk]
  }
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
  bank_name varchar [not null]
  iban varchar [not null]
  swift varchar [not null]
  status varchar [not null, note: 'DRAFT | SUBMITTED | RETURNED | APPROVED | REJECTED']
  review_comment text
  submitted_at timestamp
  created_at timestamp
}

Table file {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  owner_type varchar [not null, note: 'vendor | questionnaire_answer | category_application | requisition | proposal | question | minutes | purchase_order']
  owner_id uuid [not null]
  kind varchar [note: 'charter | id_card | registration_certificate | vat_certificate | licence | technical_document | attachment | pdf']
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
  blocked_until date [note: 'set after a second consecutive D']
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
  name varchar [not null]
  licence_required boolean [default: false]
}

Table item {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  category_id uuid [ref: > category.id, not null]
  code varchar [unique, not null]
  name varchar [not null]
  unit varchar [not null]
}

Table category_application {
  id uuid [primary key]
  vendor_id uuid [ref: > vendor.id, not null]
  category_id uuid [ref: > category.id, not null]
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
  estimated_value decimal(14,2) [not null]
  decision_comment text
  submitted_at timestamp
  created_at timestamp
}

Table requisition_line {
  id uuid [primary key]
  requisition_id uuid [ref: > requisition.id, not null]
  item_id uuid [ref: > item.id, not null]
  quantity decimal(14,3) [not null]
  estimated_unit_price decimal(14,2) [not null]
  delivery_date date [not null]
  delivery_place varchar [not null]
  specification text
}

Table sourcing {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  number varchar [unique, not null, note: 'SRC-YYYY-NNNN']
  requisition_id uuid [ref: > requisition.id, not null]
  owner_id uuid [ref: > app_user.id, not null]
  type varchar [not null, note: 'RFQ | TENDER']
  status varchar [not null, note: 'DRAFT | OPEN | CLOSED | TECHNICAL_EVALUATION | COMPARISON | IN_COMMITTEE | WINNER_APPROVED | COMPLETED | CANCELLED']
  value decimal(14,2) [not null]
  min_proposals integer [not null]
  deadline timestamp
  extension_count integer [default: 0]
  delivery_terms text
  payment_terms text
  tech_doc_required boolean [default: false]
  low_competition_reason text
  cancel_reason text
  created_at timestamp
}

Table sourcing_line {
  id uuid [primary key]
  sourcing_id uuid [ref: > sourcing.id, not null]
  requisition_line_id uuid [ref: > requisition_line.id, not null]
  status varchar [not null, note: 'ACTIVE | CANCELLED']
  winner_proposal_line_id uuid [ref: > proposal_line.id]
  winner_justification text
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
  unit_price decimal(14,2) [not null]
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
  type varchar [not null, note: 'WINNER | PO']
  sourcing_id uuid [ref: > sourcing.id, not null]
  purchase_order_id uuid [ref: > purchase_order.id, note: 'set for PO decisions']
  status varchar [not null, note: 'VOTING | APPROVED | REJECTED | NO_DECISION']
  result_rule varchar [note: 'MAJORITY | CHAIR_CASTING_VOTE | NO_QUORUM | TIE_WITHOUT_CHAIR']
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
  total decimal(14,2) [not null]
  delivery_terms text
  payment_terms text
  reason text
  created_at timestamp
}

Table purchase_order_line {
  id uuid [primary key]
  purchase_order_id uuid [ref: > purchase_order.id, not null]
  sourcing_line_id uuid [ref: > sourcing_line.id, not null]
  proposal_line_id uuid [ref: > proposal_line.id, not null]
  quantity decimal(14,3) [not null]
  unit_price decimal(14,2) [not null]
  line_total decimal(14,2) [not null]
}

Table notification {
  id uuid [primary key]
  company_id uuid [ref: > company.id, not null]
  user_id uuid [ref: > app_user.id, not null]
  event varchar [not null]
  record_type varchar [not null]
  record_id uuid [not null]
  text varchar [not null]
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
