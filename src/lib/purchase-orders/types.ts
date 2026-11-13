/**
 * What the database functions public.po_view, public.po_list and the PO decision package return (PO-01..PO-03).
 * Amounts are AZN as JSON numbers; unit prices exclude VAT and never include the extra costs of RFQ-07.
 */
export type PoStatus =
  | "PENDING_APPROVAL"
  | "PENDING_COMMITTEE"
  | "FULLY_APPROVED"
  | "ACCEPTED"
  | "DECLINED_BY_VENDOR"
  | "REJECTED";

export type PoLine = {
  item: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  deliveryDate: string;
  place: string | null;
};

/** The part of a PO that the record page, the PO decision package and the PDF all show. */
export type PoBody = {
  lines: PoLine[];
  total: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  incoterm: string | null;
  namedPlace: string | null;
  deliveryMode: string | null;
  paymentTerm: string | null;
};

export type PoView = PoBody & {
  id: string;
  number: string;
  status: PoStatus;
  createdAt: string;
  reason: string | null;
  vendor: { id: string; name: string };
  /** `id`, `ownerId` and `requesterId` are empty for a vendor. */
  sourcing: { id: string | null; number: string };
  ownerId: string | null;
  requesterId: string | null;
  winnerMinutes: { id: string; number: string } | null;
  decision: { id: string; status: string } | null;
};

export type PoListRow = {
  id: string;
  number: string;
  status: PoStatus;
  vendor_name: string;
  sourcing_id: string | null;
  sourcing_number: string;
  total: number | string;
  total_incl_vat: number | string;
  created_at: string;
  requester_id: string | null;
  owner_id: string | null;
};

export type PoDifference = {
  field: "vendor" | "quantity" | "unitPrice" | "total" | "incoterm" | "namedPlace" | "deliveryMode" | "paymentTerm";
  item?: string;
  winner: string | number | null;
  po: string | number | null;
};

/** CMT-02 AC3: the PO and every difference from the approved winner decision. */
export type PoPackage = {
  po: PoBody & { number: string; vendor: string };
  differences: PoDifference[];
  same: boolean;
};

/** PO-02 AC3 (#83): the Approver who is the PR's Requester or the sourcing owner never decides on the PO. */
export function canDecidePo(
  po: Pick<PoView, "status" | "requesterId" | "ownerId">,
  user: { id: string; roles: readonly string[] },
): boolean {
  return (
    user.roles.includes("APPROVER") &&
    po.status === "PENDING_APPROVAL" &&
    po.requesterId !== user.id &&
    po.ownerId !== user.id
  );
}
