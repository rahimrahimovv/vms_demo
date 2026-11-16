import { inflateSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECEIPT_STATUSES, buildReceiptPdf, canonicalReceiptJson, receiptFingerprint, type ReceiptData } from "@/lib/proposals/receipt";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ user: null as unknown }));
const db = vi.hoisted(() => ({ data: null as unknown, error: null as unknown }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: async () => ({ data: db.data, error: db.error }) }) }));

const receipt: ReceiptData = {
  proposalId: "p-1",
  sourcingNumber: "SRC-2026-0007",
  category: "Mineral fertilisers",
  vendor: { legalName: "Alpha Agro LLC", taxNumber: "1234567891" },
  submittedAt: "2026-11-16T08:05:00Z",
  round: 1,
  vatIncluded: true,
  vatRate: 18,
  lines: [
    { item: "Ammonium nitrate 34.4%, 50 kg bag", unit: "bag", quantity: 2000, unitPrice: 33.04, lineTotal: 66080 },
    { item: "Foliar fertiliser, 1 L", unit: "litre", quantity: 500, unitPrice: 41.5, lineTotal: 20750 },
  ],
  terms: { incoterm: "DDP", namedPlace: "Central warehouse", deliveryMode: "Truck", paymentTerm: "30 days after delivery", deliveryDays: 20, validityDays: 30 },
  files: ["technical-spec.pdf", "certificate.pdf"],
};

/** Text of a pdf-lib document: inflate every stream and decode the hex strings of the Tj operators (Latin-1). */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(t[1], "hex").toString("latin1"));
    for (const t of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(t[1]);
  }
  return out.join("\n");
}

describe("RFQ-12 receipt PDF", () => {
  it("contains the header, the fields, the priced lines, the terms, the file names and the fingerprint", async () => {
    const text = pdfText(await buildReceiptPdf(receipt));
    for (const expected of [
      "e-Procurement", "Proposal receipt", "SRC-2026-0007", "Mineral fertilisers", "Alpha Agro LLC", "1234567891",
      "16 Nov 2026, 12:05", "First offer", "Ammonium nitrate 34.4%, 50 kg bag", "2,000 bag", "33.04 AZN", "Incl. 18%",
      "66,080.00 AZN", "Foliar fertiliser, 1 L", "DDP", "Central warehouse", "Truck", "30 days after delivery",
      "technical-spec.pdf", "certificate.pdf", receiptFingerprint(receipt),
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).toContain("20"); // delivery days
  });

  it("a final-offer receipt says Final offer", async () => {
    expect(pdfText(await buildReceiptPdf({ ...receipt, round: 2 }))).toContain("Final offer");
  });

  it("holds no estimate, no saving and no committee data", async () => {
    const text = pdfText(await buildReceiptPdf(receipt)).toLowerCase();
    for (const word of ["estimat", "saving", "committee", "vote", "winner"]) expect(text).not.toContain(word);
    expect(JSON.stringify(Object.keys(receipt))).not.toMatch(/estimat|saving/i);
  });
});

describe("RFQ-12 statuses", () => {
  it("a submitted proposal has a receipt, a DRAFT or WITHDRAWN one does not", () => {
    expect(RECEIPT_STATUSES).toEqual(["SUBMITTED", "PASSED", "DISQUALIFIED", "AWARDED", "NOT_AWARDED"]);
    expect(RECEIPT_STATUSES).not.toContain("DRAFT");
    expect(RECEIPT_STATUSES).not.toContain("WITHDRAWN");
  });
});

describe("RFQ-12 fingerprint", () => {
  it("is 16 capital hex characters in groups of four", () => {
    expect(receiptFingerprint(receipt)).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
  });
  it("is stable for the same data, whatever the order of the file names or the submission time", () => {
    const same = { ...receipt, files: [...receipt.files].reverse(), submittedAt: "2026-11-17T01:00:00Z" };
    expect(receiptFingerprint(same)).toBe(receiptFingerprint(receipt));
    expect(canonicalReceiptJson(same)).toBe(canonicalReceiptJson(receipt));
  });
  it("uses a fixed key order", () => {
    expect(Object.keys(JSON.parse(canonicalReceiptJson(receipt)))).toEqual(["sourcing", "vendor", "round", "lines", "terms", "files"]);
  });
  it("changes when a price, a term, the round or a file changes", () => {
    const base = receiptFingerprint(receipt);
    const price = { ...receipt, lines: [{ ...receipt.lines[0], unitPrice: 33.05 }, receipt.lines[1]] };
    expect(receiptFingerprint(price)).not.toBe(base);
    expect(receiptFingerprint({ ...receipt, terms: { ...receipt.terms, deliveryDays: 21 } })).not.toBe(base);
    expect(receiptFingerprint({ ...receipt, round: 2 })).not.toBe(base);
    expect(receiptFingerprint({ ...receipt, files: ["other.pdf"] })).not.toBe(base);
  });
});

describe("RFQ-12 route", () => {
  const call = async (id = "p-1") => {
    const { GET } = await import("@/app/api/proposals/[id]/receipt/route");
    return GET(new Request("http://localhost/api/proposals/x/receipt"), { params: Promise.resolve({ id }) });
  };
  const vendor = { id: "u1", roles: ["VENDOR"], vendorId: "v1", mustChangePassword: false, vendorStatus: "APPROVED" };
  beforeEach(() => {
    session.user = vendor;
    db.data = receipt;
    db.error = null;
  });

  it("allowed: the owning vendor gets a PDF", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("SRC-2026-0007-receipt.pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });
  it("refused: no session", async () => {
    session.user = null;
    expect((await call()).status).toBe(401);
  });
  it("refused: every internal user", async () => {
    for (const role of ["REQUESTER", "APPROVER", "PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN"]) {
      session.user = { ...vendor, roles: [role], vendorId: null, vendorStatus: null };
      expect((await call()).status, role).toBe(403);
    }
  });
  it("refused: a vendor that must change its password", async () => {
    session.user = { ...vendor, mustChangePassword: true };
    expect((await call()).status).toBe(403);
  });
  it("refused: a DRAFT or WITHDRAWN proposal or another vendor's (the database returns nothing)", async () => {
    db.data = null;
    expect((await call()).status).toBe(404);
  });
});
