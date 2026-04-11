import React from "react";

export type ThermalReceiptLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type ThermalReceiptData = {
  receiptNumber: string;
  issuedAtLabel: string;
  providerName: string;
  customerName: string;
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  statusLabel: string;
  currencyCode: string;
  totalCents: number;
  lines: ThermalReceiptLine[];
  stornoLabel?: string | null;
};

function formatMoney(cents: number, currencyCode = "EUR") {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode,
  }).format((cents || 0) / 100);
}

export default function FiscalReceiptThermalDocument({
  data,
}: {
  data: ThermalReceiptData;
}) {
  return (
    <div className="thermal-root">
      <div className="thermal-center thermal-brand">MAGNIFIQUE CRM</div>
      <div className="thermal-divider" />

      <div className="thermal-row thermal-headline">
        <span>Beleg</span>
        <span>{data.receiptNumber}</span>
      </div>

      <div className="thermal-meta">{data.issuedAtLabel}</div>
      <div className="thermal-meta">{data.providerName || "—"}</div>
      <div className="thermal-meta">Kunde: {data.customerName || "—"}</div>

      {data.stornoLabel ? (
        <>
          <div className="thermal-divider" />
          <div className="thermal-warning">{data.stornoLabel}</div>
        </>
      ) : null}

      <div className="thermal-divider" />

      <div className="thermal-table-head thermal-row">
        <span>Pos</span>
        <span>Gesamt</span>
      </div>

      {data.lines.length === 0 ? (
        <div className="thermal-row">
          <span>Keine Positionen</span>
          <span>—</span>
        </div>
      ) : (
        data.lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="thermal-line-block">
            <div className="thermal-row">
              <span className="thermal-line-name">{line.name || "Position"}</span>
              <span className="thermal-amount">{formatMoney(line.lineTotalCents, data.currencyCode)}</span>
            </div>
            <div className="thermal-subrow">
              {line.quantity} × {formatMoney(line.unitPriceCents, data.currencyCode)}
            </div>
          </div>
        ))
      )}

      <div className="thermal-divider" />

      <div className="thermal-row thermal-total">
        <span>SUMME</span>
        <span>{formatMoney(data.totalCents, data.currencyCode)}</span>
      </div>

      <div className="thermal-divider" />

      <div className="thermal-row">
        <span>Zahlungsart</span>
        <span>{data.paymentMethodLabel || "—"}</span>
      </div>
      <div className="thermal-row">
        <span>Zahlungsstatus</span>
        <span>{data.paymentStatusLabel || "—"}</span>
      </div>
      <div className="thermal-row">
        <span>Belegstatus</span>
        <span>{data.statusLabel || "—"}</span>
      </div>

      <div className="thermal-divider" />

      <div className="thermal-center thermal-footer">
        Vielen Dank
      </div>
      <div className="thermal-center thermal-footer thermal-space-after">
        Beleg bitte aufbewahren
      </div>
    </div>
  );
}
