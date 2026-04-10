import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";

export type FiscalReceiptPdfLine = {
  name: string;
  quantity: number;
  unitPriceGross: number;
  lineTotalGross: number;
  description?: string | null;
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

  providerBlock?: string[] | null;
  customerBlock?: string[] | null;
  providerPhone?: string | null;
  providerEmail?: string | null;
  providerWebsite?: string | null;
  paymentTermsText?: string | null;

  bankName?: string | null;
  bankBic?: string | null;
  bankIban?: string | null;
  bankAccountHolder?: string | null;
  paymentReference?: string | null;

  qrCodePngBytes?: Uint8Array | Buffer | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 46;
const TOP = PAGE_HEIGHT - 46;

const TEXT = rgb(0.14, 0.14, 0.15);
const MUTED = rgb(0.38, 0.38, 0.42);
const LIGHT = rgb(0.76, 0.76, 0.79);
const GRID = rgb(0.55, 0.55, 0.58);
const ACCENT = rgb(0.6588, 0.4863, 0.2353); // #a87c3c

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

function normalizeLines(value: string[] | null | undefined) {
  return (value ?? []).map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function defaultFooterParts() {
  return [
    "Inhaber: Raluca Craus",
    "Standort: Flugfeldgürtel 24/1, 2700 Wiener Neustadt",
    "Tel: +43 676 4106468",
    "Kontaktdaten: +43 676 4106468, raluca.schwarz@gmail.com",
    "Einzelunternehmen",
    "Firmengericht: Landesgericht Wiener Neustadt",
    "Aufsichtsbehörde: Bezirkshauptmannschaft Wiener Neustadt",
    "Kammer: Wirtschaftskammer Niederösterreich",
    "Berufszweig: Kosmetik",
  ];
}

function defaultPaymentTerms(paymentMethodLabel: string, amountLabel: string) {
  const normalized = String(paymentMethodLabel ?? "").trim().toLowerCase();
  if (normalized.includes("bar") || normalized.includes("cash")) {
    return `Zahlungskonditionen: ${amountLabel} dankend in Bar kassiert`;
  }
  if (normalized.includes("karte") || normalized.includes("card")) {
    return `Zahlungskonditionen: ${amountLabel} mit Karte bezahlt`;
  }
  if (normalized.includes("überweisung") || normalized.includes("ueberweisung") || normalized.includes("transfer")) {
    return "Zahlungskonditionen: Prompt netto Kassa bei Erhalt der Faktura";
  }
  return `Zahlungskonditionen: ${amountLabel} gemäß Zahlungsart ${paymentMethodLabel || "—"}`;
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

async function tryLoadQrCode(pdfDoc: PDFDocument, bytes?: Uint8Array | Buffer | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

export async function buildFiscalReceiptPdf(input: BuildFiscalReceiptPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await tryLoadLogo(pdfDoc);
  const qrImage = await tryLoadQrCode(pdfDoc, input.qrCodePngBytes ?? null);

  const lines = input.lines ?? [];
  const totalGross = lines.reduce((sum, line) => sum + Number(line.lineTotalGross || 0), 0);
  const vatAmount = totalGross * (20 / 120);
  const netAmount = totalGross - vatAmount;

  const providerBlock = normalizeLines(input.providerBlock);
  const customerBlock = normalizeLines(input.customerBlock);
  const footerText = defaultFooterParts().join(" | ");
  const paymentTermsText = String(input.paymentTermsText ?? "").trim() || defaultPaymentTerms(input.paymentMethodLabel, input.amountLabel);

  const bankRows = [
    ["Bankverbindung", String(input.bankName ?? "").trim() || "Noch nicht hinterlegt"],
    ["BIC", String(input.bankBic ?? "").trim() || "—"],
    ["IBAN", String(input.bankIban ?? "").trim() || "—"],
    ["Empfänger-Name", String(input.bankAccountHolder ?? "").trim() || input.providerName || "—"],
    ["Zahlungsreferenz", String(input.paymentReference ?? "").trim() || input.receiptNumber || "—"],
  ] as const;

  let y = TOP;

  // Header with left logo and right logo/title zone like Figma
  if (logo) {
    const leftScale = Math.min(72 / logo.width, 72 / logo.height);
    page.drawImage(logo, {
      x: MARGIN_X + 8,
      y: y - 78,
      width: logo.width * leftScale,
      height: logo.height * leftScale,
    });

    const rightScale = Math.min(90 / logo.width, 90 / logo.height);
    page.drawImage(logo, {
      x: PAGE_WIDTH - MARGIN_X - logo.width * rightScale - 6,
      y: y - 68,
      width: logo.width * rightScale,
      height: logo.height * rightScale,
    });
  } else {
    drawText(page, "LOGO", { x: MARGIN_X + 12, y: y - 32, font: bold, size: 18 });
    drawText(page, "LOGO", { x: PAGE_WIDTH - 92, y: y - 18, font: bold, size: 16 });
  }

  // Left sender strip
  drawText(page, providerBlock[0] || `Abs: ${input.providerName || "Magnifique Beauty Institut"}`, {
    x: MARGIN_X,
    y: y - 92,
    font,
    size: 8.8,
    color: MUTED,
  });
  page.drawLine({ start: { x: MARGIN_X, y: y - 96 }, end: { x: MARGIN_X + 210, y: y - 96 }, thickness: 0.8, color: GRID });

  // Left customer block
  const leftBlockLines = customerBlock.length ? customerBlock : [input.customerName || "—"];
  let leftBlockY = y - 116;
  leftBlockLines.forEach((row, idx) => {
    drawText(page, row, {
      x: MARGIN_X,
      y: leftBlockY,
      font: idx === 0 ? bold : font,
      size: 10.8,
      color: TEXT,
    });
    leftBlockY -= 14;
  });

  // Right double invoice block
  const boxX = PAGE_WIDTH - MARGIN_X - 190;
  const topBoxY = y - 76;
  const boxW = 190;
  const topBoxH = 112;
  const lowerBoxH = 92;

  page.drawRectangle({ x: boxX, y: topBoxY - topBoxH, width: boxW, height: topBoxH, borderColor: GRID, borderWidth: 1 });
  page.drawLine({ start: { x: boxX, y: topBoxY - 26 }, end: { x: boxX + boxW, y: topBoxY - 26 }, thickness: 0.9, color: GRID });
  drawText(page, "RECHNUNG", { x: boxX + 10, y: topBoxY - 17, font: bold, size: 16 });
  drawText(page, input.receiptNumber, { x: boxX + boxW - 62, y: topBoxY - 17, font: bold, size: 14 });

  const topMeta = [
    ["Seite:", "1 von 1"],
    ["Belegdatum:", input.issuedAtLabel || "—"],
    ["Sachbearbeiter:", input.providerName || "—"],
    ["Telefon:", input.providerPhone || ""],
    ["E-Mail:", input.providerEmail || ""],
  ] as const;

  let metaY = topBoxY - 44;
  topMeta.forEach(([label, value]) => {
    drawText(page, label, { x: boxX + 10, y: metaY, font, size: 8.9, color: TEXT });
    drawText(page, value, { x: boxX + boxW - 92, y: metaY, font, size: 8.9, color: TEXT });
    metaY -= 16;
  });

  const lowerBoxTop = topBoxY - topBoxH - 2;
  page.drawRectangle({ x: boxX, y: lowerBoxTop - lowerBoxH, width: boxW, height: lowerBoxH, borderColor: GRID, borderWidth: 1 });

  const lowerMeta = [
    ["Ansprechpartner:", ""],
    ["Telefon:", input.providerPhone || ""],
    ["E-Mail:", input.providerEmail || ""],
  ] as const;

  let lowerY = lowerBoxTop - 18;
  lowerMeta.forEach(([label, value]) => {
    drawText(page, label, { x: boxX + 10, y: lowerY, font, size: 8.9, color: TEXT });
    drawText(page, value, { x: boxX + boxW - 92, y: lowerY, font, size: 8.9, color: TEXT });
    lowerY -= 16;
  });

  // Table
  y = lowerBoxTop - lowerBoxH - 46;
  const tableX = MARGIN_X + 14;
  const tableW = PAGE_WIDTH - (MARGIN_X + 14) * 2;
  const descW = 318;
  const qtyW = 60;
  const unitW = 78;
  const totalW = tableW - descW - qtyW - unitW;

  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 0.8, color: GRID });
  drawText(page, "Artikel - Bezeichnung", { x: tableX + 28, y: y - 11, font, size: 9.2 });
  drawText(page, "Menge", { x: tableX + descW + 8, y: y - 11, font, size: 9.2 });
  drawText(page, "Preis / Eh", { x: tableX + descW + qtyW + 8, y: y - 11, font, size: 9.2 });
  drawText(page, "Gesamt", { x: tableX + descW + qtyW + unitW + 8, y: y - 11, font, size: 9.2 });
  page.drawLine({ start: { x: tableX, y: y - 16 }, end: { x: tableX + tableW, y: y - 16 }, thickness: 0.8, color: GRID });
  y -= 34;

  lines.forEach((line, index) => {
    const titleLines = wrapTextByWidth(line.name, font, 10, descW - 16);
    const descLines = wrapTextByWidth(String(line.description ?? "").trim(), font, 8.6, descW - 34).filter(Boolean);
    const rowH = Math.max(26, 16 + titleLines.length * 11 + descLines.length * 10);

    drawText(page, `${String(index + 1).padStart(3, "0")}-00`, { x: tableX, y: y - 10, font, size: 8.8 });
    let textY = y - 10;
    titleLines.forEach((row, rowIndex) => {
      drawText(page, row, { x: tableX + 52, y: textY - rowIndex * 11, font, size: 9.8 });
    });
    const descStartY = textY - titleLines.length * 11;
    descLines.forEach((row, rowIndex) => {
      drawText(page, row, { x: tableX + 64, y: descStartY - rowIndex * 10, font, size: 8.5, color: MUTED });
    });

    drawText(page, String(line.quantity), { x: tableX + descW + 22, y: y - 10, font, size: 9.6 });
    drawText(page, euro(line.unitPriceGross, input.currencyCode).replace("€", "").trim(), { x: tableX + descW + qtyW + 8, y: y - 10, font, size: 9.6 });
    drawText(page, euro(line.lineTotalGross, input.currencyCode).replace("€", "").trim(), { x: tableX + descW + qtyW + unitW + 8, y: y - 10, font, size: 9.6 });

    y -= rowH;
  });

  // Summary block left aligned like preview
  y -= 4;
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 0.8, color: GRID });
  y -= 14;
  const summaryLabelX = tableX;
  const summaryMidX = tableX + tableW - 152;
  const summaryValueX = tableX + tableW - 56;

  drawText(page, "NETTOBETRAG", { x: summaryLabelX, y, font, size: 10, color: TEXT });
  drawText(page, "EUR", { x: summaryMidX, y, font, size: 10, color: TEXT });
  drawText(page, euro(netAmount, input.currencyCode).replace("€", "").trim(), { x: summaryValueX, y, font, size: 10, color: TEXT });
  y -= 16;

  drawText(page, `MWST 20% von ${euro(netAmount, input.currencyCode).replace("€", "").trim()}`, { x: summaryLabelX, y, font, size: 10, color: TEXT });
  drawText(page, "EUR", { x: summaryMidX, y, font, size: 10, color: TEXT });
  drawText(page, euro(vatAmount, input.currencyCode).replace("€", "").trim(), { x: summaryValueX, y, font, size: 10, color: TEXT });
  y -= 18;

  drawText(page, "GESAMTBETRAG", { x: summaryLabelX, y, font: bold, size: 11, color: TEXT });
  drawText(page, "EUR", { x: summaryMidX, y, font: bold, size: 11, color: TEXT });
  drawText(page, euro(totalGross, input.currencyCode).replace("€", "").trim(), { x: summaryValueX, y, font: bold, size: 11, color: TEXT });
  y -= 20;
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 0.8, color: GRID });
  y -= 18;

  drawText(page, "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG.", {
    x: tableX,
    y,
    font,
    size: 8.8,
    color: TEXT,
  });
  y -= 22;

  drawText(page, paymentTermsText, { x: tableX, y, font, size: 9.6, color: TEXT });
  y -= 26;

  // Bank block left, QR right
  drawText(page, "Bankverbindung", { x: tableX, y, font: bold, size: 12, color: TEXT });
  y -= 20;
  bankRows.forEach(([label, value], idx) => {
    drawText(page, `${label === "Bankverbindung" ? "" : `${label}:`}`, {
      x: tableX,
      y: y - idx * 17,
      font: idx === 0 ? font : font,
      size: 9.6,
      color: TEXT,
    });
    drawText(page, value, {
      x: tableX + (idx === 0 ? 0 : 94),
      y: y - idx * 17,
      font,
      size: 9.6,
      color: TEXT,
    });
  });

  const qrSize = 92;
  const qrX = PAGE_WIDTH - MARGIN_X - qrSize - 34;
  const qrY = y - 20;
  page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, borderColor: GRID, borderWidth: 1 });
  if (qrImage) {
    page.drawImage(qrImage, { x: qrX + 6, y: qrY + 6, width: qrSize - 12, height: qrSize - 12 });
  } else {
    drawText(page, "QR", { x: qrX + 32, y: qrY + 42, font: bold, size: 16, color: MUTED });
    drawText(page, "folgt", { x: qrX + 26, y: qrY + 28, font, size: 8.5, color: MUTED });
  }

  // Footer
  page.drawLine({ start: { x: MARGIN_X, y: 92 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 92 }, thickness: 0.8, color: GRID });
  if (logo) {
    const footerScale = Math.min(56 / logo.width, 44 / logo.height);
    page.drawImage(logo, {
      x: MARGIN_X,
      y: 30,
      width: logo.width * footerScale,
      height: logo.height * footerScale,
    });
  }

  const footerLines = wrapTextByWidth(footerText, font, 6.9, PAGE_WIDTH - 220);
  let footerY = 76;
  footerLines.forEach((row) => {
    drawText(page, row, { x: MARGIN_X + 82, y: footerY, font, size: 6.9, color: MUTED });
    footerY -= 8;
  });

  drawText(page, input.providerWebsite || "www.magnifique-beauty.at", {
    x: PAGE_WIDTH - 150,
    y: 34,
    font: bold,
    size: 11.8,
    color: ACCENT,
  });

  return Buffer.from(await pdfDoc.save());
}
