import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatAmount, formatDateTime } from "@/lib/format";
import { label, PAGE, pdfText, wrap } from "@/lib/minutes/pdf";

/**
 * RFQ-12: what public.proposal_receipt returns, for the owning vendor and a SUBMITTED proposal only. It holds what the
 * vendor itself submitted and nothing else: no estimate, no other vendor, no committee data.
 */
export type ReceiptData = {
  proposalId: string;
  sourcingNumber: string;
  category: string | null;
  vendor: { legalName: string; taxNumber: string | null };
  submittedAt: string;
  round: 1 | 2;
  vatIncluded: boolean;
  vatRate: number;
  lines: { item: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }[];
  terms: {
    incoterm: string;
    namedPlace: string | null;
    deliveryMode: string | null;
    paymentTerm: string | null;
    deliveryDays: number | null;
    validityDays: number | null;
  };
  files: string[];
};

/**
 * The submitted data as canonical JSON: a fixed key order (the order of this literal), prices with two decimals,
 * file names sorted. The submission time is not part of it, so the same data always gives the same fingerprint.
 */
export function canonicalReceiptJson(r: ReceiptData): string {
  return JSON.stringify({
    sourcing: r.sourcingNumber,
    vendor: { legalName: r.vendor.legalName, taxNumber: r.vendor.taxNumber },
    round: r.round,
    lines: r.lines.map((l) => ({
      item: l.item,
      unit: l.unit,
      quantity: String(Number(l.quantity)),
      unitPrice: Number(l.unitPrice).toFixed(2),
      vatIncluded: r.vatIncluded,
      vatRate: Number(r.vatRate).toFixed(2),
    })),
    terms: {
      incoterm: r.terms.incoterm,
      namedPlace: r.terms.namedPlace,
      deliveryMode: r.terms.deliveryMode,
      paymentTerm: r.terms.paymentTerm,
      deliveryDays: r.terms.deliveryDays,
      validityDays: r.terms.validityDays,
    },
    files: [...r.files].sort(),
  });
}

/** First 16 characters of the SHA-256 of the canonical JSON, in capitals, in groups of four: "A1B2 C3D4 E5F6 0718". */
export function receiptFingerprint(r: ReceiptData): string {
  const hex = createHash("sha256").update(canonicalReceiptJson(r), "utf8").digest("hex").slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join(" ");
}

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** The English receipt PDF, with the same PDF library and page layout as the minutes and the purchase order. */
export async function buildReceiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`${r.sourcingNumber} - ${label("receipt.title")}`));
  doc.setProducer(label("receipt.pdfGenerated"));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.1, 0.12);
  const muted = rgb(0.4, 0.42, 0.45);
  const accent = rgb(0.114, 0.306, 0.537);

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const right = PAGE.width - PAGE.margin;
  const room = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const draw = (text: string, x: number, size: number, font: PDFFont, color = ink) =>
    page.drawText(pdfText(text), { x, y, size, font, color });
  const drawRight = (text: string, edge: number, size: number, font: PDFFont, color = ink) => {
    const clean = pdfText(text);
    page.drawText(clean, { x: edge - font.widthOfTextAtSize(clean, size), y, size, font, color });
  };
  const none = label("common.none");

  draw(label("app.name"), PAGE.margin, 12, bold, accent);
  y -= 26;
  draw(label("receipt.title"), PAGE.margin, 16, bold);
  y -= 22;
  draw(r.sourcingNumber, PAGE.margin, 13, bold, accent);
  y -= 26;

  const keyWidth = 130;
  const field = (key: string, value: string, font: PDFFont = regular) => {
    const lines = wrap(value, font, 10, contentWidth - keyWidth);
    room(lines.length * 14 + 4);
    draw(key, PAGE.margin, 10, regular, muted);
    for (const line of lines) {
      draw(line, PAGE.margin + keyWidth, 10, font);
      y -= 14;
    }
    y -= 4;
  };
  field(label("receipt.sourcing"), r.sourcingNumber);
  field(label("receipt.category"), r.category ?? none);
  field(label("receipt.vendor"), r.vendor.legalName);
  field(label("receipt.taxNumber"), r.vendor.taxNumber ?? none);
  field(label("receipt.submitted"), formatDateTime(r.submittedAt));
  field(label("receipt.round"), label(`receipt.rounds.${r.round}`));

  y -= 8;
  room(60);
  draw(label("receipt.linesTitle"), PAGE.margin, 12, bold);
  y -= 20;
  const col = { item: PAGE.margin, qty: PAGE.margin + 175, price: PAGE.margin + 255, vat: PAGE.margin + 335 };
  draw(label("receipt.item"), col.item, 9, bold, muted);
  drawRight(label("receipt.quantity"), col.qty + 60, 9, bold, muted);
  drawRight(label("receipt.unitPrice"), col.price + 75, 9, bold, muted);
  draw(label("receipt.vat"), col.vat, 9, bold, muted);
  drawRight(label("receipt.lineTotal"), right, 9, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: right, y }, thickness: 0.5, color: muted });
  y -= 14;
  const vatText = label(r.vatIncluded ? "receipt.vatIncluded" : "receipt.vatExcluded", { rate: Number(r.vatRate) });
  for (const line of r.lines) {
    const name = wrap(line.item, regular, 9, 165);
    const height = name.length * 12 + 6;
    room(height);
    const top = y;
    name.forEach((text, i) => page.drawText(text, { x: col.item, y: top - i * 12, size: 9, font: regular, color: ink }));
    drawRight(`${quantityFormat.format(line.quantity)} ${line.unit}`, col.qty + 60, 9, regular);
    drawRight(formatAmount(line.unitPrice), col.price + 75, 9, regular);
    draw(vatText, col.vat, 9, regular);
    drawRight(formatAmount(line.lineTotal), right, 9, regular);
    y -= height;
  }

  y -= 10;
  room(40);
  draw(label("receipt.termsTitle"), PAGE.margin, 12, bold);
  y -= 20;
  field(label("receipt.incoterm"), r.terms.incoterm);
  field(label("receipt.namedPlace"), r.terms.namedPlace ?? none);
  field(label("receipt.deliveryMode"), r.terms.deliveryMode ?? none);
  field(label("receipt.paymentTerm"), r.terms.paymentTerm ?? none);
  field(label("receipt.deliveryDays"), r.terms.deliveryDays === null ? none : String(r.terms.deliveryDays));
  field(label("receipt.validityDays"), r.terms.validityDays === null ? none : String(r.terms.validityDays));

  y -= 8;
  room(40);
  draw(label("receipt.filesTitle"), PAGE.margin, 12, bold);
  y -= 20;
  if (r.files.length === 0) {
    room(16);
    draw(label("receipt.noFiles"), PAGE.margin, 10, regular, muted);
    y -= 16;
  }
  for (const name of r.files) {
    for (const text of wrap(name, regular, 10, contentWidth)) {
      room(14);
      draw(text, PAGE.margin, 10, regular);
      y -= 14;
    }
  }

  y -= 14;
  room(60);
  draw(label("receipt.fingerprint"), PAGE.margin, 12, bold);
  y -= 22;
  draw(receiptFingerprint(r), PAGE.margin, 15, bold, accent);
  y -= 18;
  draw(label("receipt.fingerprintNote"), PAGE.margin, 8, regular, muted);
  return doc.save();
}
