import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import messages from "../../../messages/en.json";
import { formatDateTime } from "@/lib/format";

/** What public.minutes_view returns: the one source for the minutes screen and the PDF (CMT-03 AC2, AC3). */
export type MinutesView = {
  id: string;
  number: string;
  decisionId: string;
  type: "OPENING" | "WINNER" | "PO";
  status: "APPROVED" | "REJECTED" | "NO_DECISION";
  resultRule: "MAJORITY" | "CHAIR_CASTING_VOTE" | "NO_QUORUM" | "TIE_WITHOUT_CHAIR" | "SOURCING_CANCELLED";
  openedAt: string;
  closedAt: string;
  sourcingId: string;
  sourcingNumber: string;
  poNumber: string | null;
  closeReason: string | null;
  reopenReason: string | null;
  eligible: number;
  for: number;
  against: number;
  voters: { name: string; isChair: boolean; vote: "FOR" | "AGAINST" | "CONFLICT" | "NONE"; comment: string | null }[];
};

/** Standard PDF fonts cover Latin-1 only: Azerbaijani letters and typographic marks are written in plain Latin. */
const PLAIN: Record<string, string> = {
  "ə": "e", "Ə": "E", "ı": "i", "İ": "I", "ğ": "g", "Ğ": "G", "ş": "s", "Ş": "S",
  "—": "-", "–": "-", "…": "...", "’": "'", "‘": "'", "“": '"', "”": '"', " ": " ",
};
export function pdfText(value: string): string {
  return Array.from(value, (ch) => PLAIN[ch] ?? (ch.charCodeAt(0) <= 0xff ? ch : "?")).join("");
}

export function label(path: string, values: Record<string, string | number> = {}): string {
  const found = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
  if (typeof found !== "string") throw new Error(`Missing message ${path}`);
  return found.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export const PAGE = { width: 595.28, height: 841.89, margin: 50 };

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfText(text).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // a single word longer than the column is cut
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** English minutes PDF with the same content as the screen: number, decision, voters, votes, result and rule. */
export async function buildMinutesPdf(m: MinutesView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`${m.number} - ${label("minutes.heading")}`));
  doc.setProducer(label("minutes.generated"));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.1, 0.12);
  const muted = rgb(0.4, 0.42, 0.45);
  const teal = rgb(0.06, 0.4, 0.4);

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const room = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const draw = (text: string, x: number, size: number, font: PDFFont, color = ink) =>
    page.drawText(pdfText(text), { x, y, size, font, color });

  // header
  draw(label("app.name"), PAGE.margin, 10, bold, teal);
  y -= 24;
  draw(label("minutes.heading"), PAGE.margin, 16, bold);
  y -= 22;
  draw(m.number, PAGE.margin, 13, bold, teal);
  y -= 26;

  const fields: [string, string][] = [
    [label("minutes.fields.type"), label(`decisions.typeTitle.${m.type}`)],
    [label("minutes.fields.sourcing"), m.sourcingNumber],
    ...(m.poNumber ? ([[label("minutes.fields.po"), m.poNumber]] as [string, string][]) : []),
    [label("minutes.fields.opened"), formatDateTime(m.openedAt)],
    [label("minutes.fields.closed"), formatDateTime(m.closedAt)],
    [label("minutes.fields.result"), label(`status.${m.status}`)],
    [label("minutes.fields.rule"), label(`decisions.rules.${m.resultRule}`)],
    [label("minutes.fields.counts"), label("minutes.counts", { for: m.for, against: m.against, eligible: m.eligible })],
    ...(m.closeReason ? ([[label("minutes.fields.cancellation"), m.closeReason]] as [string, string][]) : []),
    ...(m.reopenReason ? ([[label("minutes.fields.reopen"), m.reopenReason]] as [string, string][]) : []),
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

  // voters table
  y -= 10;
  room(60);
  draw(label("minutes.voters"), PAGE.margin, 12, bold);
  y -= 20;
  const cols = [
    { x: PAGE.margin, w: 140, title: label("minutes.voterColumns.member") },
    { x: PAGE.margin + 145, w: 55, title: label("minutes.voterColumns.role") },
    { x: PAGE.margin + 205, w: 100, title: label("minutes.voterColumns.vote") },
    { x: PAGE.margin + 310, w: contentWidth - 310, title: label("minutes.voterColumns.comment") },
  ];
  for (const col of cols) draw(col.title, col.x, 9, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.5, color: muted });
  y -= 14;
  for (const v of m.voters) {
    const comment = wrap(v.comment ?? "-", regular, 9, cols[3].w);
    const name = wrap(v.name, regular, 9, cols[0].w);
    const height = Math.max(comment.length, name.length) * 12 + 6;
    room(height);
    name.forEach((line, i) => page.drawText(line, { x: cols[0].x, y: y - i * 12, size: 9, font: regular, color: ink }));
    draw(v.isChair ? label("minutes.chair") : label("minutes.memberRole"), cols[1].x, 9, regular);
    draw(label(`decisions.votes.${v.vote}`), cols[2].x, 9, bold);
    comment.forEach((line, i) => page.drawText(line, { x: cols[3].x, y: y - i * 12, size: 9, font: regular, color: ink }));
    y -= height;
  }

  y -= 12;
  room(24);
  draw(label("minutes.readOnly"), PAGE.margin, 8, regular, muted);
  return doc.save();
}
