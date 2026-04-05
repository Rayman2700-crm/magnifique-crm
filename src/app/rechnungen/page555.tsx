import Link from "next/link";
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import FiscalReceiptSlideover from "@/components/rechnungen/FiscalReceiptSlideover";
import { createFiscalReceiptForPayment, createPaymentForSalesOrder, createSalesOrderFromAppointment } from "./actions";

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
};


function euroFromCents(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: currencyCode || "EUR" }).format(value / 100);
}

function euroFromGross(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: currencyCode || "EUR" }).format(value);
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

function SummaryCard({ label, value, subtext }: { label: string; value: number; subtext: string }) {
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

function getReceiptBusinessState(item: SlideoverReceipt) {
  const verification = String(item.verificationStatus ?? "").toUpperCase();
  const signature = String(item.signatureState ?? "").toUpperCase();
  const status = String(item.status ?? "").toUpperCase();

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
    error: "Fehler",
  };
  return labels[filter] ?? "Alle";
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
      },
      ...((practitionerRows ?? []) as Array<{
        user_id: string | null;
        full_name: string | null;
        tenant_id: string | null;
        calendar_tenant_id: string | null;
      }>)
        .filter((row) => String(row.user_id ?? "").trim() && String(row.calendar_tenant_id ?? row.tenant_id ?? "").trim())
        .map((row) => {
          const resolvedTenantId = String(row.calendar_tenant_id ?? row.tenant_id ?? "").trim();
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
          } satisfies AvatarFilterOption;
        }),
    ];
  } else {
    const resolvedTenantId = String(profile?.calendar_tenant_id ?? profile?.tenant_id ?? effectiveTenantId ?? "").trim();
    avatarOptions = [
      {
        tenantId: resolvedTenantId || null,
        userId: String(user.id),
        label: String(profile?.full_name ?? "Mein Bereich").trim() || "Mein Bereich",
        imageUrl: `/users/${user.id}.png`,
        initials: initialsFromName(String(profile?.full_name ?? "Mein Bereich")),
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

  if (effectiveTenantId) receiptsQuery = receiptsQuery.eq("tenant_id", effectiveTenantId);
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

    const allowedReceiptStatus = ["REQUESTED", "ISSUED", "FAILED", "CANCELLED"];
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
    if (effectiveTenantId) eventsQuery = eventsQuery.eq("tenant_id", effectiveTenantId);
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
    const customerName =
      readFirstString(payload, [
        ["customer_name"],
        ["person_name"],
        ["customer", "full_name"],
        ["customer", "name"],
      ]) || null;
    const providerName =
      readFirstString(payload, [
        ["provider_name"],
        ["tenant_display_name"],
        ["tenant_name"],
        ["tenant", "display_name"],
      ]) || null;
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

  const filteredItems = items.filter((item) => {
    const issued = item.issuedAt ?? item.createdAt;
    const businessState = getReceiptBusinessState(item);

    if (practitionerFilter !== "all" && String(item.tenantId ?? "").trim() !== practitionerFilter) {
      return false;
    }

    if (currentFilter === "today") return isBetween(issued, todayStart, tomorrowStart);
    if (currentFilter === "week") return isBetween(issued, weekStart, weekEnd);
    if (currentFilter === "month") return isBetween(issued, monthStart, nextMonthStart);
    if (currentFilter === "open") return businessState.key === "open";
    if (currentFilter === "error") return businessState.key === "error";
    return true;
  });

  const scopedItems = items.filter((item) =>
    practitionerFilter === "all" ? true : String(item.tenantId ?? "").trim() === practitionerFilter
  );

  const countTotal = filteredItems.length;
  const openCount = scopedItems.filter((item) => getReceiptBusinessState(item).key === "open").length;
  const errorCount = scopedItems.filter((item) => getReceiptBusinessState(item).key === "error").length;
  const paidCount = scopedItems.filter((item) => getReceiptBusinessState(item).key === "paid").length;

  const revenueTodayCents = scopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    return isBetween(issued, todayStart, tomorrowStart) ? sum + Number(item.turnoverValueCents ?? 0) : sum;
  }, 0);

  const revenueWeekCents = scopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    return isBetween(issued, weekStart, weekEnd) ? sum + Number(item.turnoverValueCents ?? 0) : sum;
  }, 0);

  const revenueMonthCents = scopedItems.reduce((sum, item) => {
    const issued = item.issuedAt ?? item.createdAt;
    return isBetween(issued, monthStart, nextMonthStart) ? sum + Number(item.turnoverValueCents ?? 0) : sum;
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
      <section className="overflow-visible rounded-[32px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="p-5 md:p-7">
          <div
            className="overflow-visible rounded-[28px] border p-5 md:p-6"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                    Clientique Backoffice
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                    Rechnungen / Abrechnung
                  </h1>

                  <div className="mt-4 hidden items-center gap-2 md:flex md:flex-wrap">
                    {[
                      ["all", "Alle", countTotal],
                      ["today", "Heute", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, todayStart, tomorrowStart)).length],
                      ["week", "Woche", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, weekStart, weekEnd)).length],
                      ["month", "Monat", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, monthStart, nextMonthStart)).length],
                      ["open", "Offen", openCount],
                      ["error", "Fehler", errorCount],
                    ].map(([key, label, count]) => {
                      const active = currentFilter === key;
                      const params = new URLSearchParams();
                      if (qRaw) params.set("q", qRaw);
                      if (practitionerFilter !== "all") params.set("practitioner", practitionerFilter);
                      if (key !== "all") params.set("filter", String(key));
                      const href = `/rechnungen${params.toString() ? `?${params.toString()}` : ""}`;
                      return (
                        <Link key={String(key)} href={href} className={statusLinkClass(active)}>
                          <span>{label}</span>
                          <span className={statusCountClass(active)}>{count}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full xl:w-auto xl:max-w-[620px] xl:min-w-[420px] xl:shrink-0">
                  <div className="hidden md:flex md:justify-end">
                    <div className="max-w-full overflow-x-auto">
                      <div className="min-w-max">
                        <div className="flex items-start gap-3">
                          {avatarOptions.map((option, index) => {
                            const active = String(option.tenantId ?? "all") === practitionerFilter;
                            const params = new URLSearchParams();
                            if (qRaw) params.set("q", qRaw);
                            if (currentFilter !== "all") params.set("filter", currentFilter);
                            if ((option.tenantId ?? "all") !== "all") params.set("practitioner", String(option.tenantId));
                            const href = `/rechnungen${params.toString() ? `?${params.toString()}` : ""}`;
                            const ringColors = ["rgba(255,255,255,0.55)", "#3b82f6", "#a855f7", "#22c55e", "#f97316"];
                            const ringColor = option.tenantId === "all" ? "rgba(255,255,255,0.55)" : ringColors[index % ringColors.length];
                            return (
                              <Link key={`${option.userId}-${option.tenantId ?? "self"}`} href={href} className="flex shrink-0 flex-col items-center gap-2">
                                <span
                                  className="inline-flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border-2 bg-black/30"
                                  style={{
                                    borderColor: active ? ringColor : "rgba(255,255,255,0.22)",
                                    boxShadow: active ? `0 0 0 2px ${ringColor}40` : "none",
                                  }}
                                >
                                  {option.tenantId === "all" ? (
                                    <span className="text-base font-black text-black rounded-full bg-white h-full w-full flex items-center justify-center">Alle</span>
                                  ) : option.imageUrl ? (
                                    <span
                                      aria-label={option.label}
                                      className="block h-full w-full rounded-full bg-cover bg-center bg-no-repeat"
                                      style={{ backgroundImage: `url(${option.imageUrl})` }}
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{option.initials}</span>
                                  )}
                                </span>
                                <span className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold transition ${active ? "border-white bg-white text-black" : "border-white/10 bg-black/20 text-white hover:bg-white/10"}`}>
                                  {option.label}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3 md:hidden">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["all", "Alle", countTotal],
                      ["today", "Heute", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, todayStart, tomorrowStart)).length],
                      ["week", "Woche", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, weekStart, weekEnd)).length],
                      ["month", "Monat", filteredItems.filter((item) => isBetween(item.issuedAt ?? item.createdAt, monthStart, nextMonthStart)).length],
                      ["open", "Offen", openCount],
                      ["error", "Fehler", errorCount],
                    ].map(([key, label, count]) => {
                      const active = currentFilter === key;
                      const params = new URLSearchParams();
                      if (qRaw) params.set("q", qRaw);
                      if (practitionerFilter !== "all") params.set("practitioner", practitionerFilter);
                      if (key !== "all") params.set("filter", String(key));
                      const href = `/rechnungen${params.toString() ? `?${params.toString()}` : ""}`;
                      return (
                        <Link key={`mobile-${String(key)}`} href={href} className={statusLinkClass(active)}>
                          <span>{label}</span>
                          <span className={statusCountClass(active)}>{count}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="md:hidden overflow-x-auto">
                  <div className="flex min-w-max items-start gap-3 pb-1">
                    {avatarOptions.map((option, index) => {
                      const active = String(option.tenantId ?? "all") === practitionerFilter;
                      const params = new URLSearchParams();
                      if (qRaw) params.set("q", qRaw);
                      if (currentFilter !== "all") params.set("filter", currentFilter);
                      if ((option.tenantId ?? "all") !== "all") params.set("practitioner", String(option.tenantId));
                      const href = `/rechnungen${params.toString() ? `?${params.toString()}` : ""}`;
                      const ringColors = ["rgba(255,255,255,0.55)", "#3b82f6", "#a855f7", "#22c55e", "#f97316"];
                      const ringColor = option.tenantId === "all" ? "rgba(255,255,255,0.55)" : ringColors[index % ringColors.length];
                      return (
                        <Link key={`mobile-${option.userId}-${option.tenantId ?? "self"}`} href={href} className="flex shrink-0 flex-col items-center gap-2">
                          <span className="inline-flex h-[44px] w-[44px] items-center justify-center overflow-hidden rounded-full border-2 bg-black/30" style={{ borderColor: active ? ringColor : "rgba(255,255,255,0.22)", boxShadow: active ? `0 0 0 2px ${ringColor}40` : "none" }}>
                            {option.tenantId === "all" ? (
                              <span className="text-sm font-black text-black rounded-full bg-white h-full w-full flex items-center justify-center">Alle</span>
                            ) : option.imageUrl ? (
                              <span
                                aria-label={option.label}
                                className="block h-full w-full rounded-full bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url(${option.imageUrl})` }}
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">{option.initials}</span>
                            )}
                          </span>
                          <span className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold transition ${active ? "border-white bg-white text-black" : "border-white/10 bg-black/20 text-white hover:bg-white/10"}`}>
                            {option.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="flex w-full items-center gap-3 xl:max-w-[620px]">
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

                  <Link href="/calendar" className="hidden h-11 shrink-0 items-center rounded-[16px] border border-emerald-500/30 bg-emerald-600/90 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 xl:inline-flex">
                    + Abrechnen
                  </Link>
                </div>

                <div className="xl:hidden flex justify-end">
                  <Link href="/calendar" className="inline-flex h-11 shrink-0 items-center rounded-[16px] border border-emerald-500/30 bg-emerald-600/90 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500">
                    + Abrechnen
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75"><div className="text-xs uppercase tracking-wide text-white/45">Was jetzt passiert</div><div className="mt-2 font-semibold text-white">Payment wird an Sales Order gehängt</div><div className="mt-2 text-white/65">Danach ist der Vorgang kassierseitig vollständig vorbereitet. Fiscal kommt erst im nächsten Schritt.</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 px-2.5 py-1">Sales Order: {shortId(createdSalesOrder.id)}</span><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">Offen: {euroFromGross(salesOrderDisplayTotal, createdSalesOrder.currency_code || "EUR")}</span></div></div>
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
                  <div className="mt-3 text-sm text-white/70">Zahlung wurde erfolgreich an die Sales Order gebunden. Damit ist der Checkout bis zum Payment sauber getrennt aufgebaut.</div>
                </div>

                {!createdReceipt ? (
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
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <div className="mt-1 text-xs text-white/55">{errorCount} mit Fehler · {paidCount} bezahlt</div>
            </div>
          </div>

          {(qRaw || currentFilter !== "all") && filteredItems.length === 0 ? (

            <Card className="mt-6 border-white/10 bg-white/[0.03]">
              <CardContent className="p-5 text-sm text-white/70">
                Keine Treffer für diese Ansicht. Nutze eine andere Suche oder wechsle den Filter.
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-6 overflow-hidden border-white/10 bg-white/[0.03]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-left text-white/55">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Beleg</th>
                      <th className="px-4 py-3 font-semibold">Kunde</th>
                      <th className="px-4 py-3 font-semibold">Behandler</th>
                      <th className="px-4 py-3 font-semibold">Erstellt</th>
                      <th className="px-4 py-3 font-semibold">Betrag</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Letzter Event</th>
                      <th className="px-4 py-3 font-semibold text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-white/45">Keine Fiscal-Receipts gefunden.</td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const businessState = getReceiptBusinessState(item);
                        const detailParams = new URLSearchParams();
                        if (qRaw) detailParams.set("q", qRaw);
                        if (currentFilter !== "all") detailParams.set("filter", currentFilter);
                        detailParams.set("receipt", item.id);

                        return (
                          <tr key={item.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
                            <td className="px-4 py-3 align-top">
                              <div className="font-semibold text-white">{item.receiptNumber}</div>
                              <div className="mt-1 text-xs text-white/45">{shortId(item.id)}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-white/85">{item.customerName ?? "—"}</div>
                              <div className="mt-1 text-xs text-white/45">SO {shortId(item.salesOrderId)}</div>
                            </td>
                            <td className="px-4 py-3 align-top text-white/75">{item.providerName ?? "—"}</td>
                            <td className="px-4 py-3 align-top text-white/75">{formatDateTime(item.createdAt)}</td>
                            <td className="px-4 py-3 align-top text-white/85">{euroFromCents(item.turnoverValueCents, item.currencyCode)}</td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={businessState.tone}>{businessState.label}</Badge>
                                <Badge tone={toneForVerification(item.verificationStatus)}>{item.verificationStatus ?? "—"}</Badge>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-white/75">{formatEventLabel(item.latestEventType, item.events[0]?.referenceData ?? null)}</td>
                            <td className="px-4 py-3 text-right align-top">
                              <Link href={`/rechnungen?${detailParams.toString()}`} className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15">Details</Link>
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
