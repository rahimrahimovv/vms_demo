// DEMO-03 AC7: the self-check at the end of `npm run demo:load`. It stops at the first failed check and names it.
import { EMAIL, as, type World } from "./world";

/** Allowed transitions per record type (backlog "Status Transition Model"); "" is the start (no earlier status). */
const EDGES: Record<string, string[]> = {
  sourcing: [
    ":DRAFT", "DRAFT:OPEN", "OPEN:CLOSED", "CLOSED:OPEN", "CLOSED:AWAITING_OPENING", "CLOSED:COMPARISON", "AWAITING_OPENING:TECHNICAL_EVALUATION",
    "TECHNICAL_EVALUATION:COMPARISON", "COMPARISON:FINAL_OFFER_ROUND", "FINAL_OFFER_ROUND:COMPARISON", "COMPARISON:IN_COMMITTEE",
    "IN_COMMITTEE:WINNER_APPROVED", "IN_COMMITTEE:COMPARISON", "WINNER_APPROVED:COMPARISON", "WINNER_APPROVED:COMPLETED", "COMPARISON:COMPLETED",
    ...["DRAFT", "OPEN", "CLOSED", "AWAITING_OPENING", "TECHNICAL_EVALUATION", "COMPARISON", "FINAL_OFFER_ROUND"].map((s) => `${s}:CANCELLED`),
  ],
  requisition: [":DRAFT", ":PENDING_APPROVAL", "DRAFT:PENDING_APPROVAL", "PENDING_APPROVAL:APPROVED", "PENDING_APPROVAL:RETURNED", "PENDING_APPROVAL:REJECTED",
    "RETURNED:PENDING_APPROVAL", "APPROVED:IN_SOURCING", "IN_SOURCING:APPROVED", "IN_SOURCING:COMPLETED"],
  vendor: [":DRAFT", "DRAFT:SUBMITTED", "RETURNED:SUBMITTED", "SUBMITTED:APPROVED", "SUBMITTED:RETURNED", "SUBMITTED:REJECTED", "REJECTED:RETURNED"],
  questionnaire_response: [":DRAFT", "DRAFT:SUBMITTED", "RETURNED:SUBMITTED", "SUBMITTED:GRADED", "SUBMITTED:RETURNED", "GRADED:EXPIRED"],
  category_application: [":PENDING", "PENDING:QUALIFIED", "PENDING:REJECTED", "QUALIFIED:EXPIRED"],
  invitation: [":INVITED", "INVITED:ACCEPTED", "INVITED:DECLINED", "ACCEPTED:DECLINED"],
  proposal: [":DRAFT", ":SUBMITTED", "DRAFT:SUBMITTED", "SUBMITTED:WITHDRAWN", "WITHDRAWN:SUBMITTED", "SUBMITTED:PASSED", "SUBMITTED:DISQUALIFIED", "PASSED:DISQUALIFIED",
    "PASSED:AWARDED", "PASSED:NOT_AWARDED", "SUBMITTED:AWARDED", "SUBMITTED:NOT_AWARDED", "AWARDED:NOT_AWARDED", "NOT_AWARDED:AWARDED"],
  purchase_order: [":PENDING_APPROVAL", "PENDING_APPROVAL:PENDING_COMMITTEE", "PENDING_APPROVAL:REJECTED", "PENDING_COMMITTEE:FULLY_APPROVED", "PENDING_COMMITTEE:REJECTED",
    "FULLY_APPROVED:ACCEPTED", "FULLY_APPROVED:DECLINED_BY_VENDOR"],
  decision: [":VOTING", "VOTING:APPROVED", "VOTING:REJECTED", "VOTING:NO_DECISION"],
  vendor_change_request: [":SUBMITTED", "SUBMITTED:APPROVED", "SUBMITTED:RETURNED", "SUBMITTED:REJECTED", "SUBMITTED:WITHDRAWN", "RETURNED:SUBMITTED", "RETURNED:WITHDRAWN"],
  plan_line: [":ACTIVE", "ACTIVE:CLOSED"],
  question: [":UNANSWERED", "UNANSWERED:PUBLISHED"],
  demo: [":RESET"],
};
/** Tables whose rows carry a status and an audit trail. */
const STATUS_TABLES: Record<string, string> = {
  sourcing: "sourcing", requisition: "requisition", vendor: "vendor", questionnaire_response: "questionnaire_response",
  category_application: "category_application", invitation: "invitation", proposal: "proposal", purchase_order: "purchase_order",
  decision: "decision", vendor_change_request: "vendor_change_request", plan_line: "plan_line", question: "question",
};

export const EXPECTED = {
  vendors: 15, requisitions: 19, sourcings: 12, planLines: 6, purchaseOrders: 4,
  decisionsClosed: 8, decisionsVoting: 3,
  requisitionStatus: { DRAFT: 1, PENDING_APPROVAL: 2, RETURNED: 1, REJECTED: 1, APPROVED: 3, IN_SOURCING: 10, COMPLETED: 1 } as Record<string, number>,
  sourcingStatus: {
    DRAFT: 1, OPEN: 2, CLOSED: 1, AWAITING_OPENING: 1, TECHNICAL_EVALUATION: 1, COMPARISON: 1, FINAL_OFFER_ROUND: 1, IN_COMMITTEE: 1,
    WINNER_APPROVED: 1, COMPLETED: 1, CANCELLED: 1,
  } as Record<string, number>,
  vendorStatus: { DRAFT: 1, SUBMITTED: 3, RETURNED: 1, REJECTED: 1, APPROVED: 9 } as Record<string, number>,
  poStatus: { FULLY_APPROVED: 1, PENDING_COMMITTEE: 1, PENDING_APPROVAL: 1, ACCEPTED: 1 } as Record<string, number>,
};

class Failed extends Error {}
const fail = (m: string): never => { throw new Failed(m); };

async function n(w: World, sql: string, params: unknown[] = []): Promise<number> {
  return Number((await w.db.query(sql, params)).rows[0].n);
}
async function grouped(w: World, table: string): Promise<Record<string, number>> {
  const { rows } = await w.db.query(`select status, count(*)::int as n from public.${table} group by status`);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
function sameCounts(label: string, actual: Record<string, number>, expected: Record<string, number>) {
  const a = JSON.stringify(Object.entries(actual).sort());
  const e = JSON.stringify(Object.entries(expected).sort());
  if (a !== e) fail(`${label}: expected ${e}, found ${a}`);
}

/** Returns the "Loaded: ..." line, or throws with the first failed check. */
export async function selfCheck(w: World, sourcings: Record<string, string>): Promise<string> {
  // 1. counts of the catalogue
  const counts = {
    vendors: await n(w, "select count(*) as n from public.vendor"),
    requisitions: await n(w, "select count(*) as n from public.requisition"),
    sourcings: await n(w, "select count(*) as n from public.sourcing"),
    planLines: await n(w, "select count(*) as n from public.plan_line"),
    purchaseOrders: await n(w, "select count(*) as n from public.purchase_order"),
  };
  for (const [k, v] of Object.entries(counts)) if (v !== (EXPECTED as Record<string, unknown>)[k]) fail(`count of ${k}: expected ${(EXPECTED as Record<string, unknown>)[k]}, found ${v}`);
  const voting = await n(w, "select count(*) as n from public.decision where status = 'VOTING'");
  const closed = await n(w, "select count(*) as n from public.decision where status <> 'VOTING'");
  if (voting !== EXPECTED.decisionsVoting) fail(`open decisions: expected ${EXPECTED.decisionsVoting}, found ${voting}`);
  if (closed !== EXPECTED.decisionsClosed) fail(`closed decisions: expected ${EXPECTED.decisionsClosed}, found ${closed}`);
  const minutes = await n(w, "select count(*) as n from public.minutes");
  if (minutes !== closed) fail(`minutes: expected one per closed decision (${closed}), found ${minutes}`);
  const { rows: nums } = await w.db.query("select number from public.minutes order by number");
  nums.forEach((r, i) => { if (r.number !== `MIN-2026-${String(i + 1).padStart(3, "0")}`) fail(`minutes numbers are not consecutive: ${r.number}`); });
  sameCounts("requisition statuses", await grouped(w, "requisition"), EXPECTED.requisitionStatus);
  sameCounts("sourcing statuses", await grouped(w, "sourcing"), EXPECTED.sourcingStatus);
  sameCounts("vendor statuses", await grouped(w, "vendor"), EXPECTED.vendorStatus);
  sameCounts("PO statuses", await grouped(w, "purchase_order"), EXPECTED.poStatus);
  if ((await n(w, "select count(*) as n from public.vendor_change_request where status = 'SUBMITTED'")) !== 1) fail("expected one SUBMITTED change request");

  // 2. every status is allowed, every row has its audit entry and the last entry says its current status
  const { rows: audit } = await w.db.query("select record_type, coalesce(from_status, '') as f, to_status as t, count(*)::int as c from public.audit_entry group by 1, 2, 3");
  for (const a of audit) {
    const edges = EDGES[a.record_type];
    if (edges && !edges.includes(`${a.f}:${a.t}`)) fail(`transition ${a.record_type} ${a.f || "(none)"} -> ${a.t} is not in the Status Transition Model`);
  }
  for (const [type, table] of Object.entries(STATUS_TABLES)) {
    const { rows } = await w.db.query(
      `select r.id, r.status, (select e.to_status from public.audit_entry e where e.record_type = $1 and e.record_id = r.id order by e.created_at desc, e.id desc limit 1) as last
         from public.${table} r`, [type]);
    for (const r of rows) {
      if (r.last === null) fail(`${type} ${r.id} has no audit entry`);
      if (r.last !== r.status && !(await sameInstant(w, type, r.id, r.status))) fail(`${type} ${r.id}: status ${r.status} but the audit trail ends with ${r.last}`);
    }
  }

  // 3. dates: nothing may close during a demo session
  const soon = "now() + interval '2 days'";
  if ((await n(w, `select count(*) as n from public.sourcing where status = 'OPEN' and deadline < ${soon}`)) > 0) fail("an OPEN sourcing closes within 2 days");
  if ((await n(w, `select count(*) as n from public.sourcing where status = 'FINAL_OFFER_ROUND' and final_offer_deadline < ${soon}`)) > 0) fail("a final-offer round closes within 2 days");
  if ((await n(w, `select count(*) as n from public.decision where status = 'VOTING' and deadline < ${soon}`)) > 0) fail("a voting deadline is within 2 days");

  // 4. live scenario still possible
  if ((await n(w, "select count(*) as n from public.vendor where legal_name ilike 'Kura Agro%'")) > 0) fail("Kura Agro Supply MMC exists");
  const free = Number((await w.db.query(
    `select pl.planned_amount - coalesce((select sum(r.estimated_value) from public.requisition r where r.plan_line_id = pl.id and r.status in ('PENDING_APPROVAL', 'APPROVED', 'IN_SOURCING', 'COMPLETED')), 0) as free
       from public.plan_line pl where pl.description = 'Spring fertiliser programme'`)).rows[0].free);
  if (free < 100000) fail(`plan line "Spring fertiliser programme" has only ${free} free`);
  if ((await n(w, "select count(*) as n from public.item where code in ('FRT-001', 'FRT-004')")) !== 2) fail("the two demo catalogue items are missing");

  // 5. notifications: the demo user of every role has at least 3 unread
  for (const email of [EMAIL.requester, EMAIL.approver, EMAIL.specialist, EMAIL.chair, EMAIL.admin, "sales@beta-trade.test"]) {
    const unread = await n(w, "select count(*) as n from public.notification x join public.app_user u on u.id = x.user_id where lower(u.email) = $1 and not x.is_read", [email]);
    if (unread < 3) fail(`${email} has only ${unread} unread notification(s)`);
  }

  // 6. sealed rules on the loaded data: no price or vendor name reaches a role that must not see it
  await sealedChecks(w, sourcings);

  // 7. every seeded vendor can sign in
  for (const v of w.vendors.values()) await as(w, v.email);

  const decisions = voting + closed;
  return `Loaded: ${counts.vendors} vendors, ${counts.requisitions} PRs, ${counts.sourcings} sourcings, ${decisions} decisions, ${counts.purchaseOrders} POs`;
}

/** Several status rows can be written in one transaction (same instant): then the order is unknown, so accept the status if it is among the last instant's entries. */
async function sameInstant(w: World, type: string, id: string, status: string): Promise<boolean> {
  const { rows } = await w.db.query(
    `select 1 from public.audit_entry e where e.record_type = $1 and e.record_id = $2 and e.to_status = $3
       and e.created_at = (select max(created_at) from public.audit_entry where record_type = $1 and record_id = $2)`, [type, id, status]);
  return rows.length > 0;
}

async function sealedChecks(w: World, s: Record<string, string>) {
  const sealed = [s.S2, s.S3, s.S5, s.S6]; // OPEN, OPEN, AWAITING_OPENING, TECHNICAL_EVALUATION: no price for any internal user
  const { rows: sealedProposals } = await w.db.query("select id, sourcing_id from public.proposal where sourcing_id = any($1)", [sealed]);
  const proposalIds = sealedProposals.map((p) => p.id as string);
  if (proposalIds.length === 0) fail("sealed check: no proposals found on the sealed sourcings");
  for (const email of [EMAIL.specialist, EMAIL.chair, EMAIL.admin, EMAIL.approver, EMAIL.requester]) {
    const client = await as(w, email);
    const prices = await client.from("proposal_line").select("proposal_id").in("proposal_id", proposalIds);
    if ((prices.data ?? []).length > 0) fail(`sealed prices of S2, S3, S5 or S6 are readable by ${email}`);
  }
  // names of bidders: not before the opening (S2, S3 are OPEN; S5 is awaiting the opening decision)
  const openIds = sealedProposals.filter((p) => [s.S2, s.S3, s.S5].includes(p.sourcing_id)).map((p) => p.id as string);
  for (const email of [EMAIL.specialist, EMAIL.chair, EMAIL.admin]) {
    const client = await as(w, email);
    const names = await client.from("proposal").select("id").in("id", openIds);
    if ((names.data ?? []).length > 0) fail(`proposals (vendor names) of S2, S3 or S5 are readable by ${email} before the opening`);
  }
  // the final-offer answers of S8 stay hidden while the round runs
  const { rows: round2 } = await w.db.query("select pl.id from public.proposal_line pl join public.proposal p on p.id = pl.proposal_id where p.sourcing_id = $1 and pl.round = 2", [s.S8]);
  if (round2.length === 0) fail("S8 has no final-offer prices");
  const nigar = await as(w, EMAIL.specialist);
  const hidden = await nigar.from("proposal_line").select("id").in("id", round2.map((r) => r.id as string));
  if ((hidden.data ?? []).length > 0) fail("final-offer prices of S8 are readable by the owner while the round runs");
  // a vendor reads only its own proposals
  const ege = await as(w, "sales@beta-trade.test");
  const { rows: ownerRow } = await w.db.query("select id from public.vendor where legal_name = 'Ege Tarim Kimya A.S.'");
  const others = await ege.from("proposal").select("vendor_id").neq("vendor_id", ownerRow[0].id);
  if ((others.data ?? []).length > 0) fail("a vendor can read the proposals of other vendors");
}
