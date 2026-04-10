import Link from "next/link";
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import FiscalReceiptSlideover from "@/components/rechnungen/FiscalReceiptSlideover";
import { cancelCardPaymentForCheckout, completeCardPaymentForCheckout, createFiscalReceiptForPayment, createPaymentForSalesOrder, createSalesOrderFromAppointment, failCardPaymentForCheckout, startCardPaymentForCheckout } from "./actions";

type FiscalReceiptRow = {
  id: string;
  tenant_id: string | null;
  cash_register_id: string | null;
  sales_order_id: string | null;
  payment_id: string | null;
  receipt_number: string | null;
  receipt_type: string | null;
  status: string | null;
  issued_at: string | null;
  currency_code: string | null;
  sum_tax_set_normal: number | null;
  sum_tax_set_reduced1: number | null;
  sum_tax_set_reduced2: number | null;
  sum_tax_set_zero: number | null;
  turnover_value_cents: number | null;
  chain_previous_receipt_id: string | null;
  chain_previous_hash: string | null;
  receipt_payload_hash: string | null;
  receipt_payload_canonical: string | null;
  signature_value: string | null;
  signature_algorithm: string | null;
  signature_created_at: string | null;
  signature_state: string | null;
  verification_status: string | null;
  verification_checked_at: string | null;
  verification_notes: string | null;
  created_at: string | null;
};

type FiscalEventRow = {
  id: string;
  fiscal_receipt_id: string | null;
  event_type: string | null;
  event_timestamp: string | null;
  performed_by: string | null;
  notes: string | null;
  reference_data: Record<string, unknown> | null;
  created_at: string | null;
};

type SlideoverEvent = {
  id: string;
  eventType: string;
  eventTimestamp: string | null;
  performedBy: string | null;
  notes: string | null;
  referenceData: Record<string, unknown> | null;
  createdAt: string | null;
};

type CheckoutServiceOption = {
  id: string;
  name: string;
  defaultPriceCents: number | null;
};

type SlideoverReceipt = {
  id: string;
  tenantId: string | null;
  cashRegisterId: string | null;
  salesOrderId: string | null;
  paymentId: string | null;
  receiptNumber: string;
  receiptType: string | null;
  status: string | null;
  issuedAt: string | null;
  currencyCode: string | null;
  turnoverValueCents: number | null;
  sumTaxSetNormal: number | null;
  sumTaxSetReduced1: number | null;
  sumTaxSetReduced2: number | null;
  sumTaxSetZero: number | null;
  chainPreviousReceiptId: string | null;
  chainPreviousHash: string | null;
  receiptPayloadHash: string | null;
  receiptPayloadCanonical: string | null;
  signatureValue: string | null;
  signatureAlgorithm: string | null;
  signatureCreatedAt: string | null;
  signatureState: string | null;
  verificationStatus: string | null;
  verificationCheckedAt: string | null;
  verificationNotes: string | null;
  createdAt: string | null;
  latestEventType: string | null;
  events: SlideoverEvent[];
  customerName?: string | null;
  providerName?: string | null;
  providerAvatarUrl?: string | null;
  providerInitials?: string | null;
  availableServices?: CheckoutServiceOption[];
  paymentMethodLabel?: string | null;
  paymentStatus?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deliveries?: SlideoverDelivery[];
};

type ReceiptDeliveryRow = {
  id: string;
  tenant_id: string | null;
  fiscal_receipt_id: string | null;
  channel: string | null;
  status: string | null;
  recipient: string | null;
  subject: string | null;
  message_preview: string | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_by: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SlideoverDelivery = {
  id: string;
  channel: string | null;
  status: string | null;
  recipient: string | null;
  subject: string | null;
  messagePreview: string | null;
  provider: string | null;
  providerMessageId: string | null;
  sentBy: string | null;
  sentByLabel: string | null;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type CheckoutAppointmentRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  service_id: string | null;
  service_name_snapshot: string | null;
  service_price_cents_snapshot: number | null;
  service_duration_minutes_snapshot: number | null;
  start_at: string | null;
  end_at: string | null;
  notes_internal: string | null;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
  person?:
    | { full_name: string | null; phone: string | null; email: string | null }
    | { full_name: string | null; phone: string | null; email: string | null }[]
    | null;
};

type CheckoutServiceRow = {
  id: string;
  name: string | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

type SalesOrderRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  status: string | null;
  currency_code: string | null;
  subtotal_gross: number | null;
  tax_total: number | null;
  grand_total: number | null;
  created_at: string | null;
};

type SalesOrderLineRow = {
  id: string;
  sales_order_id: string | null;
  name: string | null;
  quantity: number | null;
  unit_price_gross: number | null;
  tax_rate: number | null;
  line_total_gross: number | null;
  created_at: string | null;
};

type PaymentMethodJoin =
  | { id: string | null; code: string | null; name: string | null }
  | { id: string | null; code: string | null; name: string | null }[]
  | null;

type PaymentRow = {
  id: string;
  tenant_id: string | null;
  sales_order_id: string | null;
  payment_method_id: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string | null;
  payment_method: PaymentMethodJoin;
};

type AvatarFilterOption = {
  tenantId: string | null;
  userId: string;
  label: string;
  imageUrl: string;
  initials: string;
  filterKey: string;
};


function euroFromCents(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  const abs = Math.abs(value) / 100;
  const formatted = new Intl.NumberFormat("de-AT", { style: "currency", currency: currencyCode || "EUR" }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

function euroFromGross(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("de-AT", { style: "currency", currency: currencyCode || "EUR" }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
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

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}


function initialsFromName(value: string | null | undefined, fallback = "AL") {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return fallback;
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || fallback;
}


function avatarRingColor(label: string | null | undefined) {
  const value = String(label ?? "").toLowerCase();

  if (value.includes("radu")) return "#3b82f6";
  if (value.includes("raluca")) return "#a855f7";
  if (value.includes("alexandra")) return "#22c55e";
  if (value.includes("barbara")) return "#f97316";

  return "rgba(255,255,255,0.55)";
}

function firstNameLabel(label: string | null | undefined, fallback = "Behandler") {
  const value = String(label ?? "").trim() || fallback;
  return value.split(/\s+/)[0] || fallback;
}

function normalizePractitionerKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("radu")) return "radu";
  if (normalized.includes("raluca")) return "raluca";
  if (normalized.includes("alexandra")) return "alexandra";
  if (normalized.includes("barbara")) return "barbara";
  return normalized.replace(/\s+/g, "-");
}

function customerBadgeClass(value: string | null | undefined) {
  const palette = [
    "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-100",
    "border-blue-500/30 bg-blue-500/15 text-blue-100",
    "border-violet-500/30 bg-violet-500/15 text-violet-100",
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
    "border-amber-500/30 bg-amber-500/15 text-amber-100",
  ];
  const seed = String(value ?? "").trim();
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? palette[0];
}


function providerBadgeMeta(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized.includes("radu")) {
    return {
      initials: "RC",
      className: "border-blue-500/30 bg-blue-500/15 text-blue-100",
    };
  }

  if (normalized.includes("raluca")) {
    return {
      initials: "RC",
      className: "border-violet-500/30 bg-violet-500/15 text-violet-100",
    };
  }

  if (normalized.includes("alexandra")) {
    return {
      initials: "AS",
      className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
    };
  }

  if (normalized.includes("barbara")) {
    return {
      initials: "BE",
      className: "border-amber-500/30 bg-amber-500/15 text-amber-100",
    };
  }

  return {
    initials: initialsFromName(value, "BE"),
    className: "border-white/15 bg-white/10 text-white/90",
  };
}

function eventBadgeTone(value: string | null | undefined, referenceData?: Record<string, unknown> | null) {
  const normalized = String(value ?? "").toUpperCase();
  const auditAction = String(referenceData?.audit_action ?? "").trim().toLowerCase();
  if (auditAction === "receipt_edited") return "blue" as const;
  if (normalized.includes("FAILED")) return "red" as const;
  if (normalized.includes("SUCCEEDED") || normalized.includes("CREATED")) return "green" as const;
  return "neutral" as const;
}

function escapeIlikeValue(value: string) {
  return value.replace(/[,%]/g, "").replace(/\s+/g, " ").trim();
}

function formatEventLabel(value: string | null | undefined, referenceData?: Record<string, unknown> | null) {
  const normalized = String(value ?? "").toUpperCase();
  const auditAction = String(referenceData?.audit_action ?? "").trim().toLowerCase();
  if (auditAction === 'receipt_edited') return 'Beleg bearbeitet';
  const labels: Record<string, string> = {
    RECEIPT_CREATION_STARTED: "Belegerstellung gestartet",
    STANDARD_RECEIPT_CREATED: "Beleg erstellt",
    RECEIPT_VERIFICATION_SUCCEEDED: "Verifikation erfolgreich",
    RECEIPT_CREATION_FAILED: "Belegerstellung fehlgeschlagen",
  };
  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "—");
}

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

function readMetaLineValue(existing: string | null | undefined, prefix: string) {
  const lines = String(existing ?? "")
    .split("\n")
    .map((entry: string) => entry.trim())
    .filter(Boolean);
  const match = lines.find((entry: string) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!match) return "";
  return match.slice(prefix.length).trim();
}

function normalizeAppointmentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "no_show") return "no_show";
  return "scheduled";
}

function formatAppointmentStatusLabel(value: string | null | undefined) {
  const normalized = normalizeAppointmentStatus(value);
  if (normalized === "completed") return "Gekommen";
  if (normalized === "cancelled") return "Abgesagt";
  if (normalized === "no_show") return "Nicht gekommen";
  return "Geplant";
}

function moneyInputDefault(cents: number | null | undefined) {
  if (typeof cents !== "number") return "0,00";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function grossInputDefault(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0,00";
  return value.toFixed(2).replace(".", ",");
}

function SummaryCard({ label, value, subtext }: { label: string; value: ReactNode; subtext: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/55">{subtext}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "neutral" | "green" | "amber" | "red" | "blue"; children: ReactNode }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : tone === "amber"
        ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
        : tone === "red"
          ? "border-red-400/25 bg-red-500/10 text-red-200"
          : tone === "blue"
            ? "border-sky-400/25 bg-sky-500/10 text-sky-200"
            : "border-white/10 bg-white/5 text-white/75";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

function toneForSignature(state: string | null) {
  const value = String(state ?? "").toUpperCase();
  if (value === "SIMULATED" || value === "SIGNED") return "blue" as const;
  if (value === "PENDING") return "amber" as const;
  if (value.includes("FAIL")) return "red" as const;
  return "neutral" as const;
}

function toneForVerification(state: string | null) {
  const value = String(state ?? "").toUpperCase();
  if (value === "VALID") return "green" as const;
  if (!value) return "neutral" as const;
  if (value.includes("PENDING")) return "amber" as const;
  return "red" as const;
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

function toneForPaymentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "COMPLETED") return "green" as const;
  if (normalized === "PENDING" || normalized === "PROCESSING") return "amber" as const;
  if (normalized === "FAILED" || normalized === "CANCELLED") return "red" as const;
  if (normalized === "REFUNDED") return "blue" as const;
  return "neutral" as const;
}


function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endExclusive(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isBetween(dateValue: string | null | undefined, start: Date, end: Date) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date < end;
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

function getReceiptBusinessState(item: SlideoverReceipt) {
  const verification = String(item.verificationStatus ?? "").toUpperCase();
  const signature = String(item.signatureState ?? "").toUpperCase();
  const status = String(item.status ?? "").toUpperCase();

  const stornoInfo = parseStornoInfoFromNotes(item.verificationNotes);
  if (stornoInfo.originalReceiptNumber || String(item.receiptType ?? "").toUpperCase() === "REVERSAL") {
    return { key: "cancelled", label: "Stornobeleg", tone: "amber" as const };
  }

  if (status === "REVERSED" || status === "CANCELLED") {
    return { key: "cancelled", label: "Storniert", tone: "red" as const };
  }

  if (verification.includes("INVALID") || signature.includes("FAIL") || status.includes("FAIL")) {
    return { key: "error", label: "Fehler", tone: "red" as const };
  }

  if (status === "CREATED" || status === "PENDING" || status === "DRAFT") {
    return { key: "open", label: "Offen", tone: "amber" as const };
  }

  if (verification === "VALID") {
    return { key: "paid", label: "Bezahlt", tone: "green" as const };
  }

  if (signature === "SIMULATED") {
    return { key: "simulated", label: "Simuliert", tone: "blue" as const };
  }

  return { key: "neutral", label: status || "Unklar", tone: "neutral" as const };
}




function getReceiptSearchHaystack(item: SlideoverReceipt) {
  const latestEventLabel = formatEventLabel(item.latestEventType, item.events[0]?.referenceData ?? null);

  return [
    item.receiptNumber,
    item.id,
    item.salesOrderId,
    item.paymentId,
    item.cashRegisterId,
    item.customerName,
    item.providerName,
    item.status,
    item.paymentStatus,
    item.signatureState,
    item.verificationStatus,
    latestEventLabel,
    item.latestEventType,
  ]
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function matchesReceiptSearch(item: SlideoverReceipt, query: string) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return getReceiptSearchHaystack(item).includes(normalized);
}

function statusLinkClass(isActive: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition whitespace-nowrap",
    isActive
      ? "border-white bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.10)]"
      : "border-white/10 bg-black/20 text-white hover:bg-white/10",
  ].join(" ");
}

function statusCountClass(isActive: boolean) {
  return [
    "inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
    isActive ? "bg-black/10 text-black" : "bg-white/10 text-white/90",
  ].join(" ");
}
function getQuickFilterLabel(filter: string) {
  const labels: Record<string, string> = {
    all: "Alle",
    today: "Heute",
    week: "Woche",
    month: "Monat",
    open: "Offen",
    cancelled: "Storniert",
    error: "Fehler",
  };
  return labels[filter] ?? "Alle";
}

function buildRechnungenHref({
  qRaw,
  filter,
  practitioner,
  receipt,
  appointmentId,
  salesOrder,
  payment,
}: {
  qRaw?: string;
  filter?: string;
  practitioner?: string;
  receipt?: string;
  appointmentId?: string;
  salesOrder?: string;
  payment?: string;
}) {
  const params = new URLSearchParams();
  if (qRaw?.trim()) params.set("q", qRaw.trim());
  if (filter && filter !== "all") params.set("filter", filter);
  if (practitioner && practitioner !== "all") params.set("practitioner", practitioner);
  if (receipt) params.set("receipt", receipt);
  if (appointmentId) params.set("appointmentId", appointmentId);
  if (salesOrder) params.set("salesOrder", salesOrder);
  if (payment) params.set("payment", payment);
  const query = params.toString();
  return query ? `/rechnungen?${query}` : "/rechnungen";
}

function MobileReceiptFilterMenu({
  qRaw,
  currentFilter,
  practitionerFilter,
  counts,
}: {
  qRaw: string;
  currentFilter: string;
  practitionerFilter: string;
  counts: { all: number; today: number; week: number; month: number; open: number; cancelled: number; error: number };
}) {
  const items = [
    { key: "all", label: "Alle", count: counts.all },
    { key: "today", label: "Heute", count: counts.today },
    { key: "week", label: "Woche", count: counts.week },
    { key: "month", label: "Monat", count: counts.month },
    { key: "open", label: "Offen", count: counts.open },
    { key: "cancelled", label: "Storniert", count: counts.cancelled },
    { key: "error", label: "Fehler", count: counts.error },
  ];
  const activeCount = items.find((item) => item.key === currentFilter)?.count ?? counts.all;

  return (
    <>
      <button
        type="button"
        popoverTarget="receipts-filter-menu"
        popoverTargetAction="toggle"
        className="relative flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_0_0_2px_rgba(11,11,12,0.95),0_10px_28px_rgba(0,0,0,0.30)] md:hidden"
        aria-label="Rechnungsfilter öffnen"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeCount}
        </span>
      </button>

      <div
        id="receipts-filter-menu"
        popover="auto"
        className="md:hidden fixed left-[116px] top-[332px] z-[2147483647] m-0 w-[224px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.995)_0%,rgba(12,13,16,0.995)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.62)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Filter wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Belege filtern</div>
        </div>
        <div className="grid gap-2">
          {items.map((item) => {
            const selected = currentFilter === item.key;
            return (
              <Link
                key={item.key}
                href={buildRechnungenHref({ qRaw, filter: item.key, practitioner: practitionerFilter })}
                className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                style={{
                  borderColor: selected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                  backgroundColor: selected ? "rgba(214,195,163,0.14)" : "rgba(255,255,255,0.04)",
                }}
              >
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/90">
                  {item.count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function MobileReceiptAvatarMenu({
  avatarOptions,
  practitionerFilter,
  qRaw,
  currentFilter,
}: {
  avatarOptions: AvatarFilterOption[];
  practitionerFilter: string;
  qRaw: string;
  currentFilter: string;
}) {
  const activeOption =
    avatarOptions.find((option) => option.filterKey === practitionerFilter) ??
    avatarOptions[0] ??
    null;

  const ringColors = ["#d6c3a3", ...avatarOptions.filter((option) => option.tenantId !== "all").map((option) => avatarRingColor(option.label))];
  const step = 100 / Math.max(1, ringColors.length);
  const ringBackground = `conic-gradient(${ringColors
    .map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`)
    .join(", ")})`;

  return (
    <>
      <button
        type="button"
        popoverTarget="receipts-avatar-menu"
        popoverTargetAction="toggle"
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full md:hidden"
        aria-label="Behandler auswählen"
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[12px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {activeOption?.tenantId === "all" ? (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
          ) : activeOption?.imageUrl ? (
            <img src={activeOption.imageUrl} alt={activeOption.label} className="h-full w-full object-cover" />
          ) : (
            activeOption?.initials ?? "BE"
          )}
        </span>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeOption?.tenantId === "all" ? avatarOptions.length : "1"}
        </span>
      </button>

      <div
        id="receipts-avatar-menu"
        popover="auto"
        className="md:hidden fixed right-4 top-[332px] z-[2147483647] m-0 w-[min(640px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Behandler wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Rechnungen filtern</div>
        </div>
        <div className="grid gap-2">
          {avatarOptions.map((option) => {
            const selected = option.filterKey === practitionerFilter;
            const ringColor = option.tenantId === "all" ? "rgba(255,255,255,0.55)" : avatarRingColor(option.label);
            return (
              <Link
                key={`mobile-avatar-${option.userId}-${option.tenantId ?? "self"}`}
                href={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: option.filterKey,
                })}
                className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                style={{
                  borderColor: selected ? `${ringColor}66` : "rgba(255,255,255,0.10)",
                  backgroundColor: selected ? `${ringColor}22` : "rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white"
                    style={{ borderColor: option.tenantId === "all" ? "rgba(255,255,255,0.55)" : ringColor }}
                  >
                    {option.tenantId === "all" ? (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
                    ) : option.imageUrl ? (
                      <img src={option.imageUrl} alt={option.label} className="h-full w-full object-cover" />
                    ) : (
                      option.initials
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{option.tenantId === "all" ? "Alle" : firstNameLabel(option.label, "Behandler")}</div>
                    <div className="truncate text-xs text-white/50">{option.tenantId === "all" ? "Alle Behandler" : option.label}</div>
                  </div>
                </div>
                {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}


export default async function RechnungenPage({
  searchParams,
}: {
  searchParams?:
    | Promise<{ q?: string; filter?: string; practitioner?: string; receipt?: string; appointmentId?: string; salesOrder?: string; payment?: string; success?: string; error?: string }>
    | { q?: string; filter?: string; practitioner?: string; receipt?: string; appointmentId?: string; salesOrder?: string; payment?: string; success?: string; error?: string };
}) {
  const sp = searchParams ? await searchParams : undefined;
  const qRaw = String(sp?.q ?? "").trim();
  const q = qRaw.toLowerCase();
  const currentFilter = String(sp?.filter ?? "all").trim().toLowerCase() || "all";
  const practitionerFilter = String(sp?.practitioner ?? "all").trim();
  const appointmentId = String(sp?.appointmentId ?? "").trim();
  const salesOrderId = String(sp?.salesOrder ?? "").trim();
  const paymentId = String(sp?.payment ?? "").trim();
  const receiptId = String(sp?.receipt ?? "").trim();
  const successMessage = String(sp?.success ?? "").trim();
  const errorMessage = String(sp?.error ?? "").trim();

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl p-6 text-white">
        <Link href="/login" className="underline">Bitte einloggen</Link>
      </main>
    );
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


  let avatarOptions: AvatarFilterOption[] = [];
  const tenantNameById = new Map<string, string>();

  if (isAdmin) {
    const [{ data: tenantRows }, { data: practitionerRows }] = await Promise.all([
      admin.from("tenants").select("id, display_name").order("display_name", { ascending: true }),
      admin
        .from("user_profiles")
        .select("user_id, full_name, tenant_id, calendar_tenant_id")
        .not("calendar_tenant_id", "is", null),
    ]);

    for (const tenant of (tenantRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      tenantNameById.set(String(tenant.id), String(tenant.display_name ?? "").trim() || "Behandler");
    }

    avatarOptions = [
      {
        tenantId: "all",
        userId: "all",
        label: "Alle",
        imageUrl: "",
        initials: "AL",
        filterKey: "all",
      },
      ...((practitionerRows ?? []) as Array<{
        user_id: string | null;
        full_name: string | null;
        tenant_id: string | null;
        calendar_tenant_id: string | null;
      }>)
        .filter((row) => String(row.user_id ?? "").trim() && String(row.calendar_tenant_id ?? row.tenant_id ?? "").trim())
        .map((row) => {
          const resolvedTenantId = String(row.tenant_id ?? row.calendar_tenant_id ?? "").trim();
          const label =
            tenantNameById.get(resolvedTenantId) ||
            String(row.full_name ?? "").trim() ||
            "Behandler";
          return {
            tenantId: resolvedTenantId,
            userId: String(row.user_id),
            label,
            imageUrl: `/users/${row.user_id}.png`,
            initials: initialsFromName(label, "BE"),
            filterKey: normalizePractitionerKey(label),
          } satisfies AvatarFilterOption;
        }),
    ];
  } else {
    const resolvedTenantId = String(profile?.tenant_id ?? profile?.calendar_tenant_id ?? effectiveTenantId ?? "").trim();
    avatarOptions = [
      {
        tenantId: resolvedTenantId || null,
        userId: String(user.id),
        label: String(profile?.full_name ?? "Mein Bereich").trim() || "Mein Bereich",
        imageUrl: `/users/${user.id}.png`,
        initials: initialsFromName(String(profile?.full_name ?? "Mein Bereich")),
        filterKey: normalizePractitionerKey(String(profile?.full_name ?? "Mein Bereich")),
      },
    ];
  }

  let checkoutAppointment: CheckoutAppointmentRow | null = null;
  let checkoutServices: CheckoutServiceRow[] = [];

  if (appointmentId) {
    const appointmentBaseQuery = admin.from("appointments").select(`
      id, tenant_id, person_id, service_id,
      service_name_snapshot, service_price_cents_snapshot, service_duration_minutes_snapshot,
      start_at, end_at, notes_internal,
      tenant:tenants ( display_name ),
      person:persons ( full_name, phone, email )
    `);

    const appointmentScopedQuery = effectiveTenantId ? appointmentBaseQuery.eq("tenant_id", effectiveTenantId) : appointmentBaseQuery;
    const { data: appointmentRaw } = await appointmentScopedQuery.eq("id", appointmentId).maybeSingle();
    checkoutAppointment = (appointmentRaw ?? null) as CheckoutAppointmentRow | null;

    const serviceTenantId = String((appointmentRaw as { tenant_id?: string | null } | null)?.tenant_id ?? "").trim();
    if (serviceTenantId) {
      const { data: serviceRows } = await admin
        .from("services")
        .select("id, name, default_price_cents, is_active")
        .eq("tenant_id", serviceTenantId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      checkoutServices = (serviceRows ?? []) as CheckoutServiceRow[];
    }
  }

  let createdSalesOrder: SalesOrderRow | null = null;
  let createdSalesOrderLines: SalesOrderLineRow[] = [];

  if (salesOrderId) {
    const { data: salesOrderRaw } = await admin
      .from("sales_orders")
      .select("id, tenant_id, customer_id, appointment_id, status, currency_code, subtotal_gross, tax_total, grand_total, created_at")
      .eq("id", salesOrderId)
      .maybeSingle();

    createdSalesOrder = (salesOrderRaw ?? null) as SalesOrderRow | null;

    if (createdSalesOrder?.id) {
      const { data: lineRows } = await admin
        .from("sales_order_lines")
        .select("id, sales_order_id, name, quantity, unit_price_gross, tax_rate, line_total_gross, created_at")
        .eq("sales_order_id", createdSalesOrder.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      createdSalesOrderLines = (lineRows ?? []) as SalesOrderLineRow[];
    }
  }

  let createdPayment: PaymentRow | null = null;
  if (paymentId) {
    const { data: paymentRaw } = await admin
      .from("payments")
      .select(`
        id, tenant_id, sales_order_id, payment_method_id, amount, currency_code,
        status, paid_at, created_at,
        payment_method:payment_methods ( id, code, name )
      `)
      .eq("id", paymentId)
      .maybeSingle();
    createdPayment = (paymentRaw ?? null) as PaymentRow | null;
  } else if (createdSalesOrder?.id) {
    const { data: paymentRows } = await admin
      .from("payments")
      .select(`
        id, tenant_id, sales_order_id, payment_method_id, amount, currency_code,
        status, paid_at, created_at,
        payment_method:payment_methods ( id, code, name )
      `)
      .eq("sales_order_id", createdSalesOrder.id)
      .order("created_at", { ascending: false })
      .limit(1);
    createdPayment = ((paymentRows ?? [])[0] ?? null) as PaymentRow | null;
  }


  const createdPaymentMethodCode = String(firstJoin(createdPayment?.payment_method)?.code ?? "").trim().toUpperCase();
  const createdPaymentStatus = String(createdPayment?.status ?? "").trim().toUpperCase();
  const isCreatedCardPayment = createdPaymentMethodCode === "CARD";
  const isCreatedCompletedPayment = createdPaymentStatus === "COMPLETED";
  const isCreatedPendingPayment = createdPaymentStatus === "PENDING";
  const isCreatedProcessingPayment = createdPaymentStatus === "PROCESSING";
  const isCreatedFailedPayment = createdPaymentStatus === "FAILED";
  const isCreatedCancelledPayment = createdPaymentStatus === "CANCELLED";

  let createdReceipt: FiscalReceiptRow | null = null;
  if (receiptId) {
    const { data: receiptRaw } = await admin
      .from("fiscal_receipts")
      .select(`
        id, tenant_id, cash_register_id, sales_order_id, payment_id,
        receipt_number, receipt_type, status, issued_at, currency_code,
        sum_tax_set_normal, sum_tax_set_reduced1, sum_tax_set_reduced2, sum_tax_set_zero,
        turnover_value_cents, chain_previous_receipt_id, chain_previous_hash,
        receipt_payload_hash, receipt_payload_canonical, signature_value, signature_algorithm,
        signature_created_at, signature_state, verification_status, verification_checked_at,
        verification_notes, created_at
      `)
      .eq("id", receiptId)
      .maybeSingle();
    createdReceipt = (receiptRaw ?? null) as FiscalReceiptRow | null;
  } else if (createdPayment?.id) {
    const { data: receiptRows } = await admin
      .from("fiscal_receipts")
      .select(`
        id, tenant_id, cash_register_id, sales_order_id, payment_id,
        receipt_number, receipt_type, status, issued_at, currency_code,
        sum_tax_set_normal, sum_tax_set_reduced1, sum_tax_set_reduced2, sum_tax_set_zero,
        turnover_value_cents, chain_previous_receipt_id, chain_previous_hash,
        receipt_payload_hash, receipt_payload_canonical, signature_value, signature_algorithm,
        signature_created_at, signature_state, verification_status, verification_checked_at,
        verification_notes, created_at
      `)
      .eq("payment_id", createdPayment.id)
      .order("created_at", { ascending: false })
      .limit(1);
    createdReceipt = ((receiptRows ?? [])[0] ?? null) as FiscalReceiptRow | null;
  }

  let receiptsQuery = admin
    .from("fiscal_receipts")
    .select(`
      id, tenant_id, cash_register_id, sales_order_id, payment_id,
      receipt_number, receipt_type, status, issued_at, currency_code,
      sum_tax_set_normal, sum_tax_set_reduced1, sum_tax_set_reduced2, sum_tax_set_zero,
      turnover_value_cents, chain_previous_receipt_id, chain_previous_hash,
      receipt_payload_hash, receipt_payload_canonical, signature_value, signature_algorithm,
      signature_created_at, signature_state, verification_status, verification_checked_at,
      verification_notes, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(q ? 300 : 150);

  if (!isAdmin && effectiveTenantId) receiptsQuery = receiptsQuery.eq("tenant_id", effectiveTenantId);
    const sanitizedQuery = escapeIlikeValue(qRaw);
  if (sanitizedQuery) {
    const orParts = [
      `receipt_number.ilike.%${sanitizedQuery}%`,
      `sales_order_id.ilike.%${sanitizedQuery}%`,
      `payment_id.ilike.%${sanitizedQuery}%`,
      `cash_register_id.ilike.%${sanitizedQuery}%`,
      `id.ilike.%${sanitizedQuery}%`,
    ];

    const upperQuery = sanitizedQuery.toUpperCase();

    const allowedReceiptStatus = ["REQUESTED", "ISSUED", "FAILED", "CANCELLED", "REVERSED"];
    const allowedSignatureState = ["SIMULATED", "PENDING", "SIGNED", "FAILED"];
    const allowedVerificationStatus = ["VALID", "INVALID", "PENDING", "SKIPPED"];

    if (allowedReceiptStatus.includes(upperQuery)) {
      orParts.push(`status.eq.${upperQuery}`);
    }

    if (allowedSignatureState.includes(upperQuery)) {
      orParts.push(`signature_state.eq.${upperQuery}`);
    }

    if (allowedVerificationStatus.includes(upperQuery)) {
      orParts.push(`verification_status.eq.${upperQuery}`);
    }

    receiptsQuery = receiptsQuery.or(orParts.join(","));
  }
  const { data: receiptsRaw, error: receiptsError } = await receiptsQuery;

  if (receiptsError) {
    return (
      <main className="mx-auto max-w-7xl p-6 text-white">
        <Card className="border-red-400/20 bg-red-500/10">
          <CardContent className="p-5">
            <div className="text-lg font-semibold text-red-200">Fiscal-Receipts konnten nicht geladen werden</div>
            <div className="mt-2 text-sm text-red-100/80">{receiptsError.message}</div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const receipts = (receiptsRaw ?? []) as FiscalReceiptRow[];

  const receiptIds = receipts.map((row) => row.id).filter(Boolean);
  let events: FiscalEventRow[] = [];
  if (receiptIds.length > 0) {
    let eventsQuery = admin
      .from("fiscal_events")
      .select(`id, fiscal_receipt_id, event_type, event_timestamp, performed_by, notes, reference_data, created_at`)
      .in("fiscal_receipt_id", receiptIds)
      .order("event_timestamp", { ascending: false });
    if (!isAdmin && effectiveTenantId) eventsQuery = eventsQuery.eq("tenant_id", effectiveTenantId);
    const { data: eventsRaw } = await eventsQuery;
    events = (eventsRaw ?? []) as FiscalEventRow[];
  }

  const eventsByReceipt = new Map<string, SlideoverEvent[]>();
  for (const row of events) {
    const receiptId = String(row.fiscal_receipt_id ?? "").trim();
    if (!receiptId) continue;
    const next: SlideoverEvent = {
      id: row.id,
      eventType: row.event_type ?? "—",
      eventTimestamp: row.event_timestamp,
      performedBy: row.performed_by,
      notes: row.notes,
      referenceData: row.reference_data,
      createdAt: row.created_at,
    };
    const bucket = eventsByReceipt.get(receiptId) ?? [];
    bucket.push(next);
    eventsByReceipt.set(receiptId, bucket);
  }


  const receiptSalesOrderIds = Array.from(new Set(receipts.map((row) => String(row.sales_order_id ?? "").trim()).filter(Boolean)));
  const receiptPaymentIds = Array.from(new Set(receipts.map((row) => String(row.payment_id ?? "").trim()).filter(Boolean)));

  const paymentMethodLabelByReceiptId = new Map<string, string>();
  const paymentStatusByReceiptId = new Map<string, string>();
  if (receiptPaymentIds.length > 0) {
    const { data: receiptPaymentRows } = await admin
      .from("payments")
      .select(`
        id,
        status,
        payment_method:payment_methods ( id, code, name )
      `)
      .in("id", receiptPaymentIds);

    for (const row of (receiptPaymentRows ?? []) as Array<{ id: string; status: string | null; payment_method: PaymentMethodJoin }>) {
      const paymentId = String(row.id ?? "").trim();
      if (!paymentId) continue;
      const label = formatPaymentMethod(row.payment_method);
      const paymentStatus = String(row.status ?? "").trim() || null;
      for (const receipt of receipts) {
        if (String(receipt.payment_id ?? "").trim() === paymentId) {
          paymentMethodLabelByReceiptId.set(receipt.id, label);
          if (paymentStatus) paymentStatusByReceiptId.set(receipt.id, paymentStatus);
        }
      }
    }
  }

  const salesOrderCustomerIdBySalesOrderId = new Map<string, string>();
  if (receiptSalesOrderIds.length > 0) {
    const { data: receiptSalesOrderRows } = await admin
      .from("sales_orders")
      .select("id, customer_id")
      .in("id", receiptSalesOrderIds);

    for (const row of (receiptSalesOrderRows ?? []) as Array<{ id: string; customer_id: string | null }>) {
      const salesOrderId = String(row.id ?? "").trim();
      const customerId = String(row.customer_id ?? "").trim();
      if (salesOrderId && customerId) salesOrderCustomerIdBySalesOrderId.set(salesOrderId, customerId);
    }
  }

  const receiptCustomerProfileIds = Array.from(new Set(Array.from(salesOrderCustomerIdBySalesOrderId.values()).filter(Boolean)));
  const customerProfileById = new Map<string, { customerName: string | null; customerPhone: string | null; customerEmail: string | null }>();
  if (receiptCustomerProfileIds.length > 0) {
    const { data: receiptCustomerProfiles } = await admin
      .from("customer_profiles")
      .select(`id, person:persons ( full_name, phone, email )`)
      .in("id", receiptCustomerProfileIds);

    for (const profile of (receiptCustomerProfiles ?? []) as Array<{ id: string; person: { full_name: string | null; phone: string | null; email: string | null } | { full_name: string | null; phone: string | null; email: string | null }[] | null }>) {
      const personJoin = firstJoin(profile.person);
      customerProfileById.set(String(profile.id), {
        customerName: String(personJoin?.full_name ?? "").trim() || null,
        customerPhone: String(personJoin?.phone ?? "").trim() || null,
        customerEmail: String(personJoin?.email ?? "").trim() || null,
      });
    }
  }

  const receiptDeliveryByReceiptId = new Map<string, SlideoverDelivery[]>();
  if (receiptIds.length > 0) {
    const { data: deliveryRows } = await admin
      .from("receipt_deliveries")
      .select("id, tenant_id, fiscal_receipt_id, channel, status, recipient, subject, message_preview, provider, provider_message_id, sent_by, sent_at, failed_at, error_message, created_at, updated_at")
      .in("fiscal_receipt_id", receiptIds)
      .order("created_at", { ascending: false });

    const deliveries = (deliveryRows ?? []) as ReceiptDeliveryRow[];
    const senderIds = Array.from(new Set(deliveries.map((row) => String(row.sent_by ?? "").trim()).filter(Boolean)));
    const senderLabelById = new Map<string, string>();

    if (senderIds.length > 0) {
      const { data: senderRows } = await admin
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", senderIds);

      for (const row of (senderRows ?? []) as Array<{ user_id: string | null; full_name: string | null }>) {
        const userId = String(row.user_id ?? "").trim();
        if (!userId) continue;
        senderLabelById.set(userId, String(row.full_name ?? "").trim() || userId);
      }
    }

    for (const row of deliveries) {
      const receiptIdKey = String(row.fiscal_receipt_id ?? "").trim();
      if (!receiptIdKey) continue;
      const bucket = receiptDeliveryByReceiptId.get(receiptIdKey) ?? [];
      const sentBy = String(row.sent_by ?? "").trim() || null;
      bucket.push({
        id: row.id,
        channel: row.channel,
        status: row.status,
        recipient: row.recipient,
        subject: row.subject,
        messagePreview: row.message_preview,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        sentBy,
        sentByLabel: sentBy ? (senderLabelById.get(sentBy) ?? sentBy) : null,
        sentAt: row.sent_at,
        failedAt: row.failed_at,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
      receiptDeliveryByReceiptId.set(receiptIdKey, bucket);
    }
  }

  const receiptTenantIds = Array.from(new Set(receipts.map((row) => String(row.tenant_id ?? '').trim()).filter(Boolean)));
  const servicesByTenant = new Map<string, CheckoutServiceOption[]>();
  if (receiptTenantIds.length > 0) {
    const { data: receiptServiceRows } = await admin
      .from('services')
      .select('id, tenant_id, name, default_price_cents, is_active')
      .in('tenant_id', receiptTenantIds)
      .eq('is_active', true)
      .order('name', { ascending: true });

    for (const row of (receiptServiceRows ?? []) as Array<CheckoutServiceRow & { tenant_id?: string | null }>) {
      const tenantId = String(row.tenant_id ?? '').trim();
      if (!tenantId) continue;
      const bucket = servicesByTenant.get(tenantId) ?? [];
      bucket.push({
        id: row.id,
        name: row.name ?? 'Unbenannte Dienstleistung',
        defaultPriceCents: row.default_price_cents,
      });
      servicesByTenant.set(tenantId, bucket);
    }
  }

  const items: SlideoverReceipt[] = receipts.map((row) => {
    const receiptEvents = eventsByReceipt.get(row.id) ?? [];
    const latestEvent = receiptEvents[0] ?? null;
    const payload = parsePayload(row.receipt_payload_canonical);
    const customerProfile =
      customerProfileById.get(salesOrderCustomerIdBySalesOrderId.get(String(row.sales_order_id ?? "").trim()) ?? "") ?? null;
    const customerName =
      readFirstString(payload, [
        ["customer_name"],
        ["person_name"],
        ["customer", "full_name"],
        ["customer", "name"],
      ]) ||
      customerProfile?.customerName ||
      null;
    const providerName =
      readFirstString(payload, [
        ["provider_name"],
        ["tenant_display_name"],
        ["tenant_name"],
        ["tenant", "display_name"],
      ]) ||
      tenantNameById.get(String(row.tenant_id ?? "").trim()) ||
      null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      cashRegisterId: row.cash_register_id,
      salesOrderId: row.sales_order_id,
      paymentId: row.payment_id,
      receiptNumber: row.receipt_number ?? "—",
      receiptType: row.receipt_type,
      status: row.status,
      issuedAt: row.issued_at,
      currencyCode: row.currency_code,
      turnoverValueCents: row.turnover_value_cents,
      sumTaxSetNormal: row.sum_tax_set_normal,
      sumTaxSetReduced1: row.sum_tax_set_reduced1,
      sumTaxSetReduced2: row.sum_tax_set_reduced2,
      sumTaxSetZero: row.sum_tax_set_zero,
      chainPreviousReceiptId: row.chain_previous_receipt_id,
      chainPreviousHash: row.chain_previous_hash,
      receiptPayloadHash: row.receipt_payload_hash,
      receiptPayloadCanonical: row.receipt_payload_canonical,
      signatureValue: row.signature_value,
      signatureAlgorithm: row.signature_algorithm,
      signatureCreatedAt: row.signature_created_at,
      signatureState: row.signature_state,
      verificationStatus: row.verification_status,
      verificationCheckedAt: row.verification_checked_at,
      verificationNotes: row.verification_notes,
      createdAt: row.created_at,
      latestEventType: latestEvent?.eventType ?? null,
      events: receiptEvents,
      customerName,
      providerName,
      providerAvatarUrl:
        avatarOptions.find((option) => String(option.tenantId ?? "").trim() === String(row.tenant_id ?? "").trim())?.imageUrl ?? null,
      providerInitials:
        avatarOptions.find((option) => String(option.tenantId ?? "").trim() === String(row.tenant_id ?? "").trim())?.initials ??
        initialsFromName(providerName, "BE"),
      availableServices: servicesByTenant.get(String(row.tenant_id ?? '').trim()) ?? [],
      paymentMethodLabel: paymentMethodLabelByReceiptId.get(row.id) ?? null,
      paymentStatus: paymentStatusByReceiptId.get(row.id) ?? null,
      customerEmail: customerProfile?.customerEmail ?? null,
      customerPhone: customerProfile?.customerPhone ?? null,
      deliveries: receiptDeliveryByReceiptId.get(row.id) ?? [],
    };
  });


  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = endExclusive(todayStart, 1);
  const weekStart = startOfDay(now);
  const weekday = weekStart.getDay();
  const diffToMonday = (weekday + 6) % 7;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  const weekEnd = endExclusive(weekStart, 7);
  const monthStart = startOfMonth(now);
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const practitionerScopedItems = items.filter((item) =>
    practitionerFilter === "all"
      ? true
      : normalizePractitionerKey(item.providerName) === practitionerFilter
  );

  const searchScopedItems = practitionerScopedItems.filter((item) => matchesReceiptSearch(item, qRaw));

  const filteredItems = searchScopedItems.filter((item) => {
    const issued = item.issuedAt ?? item.createdAt;
    const businessState = getReceiptBusinessState(item);

    if (currentFilter === "today") return isBetween(issued, todayStart, tomorrowStart);
    if (currentFilter === "week") return isBetween(issued, weekStart, weekEnd);
    if (currentFilter === "month") return isBetween(issued, monthStart, nextMonthStart);
    if (currentFilter === "open") return businessState.key === "open";
    if (currentFilter === "cancelled") return businessState.key === "cancelled";
    if (currentFilter === "error") return businessState.key === "error";
    return true;
  });

  const quickFilterCounts = {
    all: searchScopedItems.length,
    today: searchScopedItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, todayStart, tomorrowStart)).length,
    week: searchScopedItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, weekStart, weekEnd)).length,
    month: searchScopedItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, monthStart, nextMonthStart)).length,
    open: searchScopedItems.filter((item) => getReceiptBusinessState(item).key === "open").length,
    cancelled: searchScopedItems.filter((item) => getReceiptBusinessState(item).key === "cancelled").length,
    error: searchScopedItems.filter((item) => getReceiptBusinessState(item).key === "error").length,
  };

  const countTotal = filteredItems.length;
  const openCount = quickFilterCounts.open;
  const cancelledCount = quickFilterCounts.cancelled;
  const errorCount = quickFilterCounts.error;
  const paidCount = searchScopedItems.filter((item) => getReceiptBusinessState(item).key === "paid").length;

  const revenueTodayCents = searchScopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    const businessState = getReceiptBusinessState(item);
    return isBetween(issued, todayStart, tomorrowStart) && businessState.key !== "cancelled" ? sum + Number(item.turnoverValueCents ?? 0) : sum;
  }, 0);

  const revenueWeekCents = searchScopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    const businessState = getReceiptBusinessState(item);
    return isBetween(issued, weekStart, weekEnd) && businessState.key !== "cancelled" ? sum + Number(item.turnoverValueCents ?? 0) : sum;
  }, 0);

  const revenueMonthCents = searchScopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    const businessState = getReceiptBusinessState(item);
    return isBetween(issued, monthStart, nextMonthStart) && businessState.key !== "cancelled" ? sum + Number(item.turnoverValueCents ?? 0) : sum;
  }, 0);

  const checkoutTenant = firstJoin(checkoutAppointment?.tenant);
  const checkoutPerson = firstJoin(checkoutAppointment?.person);
  const checkoutServiceLabel =
    String(checkoutAppointment?.service_name_snapshot ?? "").trim() ||
    readMetaLineValue(checkoutAppointment?.notes_internal, "Dienstleistung:") ||
    readMetaLineValue(checkoutAppointment?.notes_internal, "Titel:") ||
    "Termin";
  const checkoutPriceRaw = Number(String(readMetaLineValue(checkoutAppointment?.notes_internal, "Preis:") || "").replace(/[^\d,.-]/g, "").replace(",", "."));
  const checkoutPriceCents =
    typeof checkoutAppointment?.service_price_cents_snapshot === "number"
      ? checkoutAppointment.service_price_cents_snapshot
      : Number.isFinite(checkoutPriceRaw)
        ? Math.round(checkoutPriceRaw * 100)
        : null;
  const checkoutDurationMinutes =
    typeof checkoutAppointment?.service_duration_minutes_snapshot === "number"
      ? checkoutAppointment.service_duration_minutes_snapshot
      : Number(String(readMetaLineValue(checkoutAppointment?.notes_internal, "Dauer:")).replace(/[^\d]/g, "")) || null;
  const checkoutStatus = formatAppointmentStatusLabel(readMetaLineValue(checkoutAppointment?.notes_internal, "Status:"));
  const checkoutStatusNormalized = normalizeAppointmentStatus(readMetaLineValue(checkoutAppointment?.notes_internal, "Status:"));

  const salesOrderGrossTotal = createdSalesOrderLines.reduce((sum, line) => sum + Number(line.line_total_gross ?? 0), 0);
  const salesOrderDisplayTotal = typeof createdSalesOrder?.grand_total === "number" && createdSalesOrder.grand_total > 0
    ? createdSalesOrder.grand_total
    : salesOrderGrossTotal;

  const checkoutStage = createdReceipt || receiptId
    ? "receipt"
    : createdPayment || paymentId
      ? "payment"
      : createdSalesOrder || salesOrderId
        ? "sales_order"
        : appointmentId
          ? "appointment"
          : "list";

  const isCheckoutFlow = checkoutStage !== "list";
  const showCheckoutBuilder = Boolean(checkoutStage === "appointment" && checkoutAppointment);
  const showSalesOrderCard = Boolean(checkoutStage !== "list" && (createdSalesOrder || createdPayment || createdReceipt));
  const showCheckoutRecoveryHint = Boolean(
    isCheckoutFlow &&
    checkoutStage !== "appointment" &&
    !createdSalesOrder &&
    !createdPayment &&
    !createdReceipt
  );


  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8 text-white">
      
<section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-5 md:p-6 xl:p-8">
            <div className="md:hidden">
              <div
                className="overflow-visible rounded-[28px] border p-5 md:p-6"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex flex-col gap-6">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                      Clientique Backoffice
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                      Rechnungen
                    </h1>
                  </div>

                  <div className="md:hidden flex items-center justify-between gap-3">
                    <MobileReceiptFilterMenu
                      qRaw={qRaw}
                      currentFilter={currentFilter}
                      practitionerFilter={practitionerFilter}
                      counts={quickFilterCounts}
                    />

                    <Link
                      href="/calendar"
                      aria-label="Abrechnung starten"
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
                      style={{
                        color: "#0b0b0c",
                        background: "linear-gradient(180deg, rgba(214,195,163,0.96) 0%, rgba(214,195,163,0.88) 100%)",
                        borderColor: "rgba(214,195,163,0.28)",
                        boxShadow: "0 12px 28px rgba(214,195,163,0.22), 0 0 0 2px rgba(11,11,12,0.95)",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-[18px] w-[18px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </Link>

                    <MobileReceiptAvatarMenu
                      avatarOptions={avatarOptions}
                      practitionerFilter={practitionerFilter}
                      qRaw={qRaw}
                      currentFilter={currentFilter}
                    />
                  </div>

                  <div className="md:hidden flex flex-col gap-3">
                    <form action="/rechnungen" method="get" className="w-full">
                      {currentFilter !== "all" ? <input type="hidden" name="filter" value={currentFilter} /> : null}
                      {practitionerFilter !== "all" ? <input type="hidden" name="practitioner" value={practitionerFilter} /> : null}
                      <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                        <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          name="q"
                          defaultValue={qRaw}
                          placeholder="Belegnr., Kunde, Sales Order, Payment oder Status"
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                        />
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,640px)] xl:items-start">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                    Clientique Backoffice
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                    Rechnungen
                  </h1>

                  <div className="mt-5 pb-1">
                    <div className="flex items-start gap-3">
                      {avatarOptions.map((option) => {
                        const active = option.filterKey === practitionerFilter;
                        const ringColor = option.tenantId === "all" ? "rgba(255,255,255,0.55)" : avatarRingColor(option.label);
                        const chipLabel = option.tenantId === "all" ? "Alle" : firstNameLabel(option.label, "Behandler");
                        return (
                          <Link
                            key={`${option.userId}-${option.tenantId ?? "self"}`}
                            href={buildRechnungenHref({
                              qRaw,
                              filter: currentFilter,
                              practitioner: option.filterKey,
                              appointmentId,
                              salesOrder: salesOrderId,
                              payment: paymentId,
                              receipt: receiptId,
                            })}
                            className="flex shrink-0 flex-col items-center gap-2"
                            title={option.label}
                          >
                            <div
                              className="relative overflow-hidden rounded-full"
                              style={{
                                width: 56,
                                height: 56,
                                border: option.tenantId === "all" ? "4px solid rgba(255,255,255,0.55)" : `4px solid ${ringColor}`,
                                boxShadow: "0 12px 26px rgba(0,0,0,0.32)",
                                background: option.tenantId === "all" ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.04)",
                              }}
                            >
                              {option.tenantId === "all" ? (
                                <span className="flex h-full w-full items-center justify-center text-sm font-extrabold text-black">Alle</span>
                              ) : option.imageUrl ? (
                                <img src={option.imageUrl} alt={option.label} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[13px] font-extrabold text-white/90">
                                  {option.initials}
                                </div>
                              )}

                              {option.tenantId !== "all" ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 3,
                                    bottom: 3,
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    backgroundColor: ringColor,
                                    boxShadow: "0 0 0 2px rgba(0,0,0,0.65)",
                                  }}
                                />
                              ) : null}
                            </div>

                            <div
                              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                                active
                                  ? "border border-white bg-white text-black"
                                  : "border border-white/10 bg-black/25 text-white/90"
                              }`}
                              style={{ backdropFilter: "blur(8px)", lineHeight: 1 }}
                            >
                              {chipLabel}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex w-full max-w-[640px] flex-col gap-3 sm:flex-row">
                  <div className="flex w-full max-w-[640px] flex-col gap-3 sm:flex-row">
                    <form action="/rechnungen" method="get" className="flex-1">
                      {currentFilter !== "all" ? <input type="hidden" name="filter" value={currentFilter} /> : null}
                      {practitionerFilter !== "all" ? <input type="hidden" name="practitioner" value={practitionerFilter} /> : null}
                      <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                        <input
                          type="text"
                          name="q"
                          defaultValue={qRaw}
                          placeholder="Belegnr., Kunde, Sales Order, Payment oder Status"
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                        />
                      </div>
                    </form>

                    <Link href="/calendar" className="sm:shrink-0">
                      <div className="inline-flex h-11 w-full items-center justify-center rounded-[16px] border border-[var(--primary)] bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_12px_26px_rgba(214,195,163,0.18)] sm:w-auto whitespace-nowrap">
                        + Abrechnen
                      </div>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 md:flex-wrap">
                {[
                  ["all", "Alle", quickFilterCounts.all],
                  ["today", "Heute", quickFilterCounts.today],
                  ["week", "Woche", quickFilterCounts.week],
                  ["month", "Monat", quickFilterCounts.month],
                  ["open", "Offen", quickFilterCounts.open],
                  ["cancelled", "Storniert", quickFilterCounts.cancelled],
                  ["error", "Fehler", quickFilterCounts.error],
                ].map(([key, label, count]) => {
                  const active = currentFilter === key;
                  return (
                    <Link
                      key={String(key)}
                      href={buildRechnungenHref({
                        qRaw,
                        filter: String(key),
                        practitioner: practitionerFilter,
                        appointmentId,
                        salesOrder: salesOrderId,
                        payment: paymentId,
                        receipt: receiptId,
                      })}
                      className={statusLinkClass(active)}
                    >
                      <span>{label}</span>
                      <span className={statusCountClass(active)}>{count}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Umsatz heute"
                  value={euroFromCents(revenueTodayCents, "EUR")}
                  subtext="Direkt kassiert heute"
                />
                <SummaryCard
                  label="Umsatz Woche"
                  value={euroFromCents(revenueWeekCents, "EUR")}
                  subtext="Laufende Kalenderwoche"
                />
                <SummaryCard
                  label="Umsatz Monat"
                  value={euroFromCents(revenueMonthCents, "EUR")}
                  subtext="Aktueller Monat"
                />
                <SummaryCard
                  label="Offene Belege"
                  value={openCount}
                  subtext={`${cancelledCount} storniert · ${errorCount} mit Fehler · ${paidCount} bezahlt`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {successMessage ? <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{decodeURIComponent(successMessage)}</div> : null}
      {errorMessage ? <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{decodeURIComponent(errorMessage)}</div> : null}
      {showCheckoutRecoveryHint ? (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Der Checkout-Kontext ist noch da, aber die zugehörige Sales Order konnte nicht geladen werden. Der Builder bleibt absichtlich ausgeblendet, damit der Flow nicht zurückspringt. Nutze jetzt entweder <span className="font-semibold text-white">Checkout schließen</span> oder suche die Sales Order über die normale Rechnungsübersicht.
        </div>
      ) : null}
            {!isCheckoutFlow && (qRaw || currentFilter !== "all") ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <div className="text-white/75">
            {qRaw ? <>Suche aktiv für <span className="font-semibold text-white">{qRaw}</span></> : <>Filter aktiv: <span className="font-semibold text-white">{getQuickFilterLabel(currentFilter)}</span></>}
            <span className="ml-2 text-white/55">{countTotal} Treffer</span>
          </div>
          <Link href="/rechnungen" className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15">Zurücksetzen</Link>
        </div>
      ) : null}

      {showCheckoutBuilder ? (
        checkoutAppointment ? (
          <>
            <Card className="mt-6 border-emerald-400/20 bg-emerald-500/10">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Checkout aus Termin</div>
                    <div className="mt-2 text-2xl font-black text-white">{checkoutServiceLabel}</div>
                    <div className="mt-2 text-sm text-white/75">{checkoutPerson?.full_name || "Unbekannter Kunde"} · {checkoutTenant?.display_name || "Behandler"}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/65">
                      <span className="rounded-full border border-white/10 px-2.5 py-1">Termin: {formatDateTime(checkoutAppointment.start_at)}</span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1">Status: {checkoutStatus}</span>
                      {checkoutDurationMinutes ? <span className="rounded-full border border-white/10 px-2.5 py-1">Dauer: {checkoutDurationMinutes} Min</span> : null}
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">Betrag: {euroFromCents(checkoutPriceCents, "EUR")}</span>
                    </div>
                    <div className="mt-4 text-sm text-white/70">Jetzt wird aus dem Termin ein echter Verkaufsentwurf. Erst wenn die Positionen bestätigt sind, geht ihr im nächsten Schritt in Payment und danach in Fiscal.</div>
                  </div>
                  <div className="grid min-w-[260px] gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                    <div><div className="text-xs uppercase tracking-wide text-white/45">Schritt 2</div><div className="mt-1 font-semibold text-white">Sales Order aufbauen</div></div>
                    <div><div className="text-xs uppercase tracking-wide text-white/45">Danach</div><div className="mt-1">Payment erfassen → Fiscal erzeugen</div></div>
                    {checkoutStatusNormalized !== "completed" ? <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Achtung: Dieser Termin ist noch nicht auf „Gekommen“. Fachlich sollte er erst dann abgerechnet werden.</div> : null}
                    <div className="flex flex-wrap gap-2">
                      <Link href="/calendar" className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15">Zurück zum Kalender</Link>
                      <Link href="/rechnungen" className="inline-flex h-10 items-center rounded-xl border border-emerald-500/30 bg-emerald-600/80 px-4 text-sm font-semibold text-white hover:bg-emerald-600">Checkout schließen</Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 border-white/10 bg-white/[0.03]">
              <CardContent className="p-5">
                <div className="mb-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Checkout Builder</div>
                  <h2 className="mt-2 text-2xl font-black text-white">Sales Order aus Termin erstellen</h2>
                  <p className="mt-2 max-w-3xl text-sm text-white/60">Hier bestätigt ihr die Hauptposition aus dem Termin, könnt den Preis anpassen und bei Bedarf eine Zusatzleistung ergänzen. Genau das gehört in den Sales-Order-Schritt vor Payment/Fiscal.</p>
                </div>
                <form action={createSalesOrderFromAppointment} className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                  <input type="hidden" name="appointment_id" value={checkoutAppointment.id} />
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                      <div className="text-sm font-semibold text-white">Hauptposition aus Termin</div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2"><label className="text-sm font-medium text-white">Bezeichnung</label><input name="primary_name" defaultValue={checkoutServiceLabel} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" /></div>
                        <div><label className="text-sm font-medium text-white">Menge</label><input name="primary_quantity" type="number" min="1" step="1" defaultValue="1" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" /></div>
                        <div><label className="text-sm font-medium text-white">Steuer %</label><input name="primary_tax_rate" type="number" min="0" step="0.01" defaultValue="20" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" /></div>
                        <div><label className="text-sm font-medium text-white">Preis brutto (€)</label><input name="primary_price" defaultValue={moneyInputDefault(checkoutPriceCents)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" /></div>
                        <div><label className="text-sm font-medium text-white">Termininfo</label><div className="mt-1 flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/70">{formatDateTime(checkoutAppointment.start_at)}</div></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><div className="text-sm font-semibold text-white">Optionale Zusatzposition</div><div className="mt-1 text-xs text-white/50">Zum Beispiel Zusatzservice, Produkt oder Korrektur vor dem Payment.</div></div>
                        <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80"><input type="checkbox" name="add_extra_line" value="1" className="h-4 w-4" />Zusatz aktivieren</label>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2"><label className="text-sm font-medium text-white">Dienstleistung wählen</label><select name="extra_service_id" defaultValue="" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"><option value="">Keine Vorauswahl</option>{checkoutServices.map((service) => <option key={service.id} value={service.id}>{service.name ?? "Unbenannte Dienstleistung"}{typeof service.default_price_cents === "number" ? ` · ${euroFromCents(service.default_price_cents, "EUR")}` : ""}</option>)}</select></div>
                        <div className="md:col-span-2"><label className="text-sm font-medium text-white">Bezeichnung</label><input name="extra_name" placeholder="z. B. Zusatzpflege, Produktverkauf, Rabatt-Ausgleich" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" /></div>
                        <div><label className="text-sm font-medium text-white">Menge</label><input name="extra_quantity" type="number" min="1" step="1" defaultValue="1" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" /></div>
                        <div><label className="text-sm font-medium text-white">Steuer %</label><input name="extra_tax_rate" type="number" min="0" step="0.01" defaultValue="20" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" /></div>
                        <div className="md:col-span-2"><label className="text-sm font-medium text-white">Preis brutto (€)</label><input name="extra_price" placeholder="z. B. 19,00" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wide text-white/45">Preview</div><div className="mt-2 text-lg font-semibold text-white">Was jetzt erstellt wird</div><div className="mt-4 space-y-3 text-sm text-white/75"><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="font-medium text-white">1 × {checkoutServiceLabel}</div><div className="mt-1 text-white/60">Preis editierbar · Steuer standardmäßig 20%</div></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="font-medium text-white">Optional zweite Position</div><div className="mt-1 text-white/60">Zusatzleistung oder Produkt vor Payment ergänzen</div></div></div></div>
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Dieser Schritt erzeugt bewusst noch keinen Fiscal-Beleg. Erst Sales Order, dann Payment, dann Fiscal.</div>
                    <button type="submit" disabled={checkoutStatusNormalized !== "completed"} className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">Sales Order erstellen</button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="mt-6 border-amber-400/20 bg-amber-500/10"><CardContent className="p-5 text-sm text-amber-100">Der angeforderte Termin für den Checkout wurde nicht gefunden oder gehört nicht zu deinem Tenant.</CardContent></Card>
        )
      ) : null}

      {showSalesOrderCard && createdSalesOrder ? (
        <Card className="mt-6 border-sky-400/20 bg-sky-500/10">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">Sales Order erstellt</div>
                <div className="mt-2 text-2xl font-black text-white">{shortId(createdSalesOrder.id)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                  <span className="rounded-full border border-white/10 px-2.5 py-1">Status: {createdSalesOrder.status ?? "DRAFT"}</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1">Erstellt: {formatDateTime(createdSalesOrder.created_at)}</span>
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-sky-100">Summe: {euroFromGross(salesOrderDisplayTotal, createdSalesOrder.currency_code || "EUR")}</span>
                </div>
                <div className="mt-4 text-sm text-white/70">Die Verkaufsbasis steht jetzt. Als nächster Schritt kommt Payment — erst danach sollte Fiscal erzeugt werden.</div>
              </div>
              <div className="min-w-[280px] rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-wide text-white/45">Schritt 3</div><div className="mt-2 text-lg font-semibold text-white">Payment erfassen</div><div className="mt-2 text-sm text-white/65">Jetzt wird der Zahlungsvorgang an die Sales Order gehängt. Erst wenn Payment sauber da ist, geht es in Fiscal.</div></div>
            </div>

            {createdSalesOrderLines.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 text-left text-white/55"><tr><th className="px-4 py-3 font-semibold">Position</th><th className="px-4 py-3 font-semibold">Menge</th><th className="px-4 py-3 font-semibold">Einzelpreis</th><th className="px-4 py-3 font-semibold">Steuer</th><th className="px-4 py-3 font-semibold">Gesamt</th></tr></thead>
                  <tbody>
                    {createdSalesOrderLines.map((line) => (
                      <tr key={line.id} className="border-b border-white/5 last:border-b-0">
                        <td className="px-4 py-3 text-white">{line.name ?? "Position"}</td>
                        <td className="px-4 py-3 text-white/75">{line.quantity ?? 1}</td>
                        <td className="px-4 py-3 text-white/75">{euroFromGross(line.unit_price_gross, "EUR")}</td>
                        <td className="px-4 py-3 text-white/75">{typeof line.tax_rate === "number" ? `${line.tax_rate}%` : "—"}</td>
                        <td className="px-4 py-3 font-medium text-white">{euroFromGross(line.line_total_gross, "EUR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!createdPayment ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                <div className="mb-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Payment</div><div className="mt-2 text-xl font-black text-white">Zahlung für Sales Order erfassen</div><div className="mt-2 text-sm text-white/65">Wähle Zahlungsart und bestätige den Betrag. Das erzeugt bewusst nur das Payment — noch keinen Fiscal-Beleg.</div></div>
                <form action={createPaymentForSalesOrder} className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                  <input type="hidden" name="appointment_id" value={appointmentId} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><label className="text-sm font-medium text-white">Zahlungsart</label><select name="payment_method" defaultValue="CASH" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"><option value="CASH">Bar</option><option value="CARD">Karte</option><option value="TRANSFER">Überweisung</option></select></div>
                    <div><label className="text-sm font-medium text-white">Betrag (€)</label><input name="payment_amount" defaultValue={grossInputDefault(salesOrderDisplayTotal)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" /></div>
                    <div className="md:col-span-2"><label className="text-sm font-medium text-white">Interne Notiz</label><input name="payment_notes" placeholder="z. B. komplett kassiert an der Rezeption" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" /></div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75"><div className="text-xs uppercase tracking-wide text-white/45">Was jetzt passiert</div><div className="mt-2 font-semibold text-white">Payment wird an Sales Order gehängt</div><div className="mt-2 text-white/65">Bar und Überweisung bleiben vorerst Sofort-Flow. Karte läuft jetzt über PENDING → PROCESSING → COMPLETED.</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 px-2.5 py-1">Sales Order: {shortId(createdSalesOrder.id)}</span><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">Offen: {euroFromGross(salesOrderDisplayTotal, createdSalesOrder.currency_code || "EUR")}</span></div></div>
                    <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500">Zahlung erfassen</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Payment erfasst</div>
                  <div className="mt-2 text-2xl font-black text-white">{shortId(createdPayment.id)}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/75">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">Methode: {formatPaymentMethod(createdPayment.payment_method)}</span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">Status: {createdPayment.status ?? "COMPLETED"}</span>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">Betrag: {euroFromGross(createdPayment.amount, createdPayment.currency_code || "EUR")}</span>
                  </div>
                  <div className="mt-3 text-sm text-white/70">
                    {isCreatedCardPayment
                      ? "Kartenzahlung ist jetzt als eigener Checkout-Flow angeschlossen. Erst nach erfolgreichem Abschluss darf Fiscal erzeugt werden."
                      : "Zahlung wurde erfolgreich an die Sales Order gebunden. Damit ist der Checkout bis zum Payment sauber getrennt aufgebaut."}
                  </div>
                </div>

                {!createdReceipt ? (
                  isCreatedCardPayment ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-amber-200/80">Kartenzahlung</div>
                        <div className="mt-2 text-lg font-semibold text-white">Terminal-Flow simuliert</div>
                        <div className="mt-2 text-sm text-white/70">Bar und Überweisung bleiben direkt bezahlt. Karte läuft hier jetzt bewusst in mehreren Zuständen, bevor Fiscal erzeugt werden darf.</div>
                      </div>

                      {isCreatedPendingPayment ? (
                        <form action={startCardPaymentForCheckout} className="space-y-4">
                          <input type="hidden" name="appointment_id" value={appointmentId} />
                          <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                          <input type="hidden" name="payment_id" value={createdPayment.id} />
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                            <div className="text-xs uppercase tracking-wide text-white/45">Status</div>
                            <div className="mt-2 font-semibold text-white">Warte auf Start</div>
                            <div className="mt-2 text-white/65">Die Kartenzahlung wurde angelegt, aber noch nicht gestartet.</div>
                          </div>
                          <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-400">Kartenzahlung starten</button>
                        </form>
                      ) : null}

                      {isCreatedProcessingPayment ? (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                            <div className="text-xs uppercase tracking-wide text-white/45">Status</div>
                            <div className="mt-2 font-semibold text-white">Terminal läuft</div>
                            <div className="mt-2 text-white/65">Jetzt kannst du den simulierten Terminal-Ausgang wählen: erfolgreich, fehlgeschlagen oder abgebrochen.</div>
                          </div>
                          <div className="grid gap-3">
                            <form action={completeCardPaymentForCheckout}>
                              <input type="hidden" name="appointment_id" value={appointmentId} />
                              <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                              <input type="hidden" name="payment_id" value={createdPayment.id} />
                              <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500">Kartenzahlung erfolgreich abschließen</button>
                            </form>
                            <form action={failCardPaymentForCheckout}>
                              <input type="hidden" name="appointment_id" value={appointmentId} />
                              <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                              <input type="hidden" name="payment_id" value={createdPayment.id} />
                              <input type="hidden" name="reason" value="Terminalzahlung fehlgeschlagen" />
                              <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-red-500/30 bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">Als fehlgeschlagen markieren</button>
                            </form>
                            <form action={cancelCardPaymentForCheckout}>
                              <input type="hidden" name="appointment_id" value={appointmentId} />
                              <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                              <input type="hidden" name="payment_id" value={createdPayment.id} />
                              <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15">Kartenzahlung abbrechen</button>
                            </form>
                          </div>
                        </div>
                      ) : null}

                      {isCreatedFailedPayment ? (
                        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">Kartenzahlung ist fehlgeschlagen. Fiscal bleibt gesperrt.</div>
                      ) : null}

                      {isCreatedCancelledPayment ? (
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">Kartenzahlung wurde abgebrochen. Fiscal bleibt gesperrt.</div>
                      ) : null}

                      {isCreatedCompletedPayment ? (
                        <form action={createFiscalReceiptForPayment} className="space-y-4">
                          <input type="hidden" name="appointment_id" value={appointmentId} />
                          <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                          <input type="hidden" name="payment_id" value={createdPayment.id} />
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                            <div className="text-xs uppercase tracking-wide text-white/45">Nächster Schritt</div>
                            <div className="mt-2 font-semibold text-white">Fiscal Receipt erzeugen</div>
                            <div className="mt-2 text-white/65">Die Kartenzahlung ist erfolgreich abgeschlossen. Erst jetzt darf der Fiscal-Beleg erzeugt werden.</div>
                          </div>
                          <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-400">Fiscal Receipt erzeugen</button>
                        </form>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                      <div className="text-xs uppercase tracking-wide text-amber-200/80">Nächster Schritt</div>
                      <div className="mt-2 text-lg font-semibold text-white">Fiscal Receipt erzeugen</div>
                      <div className="mt-2 text-sm text-white/70">Jetzt wird aus Sales Order + Payment der Fiscal-Beleg erzeugt. Erst danach ist der Checkout fachlich komplett abgeschlossen.</div>
                      <form action={createFiscalReceiptForPayment} className="mt-4 space-y-4">
                        <input type="hidden" name="appointment_id" value={appointmentId} />
                        <input type="hidden" name="sales_order_id" value={createdSalesOrder.id} />
                        <input type="hidden" name="payment_id" value={createdPayment.id} />
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                          <div className="text-xs uppercase tracking-wide text-white/45">Was jetzt passiert</div>
                          <div className="mt-2 font-semibold text-white">Fiscal Receipt + Receipt-Zeilen</div>
                          <div className="mt-2 text-white/65">Der Beleg wird für die aktuelle Kassa erzeugt und die Zeilen aus der Sales Order übernommen.</div>
                        </div>
                        <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-400">
                          Fiscal Receipt erzeugen
                        </button>
                      </form>
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                    <div className="text-xs uppercase tracking-wide text-sky-200/80">Fiscal Receipt erzeugt</div>
                    <div className="mt-2 text-2xl font-black text-white">{createdReceipt.receipt_number ?? shortId(createdReceipt.id)}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/75">
                      <span className="rounded-full border border-white/10 px-2.5 py-1">Status: {createdReceipt.status ?? "CREATED"}</span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1">Signatur: {createdReceipt.signature_state ?? "—"}</span>
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-sky-100">Betrag: {euroFromCents(createdReceipt.turnover_value_cents, createdReceipt.currency_code || "EUR")}</span>
                    </div>
                    <div className="mt-3 text-sm text-white/70">Der Checkout ist jetzt bis Fiscal durchgelaufen. Als Nächstes könnt ihr die Receipt-Details prüfen.</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/rechnungen?${new URLSearchParams({
                        ...(qRaw ? { q: qRaw } : {}),
                        ...(appointmentId ? { appointmentId } : {}),
                        ...(createdSalesOrder?.id ? { salesOrder: createdSalesOrder.id } : {}),
                        ...(createdPayment?.id ? { payment: createdPayment.id } : {}),
                        receipt: createdReceipt.id,
                      }).toString()}`} className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15">
                        Receipt Details
                      </Link>
                      <Link href="/rechnungen" className="inline-flex h-10 items-center rounded-xl border border-sky-500/30 bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">
                        Checkout schließen
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isCheckoutFlow ? (
        <>
          <div className="mt-6 grid gap-3 md:hidden">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/45">Umsatz heute</div>
              <div className="mt-2 text-2xl font-bold text-white">{euroFromCents(revenueTodayCents, "EUR")}</div>
              <div className="mt-1 text-xs text-white/55">direkt kassiert heute</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/45">Umsatz Woche</div>
              <div className="mt-2 text-2xl font-bold text-white">{euroFromCents(revenueWeekCents, "EUR")}</div>
              <div className="mt-1 text-xs text-white/55">laufende Kalenderwoche</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/45">Umsatz Monat</div>
              <div className="mt-2 text-2xl font-bold text-white">{euroFromCents(revenueMonthCents, "EUR")}</div>
              <div className="mt-1 text-xs text-white/55">aktueller Monat</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/45">Offene Belege</div>
              <div className="mt-2 text-2xl font-bold text-white">{openCount}</div>
              <div className="mt-1 text-xs text-white/55">{cancelledCount} storniert · {errorCount} mit Fehler · {paidCount} bezahlt</div>
            </div>
          </div>

          {(qRaw || currentFilter !== "all") && filteredItems.length === 0 ? (

            <Card className="mt-6 border-white/10 bg-white/[0.03]">
              <CardContent className="p-5 text-sm text-white/70">
                Keine Treffer für diese Ansicht. Nutze eine andere Suche oder wechsle den Filter.
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-6 overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <CardContent className="p-0">
              <div className="border-b border-white/8 px-5 py-4 md:px-6">
                <div className="text-lg font-semibold text-[var(--text)]">Belegliste</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{filteredItems.length} Ergebnis(se)</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] table-auto text-sm">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="w-[14%] px-6 py-4 font-semibold text-left text-white/60">Beleg</th>
                      <th className="w-[30%] px-4 py-4 font-semibold text-left text-white/60">Kunde</th>
                      <th className="w-[22%] px-4 py-4 font-semibold text-left text-white/60">Erstellt</th>
                      <th className="w-[14%] px-4 py-4 font-semibold text-left text-white/60">Betrag</th>
                      <th className="w-[20%] px-6 py-4 font-semibold text-right text-white/60">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-white/45">Keine Fiscal-Receipts gefunden.</td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const businessState = getReceiptBusinessState(item);
                        const latestEventLabel = formatEventLabel(item.latestEventType, item.events[0]?.referenceData ?? null);
                        const latestEventTone = eventBadgeTone(item.latestEventType, item.events[0]?.referenceData ?? null);
                        const customerName = item.customerName?.trim() || "Unbekannt";
                        const providerBadge = providerBadgeMeta(item.providerName);
                        const detailParams = new URLSearchParams();
                        if (qRaw) detailParams.set("q", qRaw);
                        if (currentFilter !== "all") detailParams.set("filter", currentFilter);
                        if (practitionerFilter !== "all") detailParams.set("practitioner", practitionerFilter);
                        detailParams.set("receipt", item.id);

                        return (
                          <tr key={item.id} className="border-t border-white/8 transition hover:bg-white/[0.025]">
                            <td className="px-6 py-4 align-middle">
                              <div className="flex items-center gap-3">
                                <Link
                                  href={`/rechnungen?${detailParams.toString()}`}
                                  title="Details öffnen"
                                  aria-label="Details öffnen"
                                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </Link>

                                <div className="flex min-h-[52px] flex-col justify-center">
                                  <div className="font-semibold leading-none text-white">{item.receiptNumber}</div>
                                  {(() => {
                                    const stornoInfo = parseStornoInfoFromNotes(item.verificationNotes);
                                    const isStornoReceipt = Boolean(stornoInfo.originalReceiptNumber) || String(item.receiptType ?? "").toUpperCase() === "REVERSAL";
                                    if (isStornoReceipt) {
                                      return (
                                        <div className="mt-1.5 space-y-1">
                                          <span className="inline-flex h-6 items-center rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                                            Stornobeleg
                                          </span>
                                          {stornoInfo.originalReceiptNumber ? (
                                            <div className="text-[11px] text-white/50">zu {stornoInfo.originalReceiptNumber}</div>
                                          ) : null}
                                        </div>
                                      );
                                    }
                                    if (businessState.key === "cancelled") {
                                      return (
                                        <div className="mt-1.5 space-y-1">
                                          <span className="inline-flex h-6 items-center rounded-full border border-red-400/25 bg-red-500/10 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-200">
                                            Storniert
                                          </span>
                                          {stornoInfo.stornoReceiptNumber ? (
                                            <div className="text-[11px] text-white/50">durch {stornoInfo.stornoReceiptNumber}</div>
                                          ) : null}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 align-middle">
                              <div className="flex items-center gap-4">
                                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${providerBadge.className}`}>
                                  {providerBadge.initials}
                                </span>
                                <span className="truncate font-semibold text-white">{customerName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 align-middle text-white/75">{formatDateTime(item.createdAt)}</td>
                            <td className="px-6 py-4 align-middle font-medium text-white">{euroFromCents(item.turnoverValueCents, item.currencyCode)}</td>
                            <td className="px-6 py-4 text-right align-middle">
                              <div className="flex items-center justify-end gap-2">
                                <span title={businessState.label}>
                                  <Badge tone={businessState.tone}>
                                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="10" cy="10" r="7" />
                                      <path d="m7.5 10 1.6 1.6 3.4-3.7" />
                                    </svg>
                                  </Badge>
                                </span>
                                <span title={`Zahlung: ${formatPaymentStatus(item.paymentStatus)}`}>
                                  <Badge tone={toneForPaymentStatus(item.paymentStatus)}>
                                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <rect x="3.5" y="5.5" width="13" height="9" rx="2" />
                                      <path d="M3.5 8.5h13" />
                                    </svg>
                                  </Badge>
                                </span>
                                <span title={latestEventLabel}>
                                  <Badge tone={latestEventTone}>
                                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M10 5v5l3 2" />
                                      <circle cx="10" cy="10" r="7" />
                                    </svg>
                                  </Badge>
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <FiscalReceiptSlideover items={items} />
    </main>
  );
}
