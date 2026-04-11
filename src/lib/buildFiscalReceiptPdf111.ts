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

const TEXT = rgb(0.2, 0.2, 0.2);
const FOOTER_TEXT = rgb(0.55, 0.55, 0.55);
const HEADER_BG = rgb(0.30, 0.30, 0.30);
const HEADER_DIVIDER = rgb(0.82, 0.82, 0.82);
const HEADER_TEXT = rgb(1, 1, 1);
const LINE_LIGHT = rgb(0.85, 0.85, 0.85);
const GOLD = rgb(0.72, 0.53, 0.17);

type ProviderDefaults = {
  studioName: string;
  address1: string;
  address2: string;
  country: string;
  phone: string;
  email: string;
  iban: string;
  bic: string;
  invoicePrefix: string;
  logoPath: string;
};

const PROVIDER_DEFAULTS: Array<{ match: string; values: ProviderDefaults }> = [
  {
    match: "radu craus",
    values: {
      studioName: "Magnifique Beauty Institut",
      address1: "Flugfeldgürtel 24/1",
      address2: "2700 Wiener Neustadt",
      country: "Österreich",
      phone: "+43 676 6742429",
      email: "radu.craus@gmail.com",
      iban: "AT12 3456 7890 1234 5678",
      bic: "",
      invoicePrefix: "RAD",
      logoPath: "/logos/radu-craus.png",
    },
  },
  {
    match: "raluca craus",
    values: {
      studioName: "Magnifique Beauty Institut",
      address1: "Flugfeldgürtel 24/1",
      address2: "2700 Wiener Neustadt",
      country: "Österreich",
      phone: "+43 676 4106468",
      email: "raluca.schwarz@gmail.com",
      iban: "",
      bic: "",
      invoicePrefix: "RAL",
      logoPath: "/logos/raluca-craus.png",
    },
  },
  {
    match: "alexandra sacadat",
    values: {
      studioName: "Magnifique Beauty Institut",
      address1: "Flugfeldgürtel 24/1",
      address2: "2700 Wiener Neustadt",
      country: "Österreich",
      phone: "+43 664 1433818",
      email: "alexandra_soj@hotmail.com",
      iban: "",
      bic: "",
      invoicePrefix: "ALE",
      logoPath: "/logos/alexandra-sacadat.png",
    },
  },
  {
    match: "barbara",
    values: {
      studioName: "Magnifique Beauty Institut",
      address1: "Flugfeldgürtel 24/1",
      address2: "2700 Wiener Neustadt",
      country: "Österreich",
      phone: "+43 699 12638348",
      email: "eder.barbara1969@gmail.com",
      iban: "",
      bic: "",
      invoicePrefix: "BAR",
      logoPath: "/logos/barbara-eder.png",
    },
  },
];

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

function parseIssuedDate(value: string) {
  const raw = toText(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{2}\.\d{2}\.\d{4})/);
  return match ? match[1] : raw;
}

function extractYearFromDate(value: string) {
  const match = parseIssuedDate(value).match(/(\d{4})$/);
  return match ? match[1] : String(new Date().getFullYear());
}

function maybeFormatReceiptNumber(receiptNumber: string, prefix: string, issuedAtLabel: string) {
  const raw = toText(receiptNumber);
  if (!raw) return "-";
  if (raw.includes("-")) return raw;
  if (!/^\d+$/.test(raw) || !prefix) return raw;
  return `${prefix}-${extractYearFromDate(issuedAtLabel)}-${raw.padStart(4, "0")}`;
}

function sanitizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function truncateEpcField(value: string, maxLength: number) {
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
  return QRCode.toBuffer(buildEpcQrPayload(params), {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 256,
    color: { dark: "#000000", light: "#FFFFFF" },
    type: "png",
  });
}

function getProviderDefaults(providerName: string): ProviderDefaults | null {
  const lower = toText(providerName).toLowerCase();
  for (const item of PROVIDER_DEFAULTS) {
    if (lower.includes(item.match)) return item.values;
  }
  return null;
}

function toAbsolutePublicPath(candidate: string) {
  if (!candidate) return "";
  if (path.isAbsolute(candidate)) return candidate;
  return path.join(process.cwd(), "public", candidate.replace(/^\/+/, ""));
}

async function tryLoadImage(pdfDoc: PDFDocument, candidates: string[]): Promise<PDFImage | null> {
  for (const candidate of candidates) {
    try {
      const absolute = toAbsolutePublicPath(candidate);
      const bytes = await readFile(absolute);
      const lower = absolute.toLowerCase();
      if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        return await pdfDoc.embedJpg(bytes);
      }
      return await pdfDoc.embedPng(bytes);
    } catch {
      // ignore and continue
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
  page.drawText(safeText, { x: rightX - textWidth, y, size, font, color });
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
  page.drawText(safeText, { x: centerX - textWidth / 2, y, size, font, color });
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
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const defaults = getProviderDefaults(input.providerName);

  const providerStudioName = toText(input.providerStudioName) || defaults?.studioName || "Magnifique Beauty Institut";
  const providerAddress1 = toText(input.providerAddress1) || defaults?.address1 || "";
  const providerAddress2 = toText(input.providerAddress2) || defaults?.address2 || "";
  const providerCountry = toText(input.providerCountry) || defaults?.country || "Österreich";
  const providerPhone = toText(input.providerPhone) || defaults?.phone || "";
  const providerEmail = toText(input.providerEmail) || defaults?.email || "";
  const providerIban = toText(input.providerIban) || defaults?.iban || "";
  const providerBic = toText(input.providerBic) || defaults?.bic || "";
  const providerInvoicePrefix = toText(input.providerInvoicePrefix) || defaults?.invoicePrefix || "";

  const providerLogo = await tryLoadImage(pdfDoc, [
    toText(input.providerLogoPath),
    defaults?.logoPath || "",
  ].filter(Boolean));

  const footerLogo = await tryLoadImage(pdfDoc, [
    toText(input.footerLogoPath),
    "/logos/magnifique-footer.png",
    "/branding/magnifique-logo-gold.png",
    "/magnifique-logo-gold.png",
  ].filter(Boolean));

  const lines = Array.isArray(input.lines) ? input.lines : [];
  const total = lines.reduce((sum, line) => sum + Number(line.lineTotalGross || 0), 0);

  const paymentMethod = normalizePaymentMethod(input.paymentMethodLabel);
  const paymentTermsText = buildPaymentTermsText(paymentMethod);
  const issueDateLabel = parseIssuedDate(input.issuedAtLabel);
  const receiptNumberLabel = maybeFormatReceiptNumber(input.receiptNumber, providerInvoicePrefix, issueDateLabel);
  const paymentReference = buildPaymentReference(receiptNumberLabel, input.customerName);

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

  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = width - marginLeft - marginRight;
  const rightX = 345;

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

  const logoBox = { x: marginLeft, y: height - 155, width: 118, height: 118 };
  if (providerLogo) {
    drawImageContain(page, providerLogo, logoBox, 0);
  }

  page.drawText("RECHNUNG", {
    x: rightX,
    y: height - 60,
    size: 22,
    font: fontBold,
    color: TEXT,
  });

  page.drawText(`Rechnungsnummer: ${receiptNumberLabel || "-"}`, {
    x: rightX,
    y: height - 95,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  page.drawText(`Rechnungsdatum: ${issueDateLabel || "-"}`, {
    x: rightX,
    y: height - 110,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  page.drawText(`Zahlungsart: ${paymentMethod}`, {
    x: rightX,
    y: height - 125,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  if (toText(input.paidAtLabel)) {
    page.drawText(`Bezahlt am: ${toText(input.paidAtLabel)}`, {
      x: rightX,
      y: height - 140,
      size: 10,
      font: fontRegular,
      color: TEXT,
    });
  }

  const providerStartY = height - 185;

  page.drawText(toText(input.providerName) || "-", {
    x: rightX,
    y: providerStartY,
    size: 16,
    font: fontBold,
    color: TEXT,
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
      color: TEXT,
    });
    providerY -= 15;
  });

  let customerY = providerStartY;

  page.drawText("Rechnung an", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: TEXT,
  });

  customerY -= 22;

  page.drawText(toText(input.customerName) || "-", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: TEXT,
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
      color: TEXT,
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
        TEXT,
        11,
      );
      if (index < serviceParts.length - 1) serviceY -= 2;
    });

    drawRightAlignedText(page, String(Number(item.quantity || 0)), col2Right, rowY, fontRegular, 10, TEXT);
    drawRightAlignedText(page, euro(Number(item.unitPriceGross || 0), input.currencyCode), col3Right, rowY, fontRegular, 10, TEXT);
    drawRightAlignedText(page, euro(lineTotal, input.currencyCode), col4Right, rowY, fontRegular, 10, TEXT);

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

  drawRightAlignedText(page, "Gesamtbetrag", totalLabelRight, totalY, fontBold, 11, TEXT);
  drawRightAlignedText(page, euro(total, input.currencyCode), col4Right, totalY, fontBold, 11, TEXT);

  drawWrappedText(page, smallBusinessNotice, marginLeft, hintY, contentWidth, fontRegular, 9, TEXT, 11);
  drawWrappedText(page, paymentTermsText, marginLeft, paymentTermsY, contentWidth, fontRegular, 9, TEXT, 11);

  page.drawText("Kontodaten", {
    x: marginLeft,
    y: accountHeadingY,
    size: 10,
    font: fontBold,
    color: TEXT,
  });

  page.drawText(`Behandlername: ${toText(input.providerName) || "-"}`, {
    x: marginLeft,
    y: accountHolderY,
    size: 9,
    font: fontRegular,
    color: TEXT,
  });

  page.drawText(`IBAN: ${providerIban}`, {
    x: marginLeft,
    y: accountIbanY,
    size: 9,
    font: fontRegular,
    color: TEXT,
  });

  const afterReferenceY = drawWrappedText(
    page,
    `Verwendungszweck: ${paymentReference}`,
    marginLeft,
    accountReferenceY,
    contentWidth,
    fontRegular,
    9,
    TEXT,
    11,
  );

  const thankYouY = afterReferenceY - 12;
  const footerLineY = thankYouY - 44;
  const footerTextY = footerLineY - 18;

  drawWrappedText(page, thankYouText, marginLeft, thankYouY, contentWidth, fontRegular, 9, TEXT, 11);

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
        TEXT,
      );

      const qrBytes = await buildTransferQrPngBytes({
        recipientName: toText(input.providerName),
        iban: providerIban,
        bic: providerBic,
        amount: total,
        reference: paymentReference,
      });

      const qrImage = await pdfDoc.embedPng(qrBytes);
      drawImageContain(page, qrImage, qrBox, 0);
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


export type DailyClosingPdfGroup = {
  key?: string | null;
  tenantId?: string | null;
  cashRegisterId?: string | null;
  providerName?: string | null;
  receiptCount?: number;
  cashCents?: number;
  cardCents?: number;
  transferCents?: number;
  totalCents?: number;
  stornoCount?: number;
  stornoCents?: number;
  latestIssuedAt?: string | null;
};

export type BuildDailyClosingPdfInput = {
  closingDate: string;
  mode: "all" | "single";
  practitionerLabel?: string | null;
  generatedByName?: string | null;
  generatedAtLabel?: string | null;
  summary: {
    receiptCount: number;
    cashCents: number;
    cardCents: number;
    transferCents: number;
    totalCents: number;
    stornoCount: number;
    stornoCents: number;
  };
  groups: DailyClosingPdfGroup[];
};

function euroFromCentsForPdf(value: number | null | undefined, currencyCode?: string | null) {
  return euro((Number(value || 0) || 0) / 100, currencyCode);
}

function formatDateTimeForPdf(value: string | null | undefined) {
  const raw = toText(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function buildDailyClosingPdf(input: BuildDailyClosingPdfInput) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginLeft = 42;
  const marginRight = 42;
  const contentWidth = width - marginLeft - marginRight;

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

  page.drawText("TAGESABSCHLUSS", {
    x: marginLeft,
    y: height - 58,
    size: 22,
    font: fontBold,
    color: TEXT,
  });

  page.drawText(`Datum: ${toText(input.closingDate) || "-"}`, {
    x: marginLeft,
    y: height - 84,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  page.drawText(`Modus: ${input.mode === "single" ? "Einzelne Kassa" : "Alle sichtbaren Kassen"}`, {
    x: marginLeft,
    y: height - 98,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  page.drawText(`Behandler-Filter: ${toText(input.practitionerLabel) || "Alle"}`, {
    x: marginLeft,
    y: height - 112,
    size: 10,
    font: fontRegular,
    color: TEXT,
  });

  drawRightAlignedText(page, `Erzeugt am: ${formatDateTimeForPdf(input.generatedAtLabel)}`, width - marginRight, height - 84, fontRegular, 10, TEXT);
  drawRightAlignedText(page, `Erzeugt von: ${toText(input.generatedByName) || "Unbekannt"}`, width - marginRight, height - 98, fontRegular, 10, TEXT);

  const summaryTop = height - 156;
  const boxGap = 12;
  const boxWidth = (contentWidth - boxGap) / 2;
  const boxHeight = 76;
  const summaryBoxes = [
    { x: marginLeft, y: summaryTop - boxHeight, title: "Bezahlt gesamt", value: euroFromCentsForPdf(input.summary.totalCents), sub: `${Number(input.summary.receiptCount || 0)} Belege` },
    { x: marginLeft + boxWidth + boxGap, y: summaryTop - boxHeight, title: "Karte / Bar", value: `${euroFromCentsForPdf(input.summary.cardCents)} · ${euroFromCentsForPdf(input.summary.cashCents)}`, sub: `Überweisung ${euroFromCentsForPdf(input.summary.transferCents)}` },
    { x: marginLeft, y: summaryTop - boxHeight - 88, title: "Stornos", value: String(Number(input.summary.stornoCount || 0)), sub: `${euroFromCentsForPdf(input.summary.stornoCents)} storniertes Volumen` },
    { x: marginLeft + boxWidth + boxGap, y: summaryTop - boxHeight - 88, title: "Kassen", value: String(Array.isArray(input.groups) ? input.groups.length : 0), sub: input.mode === "single" ? "Einzelabschluss" : "Sichtbare Kassen" },
  ];

  for (const box of summaryBoxes) {
    page.drawRectangle({ x: box.x, y: box.y, width: boxWidth, height: boxHeight, borderColor: LINE_LIGHT, borderWidth: 1 });
    page.drawText(box.title, { x: box.x + 12, y: box.y + 54, size: 9, font: fontRegular, color: FOOTER_TEXT });
    page.drawText(box.value, { x: box.x + 12, y: box.y + 30, size: 16, font: fontBold, color: TEXT });
    page.drawText(box.sub, { x: box.x + 12, y: box.y + 12, size: 9, font: fontRegular, color: FOOTER_TEXT });
  }

  let y = summaryTop - boxHeight - 210;
  page.drawText("Kassenübersicht", { x: marginLeft, y, size: 13, font: fontBold, color: TEXT });
  y -= 18;

  const groups = Array.isArray(input.groups) ? input.groups : [];
  for (const group of groups) {
    const providerName = toText(group.providerName) || "Behandler";
    const registerLabel = toText(group.cashRegisterId) ? `Kassa ${toText(group.cashRegisterId)}` : "Kassa nicht zugeordnet";
    const latestLabel = toText(group.latestIssuedAt) ? `Letzte Buchung: ${formatDateTimeForPdf(group.latestIssuedAt)}` : "Letzte Buchung: -";
    const cardBarLine = `Karte ${euroFromCentsForPdf(group.cardCents)} · Bar ${euroFromCentsForPdf(group.cashCents)} · Überweisung ${euroFromCentsForPdf(group.transferCents)}`;
    const totalsLine = `${Number(group.receiptCount || 0)} Belege · ${Number(group.stornoCount || 0)} Stornos · Gesamt ${euroFromCentsForPdf(group.totalCents)}`;
    const stornoLine = Number(group.stornoCount || 0) > 0 ? `Storno-Volumen ${euroFromCentsForPdf(group.stornoCents)}` : "Kein Storno an diesem Tag";

    const blockHeight = 74;
    if (y - blockHeight < 82) {
      const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 58;
      newPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(1,1,1) });
      newPage.drawText("TAGESABSCHLUSS – FORTSETZUNG", { x: marginLeft, y, size: 16, font: fontBold, color: TEXT });
      y -= 24;
      page = newPage;
    }

    page.drawRectangle({ x: marginLeft, y: y - 58, width: contentWidth, height: 58, borderColor: LINE_LIGHT, borderWidth: 1 });
    page.drawText(providerName, { x: marginLeft + 12, y: y - 16, size: 11, font: fontBold, color: TEXT });
    page.drawText(registerLabel, { x: marginLeft + 12, y: y - 30, size: 9, font: fontRegular, color: FOOTER_TEXT });
    page.drawText(latestLabel, { x: marginLeft + 12, y: y - 42, size: 9, font: fontRegular, color: FOOTER_TEXT });
    page.drawText(cardBarLine, { x: marginLeft + 245, y: y - 16, size: 9, font: fontRegular, color: TEXT });
    page.drawText(totalsLine, { x: marginLeft + 245, y: y - 30, size: 9, font: fontBold, color: TEXT });
    page.drawText(stornoLine, { x: marginLeft + 245, y: y - 42, size: 9, font: fontRegular, color: FOOTER_TEXT });
    y -= 70;
  }

  page.drawLine({ start: { x: marginLeft, y: 64 }, end: { x: width - marginRight, y: 64 }, thickness: 1, color: rgb(0.88, 0.88, 0.88) });
  page.drawText("Tagesabschluss PDF · Magnifique CRM", { x: marginLeft, y: 48, size: 8.5, font: fontRegular, color: FOOTER_TEXT });
  drawRightAlignedText(page, `Erzeugt von ${toText(input.generatedByName) || "Unbekannt"}`, width - marginRight, 48, fontRegular, 8.5, FOOTER_TEXT);

  return Buffer.from(await pdfDoc.save());
}
