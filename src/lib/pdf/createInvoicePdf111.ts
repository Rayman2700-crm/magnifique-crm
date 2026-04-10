import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function createInvoicePdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const euro = (value: number) => `€ ${value.toFixed(2).replace(".", ",")}`;

  const tenant = {
    legalName: "Radu Craus",
    studioName: "Magnifique Beauty Institut",
    address1: "Flugfeldgürtel 24/1",
    address2: "2700 Wiener Neustadt",
    country: "Österreich",
    phone: "+43 676 6742429",
    email: "radu.craus@gmail.com",
    iban: "AT12 3456 7890 1234 5678",
    bic: "ABCDEFGHXXX",
    footerText:
      "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.",
    kleinunternehmerText:
      "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.",
    logoUrl: "/logos/radu-craus.png",
  };

  const invoice = {
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

  function drawImageContain(image: any, box: { x: number; y: number; width: number; height: number }, padding = 0) {
    const availableWidth = box.width - padding * 2;
    const availableHeight = box.height - padding * 2;

    const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
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

  page.drawText(`Bezahlt am: ${invoice.paidAt}`, {
    x: rightX,
    y: height - 140,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  const providerStartY = height - 185;

  page.drawText(tenant.legalName, {
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

  page.drawText(tenant.address1, {
    x: rightX,
    y: providerStartY - 35,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText(tenant.address2, {
    x: rightX,
    y: providerStartY - 50,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText(tenant.country, {
    x: rightX,
    y: providerStartY - 65,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText(`Tel: ${tenant.phone}`, {
    x: rightX,
    y: providerStartY - 85,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText(`E-Mail: ${tenant.email}`, {
    x: rightX,
    y: providerStartY - 100,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
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

  page.drawText(invoice.customerName, {
    x: marginLeft,
    y: customerY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  customerY -= 16;

  page.drawText(invoice.customerAddress1, {
    x: marginLeft,
    y: customerY,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  customerY -= 14;

  page.drawText(invoice.customerAddress2, {
    x: marginLeft,
    y: customerY,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  customerY -= 14;

  page.drawText(invoice.customerAddress3, {
    x: marginLeft,
    y: customerY,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
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

  page.drawText(tenant.kleinunternehmerText, {
    x: marginLeft,
    y: hintY,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    maxWidth: contentWidth,
  });

  page.drawText("Bankverbindung", {
    x: marginLeft,
    y: bankTitleY,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`IBAN: ${tenant.iban}`, {
    x: marginLeft,
    y: bankIbanY,
    size: 9,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`BIC: ${tenant.bic}`, {
    x: marginLeft,
    y: bankBicY,
    size: 9,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawLine({
    start: { x: marginLeft, y: footerLineY },
    end: { x: width - marginRight, y: footerLineY },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  page.drawText(tenant.footerText, {
    x: marginLeft,
    y: footerTextY,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    maxWidth: contentWidth,
    lineHeight: 11,
  });

const pdfBytes = await pdfDoc.save();

const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
new Uint8Array(pdfArrayBuffer).set(pdfBytes);

const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "rechnung-prototyp-dynamisch.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}