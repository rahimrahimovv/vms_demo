/**
 * Dot colour per status (docs/DESIGN.md, D-015): green = approved, active, qualified, valid, completed, awarded; blue = pending, open,
 * in progress, voting, comparison; amber = waiting, expiring, warning, below minimum; grey = draft, cancelled, not graded;
 * red (the destructive badge) only for rejected, disqualified, expired. Status names are exactly the backlog's Status Transition Model.
 */
export type StatusTone = "grey" | "blue" | "amber" | "green" | "red";

const TONES: Record<string, StatusTone> = {
  // generic / users
  ACTIVE: "green",
  INACTIVE: "grey",
  DRAFT: "grey",
  // pending or in progress
  SUBMITTED: "blue",
  PENDING: "blue",
  PENDING_APPROVAL: "blue",
  PENDING_COMMITTEE: "blue",
  IN_SOURCING: "blue",
  OPEN: "blue",
  CLOSED: "blue",
  TECHNICAL_EVALUATION: "blue",
  COMPARISON: "blue",
  FINAL_OFFER_ROUND: "blue",
  INVITED: "blue",
  // returned or waiting for a decision
  RETURNED: "amber",
  IN_COMMITTEE: "amber",
  VOTING: "blue", // pending: the committee is voting
  UNANSWERED: "amber",
  FULLY_APPROVED: "amber", // waiting for the vendor's decision
  NO_DECISION: "amber",
  AWAITING_OPENING: "amber", // Tender waiting for the committee to open the bids
  HOLD: "amber", // vendor standing after a second D grade
  EXPIRING: "amber", // certificate within 30 days of expiry
  VALID: "green",
  // approved or completed
  APPROVED: "green",
  ACCEPTED: "green",
  QUALIFIED: "green",
  GRADED: "green",
  PASSED: "green",
  WINNER_APPROVED: "green",
  COMPLETED: "green",
  AWARDED: "green",
  PUBLISHED: "green",
  // rejected or cancelled
  REJECTED: "red",
  CANCELLED: "grey",
  DECLINED: "red",
  DECLINED_BY_VENDOR: "red",
  DISQUALIFIED: "red",
  BLACKLISTED: "red",
  // closed without an outcome
  WITHDRAWN: "grey",
  EXPIRED: "red",
  NOT_AWARDED: "grey",
};

/** Every status that has a badge colour; each needs a status.<NAME> text (checked by a test). */
export const KNOWN_STATUSES = Object.keys(TONES);

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? "grey";
}
