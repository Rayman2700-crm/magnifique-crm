import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { getTenantLogoPath } from "./logoMap";

type DbTenantInvoiceData = {
  legal_name: string | null;
  display_name?: string | null;
  studio_name?: string | null;
  invoice_address_line1: string | null;
  zip: string | number | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
  invoice_prefix: string | null;
  kleinunternehmer_text?: string | null;
};

type InvoicePdfItem = {
  title: string;
  description?: string | null;
  durationMinutes?: number | string | null;
  qty: number;
  unitPrice: number;
};

type InvoicePdfData = {
  invoiceNumber?: string | null;
  invoiceSequence?: number | string | null;
  issueDate?: string | Date | null;
  paidAt?: string | Date | null;
  paymentMethod?: string | null;
  customerName: string;
  customerAddress1?: string | null;
  customerAddress2?: string | null;
  customerAddress3?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  items: InvoicePdfItem[];
};

type CreateInvoicePdfInput = {
  dbTenant?: DbTenantInvoiceData;
  invoice?: InvoicePdfData;
  downloadFileName?: string;
};

type TenantViewModel = {
  legalName: string;
  studioName: string;
  address1: string;
  address2: string;
  country: string;
  phone: string;
  email: string;
  iban: string;
  bic: string;
  invoicePrefix: string;
  kleinunternehmerText: string;
  thankYouText: string;
  footerLegalText: string;
  logoUrl: string | null;
};

type ResolvedInvoiceItem = {
  title: string;
  description: string;
  durationLabel: string;
  qty: number;
  unitPrice: number;
};

type ResolvedInvoiceViewModel = {
  invoiceNumber: string;
  issueDate: string;
  paidAt: string;
  paymentMethod: string;
  paymentTermsText: string;
  paymentReference: string;
  customerName: string;
  customerAddress1: string;
  customerAddress2: string;
  customerAddress3: string;
  customerPhone: string;
  customerEmail: string;
  items: ResolvedInvoiceItem[];
};

const DEFAULT_DB_TENANT: DbTenantInvoiceData = {
  legal_name: "Radu Craus",
  display_name: "Magnifique Beauty Institut",
  studio_name: "Magnifique Beauty Institut",
  invoice_address_line1: "Flugfeldgürtel 24/1",
  zip: "2700",
  city: "Wiener Neustadt",
  country: "Österreich",
  phone: "+43 676 6742429",
  email: "radu.craus@gmail.com",
  iban: "AT12 3456 7890 1234 5678",
  bic: "",
  invoice_prefix: "RAD",
  kleinunternehmer_text:
    "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.",
};

const DEFAULT_INVOICE: InvoicePdfData = {
  invoiceSequence: 1,
  issueDate: null,
  paidAt: null,
  paymentMethod: "Karte",
  customerName: "Maria Mustermann",
  customerAddress1: "Musterstraße 12",
  customerAddress2: "2700 Wiener Neustadt",
  customerAddress3: "Österreich",
  customerPhone: "+43 664 1234567",
  customerEmail: "maria.mustermann@example.com",
  items: [
    {
      title: "AUFFÜLLUNG KLASSISCH",
      description:
        "Schonendes Entfernen des alten Materials und präzises Auffüllen. Stärkt und perfektioniert die Nägel, damit sie ihre Form und Eleganz behalten. inkl. russ. Maniküre",
      durationMinutes: 90,
      qty: 1,
      unitPrice: 65.0,
    },
    {
      title: "Nagelspange",
      description: "Korrektur und Entlastung eingewachsener Nägel.",
      durationMinutes: 45,
      qty: 2,
      unitPrice: 95.0,
    },
  ],
};

function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function padInvoiceSequence(value: number | string | null | undefined): string {
  const raw = toText(value);
  if (!raw) return "0001";
  if (/^\d+$/.test(raw)) return raw.padStart(4, "0");
  return raw;
}

function parseDateInput(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = value.trim();
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const [, yyyy, mm, dd] = isoDate;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateAT(value: string | Date | null | undefined, fallbackToToday = false): string {
  const parsed = parseDateInput(value);
  const date = parsed ?? (fallbackToToday ? new Date() : null);
  if (!date) return "";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
}

function getYearFromDateInput(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value) ?? new Date();
  return String(parsed.getFullYear());
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

function buildInvoiceNumber(
  invoiceNumber: string | null | undefined,
  invoicePrefix: string,
  issueDate: string | Date | null | undefined,
  invoiceSequence: number | string | null | undefined,
): string {
  const explicit = toText(invoiceNumber);
  if (explicit) return explicit;

  const prefix = toText(invoicePrefix).toUpperCase() || "INV";
  const year = getYearFromDateInput(issueDate);
  const sequence = padInvoiceSequence(invoiceSequence);
  return `${prefix}-${year}-${sequence}`;
}

function resolveStudioName(dbTenant: DbTenantInvoiceData): string {
  return (
    toText(dbTenant.studio_name) ||
    toText(dbTenant.display_name) ||
    "Magnifique Beauty Institut"
  );
}

function buildTenantViewModel(dbTenant: DbTenantInvoiceData): TenantViewModel {
  const zip = toText(dbTenant.zip);
  const city = toText(dbTenant.city);
  const address2 = [zip, city].filter(Boolean).join(" ");

  return {
    legalName: toText(dbTenant.legal_name),
    studioName: resolveStudioName(dbTenant),
    address1: toText(dbTenant.invoice_address_line1),
    address2,
    country: toText(dbTenant.country) || "Österreich",
    phone: toText(dbTenant.phone),
    email: toText(dbTenant.email),
    iban: toText(dbTenant.iban),
    bic: toText(dbTenant.bic),
    invoicePrefix: toText(dbTenant.invoice_prefix).toUpperCase(),
    kleinunternehmerText:
      toText(dbTenant.kleinunternehmer_text) ||
      "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.",
    thankYouText:
      "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.",
    footerLegalText:
      "Inhaber: Raluca Craus | Standort: Flugfeldgürtel 24/1, 2700 Wiener Neustadt | Tel: +43 676 4106468 | Kontaktdaten: +43 676 4106468, raluca.schwarz@gmail.com | Einzelunternehmen | Firmengericht: Landesgericht Wiener Neustadt | Aufsichtsbehörde: Bezirkshauptmannschaft Wiener Neustadt | Kammer: Wirtschaftskammer Niederösterreich | Berufszweig: Kosmetik",
    logoUrl: getTenantLogoPath(dbTenant.invoice_prefix),
  };
}

function formatDurationLabel(value: number | string | null | undefined): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `${raw} Min`;
  return raw;
}

function buildPaymentReference(invoiceNumber: string, customerName: string): string {
  return [toText(invoiceNumber), toText(customerName)].filter(Boolean).join(" - ");
}

function buildResolvedInvoiceViewModel(
  invoice: InvoicePdfData,
  tenant: TenantViewModel,
): ResolvedInvoiceViewModel {
  const issueDate = formatDateAT(invoice.issueDate, true);
  const paidAt = formatDateAT(invoice.paidAt, false);
  const paymentMethod = normalizePaymentMethod(invoice.paymentMethod);

  const invoiceNumber = buildInvoiceNumber(
    invoice.invoiceNumber,
    tenant.invoicePrefix,
    invoice.issueDate,
    invoice.invoiceSequence,
  );

  const customerName = toText(invoice.customerName);

  return {
    invoiceNumber,
    issueDate,
    paidAt,
    paymentMethod,
    paymentTermsText: buildPaymentTermsText(paymentMethod),
    paymentReference: buildPaymentReference(invoiceNumber, customerName),
    customerName,
    customerAddress1: toText(invoice.customerAddress1),
    customerAddress2: toText(invoice.customerAddress2),
    customerAddress3: toText(invoice.customerAddress3),
    customerPhone: toText(invoice.customerPhone),
    customerEmail: toText(invoice.customerEmail),
    items: Array.isArray(invoice.items)
      ? invoice.items.map((item) => ({
          title: toText(item.title),
          description: toText(item.description),
          durationLabel: formatDurationLabel(item.durationMinutes),
          qty: Number(item.qty) || 0,
          unitPrice: Number(item.unitPrice) || 0,
        }))
      : [],
  };
}

function drawWrappedText(
  page: any,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  font: any,
  size: number,
  color: ReturnType<typeof rgb>,
  lineHeight = 12,
) {
  const words = text.split(/\s+/).filter(Boolean);
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


function drawCenteredWrappedText(
  page: any,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  font: any,
  size: number,
  color: ReturnType<typeof rgb>,
  lineHeight = 12,
) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return startY;

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, size);

    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  let currentY = startY;
  for (const currentLine of lines) {
    const lineWidth = font.widthOfTextAtSize(currentLine, size);
    page.drawText(currentLine, {
      x: centerX - lineWidth / 2,
      y: currentY,
      size,
      font,
      color,
    });
    currentY -= lineHeight;
  }

  return currentY;
}

function drawRightAlignedText(
  page: any,
  text: string,
  rightX: number,
  y: number,
  font: any,
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
  page: any,
  text: string,
  centerX: number,
  y: number,
  font: any,
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

async function buildTransferQrDataUrl(params: {
  recipientName: string;
  iban: string;
  bic?: string;
  amount?: number;
  reference?: string;
}) {
  const payload = buildEpcQrPayload(params);

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 256,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

export async function createInvoicePdf(
  input: CreateInvoicePdfInput = {},
) {
  const dbTenant = input.dbTenant ?? DEFAULT_DB_TENANT;
  const invoiceInput = input.invoice ?? DEFAULT_INVOICE;
  const downloadFileName =
    input.downloadFileName ?? "rechnung-prototyp-dynamisch.pdf";

  const tenant = buildTenantViewModel(dbTenant);
  const invoice = buildResolvedInvoiceViewModel(invoiceInput, tenant);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const euro = (value: number) => `€ ${value.toFixed(2).replace(".", ",")}`;

  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = width - marginLeft - marginRight;
  const rightX = 345;
  const invoiceTextColor = rgb(0.2, 0.2, 0.2);
  const footerTextColor = rgb(0.55, 0.55, 0.55);

  async function fetchImageBytes(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Logo konnte nicht geladen werden: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function embedImageFromUrl(url: string) {
    const bytes = await fetchImageBytes(url);
    const lower = url.toLowerCase();

    if (lower.endsWith(".png")) {
      return pdfDoc.embedPng(bytes);
    }

    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      return pdfDoc.embedJpg(bytes);
    }

    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  }

  function drawImageContain(
    image: any,
    box: { x: number; y: number; width: number; height: number },
    padding = 0,
  ) {
    const availableWidth = box.width - padding * 2;
    const availableHeight = box.height - padding * 2;

    const scale = Math.min(
      availableWidth / image.width,
      availableHeight / image.height,
    );
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    const x = box.x + (box.width - drawWidth) / 2;
    const y = box.y + (box.height - drawHeight) / 2;

    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  }

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

  if (tenant.logoUrl) {
    try {
      const absoluteLogoUrl = `${window.location.origin}${tenant.logoUrl}`;
      const logoImage = await embedImageFromUrl(absoluteLogoUrl);
      drawImageContain(logoImage, logoBox, 0);
    } catch (error) {
      console.error("Logo-Fehler:", error);
      page.drawText("Logo fehlt", {
        x: logoBox.x + 20,
        y: logoBox.y + 50,
        size: 10,
        font: fontRegular,
        color: rgb(0.7, 0.2, 0.2),
      });
    }
  }

  page.drawText("RECHNUNG", {
    x: rightX,
    y: height - 60,
    size: 22,
    font: fontBold,
    color: invoiceTextColor,
  });

  page.drawText(`Rechnungsnummer: ${invoice.invoiceNumber}`, {
    x: rightX,
    y: height - 95,
    size: 10,
    font: fontRegular,
    color: invoiceTextColor,
  });

  page.drawText(`Rechnungsdatum: ${invoice.issueDate}`, {
    x: rightX,
    y: height - 110,
    size: 10,
    font: fontRegular,
    color: invoiceTextColor,
  });

  page.drawText(`Zahlungsart: ${invoice.paymentMethod}`, {
    x: rightX,
    y: height - 125,
    size: 10,
    font: fontRegular,
    color: invoiceTextColor,
  });

  if (invoice.paidAt) {
    page.drawText(`Bezahlt am: ${invoice.paidAt}`, {
      x: rightX,
      y: height - 140,
      size: 10,
      font: fontRegular,
      color: invoiceTextColor,
    });
  }

  const providerStartY = height - 185;

  page.drawText(tenant.legalName || "-", {
    x: rightX,
    y: providerStartY,
    size: 16,
    font: fontBold,
    color: invoiceTextColor,
  });

  const providerLines = [
    tenant.studioName,
    tenant.address1,
    tenant.address2,
    tenant.country,
    tenant.phone ? `Tel: ${tenant.phone}` : "",
    tenant.email ? `E-Mail: ${tenant.email}` : "",
  ].filter(Boolean);

  let providerY = providerStartY - 20;

  providerLines.forEach((line) => {
    page.drawText(line, {
      x: rightX,
      y: providerY,
      size: 10,
      font: fontRegular,
      color: invoiceTextColor,
    });
    providerY -= 15;
  });

  let customerY = providerStartY;

  page.drawText("Rechnung an", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: invoiceTextColor,
  });

  customerY -= 22;

  page.drawText(toText(invoice.customerName) || "-", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: invoiceTextColor,
  });

  customerY -= 16;

  const customerLines = [
    toText(invoice.customerAddress1),
    toText(invoice.customerAddress2),
    toText(invoice.customerAddress3),
    invoice.customerPhone ? `Tel: ${toText(invoice.customerPhone)}` : "",
    invoice.customerEmail ? `E-Mail: ${toText(invoice.customerEmail)}` : "",
  ].filter(Boolean);

  customerLines.forEach((line) => {
    page.drawText(line, {
      x: marginLeft,
      y: customerY,
      size: 10,
      font: fontRegular,
      color: invoiceTextColor,
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
  const headerBg = rgb(0.30, 0.30, 0.30);
  const headerDivider = rgb(0.82, 0.82, 0.82);
  const headerTextColor = rgb(1, 1, 1);

  page.drawRectangle({
    x: marginLeft,
    y: headerBottomY,
    width: tableRightX - marginLeft,
    height: headerHeight,
    color: headerBg,
  });

  const headerCol2Left = col2HeaderX - 14;
  const headerCol3Left = col3HeaderX - 14;
  const headerCol4Left = col4HeaderX - 14;

  [headerCol2Left, headerCol3Left, headerCol4Left].forEach((x) => {
    page.drawLine({
      start: { x, y: headerBottomY },
      end: { x, y: headerTopY },
      thickness: 0.8,
      color: headerDivider,
    });
  });

  const headerTextY = headerBottomY + 10;

  page.drawText("Dienstleistung/Artikel", {
    x: col1 + 8,
    y: headerTextY,
    size: 10,
    font: fontBold,
    color: headerTextColor,
  });

  drawCenteredText(
    page,
    "Menge",
    (headerCol2Left + headerCol3Left) / 2,
    headerTextY,
    fontBold,
    10,
    headerTextColor,
  );

  drawCenteredText(
    page,
    "Einzelpreis",
    (headerCol3Left + headerCol4Left) / 2,
    headerTextY,
    fontBold,
    10,
    headerTextColor,
  );

  drawCenteredText(
    page,
    "Gesamt",
    (headerCol4Left + tableRightX) / 2,
    headerTextY,
    fontBold,
    10,
    headerTextColor,
  );

  let rowY = tableTop - 28;
  let total = 0;

  for (const item of invoice.items) {
    const lineTotal = item.qty * item.unitPrice;
    total += lineTotal;

    const serviceParts = [
      item.title,
      item.description,
      item.durationLabel ? `Dauer: ${item.durationLabel}` : "",
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
        index === 0 ? invoiceTextColor : invoiceTextColor,
        11,
      );
      if (index < serviceParts.length - 1) {
        serviceY -= 2;
      }
    });

    drawRightAlignedText(
      page,
      String(item.qty),
      col2Right,
      rowY,
      fontRegular,
      10,
      invoiceTextColor,
    );

    drawRightAlignedText(
      page,
      euro(item.unitPrice),
      col3Right,
      rowY,
      fontRegular,
      10,
      invoiceTextColor,
    );

    drawRightAlignedText(
      page,
      euro(lineTotal),
      col4Right,
      rowY,
      fontRegular,
      10,
      invoiceTextColor,
    );

    rowY = Math.min(serviceY - 10, rowY - 28);
  }

  page.drawLine({
    start: { x: marginLeft, y: rowY + 8 },
    end: { x: tableRightX, y: rowY + 8 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  const totalY = rowY - 24;
  const hintY = totalY - 35;
  const paymentTermsY = hintY - 26;
  const accountHeadingY = paymentTermsY - 34;
  const accountHolderY = accountHeadingY - 18;
  const accountIbanY = accountHolderY - 14;
  const accountReferenceY = accountIbanY - 14;

  const totalLabelRight = col3Right - 18;

  drawRightAlignedText(
    page,
    "Gesamtbetrag",
    totalLabelRight,
    totalY,
    fontBold,
    11,
    invoiceTextColor,
  );

  drawRightAlignedText(
    page,
    euro(total),
    col4Right,
    totalY,
    fontBold,
    11,
    invoiceTextColor,
  );

  drawWrappedText(
    page,
    tenant.kleinunternehmerText,
    marginLeft,
    hintY,
    contentWidth,
    fontRegular,
    9,
    invoiceTextColor,
    11,
  );

  drawWrappedText(
    page,
    invoice.paymentTermsText,
    marginLeft,
    paymentTermsY,
    contentWidth,
    fontRegular,
    9,
    invoiceTextColor,
    11,
  );

  page.drawText("Kontodaten", {
    x: marginLeft,
    y: accountHeadingY,
    size: 10,
    font: fontBold,
    color: invoiceTextColor,
  });

  page.drawText(`Behandlername: ${tenant.legalName || "-"}`, {
    x: marginLeft,
    y: accountHolderY,
    size: 9,
    font: fontRegular,
    color: invoiceTextColor,
  });

  page.drawText(`IBAN: ${tenant.iban || ""}`, {
    x: marginLeft,
    y: accountIbanY,
    size: 9,
    font: fontRegular,
    color: invoiceTextColor,
  });

  const afterReferenceY = drawWrappedText(
    page,
    `Verwendungszweck: ${invoice.paymentReference}`,
    marginLeft,
    accountReferenceY,
    contentWidth,
    fontRegular,
    9,
    invoiceTextColor,
    11,
  );

  const thankYouY = afterReferenceY - 12;
  const footerLineY = thankYouY - 44;
  const footerTextY = footerLineY - 18;

  drawWrappedText(
    page,
    tenant.thankYouText,
    marginLeft,
    thankYouY,
    contentWidth,
    fontRegular,
    9,
    invoiceTextColor,
    11,
  );

  const shouldShowTransferQr =
    invoice.paymentMethod === "Überweisung" &&
    Boolean(tenant.legalName) &&
    Boolean(tenant.iban);

  if (shouldShowTransferQr) {
    try {
      const qrBox = {
        x: width - marginRight - 74,
        y: footerLineY + 12,
        width: 74,
        height: 74,
      };

      const qrLabel = "Scan & Überweisen";
      drawRightAlignedText(
        page,
        qrLabel,
        qrBox.x + qrBox.width,
        qrBox.y + qrBox.height + 8,
        fontRegular,
        8,
        invoiceTextColor,
      );

      const transferQrDataUrl = await buildTransferQrDataUrl({
        recipientName: tenant.legalName,
        iban: tenant.iban,
        bic: tenant.bic,
        amount: total,
        reference: invoice.paymentReference,
      });

      const transferQrImage = await embedImageFromUrl(transferQrDataUrl);
      drawImageContain(transferQrImage, qrBox, 0);
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

  const footerWebsiteText = "www.magnifique-beauty.at";
  const footerWebsiteRightX = width - marginRight;
  const footerWebsiteY = footerLineY - 34;

  try {
    const footerLogoUrl = `${window.location.origin}/logos/magnifique-footer.png`;
    const footerLogoImage = await embedImageFromUrl(footerLogoUrl);
    drawImageContain(footerLogoImage, footerLogoBox, 0);
  } catch (error) {
    console.error("Footer-Logo-Fehler:", error);
  }

  drawRightAlignedText(
    page,
    footerWebsiteText,
    footerWebsiteRightX,
    footerWebsiteY,
    fontBold,
    10.5,
    rgb(0.72, 0.53, 0.17),
  );

  const footerLegalX = footerLogoBox.x + footerLogoBox.width + 12;
  const footerLegalMaxWidth = footerWebsiteRightX - footerLegalX - 150;

  drawWrappedText(
    page,
    tenant.footerLegalText,
    footerLegalX,
    footerTextY,
    footerLegalMaxWidth,
    fontRegular,
    7.2,
    footerTextColor,
    9,
  );

  const pdfBytes = await pdfDoc.save();
  const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfArrayBuffer).set(pdfBytes);

  const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = downloadFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    pdfBytes,
    blob,
    url,
  };
}
