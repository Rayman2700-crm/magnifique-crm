import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getTenantLogoPath } from "./logoMap";

type DbTenantInvoiceData = {
  legal_name: string | null;
  display_name?: string | null;
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
  qty: number;
  unitPrice: number;
};

type InvoicePdfData = {
  invoiceNumber: string;
  issueDate: string;
  paidAt?: string | null;
  paymentMethod?: string | null;
  customerName: string;
  customerAddress1?: string | null;
  customerAddress2?: string | null;
  customerAddress3?: string | null;
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
  kleinunternehmerText: string;
  footerText: string;
  logoUrl: string | null;
};

const DEFAULT_DB_TENANT: DbTenantInvoiceData = {
  legal_name: "Radu Craus",
  display_name: "Radu Craus",
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
  invoiceNumber: "RAD-2026-0001",
  issueDate: "07.04.2026",
  paidAt: "07.04.2026",
  paymentMethod: "Karte",
  customerName: "Maria Mustermann",
  customerAddress1: "Musterstraße 12",
  customerAddress2: "2700 Wiener Neustadt",
  customerAddress3: "Österreich",
  items: [
    { title: "Permanent Make-up Beratung", qty: 1, unitPrice: 80.0 },
    { title: "Nachbehandlung", qty: 1, unitPrice: 120.0 },
    { title: "Pflegeprodukt", qty: 5, unitPrice: 19.9 },
    { title: "Nagelspange", qty: 2, unitPrice: 95.0 },
  ],
};

function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function buildTenantViewModel(dbTenant: DbTenantInvoiceData): TenantViewModel {
  const zip = toText(dbTenant.zip);
  const city = toText(dbTenant.city);
  const address2 = [zip, city].filter(Boolean).join(" ");

  return {
    legalName: toText(dbTenant.legal_name),
    studioName: "Magnifique Beauty Institut",
    address1: toText(dbTenant.invoice_address_line1),
    address2,
    country: toText(dbTenant.country) || "Österreich",
    phone: toText(dbTenant.phone),
    email: toText(dbTenant.email),
    iban: toText(dbTenant.iban),
    bic: toText(dbTenant.bic),
    kleinunternehmerText:
      toText(dbTenant.kleinunternehmer_text) ||
      "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.",
    footerText:
      "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.",
    logoUrl: getTenantLogoPath(dbTenant.invoice_prefix),
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

export async function createInvoicePdf(
  input: CreateInvoicePdfInput = {},
) {
  const dbTenant = input.dbTenant ?? DEFAULT_DB_TENANT;
  const invoice = input.invoice ?? DEFAULT_INVOICE;
  const downloadFileName =
    input.downloadFileName ?? "rechnung-prototyp-dynamisch.pdf";

  const tenant = buildTenantViewModel(dbTenant);

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

    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
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

  page.drawText(`Zahlungsart: ${toText(invoice.paymentMethod) || "-"}`, {
    x: rightX,
    y: height - 125,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  if (toText(invoice.paidAt)) {
    page.drawText(`Bezahlt am: ${toText(invoice.paidAt)}`, {
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

  page.drawText(tenant.studioName, {
    x: rightX,
    y: providerStartY - 20,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  if (tenant.address1) {
    page.drawText(tenant.address1, {
      x: rightX,
      y: providerStartY - 35,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  if (tenant.address2) {
    page.drawText(tenant.address2, {
      x: rightX,
      y: providerStartY - 50,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  if (tenant.country) {
    page.drawText(tenant.country, {
      x: rightX,
      y: providerStartY - 65,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  if (tenant.phone) {
    page.drawText(`Tel: ${tenant.phone}`, {
      x: rightX,
      y: providerStartY - 85,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  if (tenant.email) {
    page.drawText(`E-Mail: ${tenant.email}`, {
      x: rightX,
      y: providerStartY - 100,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

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
  const col1 = marginLeft;
  const col2 = 340;
  const col3 = 400;
  const col4 = 480;

  page.drawLine({
    start: { x: marginLeft, y: tableTop + 18 },
    end: { x: width - marginRight, y: tableTop + 18 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText("Leistung", { x: col1, y: tableTop, size: 10, font: fontBold });
  page.drawText("Menge", { x: col2, y: tableTop, size: 10, font: fontBold });
  page.drawText("Einzelpreis", { x: col3, y: tableTop, size: 10, font: fontBold });
  page.drawText("Gesamt", { x: col4, y: tableTop, size: 10, font: fontBold });

  let rowY = tableTop - 28;
  let total = 0;

  invoice.items.forEach((item) => {
    const lineTotal = item.qty * item.unitPrice;
    total += lineTotal;

    page.drawText(item.title, {
      x: col1,
      y: rowY,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
      maxWidth: col2 - col1 - 12,
    });

    page.drawText(String(item.qty), {
      x: col2,
      y: rowY,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    page.drawText(euro(item.unitPrice), {
      x: col3,
      y: rowY,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    page.drawText(euro(lineTotal), {
      x: col4,
      y: rowY,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    rowY -= 24;
  });

  page.drawLine({
    start: { x: marginLeft, y: rowY + 8 },
    end: { x: width - marginRight, y: rowY + 8 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  const totalY = rowY - 24;
  const hintY = totalY - 35;
  const bankTitleY = hintY - 130;
  const bankIbanY = bankTitleY - 16;
  const bankBicY = bankIbanY - 14;
  const footerLineY = bankBicY - 28;
  const footerTextY = footerLineY - 18;

  page.drawText("Gesamtbetrag", {
    x: 365,
    y: totalY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(euro(total), {
    x: col4,
    y: totalY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

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
