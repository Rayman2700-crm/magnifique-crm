import FiscalReceiptThermalDocument, {
  type ThermalReceiptData,
  type ThermalReceiptLine,
} from "@/components/rechnungen/FiscalReceiptThermalDocument";
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
    .select("role, tenant_id, calendar_tenant_id")
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

  let providerName =
    readFirstString(payload, [
      ["provider_name"],
      ["tenant_display_name"],
      ["tenant_name"],
      ["tenant", "display_name"],
    ]) || "";

  if (!providerName && receipt.tenant_id) {
    const { data: tenant } = await admin
      .from("tenants")
      .select("display_name")
      .eq("id", receipt.tenant_id)
      .maybeSingle();
    providerName = String(tenant?.display_name ?? "").trim();
  }

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

  const data: ThermalReceiptData = {
    receiptNumber: String(receipt.receipt_number ?? "—"),
    issuedAtLabel: formatDateTime(receipt.issued_at ?? receipt.created_at),
    providerName: providerName || "Magnifique CRM",
    customerName: customerName || "Nicht hinterlegt",
    paymentMethodLabel,
    paymentStatusLabel,
    statusLabel: formatReceiptStatus(receipt.status, isStornoReceipt),
    currencyCode: String(receipt.currency_code ?? "EUR"),
    totalCents: Number(receipt.turnover_value_cents ?? 0) || 0,
    lines,
    stornoLabel,
  };

  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }

        @page {
          size: 58mm auto;
          margin: 0;
        }

        @media print {
          html, body {
            width: 58mm;
            background: #fff;
          }
        }

        .thermal-page {
          width: 58mm;
          max-width: 58mm;
          margin: 0 auto;
          padding: 2.5mm 2.5mm 4mm;
          box-sizing: border-box;
        }

        .thermal-root {
          width: 100%;
          font-size: 11px;
          line-height: 1.25;
        }

        .thermal-center {
          text-align: center;
        }

        .thermal-brand {
          font-weight: 700;
          letter-spacing: 0.08em;
          font-size: 10px;
        }

        .thermal-divider {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }

        .thermal-headline {
          font-weight: 700;
          font-size: 14px;
        }

        .thermal-meta {
          margin-top: 3px;
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
          margin-top: 6px;
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
        }

        .thermal-footer {
          font-size: 10px;
        }

        .thermal-space-after {
          padding-bottom: 10mm;
        }
      `}</style>

      <div className="thermal-page">
        <FiscalReceiptThermalDocument data={data} />
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', () => {
              setTimeout(() => window.print(), 250);
            });
          `,
        }}
      />
    </>
  );
}
