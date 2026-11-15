// DEMO-03: plan lines, the 19 requisitions and the 12 sourcings S1 to S12 with their decisions and purchase orders.
// Every step is the application's own database function, called as the user who would do it. Documents with a number
// (PR, SRC, PO, MIN) are created strictly one after another, oldest story first, so the numbers rise with their dates.
import { CAT, COMMITTEE, EMAIL, MODE, PAYMENT, PLACE, attach, backdate, bakuDate, call, callAdmin, hoursFromNow, itemId, userId, type World } from "./world";

const NIGAR = EMAIL.specialist;
const LEYLA = EMAIL.requester;
const RASHAD = EMAIL.approver;

export type Line = { item: number; qty: number; price: number };
export type Ctx = { w: World; plan: Record<string, string>; prs: Record<string, string>; sourcings: Record<string, string> };

const vendorMail = (w: World, key: string) => {
  const v = w.vendors.get(key);
  if (!v) throw new Error(`vendor ${key} was not built`);
  return v;
};

// ---------------- plan lines (Admin) ----------------
export const SPRING_FERTILISER_PLAN = "00000000-0000-4000-8000-000000000801";

export async function createPlanLines(w: World): Promise<Record<string, string>> {
  const plan: Record<string, string> = { fertilisers: SPRING_FERTILISER_PLAN };
  const rows: [string, string, string, number, string][] = [
    ["irrigation", CAT.irrigation, "Irrigation modernisation 2026", 300000, "Q2"],
    ["seeds", CAT.seeds, "Seed purchase 2026", 200000, "Q1"],
    ["spareParts", CAT.spareParts, "Machinery spare parts 2026", 250000, "Q2"],
    ["plantProtection", CAT.plantProtection, "Plant protection season 2026", 150000, "Q2"],
    ["office", CAT.office, "Office supplies 2026", 10000, "Q4"],
  ];
  for (const [key, category, description, amount, quarter] of rows) {
    plan[key] = await call<string>(w, EMAIL.admin, "plan_line_save", {
      p_id: null, p_year: 2026, p_category_id: category, p_description: description, p_planned_amount: amount, p_quarter: quarter,
    });
  }
  return plan;
}

// ---------------- requisitions ----------------
const sorted = (lines: Line[]) => [...lines].sort((a, b) => a.item - b.item);

export async function makePr(
  w: World, planLine: string, lines: Line[],
  opts: { submit?: boolean; decide?: "APPROVE" | "RETURN" | "REJECT"; comment?: string; shiftDays?: number } = {},
): Promise<string> {
  const delivery = bakuDate(45);
  const id = await call<string>(w, LEYLA, "requisition_save", {
    p_id: null, p_plan_line_id: planLine, p_submit: opts.submit ?? true,
    p_lines: sorted(lines).map((l) => ({
      item_id: itemId(l.item), quantity: l.qty, estimated_unit_price: l.price, delivery_date: delivery, delivery_place_id: PLACE,
      specification: "As in the item catalogue",
    })),
  });
  if (opts.decide) await call(w, RASHAD, "requisition_decide", { p_id: id, p_decision: opts.decide, p_comment: opts.comment ?? null });
  return id;
}

// ---------------- sourcing helpers ----------------
export async function startSourcing(
  ctx: Ctx, pr: string,
  o: { deadlineHours: number; ssp?: string; justification?: string; justificationFile?: boolean },
): Promise<string> {
  const { w } = ctx;
  const id = await call<string>(w, NIGAR, "sourcing_start", { p_requisition: pr, p_method: o.ssp ? "SINGLE_SOURCE" : "COMPETITIVE", p_ssp_vendor: o.ssp ?? null });
  await call(w, NIGAR, "sourcing_save", {
    p_id: id, p_deadline: hoursFromNow(o.deadlineHours), p_incoterm: "DDP", p_named_place: PLACE, p_delivery_mode: MODE,
    p_payment_term: PAYMENT, p_tech_doc: false, p_justification: o.justification ?? "", p_excluded: [],
  });
  if (o.justificationFile) await attach(w, { type: "sourcing", id }, "justification", "single-source-justification.pdf", await userId(w, NIGAR), "Single source justification");
  return id;
}

export const publish = (w: World, id: string) => call(w, NIGAR, "sourcing_publish", { p_id: id });

export async function sourcingLines(w: World, id: string): Promise<string[]> {
  const { rows } = await w.db.query(
    "select sl.id from public.sourcing_line sl join public.requisition_line rl on rl.id = sl.requisition_line_id where sl.sourcing_id = $1 order by rl.item_id", [id]);
  return rows.map((r) => r.id as string);
}

export async function accept(w: World, key: string, sourcing: string) {
  await call(w, vendorMail(w, key).email, "invitation_accept", { p_sourcing: sourcing });
}
export async function decline(w: World, key: string, sourcing: string, reason: string) {
  await call(w, vendorMail(w, key).email, "invitation_decline", { p_sourcing: sourcing, p_reason: reason });
}
export async function offer(w: World, key: string, sourcing: string, prices: number[], o: { vat?: number; incoterm?: string } = {}) {
  const email = vendorMail(w, key).email;
  await accept(w, key, sourcing);
  const ids = await sourcingLines(w, sourcing);
  await call(w, email, "proposal_save", {
    p_sourcing: sourcing, p_submit: true,
    p_terms: {
      incoterm: o.incoterm ?? "DDP", named_place_id: PLACE, delivery_mode_id: MODE, payment_term_id: PAYMENT,
      prices_include_vat: Boolean(o.vat), vat_rate: o.vat ?? 0, delivery_days: 21, validity_days: 45, comment: "",
    },
    p_lines: ids.map((id, i) => ({ sourcing_line_id: id, unit_price: prices[i] })),
  });
}

/** Vendors answer side by side: proposals and answers carry no document number, so their order does not matter. */
export const together = (...jobs: Promise<unknown>[]) => Promise.all(jobs).then(() => undefined);

/** "End deadline now": the same call as the demo bar (it runs the deadline job at once). */
export async function closeNow(w: World, id: string) {
  await callAdmin(w, "demo_end_deadline", { p_sourcing: id });
}

export async function statusOf(w: World, table: "sourcing" | "requisition" | "purchase_order" | "decision", id: string): Promise<string> {
  const { rows } = await w.db.query(`select status from public.${table} where id = $1`, [id]);
  return rows[0]?.status as string;
}

async function openDecision(w: World, sourcing: string, type: "OPENING" | "WINNER" | "PO", po?: string): Promise<string> {
  const { rows } = await w.db.query(
    "select id from public.decision where sourcing_id = $1 and type = $2 and status = 'VOTING' and purchase_order_id is not distinct from $3", [sourcing, type, po ?? null]);
  if (rows.length !== 1) throw new Error(`expected one open ${type} decision of ${sourcing}, found ${rows.length}`);
  return rows[0].id as string;
}

export async function vote(w: World, decision: string, member: string, v: "FOR" | "AGAINST", comment = "") {
  await call(w, member, "decision_vote", { p_decision: decision, p_vote: v, p_comment: comment });
}
/** All members vote For; a decision that closes before the last vote (outcome settled) simply ends the loop. */
const allVote = async (w: World, decision: string) => {
  for (const m of COMMITTEE) {
    if ((await statusOf(w, "decision", decision)) !== "VOTING") return;
    await vote(w, decision, m, "FOR");
  }
};

async function sendToCommittee(w: World, id: string) {
  try {
    await call(w, NIGAR, "sourcing_send_to_committee", { p_id: id, p_reason: "" });
  } catch (e) {
    if (!String(e).includes("lowCompetitionReason")) throw e;
    await call(w, NIGAR, "sourcing_send_to_committee", { p_id: id, p_reason: "Only the qualified vendors of this category responded within the deadline" });
  }
}

async function poIds(w: World, sourcing: string): Promise<{ id: string; vendor_id: string }[]> {
  const { rows } = await w.db.query("select id, vendor_id from public.purchase_order where sourcing_id = $1 order by number", [sourcing]);
  return rows;
}
const vendorEmailById = (w: World, id: string) => [...w.vendors.values()].find((v) => v.id === id)!.email;

async function expect(w: World, table: "sourcing" | "requisition" | "purchase_order", id: string, status: string, what: string) {
  const actual = await statusOf(w, table, id);
  if (actual !== status) throw new Error(`${what}: expected ${status}, found ${actual}`);
}

/** The PR and the sourcing of a story are moved into the past together (the sourcing a day later than its PR). */
async function age(ctx: Ctx, key: string, pr: string, sourcing: string | null, days: number) {
  await backdate(ctx.w, "requisition", pr, days);
  if (sourcing) await backdate(ctx.w, "sourcing", sourcing, days - 1);
  ctx.prs[key] = pr;
  if (sourcing) ctx.sourcings[key] = sourcing;
}

const tender = (ctx: Ctx, key: string) => ctx.sourcings[key];

// ---------------- the stories, oldest first ----------------

/** S6: Tender, Plant protection 64,000: opening approved 3 to 0 (MIN-001), technical evaluation, 1 of 3 marked PASSED. */
export async function s6(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.plantProtection, [{ item: 11, qty: 300, price: 80 }, { item: 12, qty: 500, price: 50 }, { item: 14, qty: 300, price: 50 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "delta", id, [78, 49, 49]),
    offer(w, "eta", id, [80, 50, 52]),
    offer(w, "epsilon", id, [79, 52, 50]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "AWAITING_OPENING", "S6");
  await allVote(w, await openDecision(w, id, "OPENING"));
  await expect(w, "sourcing", id, "TECHNICAL_EVALUATION", "S6");
  const { rows } = await w.db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, w.vendors.get("delta")!.id]);
  await call(w, NIGAR, "proposal_evaluate", { p_proposal: rows[0].id, p_result: "PASSED", p_reason: null });
  await age(ctx, "S6", pr, id, 36);
}

/** S7: RFQ, Spare parts 9,500: the winner decision was REJECTED 1 to 2 (MIN-002), the rejected winner is excluded, customs 0.40 added. */
export async function s7(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.spareParts, [{ item: 17, qty: 200, price: 20 }, { item: 18, qty: 250, price: 22 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "epsilon", id, [19.5, 21.5]),
    offer(w, "zeta", id, [20, 22]),
    offer(w, "eta", id, [21, 22.5]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "COMPARISON", "S7");
  await sendToCommittee(w, id);
  const decision = await openDecision(w, id, "WINNER");
  await vote(w, decision, EMAIL.chair, "FOR");
  await vote(w, decision, EMAIL.member2, "AGAINST", "Delivery time is too long for the spring season");
  await vote(w, decision, EMAIL.member3, "AGAINST", "The price is not competitive compared with last year");
  await expect(w, "sourcing", id, "COMPARISON", "S7 after the rejection");
  const [line] = await sourcingLines(w, id);
  const { rows } = await w.db.query("select id from public.proposal where sourcing_id = $1 and vendor_id = $2", [id, w.vendors.get("zeta")!.id]);
  await call(w, NIGAR, "comparison_cost_save", { p_id: null, p_line: line, p_proposal: rows[0].id, p_type: "CUSTOMS", p_amount: 0.4, p_note: "Customs clearance per unit" });
  await age(ctx, "S7", pr, id, 32);
}

/** S10: Tender, Seeds 72,000: winner approved 3 to 0 with 3 POs: one FULLY_APPROVED, one at the committee (1 of 3), one awaiting the Approver. */
export async function s10(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.seeds, [{ item: 6, qty: 1000, price: 24 }, { item: 7, qty: 800, price: 30 }, { item: 9, qty: 80, price: 300 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    decline(w, "beta", id, "Capacity is booked until the next season"),
    offer(w, "delta", id, [23, 31, 310]),
    offer(w, "pi", id, [25, 28.5, 305]),
    offer(w, "gamma", id, [26, 32, 280]),
  );
  await closeNow(w, id);
  await allVote(w, await openDecision(w, id, "OPENING"));
  const { rows: proposals } = await w.db.query("select id from public.proposal where sourcing_id = $1 and status = 'SUBMITTED'", [id]);
  for (const p of proposals) await call(w, NIGAR, "proposal_evaluate", { p_proposal: p.id, p_result: "PASSED", p_reason: null });
  await expect(w, "sourcing", id, "COMPARISON", "S10");
  await sendToCommittee(w, id);
  await allVote(w, await openDecision(w, id, "WINNER"));
  await expect(w, "sourcing", id, "WINNER_APPROVED", "S10");
  const [first, second] = await poIds(w, id);
  if (!second) throw new Error("S10 should have three purchase orders");
  await call(w, RASHAD, "po_decide", { p_po: first.id, p_decision: "APPROVE", p_reason: null });
  await allVote(w, await openDecision(w, id, "PO", first.id)); // FULLY_APPROVED, waits for the vendor
  await call(w, RASHAD, "po_decide", { p_po: second.id, p_decision: "APPROVE", p_reason: null });
  await vote(w, await openDecision(w, id, "PO", second.id), EMAIL.chair, "FOR"); // 1 of 3 votes cast
  await age(ctx, "S10", pr, id, 29);
}

/** S11: RFQ, Fertilisers 14,000: COMPLETED, its PO accepted, result notices sent (winner and PO minutes). */
export async function s11(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.fertilisers, [{ item: 2, qty: 400, price: 35 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "beta", id, [34]),
    offer(w, "gamma", id, [35.5]),
    offer(w, "eta", id, [36]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "COMPARISON", "S11");
  await sendToCommittee(w, id);
  await allVote(w, await openDecision(w, id, "WINNER"));
  const [po] = await poIds(w, id);
  await call(w, RASHAD, "po_decide", { p_po: po.id, p_decision: "APPROVE", p_reason: null });
  await allVote(w, await openDecision(w, id, "PO", po.id));
  await call(w, vendorEmailById(w, po.vendor_id), "po_respond", { p_po: po.id, p_decision: "ACCEPT", p_reason: null });
  await expect(w, "sourcing", id, "COMPLETED", "S11");
  await expect(w, "requisition", pr, "COMPLETED", "S11 PR");
  await age(ctx, "S11", pr, id, 23);
}

/** S12: Tender, Spare parts 55,000: CANCELLED; its OPENING vote closed as NO_DECISION (SOURCING_CANCELLED). Its PR is APPROVED again. */
export async function s12(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.spareParts, [{ item: 16, qty: 500, price: 40 }, { item: 20, qty: 100, price: 350 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "epsilon", id, [39, 345]),
    offer(w, "zeta", id, [41, 350]),
    offer(w, "eta", id, [40, 348]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "AWAITING_OPENING", "S12");
  await call(w, NIGAR, "sourcing_cancel", { p_id: id, p_reason: "Budget moved to the autumn programme" });
  await expect(w, "sourcing", id, "CANCELLED", "S12");
  await expect(w, "requisition", pr, "APPROVED", "S12 PR");
  await age(ctx, "S12", pr, id, 19);
}

/** S4: RFQ, Fertilisers 20,000: CLOSED below the minimum (2 of 3); Extend, Continue and Cancel stay available. */
export async function s4(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.fertilisers, [{ item: 1, qty: 400, price: 30 }, { item: 3, qty: 200, price: 40 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "beta", id, [29.5, 40]),
    offer(w, "gamma", id, [31, 39]),
    accept(w, "eta", id),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "CLOSED", "S4");
  await age(ctx, "S4", pr, id, 16);
}

/** S8: RFQ, Seeds 28,000: FINAL_OFFER_ROUND with 2 vendors asked and 1 answer hidden until the round closes. */
export async function s8(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.seeds, [{ item: 8, qty: 100, price: 150 }, { item: 10, qty: 1300, price: 10 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "delta", id, [148, 9.8]),
    offer(w, "pi", id, [152, 10.2]),
    offer(w, "beta", id, [150, 10]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "COMPARISON", "S8");
  await call(w, NIGAR, "final_offer_request", {
    p_id: id, p_vendors: [w.vendors.get("delta")!.id, w.vendors.get("pi")!.id], p_deadline: hoursFromNow(52), p_message: "Please send your best and final offer",
  });
  const lines = await sourcingLines(w, id);
  await call(w, vendorMail(w, "pi").email, "final_offer_submit", {
    p_sourcing: id, p_keep: false, p_lines: lines.map((l, i) => ({ sourcing_line_id: l, unit_price: [146, 9.7][i] })),
  });
  await expect(w, "sourcing", id, "FINAL_OFFER_ROUND", "S8");
  await age(ctx, "S8", pr, id, 14);
}

/** S5: Tender, Irrigation 150,000: AWAITING_OPENING with 4 proposals and the OPENING vote at 1 of 3 (opened today). */
export async function s5(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.irrigation, [{ item: 26, qty: 120, price: 800 }, { item: 27, qty: 900, price: 40 }, { item: 28, qty: 300, price: 60 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await publish(w, id);
  await together(
    offer(w, "delta", id, [790, 39, 58]),
    offer(w, "epsilon", id, [820, 41, 60]),
    offer(w, "pi", id, [800, 40, 59]),
    offer(w, "beta", id, [810, 42, 62]),
  );
  await closeNow(w, id);
  await expect(w, "sourcing", id, "AWAITING_OPENING", "S5");
  await vote(w, await openDecision(w, id, "OPENING"), EMAIL.chair, "FOR");
  await age(ctx, "S5", pr, id, 11);
}

/** S9: Single Source Purchase, Fertilisers 4,000: IN_COMMITTEE with justification and file; WINNER vote at 2 of 3, one Against. */
export async function s9(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.fertilisers, [{ item: 5, qty: 100, price: 40 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, {
    deadlineHours: 72, ssp: w.vendors.get("eta")!.id,
    justification: "Gobustan Plant Protection MMC is the only registered importer of this micronutrient mix in the region", justificationFile: true,
  });
  await publish(w, id);
  await offer(w, "eta", id, [38.5]);
  await closeNow(w, id);
  await expect(w, "sourcing", id, "COMPARISON", "S9");
  await sendToCommittee(w, id);
  const decision = await openDecision(w, id, "WINNER");
  await vote(w, decision, EMAIL.chair, "FOR");
  await vote(w, decision, EMAIL.member2, "AGAINST", "A single source above the limit needs a firmer justification");
  await age(ctx, "S9", pr, id, 7);
}

/** S3: Tender, Spare parts 85,000: OPEN, deadline in 9 days, 1 proposal, Q&A with 1 published and 1 UNANSWERED question. */
export async function s3(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.spareParts, [{ item: 16, qty: 400, price: 45 }, { item: 19, qty: 500, price: 60 }, { item: 20, qty: 100, price: 370 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 9 * 24 + 4 });
  await publish(w, id);
  await offer(w, "epsilon", id, [44, 58, 365]);
  const q1 = await call<string>(w, vendorMail(w, "epsilon").email, "question_ask", { p_sourcing: id, p_text: "Can delivery be split into two shipments?" });
  await call(w, vendorMail(w, "zeta").email, "question_ask", { p_sourcing: id, p_text: "Is a certificate of origin required for the plough shares?" });
  await call(w, NIGAR, "question_publish", { p_sourcing: id, p_question: q1, p_question_text: "", p_answer: "Yes, two shipments are accepted if both arrive before the delivery date." });
  await backdate(w, "requisition", pr, 6);
  ctx.prs.S3 = pr;
  ctx.sourcings.S3 = id;
}

/** S2: RFQ, Seeds 12,000: OPEN, deadline in 2 days, 4 invited: 2 submitted, 1 accepted without a proposal, 1 declined with a reason. */
export async function s2(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.seeds, [{ item: 6, qty: 300, price: 25 }, { item: 7, qty: 150, price: 30 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 52 });
  await publish(w, id);
  await together(
    offer(w, "delta", id, [24.5, 29]),
    offer(w, "pi", id, [26, 31]),
    accept(w, "beta", id),
    decline(w, "gamma", id, "No stock of the requested varieties this season"),
  );
  await backdate(w, "requisition", pr, 4);
  ctx.prs.S2 = pr;
  ctx.sourcings.S2 = id;
}

/** S1: RFQ, Irrigation 6,000: DRAFT, invitees listed, not published. */
export async function s1(ctx: Ctx) {
  const { w } = ctx;
  const pr = await makePr(w, ctx.plan.irrigation, [{ item: 26, qty: 6, price: 600 }, { item: 28, qty: 40, price: 60 }], { decide: "APPROVE" });
  const id = await startSourcing(ctx, pr, { deadlineHours: 72 });
  await call(w, NIGAR, "sourcing_invitees", { p_id: id });
  await backdate(w, "requisition", pr, 2);
  await backdate(w, "sourcing", id, 1);
  ctx.prs.S1 = pr;
  ctx.sourcings.S1 = id;
}

/** The PRs that are not tied to a sourcing: approved and waiting, pending, returned, rejected, a draft without lines. */
export async function standalonePrs(ctx: Ctx, which: "rejected" | "returned" | "approvedIrrigation" | "approvedFertiliser" | "pending" | "draft") {
  const { w } = ctx;
  switch (which) {
    case "rejected":
      return void (await backdate(w, "requisition", await makePr(w, ctx.plan.spareParts, [{ item: 19, qty: 200, price: 110 }], { decide: "REJECT", comment: "The same hoses are in stock in the central warehouse" }), 10));
    case "returned":
      return void (await backdate(w, "requisition", await makePr(w, ctx.plan.plantProtection, [{ item: 13, qty: 300, price: 60 }], { decide: "RETURN", comment: "Please split the request by crop and add the delivery schedule" }), 9));
    case "approvedIrrigation":
      return void (await backdate(w, "requisition", await makePr(w, ctx.plan.irrigation, [{ item: 28, qty: 200, price: 60 }], { decide: "APPROVE" }), 5));
    case "approvedFertiliser":
      return void (await backdate(w, "requisition", await makePr(w, ctx.plan.fertilisers, [{ item: 4, qty: 250, price: 34 }], { decide: "APPROVE" }), 3));
    case "pending": {
      await backdate(w, "requisition", await makePr(w, ctx.plan.seeds, [{ item: 10, qty: 900, price: 10 }]), 1);
      // exceeds the plan line of 10,000.00 AZN: the plan warning shows
      await backdate(w, "requisition", await makePr(w, ctx.plan.office, [{ item: 21, qty: 1000, price: 8 }, { item: 24, qty: 70, price: 100 }]), 1);
      return;
    }
    case "draft":
      await makePr(w, ctx.plan.seeds, [], { submit: false });
  }
}

/** The order of creation: documents are numbered one after another, so this is also the order of their dates. */
export async function runStories(ctx: Ctx, log: (m: string) => void) {
  const steps: [string, () => Promise<unknown>][] = [
    ["S6", () => s6(ctx)], ["S7", () => s7(ctx)], ["S10", () => s10(ctx)], ["S11", () => s11(ctx)], ["S12", () => s12(ctx)],
    ["S4", () => s4(ctx)], ["S8", () => s8(ctx)], ["S5", () => s5(ctx)],
    ["rejected PR", () => standalonePrs(ctx, "rejected")], ["returned PR", () => standalonePrs(ctx, "returned")],
    ["S9", () => s9(ctx)], ["S3", () => s3(ctx)], ["approved Irrigation PR", () => standalonePrs(ctx, "approvedIrrigation")],
    ["S2", () => s2(ctx)], ["approved Fertiliser PR", () => standalonePrs(ctx, "approvedFertiliser")], ["S1", () => s1(ctx)],
    ["pending PRs", () => standalonePrs(ctx, "pending")], ["draft PR", () => standalonePrs(ctx, "draft")],
  ];
  for (const [name, run] of steps) {
    const t = Date.now();
    await run();
    log(`  ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
}
void tender;
