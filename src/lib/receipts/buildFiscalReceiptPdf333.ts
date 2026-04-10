import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

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

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 42;
const TOP = PAGE_HEIGHT - 42;
const BRAND_GOLD = rgb(0.74, 0.60, 0.20);
const TEXT_DARK = rgb(0.12, 0.12, 0.14);
const TEXT_MUTED = rgb(0.42, 0.42, 0.46);
const BORDER = rgb(0.88, 0.88, 0.90);
const SOFT_BG = rgb(0.975, 0.975, 0.98);
const TABLE_HEAD_BG = rgb(0.95, 0.95, 0.965);

function euro(value: number, currencyCode?: string | null) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function wrapText(text: string, maxChars = 56) {
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

function drawText(page: PDFPage, text: string, options: {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
}) {
  page.drawText(text, {
    x: options.x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? TEXT_DARK,
  });
}

async function tryLoadLogo(pdfDoc: PDFDocument) {
  const candidates = [
    path.join(process.cwd(), "public", "branding", "magnifique-logo-gold.png"),
    path.join(process.cwd(), "public", "magnifique-logo-gold.png"),
    path.join(process.cwd(), "public", "logo.png"),
  ];

  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      return await pdfDoc.embedPng(bytes);
    } catch {
      // continue
    }
  }

  return null;
}

export async function buildFiscalReceiptPdf(input: BuildFiscalReceiptPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await tryLoadLogo(pdfDoc);

  let y = TOP;

  // Header / branding
  if (logo) {
    const maxWidth = 160;
    const maxHeight = 96;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN_X,
      y: y - logoHeight + 6,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    drawText(page, "MAGNIFIQUE BEAUTY", { x: MARGIN_X, y: y - 8, font: bold, size: 17, color: TEXT_DARK });
    drawText(page, "Institut", { x: MARGIN_X, y: y - 28, font, size: 11, color: TEXT_MUTED });
  }

  drawText(page, "RECHNUNG", {
    x: PAGE_WIDTH - 180,
    y: y - 8,
    font: bold,
    size: 24,
    color: TEXT_DARK,
  });
  drawText(page, `Nr. ${input.receiptNumber}`, {
    x: PAGE_WIDTH - 180,
    y: y - 32,
    font: bold,
    size: 12,
    color: BRAND_GOLD,
  });
  drawText(page, input.issuedAtLabel, {
    x: PAGE_WIDTH - 180,
    y: y - 50,
    font,
    size: 10,
    color: TEXT_MUTED,
  });

  y -= 110;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 1.4,
    color: BRAND_GOLD,
  });

  // Info cards
  y -= 22;
  const cardGap = 14;
  const leftCardX = MARGIN_X;
  const cardY = y - 88;
  const cardW = (PAGE_WIDTH - MARGIN_X * 2 - cardGap) / 2;
  const cardH = 88;

  page.drawRectangle({
    x: leftCardX,
    y: cardY,
    width: cardW,
    height: cardH,
    color: SOFT_BG,
    borderColor: BORDER,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: leftCardX + cardW + cardGap,
    y: cardY,
    width: cardW,
    height: cardH,
    color: SOFT_BG,
    borderColor: BORDER,
    borderWidth: 1,
  });

  drawText(page, "RECHNUNG AN", {
    x: leftCardX + 14,
    y: cardY + cardH - 18,
    font: bold,
    size: 9,
    color: TEXT_MUTED,
  });
  drawText(page, input.customerName || "—", {
    x: leftCardX + 14,
    y: cardY + cardH - 42,
    font: bold,
    size: 13,
  });

  const rightX = leftCardX + cardW + cardGap + 14;
  drawText(page, "RECHNUNGSDATEN", {
    x: rightX,
    y: cardY + cardH - 18,
    font: bold,
    size: 9,
    color: TEXT_MUTED,
  });
  drawText(page, `Leistungserbringer: ${input.providerName || "—"}`,
    { x: rightX, y: cardY + cardH - 40, font: bold, size: 10.5 });
  drawText(page, `Zahlungsart: ${input.paymentMethodLabel || "—"}`,
    { x: rightX, y: cardY + cardH - 57, font, size: 10 });
  drawText(page, `Endbetrag: ${input.amountLabel || "—"}`,
    { x: rightX, y: cardY + cardH - 74, font, size: 10 });

  y = cardY - 26;

  // Table header
  const tableX = MARGIN_X;
  const tableWidth = PAGE_WIDTH - MARGIN_X * 2;
  const posW = 30;
  const qtyW = 48;
  const unitW = 90;
  const totalW = 88;
  const descW = tableWidth - posW - qtyW - unitW - totalW;

  page.drawRectangle({
    x: tableX,
    y: y - 20,
    width: tableWidth,
    height: 22,
    color: TABLE_HEAD_BG,
    borderColor: BORDER,
    borderWidth: 1,
  });

  drawText(page, "Pos.", { x: tableX + 8, y: y - 12, font: bold, size: 9.5 });
  drawText(page, "Beschreibung", { x: tableX + posW + 8, y: y - 12, font: bold, size: 9.5 });
  drawText(page, "Menge", { x: tableX + posW + descW + 8, y: y - 12, font: bold, size: 9.5 });
  drawText(page, "Einzelpreis", { x: tableX + posW + descW + qtyW + 8, y: y - 12, font: bold, size: 9.5 });
  drawText(page, "Gesamt", { x: tableX + posW + descW + qtyW + unitW + 8, y: y - 12, font: bold, size: 9.5 });

  y -= 28;

  input.lines.forEach((line, index) => {
    const wrapped = wrapText(line.name, 34);
    const rowHeight = Math.max(24, 14 + wrapped.length * 12);

    page.drawRectangle({
      x: tableX,
      y: y - rowHeight + 6,
      width: tableWidth,
      height: rowHeight,
      borderColor: BORDER,
      borderWidth: 1,
    });

    drawText(page, String(index + 1), {
      x: tableX + 10,
      y: y - 10,
      font,
      size: 10,
      color: TEXT_MUTED,
    });

    let lineY = y - 10;
    wrapped.forEach((row, rowIndex) => {
      drawText(page, row, {
        x: tableX + posW + 8,
        y: lineY - rowIndex * 12,
        font: rowIndex === 0 ? bold : font,
        size: 10,
      });
    });

    drawText(page, String(line.quantity), {
      x: tableX + posW + descW + 10,
      y: y - 10,
      font,
      size: 10,
    });
    drawText(page, euro(line.unitPriceGross, input.currencyCode), {
      x: tableX + posW + descW + qtyW + 8,
      y: y - 10,
      font,
      size: 10,
    });
    drawText(page, euro(line.lineTotalGross, input.currencyCode), {
      x: tableX + posW + descW + qtyW + unitW + 8,
      y: y - 10,
      font: bold,
      size: 10,
    });

    y -= rowHeight + 6;
  });

  // Summary box
  y -= 8;
  const sumBoxW = 210;
  const sumBoxH = 78;
  const sumBoxX = PAGE_WIDTH - MARGIN_X - sumBoxW;
  const sumBoxY = y - sumBoxH;

  page.drawRectangle({
    x: sumBoxX,
    y: sumBoxY,
    width: sumBoxW,
    height: sumBoxH,
    color: SOFT_BG,
    borderColor: BORDER,
    borderWidth: 1,
  });

  drawText(page, "GESAMTBETRAG", {
    x: sumBoxX + 16,
    y: sumBoxY + sumBoxH - 20,
    font: bold,
    size: 9,
    color: TEXT_MUTED,
  });
  drawText(page, input.amountLabel, {
    x: sumBoxX + 16,
    y: sumBoxY + sumBoxH - 46,
    font: bold,
    size: 20,
    color: TEXT_DARK,
  });
  drawText(page, `Zahlungsart: ${input.paymentMethodLabel || "—"}`,
    { x: sumBoxX + 16, y: sumBoxY + 14, font, size: 10, color: TEXT_MUTED });

  y = sumBoxY - 24;

  if (input.note) {
    drawText(page, "Hinweis", {
      x: MARGIN_X,
      y,
      font: bold,
      size: 9,
      color: TEXT_MUTED,
    });
    y -= 18;
    wrapText(input.note, 82).forEach((row) => {
      drawText(page, row, {
        x: MARGIN_X,
        y,
        font,
        size: 9.5,
        color: TEXT_DARK,
      });
      y -= 13;
    });
    y -= 10;
  }

  // Footer
  page.drawLine({
    start: { x: MARGIN_X, y: 92 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 92 },
    thickness: 1,
    color: BORDER,
  });
  drawText(page, "Vielen Dank für deinen Besuch.", {
    x: MARGIN_X,
    y: 72,
    font: bold,
    size: 10,
    color: TEXT_DARK,
  });
  drawText(page, "Dieses Dokument wurde elektronisch erstellt und digital aus Magnifique CRM erzeugt.", {
    x: MARGIN_X,
    y: 56,
    font,
    size: 8.5,
    color: TEXT_MUTED,
  });

  return Buffer.from(await pdfDoc.save());
}
