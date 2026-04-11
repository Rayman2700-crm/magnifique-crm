import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{ receipt?: string }> | { receipt?: string };

type PaymentMethodJoin =
  | { id: string | null; code: string | null; name: string | null }
  | { id: string | null; code: string | null; name: string | null }[]
  | null;

type ThermalReceiptLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type TenantContactRow = {
  id: string;
  slug: string | null;
  display_name: string | null;
  legal_name: string | null;
  invoice_address_line1: string | null;
  invoice_address_line2: string | null;
  zip: string | number | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function parsePayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getNestedValue(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readFirstString(source: unknown, candidates: string[][]) {
  for (const path of candidates) {
    const value = getNestedValue(source, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPaymentMethod(value: string | PaymentMethodJoin | null | undefined) {
  const joined = firstJoin(value as any);
  if (joined && typeof joined === "object" && !Array.isArray(joined)) {
    const byName = String((joined as { name?: string | null }).name ?? "").trim();
    if (byName) return byName;
    value = String((joined as { code?: string | null }).code ?? "");
  }

  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "CASH" || normalized === "BAR") return "Bar";
  if (normalized === "CARD" || normalized === "KARTE") return "Karte";
  if (normalized === "TRANSFER" || normalized === "ÜBERWEISUNG" || normalized === "UEBERWEISUNG") return "Überweisung";
  return normalized || "—";
}

function formatPaymentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "PENDING") return "Ausstehend";
  if (normalized === "PROCESSING") return "Wird verarbeitet";
  if (normalized === "COMPLETED") return "Bezahlt";
  if (normalized === "FAILED") return "Fehlgeschlagen";
  if (normalized === "CANCELLED") return "Abgebrochen";
  if (normalized === "REFUNDED") return "Rückerstattet";
  return normalized || "—";
}

function formatReceiptStatus(value: string | null | undefined, isStornoReceipt: boolean) {
  if (isStornoReceipt) return "Stornobeleg";
  const normalized = String(value ?? "").toUpperCase();
  const labels: Record<string, string> = {
    REQUESTED: "Angelegt",
    CREATED: "Erstellt",
    ISSUED: "Ausgestellt",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Storniert",
    REVERSED: "Storniert",
    VERIFIED: "Verifiziert",
  };
  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "—");
}

function parseStornoInfoFromNotes(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return { originalReceiptNumber: "", stornoReceiptNumber: "" };
  const originalMatch = text.match(/Stornobeleg zu\s+([A-Za-z0-9-]+)/i);
  const stornoMatch = text.match(/Storniert durch Beleg\s+([A-Za-z0-9-]+)/i);
  return {
    originalReceiptNumber: originalMatch?.[1] ?? "",
    stornoReceiptNumber: stornoMatch?.[1] ?? "",
  };
}

function isStornoReceiptType(value: string | null | undefined, verificationNotes?: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "REVERSAL") return true;
  return String(verificationNotes ?? "").includes("Stornobeleg zu");
}

function parseLinesFromPayload(payload: Record<string, unknown> | null): ThermalReceiptLine[] {
  const rawLines = Array.isArray(payload?.lines) ? (payload?.lines as Record<string, unknown>[]) : [];
  return rawLines.map((line) => ({
    name: String(line.name ?? "").trim() || "Position",
    quantity: Number(line.quantity ?? 1) || 1,
    unitPriceCents: Number(line.unit_price_gross ?? 0) || 0,
    lineTotalCents: Number(line.line_total_gross ?? 0) || 0,
  }));
}

function formatMoney(cents: number, currencyCode = "EUR") {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode,
  }).format((cents || 0) / 100);
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function practitionerLogoPath(tenant: TenantContactRow | null, userId: string) {
  const slug = normalizeKey(tenant?.slug);
  const displayName = normalizeKey(tenant?.display_name);

  if (slug === "radu" || displayName.includes("radu")) return "/logos/radu-craus.png";
  if (slug === "raluca" || displayName.includes("raluca")) return "/logos/raluca-craus.png";
  if (slug === "alexandra" || displayName.includes("alexandra")) return "/logos/alexandra-sacadat.png";
  if (slug === "barbara" || displayName.includes("barbara")) return "/logos/barbara-eder.png";

  return `/users/${userId}.png`;
}

function compactAddress(tenant: TenantContactRow | null) {
  const line1 = String(tenant?.invoice_address_line1 ?? "").trim();
  const line2 = String(tenant?.invoice_address_line2 ?? "").trim();
  const zip = String(tenant?.zip ?? "").trim();
  const city = String(tenant?.city ?? "").trim();
  const country = String(tenant?.country ?? "").trim();

  const firstLine = [line1, line2].filter(Boolean).join(", ");
  const secondLine = [zip, city].filter(Boolean).join(" ");
  return [firstLine, secondLine, country].filter(Boolean);
}

export default async function ThermalPrintPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const receiptId = String(sp?.receipt ?? "").trim();

  if (!receiptId) {
    return <div>Kein Beleg ausgewählt.</div>;
  }

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>Nicht eingeloggt.</div>;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
    calendar_tenant_id: profile?.calendar_tenant_id ?? null,
  });
  const isAdmin = String(profile?.role ?? "").toUpperCase() === "ADMIN";

  let receiptQuery = admin
    .from("fiscal_receipts")
    .select(`
      id, tenant_id, sales_order_id, payment_id, receipt_number, receipt_type, status, issued_at,
      currency_code, turnover_value_cents, receipt_payload_canonical, verification_notes, created_at
    `)
    .eq("id", receiptId);

  if (!isAdmin && effectiveTenantId) {
    receiptQuery = receiptQuery.eq("tenant_id", effectiveTenantId);
  }

  const { data: receipt } = await receiptQuery.maybeSingle();

  if (!receipt) {
    return <div>Beleg nicht gefunden.</div>;
  }

  const payload = parsePayload(receipt.receipt_payload_canonical);
  const lines = parseLinesFromPayload(payload);

  const { data: tenant } = receipt.tenant_id
    ? await admin
        .from("tenants")
        .select("id, slug, display_name, legal_name, invoice_address_line1, invoice_address_line2, zip, city, country, phone, email")
        .eq("id", receipt.tenant_id)
        .maybeSingle()
    : { data: null };

  const tenantRow = (tenant ?? null) as TenantContactRow | null;

  let providerName =
    readFirstString(payload, [
      ["provider_name"],
      ["tenant_display_name"],
      ["tenant_name"],
      ["tenant", "display_name"],
    ]) ||
    String(tenantRow?.display_name ?? "").trim() ||
    "";

  let customerName =
    readFirstString(payload, [
      ["customer_name"],
      ["person_name"],
      ["customer", "full_name"],
      ["customer", "name"],
    ]) || "";

  if (!customerName && receipt.sales_order_id) {
    const { data: salesOrder } = await admin
      .from("sales_orders")
      .select("customer_id")
      .eq("id", receipt.sales_order_id)
      .maybeSingle();

    const customerId = String(salesOrder?.customer_id ?? "").trim();
    if (customerId) {
      const { data: customerProfile } = await admin
        .from("customer_profiles")
        .select("person:persons ( full_name )")
        .eq("id", customerId)
        .maybeSingle();
      const person = firstJoin(customerProfile?.person as any);
      customerName = String(person?.full_name ?? "").trim();
    }
  }

  let paymentMethodLabel = "—";
  let paymentStatusLabel = "—";
  if (receipt.payment_id) {
    const { data: payment } = await admin
      .from("payments")
      .select(`
        status,
        payment_method:payment_methods ( id, code, name )
      `)
      .eq("id", receipt.payment_id)
      .maybeSingle();

    paymentMethodLabel = formatPaymentMethod(payment?.payment_method as PaymentMethodJoin);
    paymentStatusLabel = formatPaymentStatus(payment?.status ?? null);
  }

  const isStornoReceipt = isStornoReceiptType(receipt.receipt_type, receipt.verification_notes);
  const stornoInfo = parseStornoInfoFromNotes(receipt.verification_notes);
  const stornoLabel = isStornoReceipt
    ? `Stornobeleg${stornoInfo.originalReceiptNumber ? ` zu ${stornoInfo.originalReceiptNumber}` : ""}`
    : null;

  const practitionerName =
    String(tenantRow?.display_name ?? providerName ?? profile?.full_name ?? "Behandler").trim() || "Behandler";
  const practitionerEmail = String(tenantRow?.email ?? "").trim() || "—";
  const practitionerPhone = String(tenantRow?.phone ?? "").trim() || "—";
  const practitionerAddressLines = compactAddress(tenantRow);
  const providerLogoUrl = practitionerLogoPath(tenantRow, user.id);
  const studioLogoUrl = "/logos/magnifique-footer.png";
  const websiteUrl = "https://www.magnifique-beauty.at";
  const websiteQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(websiteUrl)}`;

  return (
    <>
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #f3f4f6 !important;
          color: #000000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
        }

        @page {
          size: 58mm auto;
          margin: 0;
        }

        @media print {
          html, body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          #thermal-print-root,
          #thermal-print-root * {
            visibility: visible !important;
          }

          #thermal-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 58mm !important;
            min-width: 58mm !important;
            max-width: 58mm !important;
            margin: 0 !important;
            padding: 2.5mm 2.5mm 4mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 2147483647 !important;
            box-shadow: none !important;
          }

          .thermal-preview-shell {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
          }
        }

        .thermal-preview-shell {
          min-height: 100vh;
          background: #f3f4f6;
          padding: 24px 0 40px;
        }

        #thermal-print-root {
          width: 58mm;
          min-width: 58mm;
          max-width: 58mm;
          margin: 0 auto;
          padding: 2.5mm 2.5mm 4mm;
          box-sizing: border-box;
          background: #ffffff;
          color: #000000;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
        }

        .thermal-root {
          width: 100%;
          font-size: 11px;
          line-height: 1.25;
          color: #000000;
        }

        .thermal-topbar {
          display: grid;
          grid-template-columns: 1fr 14mm;
          gap: 2.5mm;
          align-items: start;
          margin-bottom: 2mm;
        }

        .thermal-provider-logo {
          width: 14mm;
          height: 14mm;
          object-fit: contain;
          display: block;
        }

        .thermal-provider-details {
          min-width: 0;
          font-size: 7px;
          line-height: 1.35;
        }

        .thermal-provider-name {
          font-size: 9px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 0.8mm;
        }

        .thermal-provider-line {
          word-break: break-word;
        }

        .thermal-divider {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }

        .thermal-headline-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 6px;
          font-weight: 700;
          font-size: 14px;
        }

        .thermal-meta {
          margin-top: 2px;
          font-size: 10px;
        }

        .thermal-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }

        .thermal-table-head {
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
        }

        .thermal-line-block + .thermal-line-block {
          margin-top: 5px;
        }

        .thermal-line-name {
          flex: 1;
          min-width: 0;
          padding-right: 6px;
          word-break: break-word;
        }

        .thermal-amount {
          white-space: nowrap;
          text-align: right;
        }

        .thermal-subrow {
          margin-top: 1px;
          font-size: 10px;
        }

        .thermal-total {
          font-weight: 700;
          font-size: 13px;
        }

        .thermal-warning {
          font-weight: 700;
          text-align: center;
          font-size: 10px;
        }

        .thermal-center {
          text-align: center;
        }

        .thermal-footer {
          font-size: 10px;
        }

        .thermal-footer-brand-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2.5mm;
          align-items: center;
          margin-top: 4mm;
          padding-top: 1.5mm;
        }

        .thermal-studio-logo {
          width: 100%;
          max-width: 27mm;
          height: auto;
          display: block;
          object-fit: contain;
        }

        .thermal-web-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1mm;
        }

        .thermal-web-url {
          text-align: center;
          font-size: 7px;
          line-height: 1.2;
          word-break: break-word;
          max-width: 15mm;
        }

        .thermal-qr {
          width: 15mm;
          height: 15mm;
          display: block;
          object-fit: contain;
          border: 0.25mm solid #000;
          background: #fff;
        }
      `}</style>

      <div className="thermal-preview-shell">
        <div id="thermal-print-root">
          <div className="thermal-root">
            <div className="thermal-topbar">
              <div className="thermal-provider-details">
                <div className="thermal-provider-name">{practitionerName}</div>
                {practitionerAddressLines.length > 0 ? (
                  practitionerAddressLines.map((line) => (
                    <div key={line} className="thermal-provider-line">{line}</div>
                  ))
                ) : (
                  <div className="thermal-provider-line">—</div>
                )}
                <div className="thermal-provider-line">{practitionerPhone}</div>
                <div className="thermal-provider-line">{practitionerEmail}</div>
              </div>
              <img
                src={providerLogoUrl}
                alt={practitionerName}
                className="thermal-provider-logo"
              />
            </div>

            <div className="thermal-divider" />

            <div className="thermal-headline-row">
              <span>Beleg</span>
              <span>{String(receipt.receipt_number ?? "—")}</span>
            </div>

            <div className="thermal-meta">{formatDateTime(receipt.issued_at ?? receipt.created_at)}</div>
            <div className="thermal-meta">{providerName || "—"}</div>
            <div className="thermal-meta">Kunde: {customerName || "—"}</div>

            {stornoLabel ? (
              <>
                <div className="thermal-divider" />
                <div className="thermal-warning">{stornoLabel}</div>
              </>
            ) : null}

            <div className="thermal-divider" />

            <div className="thermal-table-head thermal-row">
              <span>Pos</span>
              <span>Gesamt</span>
            </div>

            {lines.length === 0 ? (
              <div className="thermal-row">
                <span>Keine Positionen</span>
                <span>—</span>
              </div>
            ) : (
              lines.map((line, index) => (
                <div key={`${line.name}-${index}`} className="thermal-line-block">
                  <div className="thermal-row">
                    <span className="thermal-line-name">{line.name || "Position"}</span>
                    <span className="thermal-amount">{formatMoney(line.lineTotalCents, String(receipt.currency_code ?? "EUR"))}</span>
                  </div>
                  <div className="thermal-subrow">
                    {line.quantity} × {formatMoney(line.unitPriceCents, String(receipt.currency_code ?? "EUR"))}
                  </div>
                </div>
              ))
            )}

            <div className="thermal-divider" />

            <div className="thermal-row thermal-total">
              <span>SUMME</span>
              <span>{formatMoney(Number(receipt.turnover_value_cents ?? 0) || 0, String(receipt.currency_code ?? "EUR"))}</span>
            </div>

            <div className="thermal-divider" />

            <div className="thermal-row">
              <span>Zahlungsart</span>
              <span>{paymentMethodLabel || "—"}</span>
            </div>
            <div className="thermal-row">
              <span>Zahlungsstatus</span>
              <span>{paymentStatusLabel || "—"}</span>
            </div>
            <div className="thermal-row">
              <span>Belegstatus</span>
              <span>{formatReceiptStatus(receipt.status, isStornoReceipt) || "—"}</span>
            </div>

            <div className="thermal-divider" />

            <div className="thermal-center thermal-footer">Vielen Dank</div>
            <div className="thermal-center thermal-footer">Beleg bitte aufbewahren</div>

            <div className="thermal-footer-brand-row">
              <img
                src={studioLogoUrl}
                alt="Magnifique Beauty"
                className="thermal-studio-logo"
              />

              <div className="thermal-web-col">
                <img
                  src={websiteQrUrl}
                  alt="QR-Code zur Website"
                  className="thermal-qr"
                />
                <div className="thermal-web-url">www.magnifique-beauty.at</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', () => {
              document.documentElement.style.background = '#f3f4f6';
              document.body.style.background = '#f3f4f6';
              document.body.style.margin = '0';
              document.body.style.padding = '0';

              setTimeout(() => window.print(), 250);
            });
          `,
        }}
      />
    </>
  );
}
