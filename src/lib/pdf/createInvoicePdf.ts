import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  footerText: string;
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
  iban: "",
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
    footerText:
      "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.",
    logoUrl: getTenantLogoPath(dbTenant.invoice_prefix),
  };
}

function formatDurationLabel(value: number | string | null | undefined): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `${raw} Min`;
  return raw;
}

function buildResolvedInvoiceViewModel(
  invoice: InvoicePdfData,
  tenant: TenantViewModel,
): ResolvedInvoiceViewModel {
  const issueDate = formatDateAT(invoice.issueDate, true);
  const paidAt = formatDateAT(invoice.paidAt, false);
  const paymentMethod = normalizePaymentMethod(invoice.paymentMethod);

  return {
    invoiceNumber: buildInvoiceNumber(
      invoice.invoiceNumber,
      tenant.invoicePrefix,
      invoice.issueDate,
      invoice.invoiceSequence,
    ),
    issueDate,
    paidAt,
    paymentMethod,
    paymentTermsText: buildPaymentTermsText(paymentMethod),
    customerName: toText(invoice.customerName),
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
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`Rechnungsnummer: ${invoice.invoiceNumber}`, {
    x: rightX,
    y: height - 95,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Rechnungsdatum: ${invoice.issueDate}`, {
    x: rightX,
    y: height - 110,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Zahlungsart: ${invoice.paymentMethod}`, {
    x: rightX,
    y: height - 125,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  if (invoice.paidAt) {
    page.drawText(`Bezahlt am: ${invoice.paidAt}`, {
      x: rightX,
      y: height - 140,
      size: 10,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const providerStartY = height - 185;

  page.drawText(tenant.legalName || "-", {
    x: rightX,
    y: providerStartY,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
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
      color: rgb(0.35, 0.35, 0.35),
    });
    providerY -= 15;
  });

  let customerY = providerStartY;

  page.drawText("Rechnung an", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });

  customerY -= 22;

  page.drawText(toText(invoice.customerName) || "-", {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
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
      color: rgb(0.35, 0.35, 0.35),
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

  page.drawLine({
    start: { x: marginLeft, y: tableTop + 18 },
    end: { x: tableRightX, y: tableTop + 18 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText("Leistung", { x: col1, y: tableTop, size: 10, font: fontBold });
  page.drawText("Menge", { x: col2HeaderX, y: tableTop, size: 10, font: fontBold });
  page.drawText("Einzelpreis", { x: col3HeaderX, y: tableTop, size: 10, font: fontBold });
  page.drawText("Gesamt", { x: col4HeaderX, y: tableTop, size: 10, font: fontBold });

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
        index === 0 ? rgb(0.12, 0.12, 0.12) : rgb(0.35, 0.35, 0.35),
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
      rgb(0.15, 0.15, 0.15),
    );

    drawRightAlignedText(
      page,
      euro(item.unitPrice),
      col3Right,
      rowY,
      fontRegular,
      10,
      rgb(0.15, 0.15, 0.15),
    );

    drawRightAlignedText(
      page,
      euro(lineTotal),
      col4Right,
      rowY,
      fontRegular,
      10,
      rgb(0.15, 0.15, 0.15),
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
  const bankTitleY = paymentTermsY - 104;
  const bankIbanY = bankTitleY - 16;
  const bankBicY = bankIbanY - 14;
  const footerLineY = bankBicY - 28;
  const footerTextY = footerLineY - 18;

  const totalLabelRight = col3Right - 18;

  drawRightAlignedText(
    page,
    "Gesamtbetrag",
    totalLabelRight,
    totalY,
    fontBold,
    11,
    rgb(0.1, 0.1, 0.1),
  );

  drawRightAlignedText(
    page,
    euro(total),
    col4Right,
    totalY,
    fontBold,
    11,
    rgb(0.1, 0.1, 0.1),
  );

  drawWrappedText(
    page,
    tenant.kleinunternehmerText,
    marginLeft,
    hintY,
    contentWidth,
    fontRegular,
    9,
    rgb(0.4, 0.4, 0.4),
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
    rgb(0.4, 0.4, 0.4),
    11,
  );

  const hasBankData = Boolean(tenant.iban || tenant.bic);

  if (hasBankData) {
    page.drawText("Bankverbindung", {
      x: marginLeft,
      y: bankTitleY,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    if (tenant.iban) {
      page.drawText(`IBAN: ${tenant.iban}`, {
        x: marginLeft,
        y: bankIbanY,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    if (tenant.bic) {
      page.drawText(`BIC: ${tenant.bic}`, {
        x: marginLeft,
        y: bankBicY,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

  page.drawLine({
    start: { x: marginLeft, y: footerLineY },
    end: { x: width - marginRight, y: footerLineY },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  drawWrappedText(
    page,
    tenant.footerText,
    marginLeft,
    footerTextY,
    contentWidth,
    fontRegular,
    9,
    rgb(0.4, 0.4, 0.4),
    11,
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
