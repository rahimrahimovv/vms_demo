/**
 * Committee rules from the backlog's Calculation Rules (eligible voters, quorum, decision result, voting
 * deadline) and CMT-01. The database functions app.close_decision, app.add_business_days and committee_save
 * apply the same rules; the RLS tests check them against the same worked examples.
 */

export type Vote = "FOR" | "AGAINST" | "CONFLICT" | "NONE";
export type DecisionStatus = "APPROVED" | "REJECTED" | "NO_DECISION";
export type ResultRule = "MAJORITY" | "CHAIR_CASTING_VOTE" | "NO_QUORUM" | "TIE_WITHOUT_CHAIR" | "SOURCING_CANCELLED";

export type VoterVote = { vote: Vote; isChair: boolean };

/** Eligible voters = the snapshot minus members who declared a conflict of interest. */
export function eligibleCount(voters: readonly VoterVote[]): number {
  return voters.filter((v) => v.vote !== "CONFLICT").length;
}

/** Quorum: votes cast > eligible voters / 2 (3 eligible: 2 votes = quorum, 1 vote = no quorum). */
export function hasQuorum(cast: number, eligible: number): boolean {
  return eligible > 0 && cast * 2 > eligible;
}

/**
 * Decision result (CMT-02 AC7): no quorum -> NO_DECISION; more For -> APPROVED; more Against -> REJECTED;
 * a tie follows the Chair's vote, or is NO_DECISION without it.
 */
export function decisionResult(voters: readonly VoterVote[]): { status: DecisionStatus; rule: ResultRule } {
  const eligible = eligibleCount(voters);
  const forVotes = voters.filter((v) => v.vote === "FOR").length;
  const against = voters.filter((v) => v.vote === "AGAINST").length;
  if (!hasQuorum(forVotes + against, eligible)) return { status: "NO_DECISION", rule: "NO_QUORUM" };
  if (forVotes > against) return { status: "APPROVED", rule: "MAJORITY" };
  if (against > forVotes) return { status: "REJECTED", rule: "MAJORITY" };
  const chair = voters.find((v) => v.isChair)?.vote;
  if (chair === "FOR") return { status: "APPROVED", rule: "CHAIR_CASTING_VOTE" };
  if (chair === "AGAINST") return { status: "REJECTED", rule: "CHAIR_CASTING_VOTE" };
  return { status: "NO_DECISION", rule: "TIE_WITHOUT_CHAIR" };
}

const BAKU_OFFSET_MS = 4 * 3600_000; // Asia/Baku is UTC+4 all year

/** Opening time + the voting period in business days, Monday to Friday, no holidays (CMT-01 AC2). */
export function addBusinessDays(from: Date, days: number): Date {
  const local = new Date(from.getTime() + BAKU_OFFSET_MS);
  let left = days;
  while (left > 0) {
    local.setUTCDate(local.getUTCDate() + 1);
    const weekday = local.getUTCDay(); // 0 Sunday, 6 Saturday
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return new Date(local.getTime() - BAKU_OFFSET_MS);
}

/** CMT-01 AC1: an odd number of members, at least 3. */
export function isValidCommitteeSize(count: number): boolean {
  return count >= 3 && count % 2 === 1;
}

/** CMT-01 AC2: a whole number of business days, 1 or more. */
export function isValidVotingPeriod(days: number): boolean {
  return Number.isInteger(days) && days >= 1;
}
