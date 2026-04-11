import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";

export type FiscalReceiptPdfLine = {
  name: string;
  quantity: number;
  unitPriceGross: number;
  lineTotalGross: number;
  description?: string | null;
  durationMinutes?: number | string | null;
};

export type BuildFiscalReceiptPdfInput = {
  receiptNumber: string;
  issuedAtLabel: string;
  providerName: string;
  customerName: string;
  paymentMethodLabel: string;
  amountLabel?: string;
  currencyCode?: string | null;
  lines: FiscalReceiptPdfLine[];
  note?: string | null;

  paidAtLabel?: string | null;

  customerAddress1?: string | null;
  customerAddress2?: string | null;
  customerAddress3?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;

  providerStudioName?: string | null;
  providerAddress1?: string | null;
  providerAddress2?: string | null;
  providerCountry?: string | null;
  providerPhone?: string | null;
  providerEmail?: string | null;
  providerIban?: string | null;
  providerBic?: string | null;
  providerInvoicePrefix?: string | null;
  providerLogoPath?: string | null;

  thankYouText?: string | null;
  footerLegalText?: string | null;
  footerWebsite?: string | null;
  footerLogoPath?: string | null;
  smallBusinessNotice?: string | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const DEFAULT_TEXT = rgb(0.2, 0.2, 0.2);
const FOOTER_TEXT = rgb(0.55, 0.55, 0.55);
const HEADER_BG = rgb(0.30, 0.30, 0.30);
const HEADER_DIVIDER = rgb(0.82, 0.82, 0.82);
const HEADER_TEXT = rgb(1, 1, 1);
const LINE_LIGHT = rgb(0.85, 0.85, 0.85);
const GOLD = rgb(0.72, 0.53, 0.17);

function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function euro(value: number, currencyCode?: string | null) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function normalizePaymentMethod(value: string | null | undefined): string {
  const raw = toText(value);
  if (!raw) return "-";

  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    CASH: "Bar",
    BAR: "Bar",
    CARD: "Karte",
    KARTE: "Karte",
    EC: "Karte",
    BANK_TRANSFER: "Überweisung",
    UEBERWEISUNG: "Überweisung",
    ÜBERWEISUNG: "Überweisung",
    TRANSFER: "Überweisung",
  };

  return map[upper] ?? raw;
}

function buildPaymentTermsText(paymentMethod: string): string {
  switch (paymentMethod) {
    case "Bar":
      return "Zahlungskonditionen: Betrag dankend in Bar kassiert";
    case "Karte":
      return "Zahlungskonditionen: Betrag mit Karte bezahlt";
    case "Überweisung":
      return "Zahlungskonditionen: Prompt netto Kassa bei Erhalt der Faktura";
    default:
      return `Zahlungskonditionen: ${paymentMethod || "-"}`;
  }
}

function formatDurationLabel(value: number | string | null | undefined): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `${raw} Min`;
  return raw;
}

function buildPaymentReference(receiptNumber: string, customerName: string): string {
  return [toText(receiptNumber), toText(customerName)].filter(Boolean).join(" - ");
}

function sanitizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function truncateEpcField(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function buildEpcQrPayload(params: {
  recipientName: string;
  iban: string;
  bic?: string;
  amount?: number;
  reference?: string;
}) {
  const recipientName = truncateEpcField(toText(params.recipientName), 70);
  const iban = sanitizeIban(toText(params.iban));
  const bic = truncateEpcField(toText(params.bic), 11);
  const amount =
    typeof params.amount === "number" && params.amount > 0
      ? `EUR${params.amount.toFixed(2)}`
      : "";
  const reference = truncateEpcField(toText(params.reference), 140);

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    bic,
    recipientName,
    iban,
    amount,
    "",
    reference,
    "",
  ].join("\n");
}

async function buildTransferQrPngBytes(params: {
  recipientName: string;
  iban: string;
  bic?: string;
  amount?: number;
  reference?: string;
}) {
  const payload = buildEpcQrPayload(params);
  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 256,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    type: "png",
  });
}

function getProviderLogoCandidates(input: BuildFiscalReceiptPdfInput) {
  const manual = toText(input.providerLogoPath);
  const footerManual = toText(input.footerLogoPath);
  const provider = toText(input.providerName).toLowerCase();

  const mappedFile =
    provider.includes("radu") ? "radu-craus.png" :
    provider.includes("raluca") ? "raluca-craus.png" :
    provider.includes("alexandra") ? "alexandra-sacadat.png" :
    provider.includes("barbara") ? "barbara-eder.png" :
    "";

  return [
    manual,
    mappedFile ? `/logos/${mappedFile}` : "",
    "/logos/magnifique-footer.png",
    "/branding/magnifique-logo-gold.png",
    "/magnifique-logo-gold.png",
    footerManual,
  ].filter(Boolean);
}

function getFooterLogoCandidates(input: BuildFiscalReceiptPdfInput) {
  const manual = toText(input.footerLogoPath);
  return [
    manual,
    "/logos/magnifique-footer.png",
    "/branding/magnifique-logo-gold.png",
    "/magnifique-logo-gold.png",
  ].filter(Boolean);
}

function toAbsoluteCandidate(candidate: string) {
  if (!candidate) return "";
  if (path.isAbsolute(candidate)) return candidate;
  return path.join(process.cwd(), "public", candidate.replace(/^\/+/, ""));
}

async function tryLoadImage(pdfDoc: PDFDocument, candidates: string[]): Promise<PDFImage | null> {
  for (const candidate of candidates) {
    try {
      const absolute = toAbsoluteCandidate(candidate);
      const bytes = await readFile(absolute);
      const lower = absolute.toLowerCase();
      if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        return await pdfDoc.embedJpg(bytes);
      }
      return await pdfDoc.embedPng(bytes);
    } catch {
      // continue
    }
  }
  return null;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  lineHeight = 12,
) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return startY;

  let line = "";
  let currentY = startY;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, size);

    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      line = word;
      currentY -= lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= lineHeight;
  }

  return currentY;
}

function drawRightAlignedText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const safeText = text ?? "";
  const textWidth = font.widthOfTextAtSize(safeText, size);
  page.drawText(safeText, {
    x: rightX - textWidth,
    y,
    size,
    font,
    color,
  });
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const safeText = text ?? "";
  const textWidth = font.widthOfTextAtSize(safeText, size);
  page.drawText(safeText, {
    x: centerX - textWidth / 2,
    y,
    size,
    font,
    color,
  });
}

function drawImageContain(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
  padding = 0,
) {
  const availableWidth = box.width - padding * 2;
  const availableHeight = box.height - padding * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = box.x + (box.width - drawWidth) / 2;
  const y = box.y + (box.height - drawHeight) / 2;

  page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
}

export async function buildFiscalReceiptPdf(input: BuildFiscalReceiptPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logo = await tryLoadImage(pdfDoc, getProviderLogoCandidates(input));
  const footerLogo = await tryLoadImage(pdfDoc, getFooterLogoCandidates(input));

  const lines = Array.isArray(input.lines) ? input.lines : [];
  const total =
    lines.reduce((sum, line) => sum + Number(line.lineTotalGross || 0), 0);

  const paymentMethod = normalizePaymentMethod(input.paymentMethodLabel);
  const paymentTermsText = buildPaymentTermsText(paymentMethod);
  const paymentReference = buildPaymentReference(input.receiptNumber, input.customerName);

  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = width - marginLeft - marginRight;
  const rightX = 345;

  const providerStudioName = toText(input.providerStudioName) || "Magnifique Beauty Institut";
  const providerAddress1 = toText(input.providerAddress1);
  const providerAddress2 = toText(input.providerAddress2);
  const providerCountry = toText(input.providerCountry) || "Österreich";
  const providerPhone = toText(input.providerPhone);
  const providerEmail = toText(input.providerEmail);
  const providerIban = toText(input.providerIban);
  const providerBic = toText(input.providerBic);

  const thankYouText =
    toText(input.thankYouText) ||
    "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.";

  const footerLegalText =
    toText(input.footerLegalText) ||
    "Inhaber: Raluca Craus | Standort: Flugfeldgürtel 24/1, 2700 Wiener Neustadt | Tel: +43 676 4106468 | Kontaktdaten: +43 676 4106468, raluca.schwarz@gmail.com | Einzelunternehmen | Firmengericht: Landesgericht Wiener Neustadt | Aufsichtsbehörde: Bezirkshauptmannschaft Wiener Neustadt | Kammer: Wirtschaftskammer Niederösterreich | Berufszweig: Kosmetik";

  const footerWebsite = toText(input.footerWebsite) || "www.magnifique-beauty.at";

  const smallBusinessNotice =
    toText(input.smallBusinessNotice) ||
    "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.";

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  const logoBox = {
    x: marginLeft,
    y: height - 155,
    width: 118,
    height: 118,
  };

  if (logo) {
    drawImageContain(page, logo, logoBox, 0);
  }

  page.drawText("RECHNUNG", {
    x: rightX,
    y: height - 60,
    size: 22,
    font: fontBold,
    color: DEFAULT_TEXT,
  });

  page.drawText(`Rechnungsnummer: ${toText(input.receiptNumber) || "-"}`, {
    x: rightX,
    y: height - 95,
    size: 10,
    font: fontRegular,
    color: DEFAULT_TEXT,
  });

  page.drawText(`Rechnungsdatum: ${toText(input.issuedAtLabel) || "-"}`, {
    x: rightX,
    y: height - 110,
    size: 10,
    font: fontRegular,
    color: DEFAULT_TEXT,
  });

  page.drawText(`Zahlungsart: ${paymentMethod}`, {
    x: rightX,
    y: height - 125,
    size: 10,
    font: fontRegular,
    color: DEFAULT_TEXT,
  });

  if (toText(input.paidAtLabel)) {
    page.drawText(`Bezahlt am: ${toText(input.paidAtLabel)}`, {
      x: rightX,
      y: height - 140,
      size: 10,
      font: fontRegular,
      color: DEFAULT_TEXT,
    });
  }

  const providerStartY = height - 185;

  page.drawText(toText(input.providerName) || "-", {
    x: rightX,
    y: providerStartY,
    size: 16,
    font: fontBold,
    color: DEFAULT_TEXT,
  });

  const providerLines = [
    providerStudioName,
    providerAddress1,
    providerAddress2,
    providerCountry,
    providerPhone ? `Tel: ${providerPhone}` : "",
    providerEmail ? `E-Mail: ${providerEmail}` : "",
  ].filter(Boolean);

  let providerY = providerStartY - 20;
  providerLines.forEach((line) => {
    page.drawText(line, {
      x: rightX,
      y: providerY,
      size: 10,
      font: fontRegular,
      color: DEFAULT_TEXT,
    });
    providerY -= 15;
  });

  let customerY = providerStartY;

  page.drawText("Rechnung an", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: DEFAULT_TEXT,
  });

  customerY -= 22;

  page.drawText(toText(input.customerName) || "-", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: DEFAULT_TEXT,
  });

  customerY -= 16;

  const customerLines = [
    toText(input.customerAddress1),
    toText(input.customerAddress2),
    toText(input.customerAddress3),
    toText(input.customerPhone) ? `Tel: ${toText(input.customerPhone)}` : "",
    toText(input.customerEmail) ? `E-Mail: ${toText(input.customerEmail)}` : "",
  ].filter(Boolean);

  customerLines.forEach((line) => {
    page.drawText(line, {
      x: marginLeft,
      y: customerY,
      size: 10,
      font: fontRegular,
      color: DEFAULT_TEXT,
    });
    customerY -= 14;
  });

  const tableTop = 470;
  const tableRightX = width - marginRight;
  const amountGap = 68;
  const qtyGap = 76;
  const col1 = marginLeft;
  const col4Right = tableRightX;
  const col3Right = col4Right - amountGap;
  const col2Right = col3Right - qtyGap;
  const col4HeaderX = col4Right - fontBold.widthOfTextAtSize("Gesamt", 10);
  const col3HeaderX = col3Right - fontBold.widthOfTextAtSize("Einzelpreis", 10);
  const col2HeaderX = col2Right - fontBold.widthOfTextAtSize("Menge", 10);
  const serviceMaxWidth = col2HeaderX - col1 - 24;

  const headerTopY = tableTop + 18;
  const headerBottomY = tableTop - 10;
  const headerHeight = headerTopY - headerBottomY;

  page.drawRectangle({
    x: marginLeft,
    y: headerBottomY,
    width: tableRightX - marginLeft,
    height: headerHeight,
    color: HEADER_BG,
  });

  const headerCol2Left = col2HeaderX - 14;
  const headerCol3Left = col3HeaderX - 14;
  const headerCol4Left = col4HeaderX - 14;

  [headerCol2Left, headerCol3Left, headerCol4Left].forEach((x) => {
    page.drawLine({
      start: { x, y: headerBottomY },
      end: { x, y: headerTopY },
      thickness: 0.8,
      color: HEADER_DIVIDER,
    });
  });

  const headerTextY = headerBottomY + 10;

  page.drawText("Dienstleistung/Artikel", {
    x: col1 + 8,
    y: headerTextY,
    size: 10,
    font: fontBold,
    color: HEADER_TEXT,
  });

  drawCenteredText(page, "Menge", (headerCol2Left + headerCol3Left) / 2, headerTextY, fontBold, 10, HEADER_TEXT);
  drawCenteredText(page, "Einzelpreis", (headerCol3Left + headerCol4Left) / 2, headerTextY, fontBold, 10, HEADER_TEXT);
  drawCenteredText(page, "Gesamt", (headerCol4Left + tableRightX) / 2, headerTextY, fontBold, 10, HEADER_TEXT);

  let rowY = tableTop - 28;

  for (const item of lines) {
    const lineTotal = Number(item.lineTotalGross || 0);
    const serviceParts = [
      toText(item.name),
      toText(item.description),
      formatDurationLabel(item.durationMinutes) ? `Dauer: ${formatDurationLabel(item.durationMinutes)}` : "",
    ].filter(Boolean);

    let serviceY = rowY;
    serviceParts.forEach((part, index) => {
      serviceY = drawWrappedText(
        page,
        part,
        col1,
        serviceY,
        serviceMaxWidth,
        index === 0 ? fontBold : fontRegular,
        index === 0 ? 10 : 9,
        DEFAULT_TEXT,
        11,
      );
      if (index < serviceParts.length - 1) serviceY -= 2;
    });

    drawRightAlignedText(page, String(Number(item.quantity || 0)), col2Right, rowY, fontRegular, 10, DEFAULT_TEXT);
    drawRightAlignedText(page, euro(Number(item.unitPriceGross || 0), input.currencyCode), col3Right, rowY, fontRegular, 10, DEFAULT_TEXT);
    drawRightAlignedText(page, euro(lineTotal, input.currencyCode), col4Right, rowY, fontRegular, 10, DEFAULT_TEXT);

    rowY = Math.min(serviceY - 10, rowY - 28);
  }

  page.drawLine({
    start: { x: marginLeft, y: rowY + 8 },
    end: { x: tableRightX, y: rowY + 8 },
    thickness: 1,
    color: LINE_LIGHT,
  });

  const totalY = rowY - 24;
  const hintY = totalY - 35;
  const paymentTermsY = hintY - 26;
  const accountHeadingY = paymentTermsY - 34;
  const accountHolderY = accountHeadingY - 18;
  const accountIbanY = accountHolderY - 14;
  const accountReferenceY = accountIbanY - 14;

  const totalLabelRight = col3Right - 18;

  drawRightAlignedText(page, "Gesamtbetrag", totalLabelRight, totalY, fontBold, 11, DEFAULT_TEXT);
  drawRightAlignedText(page, euro(total, input.currencyCode), col4Right, totalY, fontBold, 11, DEFAULT_TEXT);

  drawWrappedText(page, smallBusinessNotice, marginLeft, hintY, contentWidth, fontRegular, 9, DEFAULT_TEXT, 11);
  drawWrappedText(page, paymentTermsText, marginLeft, paymentTermsY, contentWidth, fontRegular, 9, DEFAULT_TEXT, 11);

  page.drawText("Kontodaten", {
    x: marginLeft,
    y: accountHeadingY,
    size: 10,
    font: fontBold,
    color: DEFAULT_TEXT,
  });

  page.drawText(`Behandlername: ${toText(input.providerName) || "-"}`, {
    x: marginLeft,
    y: accountHolderY,
    size: 9,
    font: fontRegular,
    color: DEFAULT_TEXT,
  });

  page.drawText(`IBAN: ${providerIban}`, {
    x: marginLeft,
    y: accountIbanY,
    size: 9,
    font: fontRegular,
    color: DEFAULT_TEXT,
  });

  const afterReferenceY = drawWrappedText(
    page,
    `Verwendungszweck: ${paymentReference}`,
    marginLeft,
    accountReferenceY,
    contentWidth,
    fontRegular,
    9,
    DEFAULT_TEXT,
    11,
  );

  const thankYouY = afterReferenceY - 12;
  const footerLineY = thankYouY - 44;
  const footerTextY = footerLineY - 18;

  drawWrappedText(page, thankYouText, marginLeft, thankYouY, contentWidth, fontRegular, 9, DEFAULT_TEXT, 11);

  const shouldShowTransferQr =
    paymentMethod === "Überweisung" &&
    Boolean(toText(input.providerName)) &&
    Boolean(providerIban);

  if (shouldShowTransferQr) {
    try {
      const qrBox = {
        x: width - marginRight - 74,
        y: footerLineY + 12,
        width: 74,
        height: 74,
      };

      drawRightAlignedText(
        page,
        "Scan & Überweisen",
        qrBox.x + qrBox.width,
        qrBox.y + qrBox.height + 8,
        fontRegular,
        8,
        DEFAULT_TEXT,
      );

      const transferQrBytes = await buildTransferQrPngBytes({
        recipientName: toText(input.providerName),
        iban: providerIban,
        bic: providerBic,
        amount: total,
        reference: paymentReference,
      });

      const transferQrImage = await pdfDoc.embedPng(transferQrBytes);
      drawImageContain(page, transferQrImage, qrBox, 0);
    } catch (error) {
      console.error("QR-Code-Fehler:", error);
    }
  }

  page.drawLine({
    start: { x: marginLeft, y: footerLineY },
    end: { x: width - marginRight, y: footerLineY },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  const footerLogoBox = {
    x: marginLeft,
    y: footerLineY - 60,
    width: 88,
    height: 42,
  };

  if (footerLogo) {
    drawImageContain(page, footerLogo, footerLogoBox, 0);
  }

  const footerWebsiteRightX = width - marginRight;
  const footerWebsiteY = footerLineY - 34;

  drawRightAlignedText(page, footerWebsite, footerWebsiteRightX, footerWebsiteY, fontBold, 10.5, GOLD);

  const footerLegalX = footerLogoBox.x + footerLogoBox.width + 12;
  const footerLegalMaxWidth = footerWebsiteRightX - footerLegalX - 150;

  drawWrappedText(
    page,
    footerLegalText,
    footerLegalX,
    footerTextY,
    footerLegalMaxWidth,
    fontRegular,
    7.2,
    FOOTER_TEXT,
    9,
  );

  return Buffer.from(await pdfDoc.save());
}
