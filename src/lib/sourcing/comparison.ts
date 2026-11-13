/**
 * The comparison document returned by public.sourcing_comparison and frozen in decision.package (RFQ-05 AC3,
 * RFQ-07, RFQ-08 AC5, CMT-02 AC2). Numbers arrive as JSON numbers; amounts are AZN excluding VAT.
 */
export type ComparisonCost = { id: string; type: "CUSTOMS" | "DELIVERY" | "INSURANCE" | "OTHER"; amount: number; note: string | null };

export type ComparisonCell = {
  proposalId: string;
  proposalLineId: string;
  round: number;
  entered: number;
  unitExclVat: number;
  /** Round-1 price excluding VAT when a final offer (round 2) replaced it. */
  firstExclVat: number | null;
  extra: number;
  evaluated: number;
  lineTotal: number;
  /** Rejected winner of this line (RFQ-05 AC7). */
  excluded: boolean;
  costs: ComparisonCost[];
};

export type ComparisonLine = {
  id: string;
  status: "ACTIVE" | "CANCELLED";
  cancelReason: string | null;
  item: string;
  unit: string;
  quantity: number;
  deliveryDate: string;
  place: string | null;
  estimate: number;
  eligibleCount: number;
  lowest: number | null;
  defaultProposalId: string | null;
  chosenProposalId: string | null;
  manual: boolean;
  justification: string | null;
  notLowest: boolean;
  cells: ComparisonCell[];
};

export type DifferentTerm = "incoterm" | "namedPlace" | "deliveryMode" | "paymentTerm";

export type ComparisonVendor = {
  proposalId: string;
  vendorId: string;
  name: string;
  grade: string | null;
  standing: string;
  incoterm: string;
  namedPlace: string | null;
  deliveryMode: string | null;
  paymentTerm: string | null;
  differentTerms: DifferentTerm[];
  deliveryDays: number | null;
  validityDays: number | null;
  includesVat: boolean;
  vatRate: number;
  submittedAt: string | null;
  sharedOwners: string[];
  finalOffer: { respondedAt: string | null } | null;
};

export type Comparison = {
  sourcing: {
    id: string;
    number: string;
    type: "RFQ" | "TENDER" | "SSP";
    status: string;
    minimum: number;
    lowCompetitionReason: string | null;
    sspJustification: string | null;
    sspFiles: { id: string; name: string }[];
    requiredIncoterm: string | null;
    requiredPlace: string | null;
    requiredMode: string | null;
    requiredPaymentTerm: string | null;
    finalOfferRoundsUsed: number;
    finalOfferRoundsMax: number;
    finalOfferDays: number;
    finalOfferDeadline: string | null;
    needsLowCompetitionReason: boolean;
    lastWinnerDecision: { id: string; status: string } | null;
  };
  vendors: ComparisonVendor[];
  lines: ComparisonLine[];
  disqualified: { proposalId: string; name: string; grade: string | null; reason: string }[];
  purchaseOrders: { proposalId: string; name: string; lines: number; total: number; incoterm: string; namedPlace: string | null }[];
  committeeComments: { name: string; vote: string; comment: string }[];
  /** Set only in a frozen committee package. */
  frozenAt?: string;
};

/** Amount without the currency, as in the table cells ("27.50"). */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** RFQ-05 AC5: the fewest eligible offers on any active line (what the low-competition box reports). */
export function fewestEligible(c: Comparison): number {
  const active = c.lines.filter((l) => l.status === "ACTIVE");
  return active.length === 0 ? 0 : Math.min(...active.map((l) => l.eligibleCount));
}

/** All proposals that reached the comparison: eligible ones plus the disqualified. */
export function proposalsReceived(c: Comparison): number {
  return c.vendors.length + c.disqualified.length;
}

/** The cell the vendor offers on a line, if any. */
export function cellFor(line: ComparisonLine, proposalId: string): ComparisonCell | undefined {
  return line.cells.find((c) => c.proposalId === proposalId);
}

/** A choice other than the lowest evaluated price needs a justification (ties do not, RFQ-05 AC4). */
export function needsJustification(line: ComparisonLine, cell: ComparisonCell): boolean {
  return line.lowest !== null && cell.evaluated > line.lowest;
}
