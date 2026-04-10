
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

  // Optional dynamic fields for the next DB step
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
const MARGIN_X = 40;
const TOP = PAGE_HEIGHT - 42;

const TEXT = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.38, 0.38, 0.42);
const LIGHT = rgb(0.72, 0.72, 0.76);
const GRID = rgb(0.84, 0.84, 0.87);
const HEAD_BG = rgb(0.965, 0.965, 0.972);
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

function defaultProviderFooterParts() {
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
    path.join(process.cwd(), "public", "public", "branding", "magnifique-logo-gold.png"),
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

  const providerBlock = normalizeLines(input.providerBlock) || [];
  const customerBlock = normalizeLines(input.customerBlock);
  const paymentTermsText = String(input.paymentTermsText ?? "").trim() || defaultPaymentTerms(input.paymentMethodLabel, input.amountLabel);

  const bankRows = [
    ["Bankverbindung", String(input.bankName ?? "").trim() || "Noch nicht hinterlegt"],
    ["BIC", String(input.bankBic ?? "").trim() || "—"],
    ["IBAN", String(input.bankIban ?? "").trim() || "—"],
    ["Empfänger-Name", String(input.bankAccountHolder ?? "").trim() || input.providerName || "—"],
    ["Zahlungsreferenz", String(input.paymentReference ?? "").trim() || input.receiptNumber || "—"],
  ] as const;

  let y = TOP;

  // Branding row
  if (logo) {
    const maxW = 150;
    const maxH = 78;
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
    x: PAGE_WIDTH - 188,
    y: y - 8,
    font: bold,
    size: 11,
    color: TEXT,
  });
  drawText(page, input.providerEmail || "E-Mail / Kontakt laut Behandlerprofil", {
    x: PAGE_WIDTH - 188,
    y: y - 24,
    font,
    size: 9,
    color: MUTED,
  });
  drawText(page, input.providerPhone || "Digitale Rechnung aus Magnifique CRM", {
    x: PAGE_WIDTH - 188,
    y: y - 38,
    font,
    size: 9,
    color: MUTED,
  });

  y -= 96;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 1, color: LIGHT });

  // Address strip
  y -= 20;
  drawText(page, providerBlock[0] || input.providerName || "Magnifique Beauty Institut", {
    x: MARGIN_X,
    y,
    font,
    size: 8.8,
    color: MUTED,
  });
  page.drawLine({ start: { x: MARGIN_X, y: y - 4 }, end: { x: MARGIN_X + 205, y: y - 4 }, thickness: 0.7, color: LIGHT });

  // Main title section
  y -= 34;
  drawText(page, `Rechnung Nr.: ${input.receiptNumber}`, {
    x: MARGIN_X,
    y,
    font: bold,
    size: 18,
    color: TEXT,
  });

  // Customer block on right
  const customerBlockX = PAGE_WIDTH - 208;
  const renderedCustomer = customerBlock.length
    ? customerBlock
    : [input.customerName || "—", "Kunde / Empfänger"];

  let customerY = y + 2;
  renderedCustomer.forEach((row, idx) => {
    drawText(page, row, {
      x: customerBlockX,
      y: customerY,
      font: idx === 0 ? bold : font,
      size: idx === 0 ? 11 : 9,
      color: idx === 0 ? TEXT : MUTED,
    });
    customerY -= idx === 0 ? 16 : 12;
  });

  y -= 34;

  // Meta rows
  const metaLeftX = MARGIN_X;
  const metaRightLabelX = PAGE_WIDTH - 190;
  const metaRightValueX = PAGE_WIDTH - 90;

  const metaRows: Array<[string, string]> = [
    ["Belegdatum:", input.issuedAtLabel || "—"],
    ["Zahlungskondition:", paymentTermsText.replace(/^Zahlungskonditionen:\s*/i, "")],
    ["Sachbearbeiter:", input.providerName || "—"],
    ["Zahlungsart:", input.paymentMethodLabel || "—"],
  ];

  metaRows.forEach(([label, value], index) => {
    const rowY = y - index * 15;
    drawText(page, label, { x: metaRightLabelX, y: rowY, font, size: 9, color: MUTED });
    drawText(page, value, { x: metaRightValueX, y: rowY, font: index === 2 ? bold : font, size: 9.4, color: TEXT });
  });

  drawText(page, "Wir erlauben uns zu verrechnen:", {
    x: metaLeftX,
    y,
    font,
    size: 10,
    color: TEXT,
  });
  y -= 72;

  // Table (no Pos / no Eh, as requested)
  const tableX = MARGIN_X;
  const tableW = PAGE_WIDTH - MARGIN_X * 2;
  const descW = 330;
  const qtyW = 62;
  const unitW = 85;
  const totalW = tableW - descW - qtyW - unitW;

  page.drawRectangle({ x: tableX, y: y - 18, width: tableW, height: 22, color: HEAD_BG, borderColor: GRID, borderWidth: 0.8 });
  drawText(page, "Dienstleistung / Artikel", { x: tableX + 8, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Menge", { x: tableX + descW + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Preis", { x: tableX + descW + qtyW + 6, y: y - 10, font: bold, size: 9.2 });
  drawText(page, "Gesamt", { x: tableX + descW + qtyW + unitW + 6, y: y - 10, font: bold, size: 9.2 });
  y -= 24;

  lines.forEach((line) => {
    const labelLines = wrapTextByWidth(line.name, bold, 9.6, descW - 10);
    const descLines = wrapTextByWidth(String(line.description ?? "").trim(), font, 8.6, descW - 18).filter(Boolean);
    const combinedRows = [...labelLines, ...descLines];
    const rowH = Math.max(22, 12 + combinedRows.length * 10.5);

    page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, borderColor: GRID, borderWidth: 0.7 });

    let textY = y - 9;
    labelLines.forEach((row, rowIndex) => {
      drawText(page, row, { x: tableX + 8, y: textY - rowIndex * 10.5, font: bold, size: 9.6 });
    });

    let descStartY = textY - labelLines.length * 10.5;
    descLines.forEach((row, rowIndex) => {
      drawText(page, row, { x: tableX + 18, y: descStartY - rowIndex * 10.2, font, size: 8.6, color: MUTED });
    });

    drawText(page, String(line.quantity), { x: tableX + descW + 8, y: y - 9, font, size: 9.5 });
    drawText(page, euro(line.unitPriceGross, input.currencyCode), { x: tableX + descW + qtyW + 6, y: y - 9, font, size: 9.5 });
    drawText(page, euro(line.lineTotalGross, input.currencyCode), { x: tableX + descW + qtyW + unitW + 6, y: y - 9, font: bold, size: 9.5 });

    y -= rowH + 4;
  });

  y -= 12;

  // Summary
  const labelX = PAGE_WIDTH - 195;
  const valueX = PAGE_WIDTH - 88;
  const grossLabel = euro(totalGross, input.currencyCode);
  const vatLabel = euro(vatAmount, input.currencyCode);
  const netLabel = euro(netAmount, input.currencyCode);

  drawText(page, "NETTOBETRAG", { x: labelX - 70, y, font, size: 10, color: TEXT });
  drawText(page, netLabel, { x: valueX, y, font, size: 10, color: TEXT });
  y -= 16;

  drawText(page, "MWST 20% von", { x: labelX - 70, y, font, size: 10, color: TEXT });
  drawText(page, netLabel, { x: labelX + 18, y, font, size: 10, color: TEXT });
  drawText(page, vatLabel, { x: valueX, y, font, size: 10, color: TEXT });
  y -= 16;

  drawText(page, "GESAMTBETRAG", { x: labelX - 70, y, font: bold, size: 11, color: TEXT });
  drawText(page, grossLabel, { x: valueX, y, font: bold, size: 11, color: TEXT });
  y -= 22;

  drawText(page, "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG.", {
    x: MARGIN_X,
    y,
    font,
    size: 8.6,
    color: MUTED,
  });

  y -= 18;
  drawText(page, paymentTermsText, {
    x: MARGIN_X,
    y,
    font,
    size: 9.2,
    color: TEXT,
  });

  // Bank box and QR placeholder
  y -= 18;
  const bankBoxX = MARGIN_X;
  const bankBoxY = y - 76;
  const bankBoxW = 240;
  const bankBoxH = 78;

  page.drawRectangle({
    x: bankBoxX,
    y: bankBoxY,
    width: bankBoxW,
    height: bankBoxH,
    borderColor: GRID,
    borderWidth: 0.8,
  });

  let bankTextY = bankBoxY + bankBoxH - 14;
  bankRows.forEach(([label, value], idx) => {
    drawText(page, `${label}:`, {
      x: bankBoxX + 8,
      y: bankTextY,
      font: idx == 0 ? bold : font,
      size: 8.7,
      color: TEXT,
    });
    drawText(page, value, {
      x: bankBoxX + 82,
      y: bankTextY,
      font,
      size: 8.7,
      color: TEXT,
    });
    bankTextY -= 12;
  });

  const qrBoxSize = 72;
  const qrBoxX = PAGE_WIDTH - MARGIN_X - qrBoxSize;
  const qrBoxY = bankBoxY + 3;

  page.drawRectangle({
    x: qrBoxX,
    y: qrBoxY,
    width: qrBoxSize,
    height: qrBoxSize,
    borderColor: GRID,
    borderWidth: 0.8,
  });

  if (qrImage) {
    page.drawImage(qrImage, {
      x: qrBoxX + 4,
      y: qrBoxY + 4,
      width: qrBoxSize - 8,
      height: qrBoxSize - 8,
    });
  } else {
    drawText(page, "QR", {
      x: qrBoxX + 27,
      y: qrBoxY + 30,
      font: bold,
      size: 16,
      color: MUTED,
    });
    drawText(page, "folgt", {
      x: qrBoxX + 20,
      y: qrBoxY + 18,
      font,
      size: 8.2,
      color: MUTED,
    });
  }

  if (input.note) {
    y = bankBoxY - 20;
    drawText(page, "Hinweis:", { x: MARGIN_X, y, font: bold, size: 9.2, color: MUTED });
    y -= 14;
    wrapTextByWidth(input.note, font, 9, PAGE_WIDTH - MARGIN_X * 2).forEach((row) => {
      drawText(page, row, { x: MARGIN_X, y, font, size: 9, color: TEXT });
      y -= 11;
    });
  }

  // Footer
  page.drawLine({ start: { x: MARGIN_X, y: 92 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 92 }, thickness: 0.8, color: GRID });

  if (logo) {
    const scale = Math.min(48 / logo.width, 28 / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN_X,
      y: 44,
      width: w,
      height: h,
    });
  }

  const footerText = defaultProviderFooterParts().join(" | ");
  const footerLines = wrapTextByWidth(footerText, font, 6.8, PAGE_WIDTH - MARGIN_X * 2 - 110);
  let footerY = 73;
  footerLines.forEach((row) => {
    drawText(page, row, {
      x: MARGIN_X + 55,
      y: footerY,
      font,
      size: 6.8,
      color: MUTED,
    });
    footerY -= 8;
  });

  drawText(page, input.providerWebsite || "www.magnifique-beauty.at", {
    x: PAGE_WIDTH - 145,
    y: 48,
    font: bold,
    size: 11.2,
    color: ACCENT,
  });

  return Buffer.from(await pdfDoc.save());
}
