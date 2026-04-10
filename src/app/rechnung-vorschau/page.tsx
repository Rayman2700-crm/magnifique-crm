import React from "react";
import { QRCodeSVG } from "qrcode.react";

type InvoiceItem = {
  id: string;
  description: string;
  articleNumber?: string;
  validityPeriod?: string;
  quantity: number;
  unit?: string;
  price: number;
};

type InvoiceTemplateData = {
  companyName: string;
  companyAddress: string;
  companyZip: string;
  companyCity: string;
  invoiceNumber: string;
  pageNumber: string;
  invoiceDate: string;
  processor: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  toName: string;
  toAddress: string;
  toZip: string;
  toCity: string;
  items: InvoiceItem[];
  taxRate: number;
  notes?: string;
  paymentTerms: string;
  bankName?: string;
  bic?: string;
  iban?: string;
  recipientName?: string;
  paymentReference?: string;
  footerText: string;
  website: string;
};

const sampleData: InvoiceTemplateData = {
  companyName: "Magnifique Beauty Institut",
  companyAddress: "Flugfeldgürtel 24/1",
  companyZip: "2700",
  companyCity: "Wiener Neustadt",
  invoiceNumber: "000021",
  pageNumber: "1 von 1",
  invoiceDate: "07.04.2026",
  processor: "Radu Craus",
  phone: "+43 676 4106468",
  email: "raluca.schwarz@gmail.com",
  contactPerson: "Radu Craus",
  contactPhone: "+43 676 6742429",
  contactEmail: "radu.craus@gmail.com",
  toName: "Radu Craus",
  toAddress: "Wechselgasse 2b",
  toZip: "2821",
  toCity: "Lanzenkirchen",
  items: [
    {
      id: "1",
      description: "PMU Brows Angebot",
      quantity: 1,
      unit: "Stk",
      price: 250,
    },
  ],
  taxRate: 20,
  notes: "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG.",
  paymentTerms: "€ 250,00 dankend in Bar kassiert",
  bankName: "Noch nicht hinterlegt",
  bic: "—",
  iban: "—",
  recipientName: "Radu Craus",
  paymentReference: "000021",
  footerText:
    "Inhaber: Raluca Craus | Standort: Flugfeldgürtel 24/1, 2700 Wiener Neustadt | Tel: +43 676 4106468 | Kontaktdaten: +43 676 4106468, raluca.schwarz@gmail.com | Einzelunternehmen | Firmengericht: Landesgericht Wiener Neustadt | Aufsichtsbehörde: Bezirkshauptmannschaft Wiener Neustadt | Kammer: Wirtschaftskammer Niederösterreich | Berufszweig: Kosmetik",
  website: "www.magnifique-beauty.at",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function subtotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

function taxAmount(items: InvoiceItem[], taxRate: number) {
  return (subtotal(items) * taxRate) / 100;
}

function total(items: InvoiceItem[], taxRate: number) {
  return subtotal(items) + taxAmount(items, taxRate);
}

function PaymentQr({ data }: { data: InvoiceTemplateData }) {
  const value = [
    "BCD",
    "002",
    "1",
    "SCT",
    data.bic || "",
    data.recipientName || "",
    data.iban || "",
    `EUR${total(data.items, data.taxRate).toFixed(2)}`,
    "",
    data.paymentReference || data.invoiceNumber,
    data.notes || "",
  ].join("\n");

  return <QRCodeSVG value={value} size={92} level="M" />;
}

function InvoiceTemplate({ data = sampleData }: { data?: InvoiceTemplateData }) {
  const net = subtotal(data.items);
  const vat = taxAmount(data.items, data.taxRate);
  const gross = total(data.items, data.taxRate);

  return (
    <div className="min-h-screen bg-neutral-200 p-6 md:p-10">
      <div className="mx-auto w-full max-w-[900px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
        <div className="aspect-[210/297] w-full bg-white px-12 py-10 text-black print:px-8 print:py-8" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <div className="flex items-start justify-between">
            <div className="flex h-24 w-24 items-center justify-center border border-neutral-300 text-xs tracking-[0.2em] text-neutral-500">
              LOGO
            </div>
            <div className="flex h-24 w-28 items-center justify-center border border-neutral-300 text-xs tracking-[0.2em] text-neutral-400">
              LOGO
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_300px] gap-8">
            <div>
              <div className="border-b border-neutral-500 pb-1 text-[10px] text-neutral-700">
                Abs: {data.companyName}, {data.companyAddress}, {data.companyZip} {data.companyCity}
              </div>
              <div className="mt-3 whitespace-pre-line text-[16px] leading-[1.15] text-neutral-900">
                <div className="font-medium">{data.toName}</div>
                <div>{data.toAddress}</div>
                <div>
                  {data.toZip} {data.toCity}
                </div>
              </div>
            </div>

            <div className="space-y-1 text-[12px] leading-tight">
              <div className="border border-black">
                <div className="flex items-center justify-between border-b border-black bg-neutral-100 px-3 py-2 text-[16px] font-bold tracking-[0.02em]">
                  <span>RECHNUNG</span>
                  <span>{data.invoiceNumber}</span>
                </div>
                <div className="space-y-2 px-3 py-3">
                  <div className="flex justify-between gap-3"><span>Seite:</span><span>{data.pageNumber}</span></div>
                  <div className="flex justify-between gap-3"><span>Belegdatum:</span><span>{data.invoiceDate}</span></div>
                  <div className="flex justify-between gap-3"><span>Behandler:</span><span>{data.processor}</span></div>
                  <div className="flex justify-between gap-3"><span>Telefon:</span><span>{data.phone || ""}</span></div>
                  <div className="flex justify-between gap-3"><span>E-Mail:</span><span className="text-right">{data.email || ""}</span></div>
                </div>
              </div>

              <div className="border border-black px-3 py-3">
                <div className="space-y-2">
                  <div className="flex justify-between gap-3"><span>Kunde:</span><span>{data.contactPerson || data.toName}</span></div>
                  <div className="flex justify-between gap-3"><span>Telefon:</span><span>{data.contactPhone || ""}</span></div>
                  <div className="flex justify-between gap-3"><span>E-Mail:</span><span className="text-right">{data.contactEmail || ""}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14">
            <table className="w-full border-collapse text-[12px] leading-tight">
              <thead>
                <tr className="border-b border-t border-neutral-600">
                  <th className="py-1 text-left font-normal">Artikel - Bezeichnung</th>
                  <th className="py-1 text-right font-normal">Menge</th>
                  <th className="py-1 text-right font-normal">Preis / Eh</th>
                  <th className="py-1 text-right font-normal">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-300 align-top">
                    <td className="py-4 pr-4">
                      <div className="font-medium">{item.description}</div>
                      {item.articleNumber ? <div className="mt-1 text-[11px] text-neutral-600">Art.Nr.: {item.articleNumber}</div> : null}
                      {item.validityPeriod ? <div className="text-[11px] text-neutral-600">{item.validityPeriod}</div> : null}
                    </td>
                    <td className="py-4 text-right">{item.quantity}</td>
                    <td className="py-4 text-right">{formatCurrency(item.price)}</td>
                    <td className="py-4 text-right">{formatCurrency(item.quantity * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_140px] gap-10">
            <div className="text-[12px] leading-tight">
              <div className="grid grid-cols-[1fr_110px_50px] gap-3 border-b border-black pb-1 font-medium">
                <span>NETTOBETRAG</span>
                <span className="text-right">{formatCurrency(net)}</span>
                <span className="text-right">EUR</span>
              </div>
              <div className="grid grid-cols-[1fr_110px_50px] gap-3 py-1">
                <span>MWST {data.taxRate}% von {formatCurrency(net)}</span>
                <span className="text-right">{formatCurrency(vat)}</span>
                <span className="text-right">EUR</span>
              </div>
              <div className="grid grid-cols-[1fr_110px_50px] gap-3 border-b border-t border-black py-1 font-bold">
                <span>GESAMTBETRAG</span>
                <span className="text-right">{formatCurrency(gross)}</span>
                <span className="text-right">EUR</span>
              </div>

              {data.notes ? <div className="mt-4 text-[12px] text-neutral-800">{data.notes}</div> : null}
              <div className="mt-4 text-[12px]"><span className="font-medium">Zahlungskonditionen: </span>{data.paymentTerms}</div>

              <div className="mt-6">
                <div className="mb-2 text-[18px] font-semibold">Bankverbindung</div>
                <div className="grid grid-cols-[150px_1fr] gap-y-1 text-[12px]">
                  <div>{data.bankName || "Noch nicht hinterlegt"}</div><div></div>
                  <div>BIC:</div><div>{data.bic || "—"}</div>
                  <div>IBAN:</div><div>{data.iban || "—"}</div>
                  <div>Empfänger-Name:</div><div>{data.recipientName || data.processor}</div>
                  <div>Zahlungsreferenz:</div><div>{data.paymentReference || data.invoiceNumber}</div>
                </div>
              </div>
            </div>

            <div className="flex items-start justify-end pt-2">
              <div className="border border-black p-2">
                <PaymentQr data={data} />
              </div>
            </div>
          </div>

          <div className="mt-16 border-t border-neutral-500 pt-4">
            <div className="flex items-end justify-between gap-5">
              <div className="flex h-20 w-28 items-center justify-center border border-neutral-300 text-xs tracking-[0.2em] text-neutral-400">
                LOGO
              </div>
              <div className="flex-1 text-center text-[10px] leading-snug text-neutral-600">{data.footerText}</div>
              <div className="text-[26px] font-semibold tracking-tight text-[#a87c3c]">{data.website}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <InvoiceTemplate />;
}
