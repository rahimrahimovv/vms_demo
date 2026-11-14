/**
 * Badge colour per status (CLAUDE.md Design): grey = draft, sky (light teal-blue, never the brand blue) = in progress or pending,
 * amber = returned or waiting for a decision, green = approved or completed,
 * red = rejected or cancelled. Status names are exactly the backlog's Status Transition Model.
 */
export type StatusTone = "grey" | "sky" | "amber" | "green" | "red";

const TONES: Record<string, StatusTone> = {
  // generic / users
  ACTIVE: "green",
  INACTIVE: "grey",
  DRAFT: "grey",
  // in progress or pending
  SUBMITTED: "sky",
  PENDING: "sky",
  PENDING_APPROVAL: "sky",
  PENDING_COMMITTEE: "sky",
  IN_SOURCING: "sky",
  OPEN: "sky",
  CLOSED: "sky",
  TECHNICAL_EVALUATION: "sky",
  COMPARISON: "sky",
  FINAL_OFFER_ROUND: "sky",
  INVITED: "sky",
  // returned or waiting for a decision
  RETURNED: "amber",
  IN_COMMITTEE: "amber",
  VOTING: "sky", // pending: the committee is voting (Midnight Navy: sky, never amber)
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
  CANCELLED: "red",
  DECLINED: "red",
  DECLINED_BY_VENDOR: "red",
  DISQUALIFIED: "red",
  BLACKLISTED: "red",
  // closed without an outcome
  WITHDRAWN: "grey",
  EXPIRED: "grey",
  NOT_AWARDED: "grey",
};

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? "grey";
}
