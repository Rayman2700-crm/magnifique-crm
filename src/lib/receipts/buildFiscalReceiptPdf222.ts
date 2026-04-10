import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type FiscalReceiptPdfLine = {
  name: string;
  quantity: number;
  unitPriceGross: number;
  lineTotalGross: number;
};

export type BuildFiscalReceiptPdfInput = {
  receiptNumber: string;
  issuedAtLabel: string;
  providerName: string;
  customerName: string;
  paymentMethodLabel: string;
  amountLabel: string;
  currencyCode?: string | null;
  lines: FiscalReceiptPdfLine[];
  note?: string | null;
};

function euro(value: number, currencyCode?: string | null) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function wrapText(text: string, maxChars = 72) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    current = word;
  }

  if (current) rows.push(current);
  return rows.length > 0 ? rows : [""];
}

export async function buildFiscalReceiptPdf(input: BuildFiscalReceiptPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 42;
  let y = height - margin;

  const drawText = (text: string, options?: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const size = options?.size ?? 11;
    const usedFont = options?.bold ? bold : font;
    page.drawText(text, {
      x: options?.x ?? margin,
      y,
      size,
      font: usedFont,
      color: options?.color ?? rgb(0.07, 0.07, 0.09),
    });
    y -= size + 4;
  };

  page.drawText("Magnifique CRM", {
    x: margin,
    y,
    size: 9,
    font: bold,
    color: rgb(0.35, 0.35, 0.4),
  });
  y -= 24;

  drawText(`Beleg ${input.receiptNumber}`, { size: 22, bold: true });
  drawText(input.issuedAtLabel, { size: 10, color: rgb(0.35, 0.35, 0.4) });
  y -= 10;

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.87, 0.87, 0.9) });
  y -= 24;

  drawText(`Behandler / Firma: ${input.providerName}`, { bold: true });
  drawText(`Kunde: ${input.customerName || "—"}`);
  drawText(`Zahlungsart: ${input.paymentMethodLabel || "—"}`);
  drawText(`Gesamt: ${input.amountLabel}`);
  y -= 10;

  page.drawRectangle({
    x: margin,
    y: y - 18,
    width: width - margin * 2,
    height: 22,
    color: rgb(0.96, 0.96, 0.97),
    borderColor: rgb(0.87, 0.87, 0.9),
    borderWidth: 1,
  });
  page.drawText("Leistung", { x: margin + 8, y: y - 11, size: 10, font: bold });
  page.drawText("Menge", { x: width - 220, y: y - 11, size: 10, font: bold });
  page.drawText("Einzelpreis", { x: width - 165, y: y - 11, size: 10, font: bold });
  page.drawText("Gesamt", { x: width - 78, y: y - 11, size: 10, font: bold });
  y -= 30;

  for (const line of input.lines) {
    const wrapped = wrapText(line.name, 34);
    const rowHeight = Math.max(20, wrapped.length * 13 + 8);
    page.drawRectangle({
      x: margin,
      y: y - rowHeight + 6,
      width: width - margin * 2,
      height: rowHeight,
      borderColor: rgb(0.9, 0.9, 0.92),
      borderWidth: 1,
    });

    let lineY = y - 10;
    for (const row of wrapped) {
      page.drawText(row, { x: margin + 8, y: lineY, size: 10, font });
      lineY -= 12;
    }

    page.drawText(String(line.quantity), { x: width - 210, y: y - 10, size: 10, font });
    page.drawText(euro(line.unitPriceGross, input.currencyCode), { x: width - 165, y: y - 10, size: 10, font });
    page.drawText(euro(line.lineTotalGross, input.currencyCode), { x: width - 78, y: y - 10, size: 10, font });
    y -= rowHeight + 6;
  }

  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.87, 0.87, 0.9) });
  y -= 22;

  drawText(`Summe: ${input.amountLabel}`, { size: 13, bold: true, x: width - 190 });
  y -= 8;

  if (input.note) {
    drawText("Hinweis", { size: 10, bold: true, color: rgb(0.35, 0.35, 0.4) });
    for (const row of wrapText(input.note, 80)) {
      drawText(row, { size: 10 });
    }
    y -= 8;
  }

  drawText("Dieser Beleg wurde digital aus Magnifique CRM erzeugt.", { size: 9, color: rgb(0.35, 0.35, 0.4) });

  return Buffer.from(await pdfDoc.save());
}
