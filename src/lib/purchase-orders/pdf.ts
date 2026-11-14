import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { label, PAGE, pdfText, wrap } from "@/lib/minutes/pdf";
import type { PoView } from "./types";

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/**
 * English purchase order PDF (PO-03 AC1): header with the product name e-Procurement, PO number, vendor, terms, lines,
 * total excluding VAT, VAT amount at the vendor's rate and total including VAT. Same content as the screen.
 */
export async function buildPoPdf(po: PoView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`${po.number} - ${label("purchaseOrders.pdfTitle")}`));
  doc.setProducer(label("purchaseOrders.pdfGenerated"));
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

  // header: the product name first
  draw(label("app.name"), PAGE.margin, 12, bold, accent);
  y -= 26;
  draw(label("purchaseOrders.pdfTitle"), PAGE.margin, 16, bold);
  y -= 22;
  draw(po.number, PAGE.margin, 13, bold, accent);
  y -= 26;

  const none = label("common.none");
  const fields: [string, string][] = [
    [label("purchaseOrders.fields.vendor"), po.vendor.name],
    [label("purchaseOrders.fields.sourcing"), po.sourcing.number],
    [label("purchaseOrders.pdfDate"), formatDateTime(po.createdAt)],
    [label("purchaseOrders.pdfStatus"), label(`status.${po.status}`)],
    [label("purchaseOrders.fields.incoterm"), po.incoterm ?? none],
    [label("purchaseOrders.fields.namedPlace"), po.namedPlace ?? none],
    [label("purchaseOrders.fields.deliveryMode"), po.deliveryMode ?? none],
    [label("purchaseOrders.fields.paymentTerm"), po.paymentTerm ?? none],
  ];
  const keyWidth = 130;
  for (const [key, value] of fields) {
    const lines = wrap(value, regular, 10, contentWidth - keyWidth);
    room(lines.length * 14 + 4);
    draw(key, PAGE.margin, 10, regular, muted);
    for (const line of lines) {
      draw(line, PAGE.margin + keyWidth, 10, regular);
      y -= 14;
    }
    y -= 4;
  }

  // lines table: item | quantity unit | unit price | line total | delivery
  y -= 8;
  room(60);
  draw(label("purchaseOrders.lines.title"), PAGE.margin, 12, bold);
  y -= 20;
  const col = { item: PAGE.margin, qty: PAGE.margin + 215, price: PAGE.margin + 305 };
  draw(label("purchaseOrders.lines.item"), col.item, 9, bold, muted);
  drawRight(label("purchaseOrders.lines.quantity"), col.qty + 55, 9, bold, muted);
  drawRight(label("purchaseOrders.lines.unitPrice"), col.price + 70, 9, bold, muted);
  drawRight(label("purchaseOrders.lines.lineTotal"), right, 9, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: right, y }, thickness: 0.5, color: muted });
  y -= 14;
  for (const line of po.lines) {
    const name = wrap(line.item, regular, 9, 205);
    const meta = `${label("purchaseOrders.lines.deliveryDate")}: ${formatDate(line.deliveryDate)}${line.place ? `, ${line.place}` : ""}`;
    const metaLines = wrap(meta, regular, 8, 205);
    const height = (name.length + metaLines.length) * 12 + 6;
    room(height);
    const top = y;
    name.forEach((text, i) => page.drawText(text, { x: col.item, y: top - i * 12, size: 9, font: regular, color: ink }));
    metaLines.forEach((text, i) =>
      page.drawText(text, { x: col.item, y: top - (name.length + i) * 12, size: 8, font: regular, color: muted }),
    );
    drawRight(`${quantityFormat.format(line.quantity)} ${line.unit}`, col.qty + 55, 9, regular);
    drawRight(formatAmount(line.unitPrice), col.price + 70, 9, regular);
    drawRight(formatAmount(line.lineTotal), right, 9, regular);
    y -= height;
  }

  // totals
  y -= 6;
  room(70);
  page.drawLine({ start: { x: PAGE.margin + 280, y }, end: { x: right, y }, thickness: 0.5, color: muted });
  y -= 16;
  const total = (text: string, value: string, font: PDFFont) => {
    draw(text, PAGE.margin + 280, 10, font);
    drawRight(value, right, 10, font);
    y -= 16;
  };
  total(label("purchaseOrders.totals.excl"), formatAmount(po.total), regular);
  total(label("purchaseOrders.totals.vat", { rate: po.vatRate }), formatAmount(po.vatAmount), regular);
  total(label("purchaseOrders.totals.incl"), formatAmount(po.totalInclVat), bold);

  y -= 10;
  room(24);
  draw(label("purchaseOrders.priceNote"), PAGE.margin, 8, regular, muted);
  return doc.save();
}
