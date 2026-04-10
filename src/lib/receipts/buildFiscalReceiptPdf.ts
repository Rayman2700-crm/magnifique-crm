import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";

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
const MARGIN_X = 40;
const TOP = PAGE_HEIGHT - 42;
const TEXT = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.38, 0.38, 0.42);
const LIGHT = rgb(0.72, 0.72, 0.76);
const GRID = rgb(0.84, 0.84, 0.87);
const HEAD_BG = rgb(0.965, 0.965, 0.972);
const ACCENT = rgb(0.73, 0.60, 0.20);

function euro(value: number, currencyCode?: string | null) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function drawText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
) {
  page.drawText(String(text ?? ""), {
    x: options.x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? TEXT,
  });
}

function wrapTextByWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function tryLoadLogo(pdfDoc: PDFDocument): Promise<PDFImage | null> {
  const candidates = [
    path.join(process.cwd(), "public", "branding", "magnifique-logo-gold.png"),
    path.join(process.cwd(), "public", "branding", "magnifique-logo-gold.jpg"),
    path.join(process.cwd(), "public", "magnifique-logo-gold.png"),
    path.join(process.cwd(), "public", "logo.png"),
  ];

  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      const ext = path.extname(candidate).toLowerCase();
      if (ext === ".jpg" || ext === ".jpeg") return await pdfDoc.embedJpg(bytes);
      return await pdfDoc.embedPng(bytes);
    } catch {
      // continue
    }
  }
  return null;
}


async function tryLoadProviderLogo(
  pdfDoc: PDFDocument,
  bytes?: Uint8Array | Buffer | null,
): Promise<PDFImage | null> {
  if (bytes && bytes.length > 0) {
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(bytes);
      } catch {
        // fall through to default logo
      }
    }
  }

  return await tryLoadLogo(pdfDoc);
}

export async function buildFiscalReceiptPdf(input: BuildFiscalReceiptPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await tryLoadLogo(pdfDoc);

  const lines = input.lines ?? [];
  const totalGross = lines.reduce((sum, line) => sum + Number(line.lineTotalGross || 0), 0);
  const vatAmount = totalGross * (20 / 120);
  const netAmount = totalGross - vatAmount;

  let y = TOP;

  // Branding row
  if (logo) {
    const maxW = 170;
    const maxH = 88;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN_X,
      y: y - h + 6,
      width: w,
      height: h,
    });
  } else {
    drawText(page, "MAGNIFIQUE BEAUTY INSTITUT", { x: MARGIN_X, y: y - 12, font: bold, size: 18 });
  }

  drawText(page, input.providerName || "Magnifique Beauty Institut", {
    x: PAGE_WIDTH - 190,
    y: y - 8,
    font: bold,
    size: 11,
    color: TEXT,
  });
  drawText(page, "E-Mail / Kontakt laut Behandlerprofil", {
    x: PAGE_WIDTH - 190,
    y: y - 24,
    font,
    size: 9,
    color: MUTED,
  });
  drawText(page, "Digitale Rechnung aus Magnifique CRM", {
    x: PAGE_WIDTH - 190,
    y: y - 38,
    font,
    size: 9,
    color: MUTED,
  });

  y -= 102;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 1, color: LIGHT });

  // Address / intro strip
  y -= 20;
  drawText(page, input.providerName || "Magnifique Beauty Institut", {
    x: MARGIN_X,
    y,
    font,
    size: 8.8,
    color: MUTED,
  });
  page.drawLine({ start: { x: MARGIN_X, y: y - 4 }, end: { x: MARGIN_X + 175, y: y - 4 }, thickness: 0.7, color: LIGHT });

  // Main title section
  y -= 34;
  drawText(page, `Rechnung Nr.: ${input.receiptNumber}`, {
    x: MARGIN_X,
    y,
    font: bold,
    size: 18,
    color: TEXT,
  });

  // Customer block on right like reference
  const customerBlockX = PAGE_WIDTH - 205;
  drawText(page, input.customerName || "—", {
    x: customerBlockX,
    y: y + 2,
    font: bold,
    size: 11,
    color: TEXT,
  });
  drawText(page, "Kunde / Empfänger", {
    x: customerBlockX,
    y: y - 14,
    font,
    size: 9,
    color: MUTED,
  });

  y -= 34;

  // Meta rows
  const metaLeftX = MARGIN_X;
  const metaRightLabelX = PAGE_WIDTH - 190;
  const metaRightValueX = PAGE_WIDTH - 88;

  const metaRows: Array<[string, string]> = [
    ["Belegdatum:", input.issuedAtLabel || "—"],
    ["Zahlungskondition:", "prompt"],
    ["Ihr Kontakt:", input.providerName || "—"],
    ["Zahlungsart:", input.paymentMethodLabel || "—"],
  ];

  metaRows.forEach(([label, value], index) => {
    const rowY = y - index * 15;
    drawText(page, label, { x: metaRightLabelX, y: rowY, font, size: 9, color: MUTED });
    drawText(page, value, { x: metaRightValueX, y: rowY, font: index === 2 ? bold : font, size: 9.5, color: TEXT });
  });

  drawText(page, "Wir erlauben uns zu verrechnen:", {
    x: metaLeftX,
    y,
    font,
    size: 10,
    color: TEXT,
  });
  y -= 72;

  // Table
  const tableX = MARGIN_X;
  const tableW = PAGE_WIDTH - MARGIN_X * 2;
  const posW = 28;
  const descW = 255;
  const qtyW = 52;
  const unitW = 85;
  const totalW = tableW - posW - descW - qtyW - unitW;

  page.drawRectangle({ x: tableX, y: y - 18, width: tableW, height: 22, color: HEAD_BG, borderColor: GRID, borderWidth: 0.8 });
  drawText(page, "Pos.", { x: tableX + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Produktbezeichnung", { x: tableX + posW + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Menge", { x: tableX + posW + descW + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Einzelpreis", { x: tableX + posW + descW + qtyW + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Gesamtpreis", { x: tableX + posW + descW + qtyW + unitW + 6, y: y - 10, font: bold, size: 9.2 });
  y -= 24;

  lines.forEach((line, idx) => {
    const wrapped = wrapTextByWidth(line.name, font, 9.8, descW - 10);
    const rowH = Math.max(22, 12 + wrapped.length * 11);

    page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, borderColor: GRID, borderWidth: 0.7 });
    drawText(page, String(idx + 1), { x: tableX + 7, y: y - 9, font, size: 9.5, color: MUTED });

    let textY = y - 9;
    wrapped.forEach((row, rowIndex) => {
      drawText(page, row, { x: tableX + posW + 6, y: textY - rowIndex * 10.5, font: rowIndex === 0 ? bold : font, size: 9.6 });
    });

    drawText(page, String(line.quantity), { x: tableX + posW + descW + 8, y: y - 9, font, size: 9.5 });
    drawText(page, euro(line.unitPriceGross, input.currencyCode), { x: tableX + posW + descW + qtyW + 6, y: y - 9, font, size: 9.5 });
    drawText(page, euro(line.lineTotalGross, input.currencyCode), { x: tableX + posW + descW + qtyW + unitW + 6, y: y - 9, font: bold, size: 9.5 });

    y -= rowH + 4;
  });

  y -= 12;

  // Summary aligned like reference
  const labelX = PAGE_WIDTH - 195;
  const valueX = PAGE_WIDTH - 88;
  const grossLabel = euro(totalGross, input.currencyCode);
  const vatLabel = euro(vatAmount, input.currencyCode);
  const netLabel = euro(netAmount, input.currencyCode);

  drawText(page, "Betrag: netto", { x: labelX, y, font, size: 10, color: TEXT });
  drawText(page, netLabel, { x: valueX, y, font, size: 10, color: TEXT });
  y -= 16;

  drawText(page, "20,00 % MwSt:", { x: labelX, y, font, size: 10, color: TEXT });
  drawText(page, vatLabel, { x: valueX, y, font, size: 10, color: TEXT });
  y -= 16;

  drawText(page, "Gesamtsumme:", { x: labelX, y, font: bold, size: 11, color: TEXT });
  drawText(page, grossLabel, { x: valueX, y, font: bold, size: 11, color: TEXT });
  y -= 26;

  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 0.8, color: GRID });
  y -= 18;

  drawText(page, `Zahlungsmodalitäten: ${grossLabel} ohne Abzug prompt bei Rechnungserhalt.`, {
    x: MARGIN_X,
    y,
    font,
    size: 9.5,
    color: TEXT,
  });
  y -= 14;
  drawText(page, "Wir bitten Sie, bei Überweisungen die Rechnungsnummer als Verwendungszweck zu hinterlegen.", {
    x: MARGIN_X,
    y,
    font,
    size: 9.2,
    color: TEXT,
  });

  if (input.note) {
    y -= 22;
    drawText(page, "Hinweis:", { x: MARGIN_X, y, font: bold, size: 9.2, color: MUTED });
    y -= 14;
    wrapTextByWidth(input.note, font, 9, PAGE_WIDTH - MARGIN_X * 2).forEach((row) => {
      drawText(page, row, { x: MARGIN_X, y, font, size: 9, color: TEXT });
      y -= 11;
    });
  }

  // Footer
  page.drawLine({ start: { x: MARGIN_X, y: 92 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 92 }, thickness: 0.8, color: GRID });
  drawText(page, "Magnifique Beauty Institut · digitale Rechnungserstellung über Magnifique CRM", {
    x: MARGIN_X,
    y: 72,
    font,
    size: 8.4,
    color: MUTED,
  });
  drawText(page, "Vielen Dank für deinen Besuch.", {
    x: MARGIN_X,
    y: 58,
    font: bold,
    size: 8.8,
    color: ACCENT,
  });

  return Buffer.from(await pdfDoc.save());
}
