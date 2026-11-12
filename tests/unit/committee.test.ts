import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  decisionResult,
  eligibleCount,
  hasQuorum,
  isValidCommitteeSize,
  isValidVotingPeriod,
  type Vote,
  type VoterVote,
} from "@/lib/committee/rules";
import { buildMinutesPdf, pdfText, type MinutesView } from "@/lib/minutes/pdf";

const voters = (...votes: (Vote | `chair:${Vote}`)[]): VoterVote[] =>
  votes.map((v) => (v.startsWith("chair:") ? { vote: v.slice(6) as Vote, isChair: true } : { vote: v as Vote, isChair: false }));

// Backlog "Calculation Rules": eligible voters, quorum, decision result, voting deadline.
describe("committee rules (Calculation Rules)", () => {
  it("eligible voters: 3 members, owner not a member, 0 conflicts -> 3; a conflict removes one", () => {
    expect(eligibleCount(voters("NONE", "NONE", "NONE"))).toBe(3);
    expect(eligibleCount(voters("NONE", "CONFLICT", "FOR"))).toBe(2);
  });

  it("quorum: 3 eligible, 2 votes = quorum, 1 vote = no quorum; half is not enough", () => {
    expect(hasQuorum(2, 3)).toBe(true);
    expect(hasQuorum(1, 3)).toBe(false);
    expect(hasQuorum(2, 4)).toBe(false);
    expect(hasQuorum(3, 4)).toBe(true);
    expect(hasQuorum(0, 0)).toBe(false);
  });

  it("2 For, 1 Against -> APPROVED by majority; 1 For, 2 Against -> REJECTED", () => {
    expect(decisionResult(voters("chair:FOR", "FOR", "AGAINST"))).toEqual({ status: "APPROVED", rule: "MAJORITY" });
    expect(decisionResult(voters("chair:FOR", "AGAINST", "AGAINST"))).toEqual({ status: "REJECTED", rule: "MAJORITY" });
  });

  it("2 For, 2 Against, Chair For -> APPROVED by the casting vote; Chair Against -> REJECTED", () => {
    expect(decisionResult(voters("chair:FOR", "FOR", "AGAINST", "AGAINST"))).toEqual({ status: "APPROVED", rule: "CHAIR_CASTING_VOTE" });
    expect(decisionResult(voters("chair:AGAINST", "FOR", "FOR", "AGAINST"))).toEqual({ status: "REJECTED", rule: "CHAIR_CASTING_VOTE" });
  });

  it("a tie without the Chair's vote (did not vote or conflict) -> NO_DECISION", () => {
    expect(decisionResult(voters("chair:NONE", "FOR", "AGAINST", "FOR", "AGAINST"))).toEqual({ status: "NO_DECISION", rule: "TIE_WITHOUT_CHAIR" });
    expect(decisionResult(voters("chair:CONFLICT", "FOR", "AGAINST"))).toEqual({ status: "NO_DECISION", rule: "TIE_WITHOUT_CHAIR" });
  });

  it("1 vote of 3 or no eligible voter left -> NO_DECISION, No quorum", () => {
    expect(decisionResult(voters("chair:FOR", "NONE", "NONE"))).toEqual({ status: "NO_DECISION", rule: "NO_QUORUM" });
    expect(decisionResult([])).toEqual({ status: "NO_DECISION", rule: "NO_QUORUM" });
    expect(decisionResult(voters("CONFLICT", "CONFLICT"))).toEqual({ status: "NO_DECISION", rule: "NO_QUORUM" });
  });

  it("voting deadline: opened Thu 12 Nov 2026 10:00 + 3 business days -> Tue 17 Nov 2026 10:00 (Asia/Baku)", () => {
    const opened = new Date("2026-11-12T10:00:00+04:00");
    expect(addBusinessDays(opened, 3).toISOString()).toBe(new Date("2026-11-17T10:00:00+04:00").toISOString());
  });

  it("business days skip Saturday and Sunday, also when opened on a weekend", () => {
    expect(addBusinessDays(new Date("2026-11-13T15:30:00+04:00"), 1).toISOString()).toBe(new Date("2026-11-16T15:30:00+04:00").toISOString());
    expect(addBusinessDays(new Date("2026-11-14T09:00:00+04:00"), 1).toISOString()).toBe(new Date("2026-11-16T09:00:00+04:00").toISOString());
    expect(addBusinessDays(new Date("2026-11-12T10:00:00+04:00"), 5).toISOString()).toBe(new Date("2026-11-19T10:00:00+04:00").toISOString());
  });
});

describe("minutes PDF (CMT-03 AC3)", () => {
  const view: MinutesView = {
    id: "00000000-0000-4000-8000-000000000001",
    number: "MIN-2026-001",
    decisionId: "00000000-0000-4000-8000-000000000002",
    type: "OPENING",
    status: "APPROVED",
    resultRule: "MAJORITY",
    openedAt: "2026-11-12T06:00:00Z",
    closedAt: "2026-11-13T09:30:00Z",
    sourcingId: "00000000-0000-4000-8000-000000000003",
    sourcingNumber: "SRC-2026-0001",
    poNumber: null,
    closeReason: null,
    reopenReason: "Documents added",
    eligible: 3,
    for: 2,
    against: 1,
    voters: [
      { name: "Elchin Karimov", isChair: true, vote: "FOR", comment: null },
      { name: "Sevinj Guliyeva", isChair: false, vote: "FOR", comment: null },
      { name: "Tural Ismayilov", isChair: false, vote: "AGAINST", comment: "Ə ı ğ ş İ — the bond is missing ".repeat(12) },
    ],
  };

  it("builds an English PDF, also with Azerbaijani letters and long comments", async () => {
    const bytes = await buildMinutesPdf(view);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
  });

  it("writes only characters the standard PDF fonts can show", () => {
    expect(pdfText("Əli Həsənov — İş ‘x’ …")).toBe("Eli Hesenov - Is 'x' ...");
    expect(pdfText("Müller Çay")).toBe("Müller Çay");
    expect(pdfText("日本")).toBe("??");
  });
});

describe("committee setup (CMT-01)", () => {
  it("AC1: an odd number of members, at least 3", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(isValidCommitteeSize)).toEqual([false, false, false, true, false, true, false, true]);
  });

  it("AC2: the voting period is a whole number of business days, 1 or more (default 3)", () => {
    expect([0, 1, 3, 2.5, -1].map(isValidVotingPeriod)).toEqual([false, true, true, false, false]);
  });
});
