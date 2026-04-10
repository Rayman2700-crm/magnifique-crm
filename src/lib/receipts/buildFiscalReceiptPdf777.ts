import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";

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
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const RIGHT_X = 345;

const TEXT = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.38, 0.38, 0.42);
const LIGHT = rgb(0.72, 0.72, 0.76);
const GRID = rgb(0.84, 0.84, 0.87);
const ACCENT = rgb(0.6588, 0.4863, 0.2353);

function euro(value: number, currencyCode?: string | null) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(Number(value || 0));
}

function drawText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  page.drawText(String(text ?? ""), {
    x: options.x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? TEXT,
  });
}

function wrapTextByWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
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
  return (value ?? [])
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(2).replace(".", ",");
}

function parseAmountLabelToNumber(amountLabel: string | null | undefined) {
  if (!amountLabel) return 0;
  const normalized = String(amountLabel)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultFooterText() {
  return "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.";
}

function defaultKleinunternehmerText() {
  return "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.";
}

function defaultPaymentTerms(paymentMethodLabel: string, amountLabel: string) {
  const normalized = String(paymentMethodLabel ?? "").trim().toLowerCase();

  if (normalized.includes("bar") || normalized.includes("cash")) {
    return `${amountLabel} dankend in Bar kassiert`;
  }

  if (normalized.includes("karte") || normalized.includes("card")) {
    return `${amountLabel} mit Karte bezahlt`;
  }

  if (
    normalized.includes("überweisung") ||
    normalized.includes("ueberweisung") ||
    normalized.includes("transfer")
  ) {
    return "Prompt netto Kassa bei Erhalt der Faktura";
  }

  return paymentMethodLabel || "—";
}

function extractProviderBlock(
  providerBlock: string[] | null | undefined,
  providerName: string,
) {
  const lines = normalizeLines(providerBlock);
  if (lines.length > 0) return lines;

  return [providerName || "Magnifique Beauty Institut"];
}

function extractCustomerBlock(
  customerBlock: string[] | null | undefined,
  customerName: string,
) {
  const lines = normalizeLines(customerBlock);
  if (lines.length > 0) return lines;

  return [customerName || "—"];
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

async function tryLoadQrCode(
  pdfDoc: PDFDocument,
  bytes?: Uint8Array | Buffer | null,
): Promise<PDFImage | null> {
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
  const totalGross =
    lines.length > 0
      ? lines.reduce((sum, line) => sum + Number(line.lineTotalGross || 0), 0)
      : parseAmountLabelToNumber(input.amountLabel);

  const providerBlock = extractProviderBlock(input.providerBlock, input.providerName);
  const customerBlock = extractCustomerBlock(input.customerBlock, input.customerName);

  const providerPrimary = providerBlock[0] || input.providerName || "Magnifique Beauty Institut";
  const providerRest = providerBlock.slice(1);

  const customerPrimary = customerBlock[0] || input.customerName || "—";
  const customerRest = customerBlock.slice(1);

  const contentWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(1, 1, 1),
  });

  // Optional small logo top left
  if (logo) {
    const maxW = 120;
    const maxH = 42;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;

    page.drawImage(logo, {
      x: MARGIN_LEFT,
      y: PAGE_HEIGHT - 70,
      width: w,
      height: h,
    });
  }

  // Right header
  drawText(page, "RECHNUNG", {
    x: RIGHT_X,
    y: PAGE_HEIGHT - 60,
    font: bold,
    size: 22,
    color: TEXT,
  });

  drawText(page, `Rechnungsnummer: ${input.receiptNumber || "—"}`, {
    x: RIGHT_X,
    y: PAGE_HEIGHT - 95,
    font,
    size: 10,
    color: TEXT,
  });

  drawText(page, `Rechnungsdatum: ${input.issuedAtLabel || "—"}`, {
    x: RIGHT_X,
    y: PAGE_HEIGHT - 110,
    font,
    size: 10,
    color: TEXT,
  });

  drawText(page, `Zahlungsart: ${input.paymentMethodLabel || "—"}`, {
    x: RIGHT_X,
    y: PAGE_HEIGHT - 125,
    font,
    size: 10,
    color: TEXT,
  });

  const paidAtLabel =
    String(input.paymentTermsText ?? "").trim() ||
    defaultPaymentTerms(input.paymentMethodLabel, input.amountLabel);

  drawText(page, `Bezahlt am: ${input.issuedAtLabel || "—"}`, {
    x: RIGHT_X,
    y: PAGE_HEIGHT - 140,
    font,
    size: 10,
    color: TEXT,
  });

  // Provider block right
  const providerStartY = PAGE_HEIGHT - 185;

  drawText(page, providerPrimary, {
    x: RIGHT_X,
    y: providerStartY,
    font: bold,
    size: 16,
    color: TEXT,
  });

  let providerY = providerStartY - 20;

  for (const row of providerRest) {
    drawText(page, row, {
      x: RIGHT_X,
      y: providerY,
      font,
      size: 10,
      color: MUTED,
    });
    providerY -= 15;
  }

  if (String(input.providerPhone ?? "").trim()) {
    if (providerRest.length > 0) providerY -= 5;
    drawText(page, `Tel: ${String(input.providerPhone).trim()}`, {
      x: RIGHT_X,
      y: providerY,
      font,
      size: 10,
      color: MUTED,
    });
    providerY -= 15;
  }

  if (String(input.providerEmail ?? "").trim()) {
    drawText(page, `E-Mail: ${String(input.providerEmail).trim()}`, {
      x: RIGHT_X,
      y: providerY,
      font,
      size: 10,
      color: MUTED,
    });
  }

  // Customer block left aligned to provider block
  let customerY = providerStartY;

  drawText(page, "Rechnung an", {
    x: MARGIN_LEFT,
    y: customerY,
    font: bold,
    size: 11,
    color: TEXT,
  });

  customerY -= 22;

  drawText(page, customerPrimary, {
    x: MARGIN_LEFT,
    y: customerY,
    font: bold,
    size: 11,
    color: TEXT,
  });

  customerY -= 16;

  for (const row of customerRest) {
    drawText(page, row, {
      x: MARGIN_LEFT,
      y: customerY,
      font,
      size: 10,
      color: MUTED,
    });
    customerY -= 14;
  }

  // Table
  const tableTop = 470;
  const tableX = MARGIN_LEFT;
  const tableW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  const descW = 305;
  const qtyW = 55;
  const unitW = 70;
  const totalW = tableW - descW - qtyW - unitW;

  const colDescX = tableX;
  const colQtyX = tableX + descW + 8;
  const colUnitX = tableX + descW + qtyW + 8;
  const colTotalX = tableX + descW + qtyW + unitW + 8;

  page.drawLine({
    start: { x: MARGIN_LEFT, y: tableTop + 18 },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: tableTop + 18 },
    thickness: 1,
    color: GRID,
  });

  drawText(page, "Leistung", {
    x: colDescX,
    y: tableTop,
    font: bold,
    size: 10,
    color: TEXT,
  });

  drawText(page, "Menge", {
    x: colQtyX,
    y: tableTop,
    font: bold,
    size: 10,
    color: TEXT,
  });

  drawText(page, "Einzelpreis", {
    x: colUnitX,
    y: tableTop,
    font: bold,
    size: 10,
    color: TEXT,
  });

  drawText(page, "Gesamt", {
    x: colTotalX,
    y: tableTop,
    font: bold,
    size: 10,
    color: TEXT,
  });

  let rowY = tableTop - 28;

  for (const line of lines) {
    const titleLines = wrapTextByWidth(
      String(line.name ?? "").trim(),
      font,
      10,
      descW - 8,
    );

    const descriptionLines = wrapTextByWidth(
      String(line.description ?? "").trim(),
      font,
      8.5,
      descW - 20,
    ).filter((row) => row.trim().length > 0);

    const combinedLineCount = titleLines.length + descriptionLines.length;
    const rowHeight = Math.max(24, combinedLineCount * 11 + 4);

    let textY = rowY;

    titleLines.forEach((textLine, index) => {
      drawText(page, textLine, {
        x: colDescX,
        y: textY - index * 11,
        font,
        size: 10,
        color: TEXT,
      });
    });

    if (descriptionLines.length > 0) {
      const descStartY = textY - titleLines.length * 11;
      descriptionLines.forEach((textLine, index) => {
        drawText(page, textLine, {
          x: colDescX + 10,
          y: descStartY - index * 10,
          font,
          size: 8.5,
          color: MUTED,
        });
      });
    }

    drawText(page, normalizeQuantity(line.quantity), {
      x: colQtyX,
      y: rowY,
      font,
      size: 10,
      color: TEXT,
    });

    drawText(page, euro(line.unitPriceGross, input.currencyCode), {
      x: colUnitX,
      y: rowY,
      font,
      size: 10,
      color: TEXT,
    });

    drawText(page, euro(line.lineTotalGross, input.currencyCode), {
      x: colTotalX,
      y: rowY,
      font,
      size: 10,
      color: TEXT,
    });

    rowY -= rowHeight;
  }

  page.drawLine({
    start: { x: MARGIN_LEFT, y: rowY + 8 },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: rowY + 8 },
    thickness: 1,
    color: GRID,
  });

  const totalY = rowY - 24;
  const hintY = totalY - 35;
  const paidHintY = hintY - 18;
  const bankTitleY = paidHintY - 95;
  const bankRowsStartY = bankTitleY - 16;
  const footerLineY = bankRowsStartY - 45;
  const footerTextY = footerLineY - 18;

  drawText(page, "Gesamtbetrag", {
    x: 385,
    y: totalY,
    font: bold,
    size: 11,
    color: TEXT,
  });

  drawText(page, euro(totalGross, input.currencyCode), {
    x: colTotalX,
    y: totalY,
    font: bold,
    size: 11,
    color: TEXT,
  });

  drawText(page, defaultKleinunternehmerText(), {
    x: MARGIN_LEFT,
    y: hintY,
    font,
    size: 9,
    color: MUTED,
  });

  drawText(page, `Zahlungsstatus: ${paidAtLabel}`, {
    x: MARGIN_LEFT,
    y: paidHintY,
    font,
    size: 9,
    color: MUTED,
  });

  // Bank section
  drawText(page, "Bankverbindung", {
    x: MARGIN_LEFT,
    y: bankTitleY,
    font: bold,
    size: 10,
    color: TEXT,
  });

  let bankY = bankRowsStartY;

  if (String(input.bankName ?? "").trim()) {
    drawText(page, `Bank: ${String(input.bankName).trim()}`, {
      x: MARGIN_LEFT,
      y: bankY,
      font,
      size: 9,
      color: TEXT,
    });
    bankY -= 14;
  }

  if (String(input.bankIban ?? "").trim()) {
    drawText(page, `IBAN: ${String(input.bankIban).trim()}`, {
      x: MARGIN_LEFT,
      y: bankY,
      font,
      size: 9,
      color: TEXT,
    });
    bankY -= 14;
  }

  if (String(input.bankBic ?? "").trim()) {
    drawText(page, `BIC: ${String(input.bankBic).trim()}`, {
      x: MARGIN_LEFT,
      y: bankY,
      font,
      size: 9,
      color: TEXT,
    });
    bankY -= 14;
  }

  if (String(input.bankAccountHolder ?? "").trim()) {
    drawText(page, `Kontoinhaber: ${String(input.bankAccountHolder).trim()}`, {
      x: MARGIN_LEFT,
      y: bankY,
      font,
      size: 9,
      color: TEXT,
    });
  }

  // Optional QR
  if (qrImage) {
    const qrSize = 70;
    const qrX = PAGE_WIDTH - MARGIN_RIGHT - qrSize;
    const qrY = bankTitleY - 50;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });
  }

  // Optional note
  if (String(input.note ?? "").trim()) {
    let noteY = footerLineY + 18;
    const noteLines = wrapTextByWidth(
      String(input.note).trim(),
      font,
      9,
      contentWidth,
    );

    noteLines.forEach((line) => {
      drawText(page, line, {
        x: MARGIN_LEFT,
        y: noteY,
        font,
        size: 9,
        color: MUTED,
      });
      noteY -= 11;
    });
  }

  // Footer
  page.drawLine({
    start: { x: MARGIN_LEFT, y: footerLineY },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: footerLineY },
    thickness: 1,
    color: GRID,
  });

  drawText(page, defaultFooterText(), {
    x: MARGIN_LEFT,
    y: footerTextY,
    font,
    size: 9,
    color: MUTED,
  });

  if (String(input.providerWebsite ?? "").trim()) {
    drawText(page, String(input.providerWebsite).trim(), {
      x: PAGE_WIDTH - 155,
      y: footerTextY,
      font: bold,
      size: 10.5,
      color: ACCENT,
    });
  }

  return Buffer.from(await pdfDoc.save());
}