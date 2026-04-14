import Link from "next/link";
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import FiscalReceiptSlideover from "@/components/rechnungen/FiscalReceiptSlideover";
import PendingReaderPaymentsCard from "./PendingReaderPaymentsCard";
import ClosingDateAutoSubmit from "@/components/rechnungen/ClosingDateAutoSubmit";
import RechnungenClosingSlideover from "@/components/rechnungen/RechnungenClosingSlideover";
import DashboardInvoiceSlideover from "@/components/dashboard/DashboardInvoiceSlideover";
import { backfillReadyFiscalReceipts, cancelCardPaymentForCheckout, completeCardPaymentForCheckout, createFiscalReceiptForPayment, createPaymentForSalesOrder, createSalesOrderFromAppointment, failCardPaymentForCheckout, startCardPaymentForCheckout } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  customerAddress?: string | null;
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


type PendingPaymentListItem = {
  id: string;
  tenantId: string | null;
  salesOrderId: string | null;
  appointmentId: string | null;
  customerName: string | null;
  providerName: string | null;
  amount: number | null;
  currencyCode: string | null;
  status: string | null;
  paymentMethodLabel: string | null;
  provider: string | null;
  providerTransactionId: string | null;
  createdAt: string | null;
};

type AvatarFilterOption = {
  tenantId: string | null;
  userId: string;
  label: string;
  imageUrl: string;
  initials: string;
  filterKey: string;
};

type ClosingSnapshotReceipt = {
  receiptNumber: string | null;
  issuedAt: string | null;
  customerName: string | null;
  paymentMethodLabel: string | null;
  amountCents: number;
  isStorno: boolean;
};

type ClosingGroupSummary = {
  key: string;
  tenantId: string | null;
  cashRegisterId: string | null;
  providerName: string | null;
  receiptCount: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  totalCents: number;
  stornoCount: number;
  stornoCents: number;
  latestIssuedAt: string | null;
  receipts: ClosingSnapshotReceipt[];
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

const BUSINESS_TIME_ZONE = "Europe/Vienna";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    timeZone: BUSINESS_TIME_ZONE,
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

function formatBusinessDateKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatBusinessMonthKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function formatBusinessYearKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

function formatMonthLabel(value: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "—";
  const [, year, month] = match;
  const monthIndex = Number(month) - 1;
  const date = new Date(Number(year), monthIndex, 1);
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(date);
}


function buildMonthOptions(anchorDate: string, count = 12) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDate ?? "").trim())
    ? new Date(`${anchorDate}T12:00:00`)
    : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const items: { key: string; label: string; closingDate: string }[] = [];

  for (let index = 0; index < count; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() - index, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    items.push({
      key: `${year}-${month}`,
      label: new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(date),
      closingDate: `${year}-${month}-01`,
    });
  }

  return items;
}

function buildYearOptions(anchorDate: string, count = 6) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDate ?? "").trim())
    ? new Date(`${anchorDate}T12:00:00`)
    : new Date();
  const startYear = base.getFullYear();
  return Array.from({ length: count }, (_, index) => {
    const year = String(startYear - index);
    return {
      key: year,
      label: year,
      closingDate: `${year}-01-01`,
    };
  });
}

function buildDashboardPrimaryButtonClass(fullWidth = false) {
  return [
    "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--primary)] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] shadow-[0_12px_26px_rgba(214,195,163,0.18)] transition hover:opacity-90",
    fullWidth ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDashboardSecondaryButtonClass(fullWidth = false) {
  return [
    "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] transition hover:bg-white/10",
    fullWidth ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function ClosingPeriodMenu({
  label,
  options,
}: {
  label: string;
  options: { href: string; label: string; isActive?: boolean }[];
}) {
  return (
    <details className="group relative w-full">
      <summary className={buildDashboardSecondaryButtonClass(true)}>
        <span className="truncate">{label}</span>
        <svg
          viewBox="0 0 20 20"
          className="ml-2 h-4 w-4 shrink-0 transition group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>

      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[18px] border border-white/10 bg-[#101114] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="hide-scrollbar max-h-64 overflow-auto space-y-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {options.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className={`flex items-center justify-between rounded-[14px] px-3 py-2 text-sm transition ${
                option.isActive ? "bg-white text-black" : "bg-white/[0.03] text-white hover:bg-white/[0.08]"
              }`}
            >
              <span className="truncate">{option.label}</span>
              {option.isActive ? (
                <span className="ml-3 text-[11px] font-semibold uppercase tracking-[0.12em]">Aktiv</span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}

function buildClosingGroups(items: SlideoverReceipt[]): ClosingGroupSummary[] {
  const groupsMap = new Map<string, ClosingGroupSummary>();

  for (const item of items) {
    const businessState = getReceiptBusinessState(item);
    const groupKey = `${String(item.tenantId ?? "").trim() || "no-tenant"}__${String(item.cashRegisterId ?? "").trim() || "no-register"}`;
    const existing = groupsMap.get(groupKey) ?? {
      key: groupKey,
      tenantId: item.tenantId ?? null,
      cashRegisterId: item.cashRegisterId ?? null,
      providerName: item.providerName ?? null,
      receiptCount: 0,
      cashCents: 0,
      cardCents: 0,
      transferCents: 0,
      totalCents: 0,
      stornoCount: 0,
      stornoCents: 0,
      latestIssuedAt: item.issuedAt ?? item.createdAt ?? null,
      receipts: [],
    };

    const turnover = Number(item.turnoverValueCents ?? 0) || 0;
    const normalizedPaymentStatus = String(item.paymentStatus ?? "").trim().toUpperCase();
    const receiptEntry: ClosingSnapshotReceipt = {
      receiptNumber: item.receiptNumber ?? null,
      issuedAt: item.issuedAt ?? item.createdAt ?? null,
      customerName: item.customerName ?? null,
      paymentMethodLabel: item.paymentMethodLabel ?? null,
      amountCents: Math.abs(turnover),
      isStorno: businessState.key === "cancelled",
    };

    if (businessState.key === "cancelled") {
      existing.stornoCount += 1;
      existing.stornoCents += Math.abs(turnover);
      existing.receipts.push(receiptEntry);
    } else if (businessState.key !== "error" && normalizedPaymentStatus === "COMPLETED") {
      existing.receiptCount += 1;
      existing.totalCents += turnover;
      const paymentMethod = normalizeClosingPaymentMethod(item.paymentMethodLabel);
      if (paymentMethod === "CASH") existing.cashCents += turnover;
      else if (paymentMethod === "CARD") existing.cardCents += turnover;
      else if (paymentMethod === "TRANSFER") existing.transferCents += turnover;
      existing.receipts.push(receiptEntry);
    }

    const latestCandidate = item.issuedAt ?? item.createdAt ?? null;
    if (latestCandidate && (!existing.latestIssuedAt || latestCandidate > existing.latestIssuedAt)) {
      existing.latestIssuedAt = latestCandidate;
    }

    groupsMap.set(groupKey, existing);
  }

  return Array.from(groupsMap.values()).sort((a, b) => {
    const aName = String(a.providerName ?? "").trim();
    const bName = String(b.providerName ?? "").trim();
    return aName.localeCompare(bName, "de", { sensitivity: "base" });
  });
}

function buildClosingTotals(groups: ClosingGroupSummary[]) {
  return groups.reduce(
    (sum, group) => ({
      receiptCount: sum.receiptCount + group.receiptCount,
      cashCents: sum.cashCents + group.cashCents,
      cardCents: sum.cardCents + group.cardCents,
      transferCents: sum.transferCents + group.transferCents,
      totalCents: sum.totalCents + group.totalCents,
      stornoCount: sum.stornoCount + group.stornoCount,
      stornoCents: sum.stornoCents + group.stornoCents,
    }),
    {
      receiptCount: 0,
      cashCents: 0,
      cardCents: 0,
      transferCents: 0,
      totalCents: 0,
      stornoCount: 0,
      stornoCents: 0,
    }
  );
}

function normalizeClosingPaymentMethod(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "BAR" || normalized === "CASH") return "CASH" as const;
  if (normalized === "KARTE" || normalized === "CARD") return "CARD" as const;
  if (normalized === "ÜBERWEISUNG" || normalized === "UEBERWEISUNG" || normalized === "TRANSFER") return "TRANSFER" as const;
  return "OTHER" as const;
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




function getReceiptSearchNameHaystack(item: SlideoverReceipt) {
  return [item.customerName]
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function getReceiptSearchGeneralHaystack(item: SlideoverReceipt) {
  const latestEventLabel = formatEventLabel(item.latestEventType, item.events[0]?.referenceData ?? null);

  return [
    item.receiptNumber,
    item.customerName,
    item.customerEmail,
    item.customerPhone,
    item.customerAddress,
    item.paymentId,
    item.paymentMethodLabel,
    item.paymentStatus,
    item.status,
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

  const terms = normalized.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const looksLikeCustomerNameSearch = /^[\p{L}\s'-]+$/u.test(normalized);

  if (looksLikeCustomerNameSearch) {
    const nameHaystack = getReceiptSearchNameHaystack(item);
    return terms.every((term) => nameHaystack.includes(term));
  }

  const haystack = getReceiptSearchGeneralHaystack(item);
  return terms.every((term) => haystack.includes(term));
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
  closingDate,
  closingPanel,
  receipt,
  appointmentId,
  salesOrder,
  payment,
}: {
  qRaw?: string;
  filter?: string;
  practitioner?: string;
  closingDate?: string;
  closingPanel?: string;
  receipt?: string;
  appointmentId?: string;
  salesOrder?: string;
  payment?: string;
}) {
  const params = new URLSearchParams();
  if (qRaw?.trim()) params.set("q", qRaw.trim());
  if (filter && filter !== "all") params.set("filter", filter);
  if (practitioner && practitioner !== "all") params.set("practitioner", practitioner);
  if (closingDate?.trim()) params.set("closingDate", closingDate.trim());
  if (closingPanel?.trim()) params.set("closingPanel", closingPanel.trim());
  if (receipt) params.set("receipt", receipt);
  if (appointmentId) params.set("appointmentId", appointmentId);
  if (salesOrder) params.set("salesOrder", salesOrder);
  if (payment) params.set("payment", payment);
  const query = params.toString();
  return query ? `/rechnungen?${query}` : "/rechnungen";
}

function buildInvoiceSlideoverHref({
  qRaw,
  filter,
  practitioner,
  closingDate,
}: {
  qRaw?: string;
  filter?: string;
  practitioner?: string;
  closingDate?: string;
}) {
  const params = new URLSearchParams();
  if (qRaw?.trim()) params.set("q", qRaw.trim());
  if (filter && filter !== "all") params.set("filter", filter);
  if (practitioner && practitioner !== "all") params.set("practitioner", practitioner);
  if (closingDate?.trim()) params.set("closingDate", closingDate.trim());
  params.set("invoice", "1");
  const query = params.toString();
  return query ? `/rechnungen?${query}` : "/rechnungen?invoice=1";
}

function ClosingPdfButton({
  periodType,
  mode,
  practitioner,
  closingDate,
  generatedByName,
  generatedAt,
  snapshot,
  label,
  className,
}: {
  periodType: "day" | "month" | "year";
  mode: "all" | "single";
  practitioner: string;
  closingDate: string;
  generatedByName: string;
  generatedAt: string;
  snapshot: Record<string, unknown>;
  label: string;
  className: string;
}) {
  return (
    <form
      action="/api/rechnungen/daily-closing-pdf"
      method="post"
      target="_blank"
      className="w-full"
    >
      <input type="hidden" name="periodType" value={periodType} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="practitioner" value={practitioner} />
      <input type="hidden" name="closingDate" value={closingDate} />
      <input type="hidden" name="generatedByName" value={generatedByName} />
      <input type="hidden" name="generatedAt" value={generatedAt} />
      <input type="hidden" name="snapshot" value={JSON.stringify(snapshot)} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}

function MobileReceiptFilterMenu({
  qRaw,
  currentFilter,
  practitionerFilter,
  closingDate,
  counts,
}: {
  qRaw: string;
  currentFilter: string;
  practitionerFilter: string;
  closingDate: string;
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
                href={buildRechnungenHref({ qRaw, filter: item.key, practitioner: practitionerFilter, closingDate })}
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
  closingDate,
}: {
  avatarOptions: AvatarFilterOption[];
  practitionerFilter: string;
  qRaw: string;
  currentFilter: string;
  closingDate: string;
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
                  closingDate,
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






function DesktopReceiptAvatarCompactMenu({
  avatarOptions,
  practitionerFilter,
  qRaw,
  currentFilter,
  closingDate,
  appointmentId,
  salesOrderId,
  paymentId,
  receiptId,
}: {
  avatarOptions: AvatarFilterOption[];
  practitionerFilter: string;
  qRaw: string;
  currentFilter: string;
  closingDate: string;
  appointmentId: string;
  salesOrderId: string;
  paymentId: string;
  receiptId: string;
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
    <div id="desktop-rechnungen-avatar-compact">
      <button
        type="button"
        popoverTarget="desktop-rechnungen-avatar-menu"
        popoverTargetAction="toggle"
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        aria-label="Behandler auswählen"
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[37px] w-[37px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
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
        id="desktop-rechnungen-avatar-menu"
        popover="auto"
        className="fixed right-28 top-[230px] z-[2147483647] m-0 w-[320px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl"
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
                key={`desktop-avatar-${option.userId}-${option.tenantId ?? "self"}`}
                href={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: option.filterKey,
                  closingDate,
                  appointmentId,
                  salesOrder: salesOrderId,
                  payment: paymentId,
                  receipt: receiptId,
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
    </div>
  );
}


function CompactClosingCard({
  eyebrow,
  title,
  periodLabel,
  totalLabel,
  receiptCount,
  stornoCount,
  actionHref,
  actionLabel,
  control,
  controlLabel,
}: {
  eyebrow: string;
  title?: string;
  periodLabel: string;
  totalLabel: string;
  receiptCount: number;
  stornoCount: number;
  actionHref: string;
  actionLabel: string;
  control?: ReactNode;
  controlLabel?: string;
}) {
  return (
    <div className="h-full rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 sm:p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">{eyebrow}</div>
          {title ? <div className="mt-2 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[24px]">{title}</div> : null}
          <div className={`${title ? "mt-2" : "mt-3"} text-sm text-[var(--text-muted)]`}>{periodLabel}</div>
        </div>

        <div className="flex-1">
          {control ? (
            <div className="mb-4">
              {controlLabel ? <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-white/45">{controlLabel}</div> : null}
              {control}
            </div>
          ) : (
            <div className="mb-4 h-10" />
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-2 sm:px-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Gesamt</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight text-white sm:text-[10px]">{totalLabel}</div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-2 sm:px-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Belege</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight text-white sm:text-[10px]">{receiptCount}</div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-2 sm:px-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Stornos</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight text-white sm:text-[10px]">{stornoCount}</div>
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <Link href={actionHref} className={buildDashboardPrimaryButtonClass(true)}>
            {actionLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}


function MobileClosingAccordion({
  eyebrow,
  periodLabel,
  totalLabel,
  receiptCount,
  stornoCount,
  actionHref,
  actionLabel,
  control,
  controlLabel,
}: {
  eyebrow: string;
  periodLabel: string;
  totalLabel: string;
  receiptCount: number;
  stornoCount: number;
  actionHref: string;
  actionLabel: string;
  control?: ReactNode;
  controlLabel?: string;
}) {
  return (
    <details className="group rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 md:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">{eyebrow}</div>
          <div className="mt-2 text-sm text-[var(--text-muted)]">{periodLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Gesamt</div>
            <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{totalLabel}</div>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition group-open:rotate-180">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </span>
        </div>
      </summary>

      <div className="mt-4">
        <CompactClosingCard
          eyebrow={eyebrow}
          title=""
          periodLabel={periodLabel}
          totalLabel={totalLabel}
          receiptCount={receiptCount}
          stornoCount={stornoCount}
          actionHref={actionHref}
          actionLabel={actionLabel}
          control={control}
          controlLabel={controlLabel}
        />
      </div>
    </details>
  );
}


export default async function RechnungenPage({
  searchParams,
}: {
  searchParams?:
    | Promise<{ q?: string; filter?: string; practitioner?: string; closingDate?: string; closingPanel?: string; receipt?: string; appointmentId?: string; salesOrder?: string; payment?: string; success?: string; error?: string }>
    | { q?: string; filter?: string; practitioner?: string; closingDate?: string; closingPanel?: string; receipt?: string; appointmentId?: string; salesOrder?: string; payment?: string; success?: string; error?: string };
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
  const todayDateKey = formatBusinessDateKey(new Date());
  const requestedClosingDate = String((sp as any)?.closingDate ?? "").trim();
  const closingDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedClosingDate) ? requestedClosingDate : todayDateKey;
  const closingPanel = ["day", "month", "year"].includes(String((sp as any)?.closingPanel ?? "").trim().toLowerCase())
    ? (String((sp as any)?.closingPanel ?? "").trim().toLowerCase() as "day" | "month" | "year")
    : "";
  const readyForFiscalReturnQuery = (() => {
    const params = new URLSearchParams();
    if (qRaw) params.set("q", qRaw);
    if (currentFilter && currentFilter !== "all") params.set("filter", currentFilter);
    if (practitionerFilter && practitionerFilter !== "all") params.set("practitioner", practitionerFilter);
    if (closingDate) params.set("closingDate", closingDate);
    return params.toString();
  })();

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

  const invoiceTenantIds = Array.from(
    new Set(
      (isAdmin
        ? Array.from(tenantNameById.keys())
        : [String(profile?.tenant_id ?? profile?.calendar_tenant_id ?? effectiveTenantId ?? "").trim()]
      ).filter(Boolean)
    )
  );

  let invoiceTenantRows: Array<{ id: string; display_name: string | null }> = [];
  if (invoiceTenantIds.length > 0) {
    const { data } = await admin
      .from("tenants")
      .select("id, display_name")
      .in("id", invoiceTenantIds)
      .order("display_name", { ascending: true });
    invoiceTenantRows = (data ?? []) as Array<{ id: string; display_name: string | null }>;
  }

  const { data: invoiceServiceRowsRaw } = await admin
    .from("services")
    .select("id, tenant_id, name, default_price_cents, is_active")
    .in("tenant_id", invoiceTenantIds.length > 0 ? invoiceTenantIds : ["__none__"])
    .eq("is_active", true)
    .order("name", { ascending: true });

  const invoiceServiceRows = (invoiceServiceRowsRaw ?? []) as Array<{
    id: string;
    tenant_id: string | null;
    name: string | null;
    default_price_cents: number | null;
    is_active: boolean | null;
  }>;

  let invoiceCustomersQuery = admin
    .from("customer_profiles")
    .select("id, tenant_id, person:persons ( full_name, phone, email )")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!isAdmin && invoiceTenantIds.length > 0) {
    invoiceCustomersQuery = invoiceCustomersQuery.in("tenant_id", invoiceTenantIds);
  }

  const { data: invoiceCustomerRowsRaw } = await invoiceCustomersQuery;
  const dashboardCustomers = ((invoiceCustomerRowsRaw ?? []) as Array<{
    id: string;
    tenant_id: string | null;
    person:
      | { full_name: string | null; phone: string | null; email: string | null }
      | { full_name: string | null; phone: string | null; email: string | null }[]
      | null;
  }>)
    .map((row) => {
      const person = firstJoin(row.person);
      const displayName = String(person?.full_name ?? "").trim();
      if (!displayName) return null;
      return {
        id: row.id,
        tenantId: String(row.tenant_id ?? "").trim(),
        displayName,
        phone: String(person?.phone ?? "").trim() || null,
        email: String(person?.email ?? "").trim() || null,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      tenantId: string;
      displayName: string;
      phone: string | null;
      email: string | null;
    }>;

  const invoiceSelectedTenantId =
    String(profile?.tenant_id ?? profile?.calendar_tenant_id ?? effectiveTenantId ?? "").trim() ||
    invoiceTenantRows[0]?.id ||
    "";
  const invoiceCurrentTenantName =
    invoiceTenantRows.find((tenant) => tenant.id === invoiceSelectedTenantId)?.display_name ??
    avatarOptions[0]?.label ??
    "Behandler";

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
    .limit(q ? 600 : 150);

  if (!isAdmin && effectiveTenantId) receiptsQuery = receiptsQuery.eq("tenant_id", effectiveTenantId);
    const sanitizedQuery = escapeIlikeValue(qRaw);
  // Suche wird bewusst erst nach dem Enrichment im Speicher gemacht,
  // damit auch Kunde/Behandler-Namen wie "Radu Craus" Treffer liefern.
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

  const pendingStatusCodes = ["PENDING", "PROCESSING", "FAILED", "CANCELLED", "COMPLETED"];
  let pendingPaymentsQuery = admin
    .from("payments")
    .select(`
      id, tenant_id, sales_order_id, payment_method_id, amount, currency_code,
      status, paid_at, created_at, provider, provider_transaction_id,
      payment_method:payment_methods ( id, code, name )
    `)
    .in("status", pendingStatusCodes)
    .order("created_at", { ascending: false })
    .limit(q ? 300 : 120);

  if (!isAdmin && effectiveTenantId) pendingPaymentsQuery = pendingPaymentsQuery.eq("tenant_id", effectiveTenantId);
  if (sanitizedQuery) {
    const pendingOrParts = [
      `id.ilike.%${sanitizedQuery}%`,
      `sales_order_id.ilike.%${sanitizedQuery}%`,
      `provider_transaction_id.ilike.%${sanitizedQuery}%`,
    ];
    const upperQuery = sanitizedQuery.toUpperCase();
    if (pendingStatusCodes.includes(upperQuery)) {
      pendingOrParts.push(`status.eq.${upperQuery}`);
    }
    pendingPaymentsQuery = pendingPaymentsQuery.or(pendingOrParts.join(","));
  }

  const { data: pendingPaymentsRaw } = await pendingPaymentsQuery;

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
  const customerProfileById = new Map<string, { customerName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null }>();
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
        customerAddress: null,
      });
    }
  }


  const pendingPaymentRows = (pendingPaymentsRaw ?? []) as Array<
    PaymentRow & { provider?: string | null; provider_transaction_id?: string | null }
  >;
  const pendingPaymentIds = pendingPaymentRows.map((row) => String(row.id ?? "").trim()).filter(Boolean);
  const pendingPaymentReceiptIds = new Set<string>();
  if (pendingPaymentIds.length > 0) {
    const { data: pendingReceiptRows } = await admin
      .from("fiscal_receipts")
      .select("payment_id")
      .in("payment_id", pendingPaymentIds);

    for (const row of (pendingReceiptRows ?? []) as Array<{ payment_id: string | null }>) {
      const pid = String(row.payment_id ?? "").trim();
      if (pid) pendingPaymentReceiptIds.add(pid);
    }
  }

  const visiblePendingPaymentRows = pendingPaymentRows.filter((row) => !pendingPaymentReceiptIds.has(String(row.id ?? "").trim()));

  const pendingSalesOrderIds = Array.from(
    new Set(visiblePendingPaymentRows.map((row) => String(row.sales_order_id ?? "").trim()).filter(Boolean))
  );
  const pendingSalesOrderCustomerIdBySalesOrderId = new Map<string, string>();
  const pendingTenantIdBySalesOrderId = new Map<string, string>();
  const pendingAppointmentIdBySalesOrderId = new Map<string, string>();

  if (pendingSalesOrderIds.length > 0) {
    const { data: pendingSalesOrderRows } = await admin
      .from("sales_orders")
      .select("id, customer_id, tenant_id, appointment_id")
      .in("id", pendingSalesOrderIds);

    for (const row of (pendingSalesOrderRows ?? []) as Array<{ id: string; customer_id: string | null; tenant_id: string | null; appointment_id: string | null }>) {
      const soId = String(row.id ?? "").trim();
      if (!soId) continue;
      const customerId = String(row.customer_id ?? "").trim();
      const tenantId = String(row.tenant_id ?? "").trim();
      const appointmentId = String(row.appointment_id ?? "").trim();
      if (customerId) pendingSalesOrderCustomerIdBySalesOrderId.set(soId, customerId);
      if (tenantId) pendingTenantIdBySalesOrderId.set(soId, tenantId);
      if (appointmentId) pendingAppointmentIdBySalesOrderId.set(soId, appointmentId);
    }
  }

  const pendingCustomerProfileIds = Array.from(
    new Set(Array.from(pendingSalesOrderCustomerIdBySalesOrderId.values()).filter(Boolean))
  );
  const pendingCustomerProfileById = new Map<string, { customerName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null }>();

  if (pendingCustomerProfileIds.length > 0) {
    const { data: pendingCustomerProfiles } = await admin
      .from("customer_profiles")
      .select(`id, person:persons ( full_name, phone, email )`)
      .in("id", pendingCustomerProfileIds);

    for (const profile of (pendingCustomerProfiles ?? []) as Array<{ id: string; person: { full_name: string | null; phone: string | null; email: string | null } | { full_name: string | null; phone: string | null; email: string | null }[] | null }>) {
      const personJoin = firstJoin(profile.person);
      pendingCustomerProfileById.set(String(profile.id), {
        customerName: String(personJoin?.full_name ?? "").trim() || null,
        customerPhone: String(personJoin?.phone ?? "").trim() || null,
        customerEmail: String(personJoin?.email ?? "").trim() || null,
        customerAddress: null,
      });
    }
  }

  const pendingPaymentItems: PendingPaymentListItem[] = visiblePendingPaymentRows
    .map((row) => {
      const salesOrderId = String(row.sales_order_id ?? "").trim() || null;
      const customerProfileId = salesOrderId ? pendingSalesOrderCustomerIdBySalesOrderId.get(salesOrderId) ?? null : null;
      const tenantId = String(row.tenant_id ?? "").trim() || pendingTenantIdBySalesOrderId.get(salesOrderId ?? "") || null;
      const providerName =
        tenantNameById.get(String(tenantId ?? "").trim()) ||
        avatarOptions.find((option) => String(option.tenantId ?? "").trim() === String(tenantId ?? "").trim())?.label ||
        null;
      const customerProfile = customerProfileId ? pendingCustomerProfileById.get(customerProfileId) ?? null : null;
      return {
        id: String(row.id),
        tenantId: tenantId ? String(tenantId) : null,
        salesOrderId,
        appointmentId: salesOrderId ? pendingAppointmentIdBySalesOrderId.get(salesOrderId) ?? null : null,
        customerName: customerProfile?.customerName ?? null,
        providerName,
        amount: row.amount,
        currencyCode: row.currency_code,
        status: row.status,
        paymentMethodLabel: formatPaymentMethod(row.payment_method),
        provider: String((row as any).provider ?? "").trim() || null,
        providerTransactionId: String((row as any).provider_transaction_id ?? "").trim() || null,
        createdAt: row.created_at,
      } satisfies PendingPaymentListItem;
    })
    .filter((item) =>
      practitionerFilter === "all"
        ? true
        : normalizePractitionerKey(item.providerName) === practitionerFilter
    );

  const readerPendingPaymentItems = pendingPaymentItems.filter((item) => {
    const normalizedStatus = String(item.status ?? "").trim().toUpperCase();
    return normalizedStatus === "PENDING" || normalizedStatus === "PROCESSING" || normalizedStatus === "FAILED" || normalizedStatus === "CANCELLED";
  });

  const readyForFiscalPaymentItems = pendingPaymentItems.filter((item) => {
    const normalizedStatus = String(item.status ?? "").trim().toUpperCase();
    return normalizedStatus === "COMPLETED";
  });
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
    const customerAddress =
      readFirstString(payload, [
        ["customer_address"],
        ["address"],
        ["customer", "address"],
        ["customer", "street"],
        ["customer", "full_address"],
        ["billing_address"],
      ]) ||
      customerProfile?.customerAddress ||
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
      customerAddress,
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

  const pendingStripeCount = readerPendingPaymentItems.filter((item) => String(item.status ?? "").trim().toUpperCase() === "PENDING").length;
  const processingStripeCount = readerPendingPaymentItems.filter((item) => String(item.status ?? "").trim().toUpperCase() === "PROCESSING").length;
  const readyForFiscalCount = readyForFiscalPaymentItems.length;

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

  const closingMonth = formatBusinessMonthKey(closingDate);
  const closingYear = formatBusinessYearKey(closingDate);

  const dailyClosingItems = practitionerScopedItems.filter((item) => formatBusinessDateKey(item.issuedAt ?? item.createdAt) === closingDate);
  const monthlyClosingItems = practitionerScopedItems.filter((item) => formatBusinessMonthKey(item.issuedAt ?? item.createdAt) === closingMonth);
  const yearlyClosingItems = practitionerScopedItems.filter((item) => formatBusinessYearKey(item.issuedAt ?? item.createdAt) === closingYear);

  const dailyClosingGroups = buildClosingGroups(dailyClosingItems);
  const monthlyClosingGroups = buildClosingGroups(monthlyClosingItems);
  const yearlyClosingGroups = buildClosingGroups(yearlyClosingItems);

  const dailyClosingTotals = buildClosingTotals(dailyClosingGroups);
  const monthlyClosingTotals = buildClosingTotals(monthlyClosingGroups);
  const yearlyClosingTotals = buildClosingTotals(yearlyClosingGroups);

  const generatedAtIso = new Date().toISOString();
  const generatedByName = String(profile?.full_name ?? "").trim() || user.email || "Unbekannt";

  const monthOptions = buildMonthOptions(closingDate).map((option) => ({
    ...option,
    href: buildRechnungenHref({
      qRaw,
      filter: currentFilter,
      practitioner: practitionerFilter,
      closingDate: option.closingDate,
    }),
    isActive: option.key === closingMonth,
  }));

  const yearOptions = buildYearOptions(closingDate).map((option) => ({
    ...option,
    href: buildRechnungenHref({
      qRaw,
      filter: currentFilter,
      practitioner: practitionerFilter,
      closingDate: option.closingDate,
    }),
    isActive: option.key === closingYear,
  }));


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

  const desktopSearchHasActiveQuery = !isCheckoutFlow && Boolean(qRaw);
  const desktopSearchPreviewItems = filteredItems.slice(0, 6);

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
                      Magnifique Beauty Institut Backoffice
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
                      closingDate={closingDate}
                      counts={quickFilterCounts}
                    />

                    <Link
                      href={buildInvoiceSlideoverHref({
                        qRaw,
                        filter: currentFilter,
                        practitioner: practitionerFilter,
                        closingDate,
                      })}
                      aria-label="Rechnung erstellen"
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
                      closingDate={closingDate}
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
                          placeholder="Belegnummer, Kundenname, Kundenmail, Kundentelefonnummer, Kundenadresse, Payment oder Status"
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                        />
                        {qRaw ? (
                          <Link
                            href={buildRechnungenHref({
                              filter: currentFilter,
                              practitioner: practitionerFilter,
                              closingDate,
                            })}
                            aria-label="Suche löschen"
                            className="ml-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path d="M6 6l12 12" />
                              <path d="M18 6 6 18" />
                            </svg>
                          </Link>
                        ) : null}
                      </div>
                    </form>
                  </div>

                  <div className="md:hidden grid grid-cols-3 gap-2">
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Heute</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{euroFromCents(revenueTodayCents, "EUR")}</div>
                    </div>

                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Woche</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{euroFromCents(revenueWeekCents, "EUR")}</div>
                    </div>

                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Monat</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{euroFromCents(revenueMonthCents, "EUR")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div id="desktop-rechnungen-header" className="relative pr-[360px] xl:pr-[640px]">
                <div className="absolute right-0 top-0 z-30 flex items-start justify-end gap-3">
                  <div id="desktop-rechnungen-avatar-strip" className="max-w-[640px] overflow-hidden">
                    <div className="max-w-full overflow-x-auto">
                      <div className="min-w-max">
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
                                  closingDate,
                                  appointmentId,
                                  salesOrder: salesOrderId,
                                  payment: paymentId,
                                  receipt: receiptId,
                                })}
                                className="flex shrink-0 flex-col items-center gap-1.5"
                                title={option.label}
                              >
                                <div
                                  className="relative overflow-hidden rounded-full"
                                  style={{
                                    width: 44,
                                    height: 44,
                                    border: option.tenantId === "all" ? "3px solid rgba(255,255,255,0.55)" : `3px solid ${ringColor}`,
                                    boxShadow: "0 10px 22px rgba(0,0,0,0.28)",
                                    background: option.tenantId === "all" ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.04)",
                                  }}
                                >
                                  {option.tenantId === "all" ? (
                                    <span className="flex h-full w-full items-center justify-center text-[11px] font-extrabold text-black">Alle</span>
                                  ) : option.imageUrl ? (
                                    <img src={option.imageUrl} alt={option.label} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[11px] font-extrabold text-white/90">
                                      {option.initials}
                                    </div>
                                  )}

                                  {option.tenantId !== "all" ? (
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: 2,
                                        bottom: 2,
                                        width: 8,
                                        height: 8,
                                        borderRadius: 999,
                                        backgroundColor: ringColor,
                                        boxShadow: "0 0 0 2px rgba(0,0,0,0.65)",
                                      }}
                                    />
                                  ) : null}
                                </div>

                                <div
                                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
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
                  </div>

                  <DesktopReceiptAvatarCompactMenu
                    avatarOptions={avatarOptions}
                    practitionerFilter={practitionerFilter}
                    qRaw={qRaw}
                    currentFilter={currentFilter}
                    closingDate={closingDate}
                    appointmentId={appointmentId}
                    salesOrderId={salesOrderId}
                    paymentId={paymentId}
                    receiptId={receiptId}
                  />

                  <div id="desktop-rechnungen-search-wrap" className="relative">
                    <button
                      id="desktop-rechnungen-search-toggle"
                      type="button"
                      aria-label="Suche öffnen"
                      title="Suche"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.08]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </button>

                    <div
                      id="desktop-rechnungen-search-stack"
                      className={`${desktopSearchHasActiveQuery ? "pointer-events-auto opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 translate-y-1 scale-95"} absolute right-0 top-[calc(100%+28px)] z-20 transition duration-200`}
                      style={{ width: "420px", maxWidth: "620px" }}
                      aria-hidden={desktopSearchHasActiveQuery ? "false" : "true"}
                    >
                      <div
                        id="desktop-rechnungen-search-panel"
                        className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                      >
                        <form id="desktop-rechnungen-search-form" action="/rechnungen" method="get" className="w-full">
                          {currentFilter !== "all" ? <input type="hidden" name="filter" value={currentFilter} /> : null}
                          {practitionerFilter !== "all" ? <input type="hidden" name="practitioner" value={practitionerFilter} /> : null}
                          {closingDate ? <input type="hidden" name="closingDate" value={closingDate} /> : null}
                          <div className="flex h-12 items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                            <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                              </svg>
                            </span>
                            <input
                              id="desktop-rechnungen-search-input"
                              type="text"
                              name="q"
                              defaultValue={qRaw}
                              placeholder="Belegnummer, Kundenname, Kundenmail, Kundentelefonnummer, Kundenadresse, Payment oder Status"
                              autoComplete="off"
                              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                            />
                            <button
                              id="desktop-rechnungen-search-clear"
                              type="button"
                              aria-label="Suche löschen"
                              title="Suche löschen"
                              className="ml-3 inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                              style={{ opacity: qRaw ? 1 : 0, pointerEvents: qRaw ? "auto" : "none" }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <path d="M6 6l12 12" />
                                <path d="M18 6 6 18" />
                              </svg>
                            </button>
                          </div>
                        </form>
                      </div>

                      {desktopSearchHasActiveQuery ? (
                        <div
                          id="desktop-rechnungen-search-preview"
                          className="mt-3 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                            <div className="min-w-0">
                              <div className="text-sm text-white/75">
                                Suche aktiv für <span className="font-semibold text-white">„{qRaw}“</span>
                              </div>
                              <div className="mt-1 text-xs text-white/50">{countTotal} Treffer</div>
                            </div>
                            <Link
                              href="/rechnungen"
                              className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15"
                            >
                              Zurücksetzen
                            </Link>
                          </div>

                          {desktopSearchPreviewItems.length > 0 ? (
                            <div className="max-h-[320px] overflow-y-auto">
                              {desktopSearchPreviewItems.map((item) => {
                                const detailParams = new URLSearchParams();
                                if (qRaw) detailParams.set("q", qRaw);
                                if (currentFilter !== "all") detailParams.set("filter", currentFilter);
                                if (practitionerFilter !== "all") detailParams.set("practitioner", practitionerFilter);
                                detailParams.set("receipt", item.id);

                                return (
                                  <Link
                                    key={`desktop-search-preview-${item.id}`}
                                    href={`/rechnungen?${detailParams.toString()}`}
                                    className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3 transition last:border-b-0 hover:bg-white/[0.04]"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-white">
                                        {item.customerName?.trim() || "Unbekannter Kunde"}
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                                        <span>{item.receiptNumber}</span>
                                        <span>•</span>
                                        <span>{formatDateTime(item.createdAt)}</span>
                                      </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-sm font-semibold text-white">
                                        {euroFromCents(item.turnoverValueCents, item.currencyCode)}
                                      </div>
                                      <div className="mt-1 text-xs text-white/50">
                                        {formatPaymentStatus(item.paymentStatus)}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="px-4 py-5 text-sm text-white/60">
                              Keine Treffer für diese Suche.
                            </div>
                          )}

                          {countTotal > desktopSearchPreviewItems.length ? (
                            <div className="border-t border-white/8 px-4 py-3 text-xs text-white/50">
                              Weitere Treffer findest du direkt in der Belegliste unten.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <Link
                    href={buildInvoiceSlideoverHref({
                      qRaw,
                      filter: currentFilter,
                      practitioner: practitionerFilter,
                      closingDate,
                    })}
                    aria-label="Rechnung erstellen"
                    title="Rechnung erstellen"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] bg-[var(--primary)] text-black shadow-[0_12px_26px_rgba(214,195,163,0.18)] transition hover:opacity-90"
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
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                    Magnifique Beauty Institut Backoffice
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                    Rechnungen
                  </h1>

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
                        closingDate,
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
                  subtext={`${cancelledCount} storniert · ${errorCount} mit Fehler · ${paidCount} bezahlt · ${pendingStripeCount} pending · ${readyForFiscalCount} bereit für Fiscal`}
                />
              </div>
            </div>

            <div className="mt-6 space-y-4 md:hidden">
              <MobileClosingAccordion
                eyebrow="Tagesabschluss"
                periodLabel={closingDate}
                totalLabel={euroFromCents(dailyClosingTotals.totalCents, "EUR")}
                receiptCount={dailyClosingTotals.receiptCount}
                stornoCount={dailyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "day",
                })}
                actionLabel="Öffnen"
                control={
                  <ClosingDateAutoSubmit
                    qRaw={qRaw}
                    currentFilter={currentFilter}
                    practitionerFilter={practitionerFilter}
                    closingDate={closingDate}
                  />
                }
              />

              <MobileClosingAccordion
                eyebrow="Monatsabschluss"
                periodLabel={formatMonthLabel(closingMonth)}
                totalLabel={euroFromCents(monthlyClosingTotals.totalCents, "EUR")}
                receiptCount={monthlyClosingTotals.receiptCount}
                stornoCount={monthlyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "month",
                })}
                actionLabel="Öffnen"
                controlLabel="Monat"
                control={
                  <ClosingPeriodMenu
                    label={formatMonthLabel(closingMonth)}
                    options={monthOptions.map((option) => ({
                      href: option.href,
                      label: option.label,
                      isActive: option.isActive,
                    }))}
                  />
                }
              />

              <MobileClosingAccordion
                eyebrow="Jahresabschluss"
                periodLabel={closingYear}
                totalLabel={euroFromCents(yearlyClosingTotals.totalCents, "EUR")}
                receiptCount={yearlyClosingTotals.receiptCount}
                stornoCount={yearlyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "year",
                })}
                actionLabel="Öffnen"
                controlLabel="Jahr"
                control={
                  <ClosingPeriodMenu
                    label={closingYear}
                    options={yearOptions.map((option) => ({
                      href: option.href,
                      label: option.label,
                      isActive: option.isActive,
                    }))}
                  />
                }
              />
            </div>

            <div className="mt-6 hidden md:grid gap-4 md:grid-cols-1 lg:grid-cols-3">
              <CompactClosingCard
                eyebrow="Tagesabschluss"
                title=""
                periodLabel={closingDate}
                totalLabel={euroFromCents(dailyClosingTotals.totalCents, "EUR")}
                receiptCount={dailyClosingTotals.receiptCount}
                stornoCount={dailyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "day",
                })}
                actionLabel="Öffnen"
                control={
                  <ClosingDateAutoSubmit
                    qRaw={qRaw}
                    currentFilter={currentFilter}
                    practitionerFilter={practitionerFilter}
                    closingDate={closingDate}
                  />
                }
              />

              <CompactClosingCard
                eyebrow="Monatsabschluss"
                title=""
                periodLabel={formatMonthLabel(closingMonth)}
                totalLabel={euroFromCents(monthlyClosingTotals.totalCents, "EUR")}
                receiptCount={monthlyClosingTotals.receiptCount}
                stornoCount={monthlyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "month",
                })}
                actionLabel="Öffnen"
                controlLabel="Monat"
                control={
                  <ClosingPeriodMenu
                    label={formatMonthLabel(closingMonth)}
                    options={monthOptions.map((option) => ({
                      href: option.href,
                      label: option.label,
                      isActive: option.isActive,
                    }))}
                  />
                }
              />

              <CompactClosingCard
                eyebrow="Jahresabschluss"
                title=""
                periodLabel={closingYear}
                totalLabel={euroFromCents(yearlyClosingTotals.totalCents, "EUR")}
                receiptCount={yearlyClosingTotals.receiptCount}
                stornoCount={yearlyClosingTotals.stornoCount}
                actionHref={buildRechnungenHref({
                  qRaw,
                  filter: currentFilter,
                  practitioner: practitionerFilter,
                  closingDate,
                  closingPanel: "year",
                })}
                actionLabel="Öffnen"
                controlLabel="Jahr"
                control={
                  <ClosingPeriodMenu
                    label={closingYear}
                    options={yearOptions.map((option) => ({
                      href: option.href,
                      label: option.label,
                      isActive: option.isActive,
                    }))}
                  />
                }
              />
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


      {!isCheckoutFlow ? (
        <RechnungenClosingSlideover
          qRaw={qRaw}
          currentFilter={currentFilter}
          practitionerFilter={practitionerFilter}
          closingDate={closingDate}
          closingMonth={closingMonth}
          closingYear={closingYear}
          generatedByName={generatedByName}
          generatedAtIso={generatedAtIso}
          dailyClosingTotals={dailyClosingTotals}
          dailyClosingGroups={dailyClosingGroups}
          monthlyClosingTotals={monthlyClosingTotals}
          monthlyClosingGroups={monthlyClosingGroups}
          yearlyClosingTotals={yearlyClosingTotals}
          yearlyClosingGroups={yearlyClosingGroups}
        />
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


      {!isCheckoutFlow && readyForFiscalPaymentItems.length > 0 ? (
        <Card className="mt-6 overflow-hidden border-emerald-400/20 bg-emerald-500/10">
          <CardContent className="p-0">
            <div className="border-b border-white/8 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">Bereit für Fiscal</div>
                  <div className="mt-1 text-sm text-white/65">
                    Erfolgreiche Stripe-Kartenzahlungen ohne Fiscal-Beleg. Diese Fälle dürfen nicht verschwinden, bevor der Beleg wirklich erstellt wurde.
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <div className="text-xs text-white/55">
                    Erfolgreich bezahlt in Stripe, aber noch kein Eintrag in fiscal_receipts.
                  </div>
                  {readyForFiscalPaymentItems.length > 1 ? (
                    <form action={backfillReadyFiscalReceipts}>
                      <input type="hidden" name="return_query" value={readyForFiscalReturnQuery} />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                      >
                        Alle automatisch nachziehen
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] table-auto text-sm">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="w-[16%] px-6 py-4 text-left font-semibold text-white/60">Payment</th>
                    <th className="w-[20%] px-4 py-4 text-left font-semibold text-white/60">Kunde</th>
                    <th className="w-[14%] px-4 py-4 text-left font-semibold text-white/60">Erstellt</th>
                    <th className="w-[12%] px-4 py-4 text-left font-semibold text-white/60">Betrag</th>
                    <th className="w-[14%] px-4 py-4 text-left font-semibold text-white/60">Status</th>
                    <th className="w-[24%] px-6 py-4 text-left font-semibold text-white/60">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {readyForFiscalPaymentItems.map((item) => {
                    const detailHref = buildRechnungenHref({
                      qRaw,
                      filter: currentFilter,
                      practitioner: practitionerFilter,
                      closingDate,
                      appointmentId: item.appointmentId ?? undefined,
                      salesOrder: item.salesOrderId ?? undefined,
                      payment: item.id,
                    });

                    return (
                      <tr key={`ready-fiscal-${item.id}`} className="border-t border-white/8 transition hover:bg-white/[0.025]">
                        <td className="px-6 py-4 align-middle">
                          <div className="flex items-center gap-3">
                            <Link
                              href={detailHref}
                              title="Payment öffnen"
                              aria-label="Payment öffnen"
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </Link>
                            <div className="min-h-[52px]">
                              <div className="font-semibold leading-none text-white">{shortId(item.id)}</div>
                              <div className="mt-1.5 text-[11px] text-white/50">
                                {item.provider ? item.provider : "Stripe"}
                              </div>
                              <div className="mt-1 text-[11px] text-white/40">
                                {item.providerTransactionId ? shortId(item.providerTransactionId) : "ohne Stripe-ID"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="min-h-[52px]">
                            <div className="font-semibold text-white">{item.customerName || "Unbekannter Kunde"}</div>
                            <div className="mt-1 text-xs text-white/55">{item.providerName || "Behandler"}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle text-white/75">{formatDateTime(item.createdAt)}</td>
                        <td className="px-4 py-4 align-middle font-semibold text-white">{euroFromGross(item.amount, item.currencyCode || "EUR")}</td>
                        <td className="px-4 py-4 align-middle">
                          <Badge tone={toneForPaymentStatus(item.status)}>{formatPaymentStatus(item.status)}</Badge>
                          <div className="mt-2 text-xs text-emerald-200/80">Stripe bezahlt · Fiscal fehlt noch</div>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <form action={createFiscalReceiptForPayment} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="appointment_id" value={item.appointmentId ?? ""} />
                            <input type="hidden" name="sales_order_id" value={item.salesOrderId ?? ""} />
                            <input type="hidden" name="payment_id" value={item.id} />
                            <input type="hidden" name="return_query" value={readyForFiscalReturnQuery} />
                            <button
                              type="submit"
                              className="inline-flex h-10 items-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                            >
                              Fiscal-Beleg erzeugen
                            </button>
                            <Link
                              href={detailHref}
                              className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                            >
                              Payment öffnen
                            </Link>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isCheckoutFlow && readerPendingPaymentItems.length > 0 ? (
        <PendingReaderPaymentsCard
          items={readerPendingPaymentItems}
          qRaw={qRaw}
          currentFilter={currentFilter}
          practitionerFilter={practitionerFilter}
          pendingStripeCount={pendingStripeCount}
          processingStripeCount={processingStripeCount}
        />
      ) : null}

      {!isCheckoutFlow ? (
        <>


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
              <div className="lg:hidden px-4 py-4">
                {filteredItems.length === 0 ? (
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-6 text-sm text-white/55">
                    Keine Fiscal-Receipts gefunden.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map((item) => {
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
                      const detailHref = `/rechnungen?${detailParams.toString()}`;
                      const stornoInfo = parseStornoInfoFromNotes(item.verificationNotes);
                      const isStornoReceipt = Boolean(stornoInfo.originalReceiptNumber) || String(item.receiptType ?? "").toUpperCase() === "REVERSAL";

                      return (
                        <div key={item.id} className="rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-4 transition hover:bg-white/[0.035]">
                          <div className="block">
                            <div className="flex items-start gap-3">
                              <Link
                                href={detailHref}
                                title="Details öffnen"
                                aria-label="Details öffnen"
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </Link>

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-semibold text-white">{item.receiptNumber}</div>
                                <div className="mt-1 flex items-center gap-3">
                                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${providerBadge.className}`}>
                                    {providerBadge.initials}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">{customerName}</div>
                                    <div className="mt-1 text-xs text-white/45">{formatDateTime(item.createdAt)}</div>
                                  </div>
                                </div>

                                {isStornoReceipt ? (
                                  <div className="mt-3 inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
                                    Stornobeleg{stornoInfo.originalReceiptNumber ? ` · zu ${stornoInfo.originalReceiptNumber}` : ""}
                                  </div>
                                ) : businessState.key === "cancelled" ? (
                                  <div className="mt-3 inline-flex rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-200">
                                    Storniert{stornoInfo.stornoReceiptNumber ? ` · durch ${stornoInfo.stornoReceiptNumber}` : ""}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Betrag</div>
                                <div className="mt-1 text-sm font-semibold text-white">{euroFromCents(item.turnoverValueCents, item.currencyCode)}</div>
                              </div>
                              <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Zahlung</div>
                                <div className="mt-1 text-sm font-medium text-white/75">{formatPaymentStatus(item.paymentStatus)}</div>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge tone={businessState.tone}>{businessState.label}</Badge>
                              <Badge tone={toneForPaymentStatus(item.paymentStatus)}>{formatPaymentStatus(item.paymentStatus)}</Badge>
                              <Badge tone={latestEventTone}>{latestEventLabel}</Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] table-auto text-sm">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="w-[14%] px-6 py-4 font-semibold text-left text-white/60">Beleg</th>
                      <th className="w-[30%] px-4 py-4 font-semibold text-left text-white/60">Kunde</th>
                      <th className="w-[22%] px-4 py-4 font-semibold text-left text-white/60">Erstellt</th>
                      <th className="w-[14%] px-4 py-4 font-semibold text-left text-white/60">Betrag</th>
                      <th className="w-[28%] px-6 py-4 font-semibold text-right text-white/60">Aktion</th>
                    </tr>
                  </thead>
                  <tbody suppressHydrationWarning={true}>
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
                                    <svg viewBox="0 0 20 20" className="mr-1 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="10" cy="10" r="7" />
                                      <path d="m7.5 10 1.6 1.6 3.4-3.7" />
                                    </svg>
                                    {businessState.label}
                                  </Badge>
                                </span>
                                <span title={`Zahlung: ${formatPaymentStatus(item.paymentStatus)}`}>
                                  <Badge tone={toneForPaymentStatus(item.paymentStatus)}>
                                    <svg viewBox="0 0 20 20" className="mr-1 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <rect x="3.5" y="5.5" width="13" height="9" rx="2" />
                                      <path d="M3.5 8.5h13" />
                                    </svg>
                                    {formatPaymentStatus(item.paymentStatus)}
                                  </Badge>
                                </span>
                                <span title={latestEventLabel}>
                                  <Badge tone={latestEventTone}>
                                    <svg viewBox="0 0 20 20" className="mr-1 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M10 5v5l3 2" />
                                      <circle cx="10" cy="10" r="7" />
                                    </svg>
                                    {latestEventLabel}
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

      <DashboardInvoiceSlideover
        tenants={invoiceTenantRows.map((tenant) => ({
          id: tenant.id,
          displayName: tenant.display_name ?? "Behandler",
        }))}
        services={invoiceServiceRows.map((service) => ({
          id: service.id,
          tenantId: String(service.tenant_id ?? "").trim(),
          name: service.name ?? "Unbenannte Dienstleistung",
          defaultPriceCents: service.default_price_cents ?? null,
        }))}
        customers={dashboardCustomers}
        selectedTenantId={invoiceSelectedTenantId}
        currentUserName={String(profile?.full_name ?? "").trim() || user.email || "Benutzer"}
        currentTenantName={String(invoiceCurrentTenantName ?? "").trim() || "Behandler"}
        isAdmin={isAdmin}
      />

      <FiscalReceiptSlideover items={items} />


      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (min-width: 768px) {
              #desktop-rechnungen-avatar-strip { display: block; }
              #desktop-rechnungen-avatar-compact { display: none; }
            }
            @media (min-width: 768px) and (max-width: 1020px) {
              #desktop-rechnungen-avatar-strip { display: none; }
              #desktop-rechnungen-avatar-compact { display: block; }
            }
          `,
        }}
      />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const wrap = document.getElementById("desktop-rechnungen-search-wrap");
              const toggle = document.getElementById("desktop-rechnungen-search-toggle");
              const stack = document.getElementById("desktop-rechnungen-search-stack");
              const input = document.getElementById("desktop-rechnungen-search-input");
              const clearButton = document.getElementById("desktop-rechnungen-search-clear");
              const form = document.getElementById("desktop-rechnungen-search-form");
              const header = document.getElementById("desktop-rechnungen-header");
              if (!wrap || !toggle || !stack || !input || !form || !header || !clearButton) return;

              let submitTimer = null;
              const shouldStartOpen = ${desktopSearchHasActiveQuery ? "true" : "false"};

              const updateClearButton = () => {
                const hasValue = String(input.value || "").trim().length > 0;
                clearButton.style.opacity = hasValue ? "1" : "0";
                clearButton.style.pointerEvents = hasValue ? "auto" : "none";
              };

              const setPanelWidth = () => {
                const wrapRect = wrap.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();
                const innerGap = 8;
                const minWidth = 280;
                const maxWidth = 620;
                const availableWidth = Math.floor(wrapRect.right - headerRect.left - innerGap);
                const targetWidth = Math.max(minWidth, Math.min(maxWidth, availableWidth));
                stack.style.width = targetWidth + "px";
              };

              const openPanel = (focusInput = true) => {
                setPanelWidth();
                stack.classList.remove("pointer-events-none", "opacity-0", "translate-y-1", "scale-95");
                stack.classList.add("pointer-events-auto", "opacity-100", "translate-y-0", "scale-100");
                stack.setAttribute("aria-hidden", "false");
                if (focusInput) {
                  window.requestAnimationFrame(() => {
                    input.focus();
                    const length = input.value.length;
                    input.setSelectionRange(length, length);
                    updateClearButton();
                  });
                } else {
                  updateClearButton();
                }
              };

              const closePanel = () => {
                stack.classList.add("pointer-events-none", "opacity-0", "translate-y-1", "scale-95");
                stack.classList.remove("pointer-events-auto", "opacity-100", "translate-y-0", "scale-100");
                stack.setAttribute("aria-hidden", "true");
              };

              const isOpen = () => stack.getAttribute("aria-hidden") === "false";

              toggle.addEventListener("click", (event) => {
                event.preventDefault();
                if (isOpen()) {
                  closePanel();
                } else {
                  openPanel();
                }
              });

              input.addEventListener("input", () => {
                updateClearButton();
                if (!isOpen()) openPanel(false);
                if (submitTimer) window.clearTimeout(submitTimer);
                submitTimer = window.setTimeout(() => {
                  form.requestSubmit();
                }, 260);
              });

              clearButton.addEventListener("click", (event) => {
                event.preventDefault();
                input.value = "";
                updateClearButton();
                input.focus();
                if (submitTimer) window.clearTimeout(submitTimer);
                form.requestSubmit();
              });

              input.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePanel();
                  toggle.focus();
                }
              });

              document.addEventListener("click", (event) => {
                if (!isOpen()) return;
                if (wrap.contains(event.target)) return;
                closePanel();
              });

              window.addEventListener("resize", () => {
                if (isOpen()) setPanelWidth();
              });

              updateClearButton();
              if (shouldStartOpen) {
                openPanel(false);
              } else {
                closePanel();
              }
            })();
          `,
        }}
      />
    </main>
  );
}
