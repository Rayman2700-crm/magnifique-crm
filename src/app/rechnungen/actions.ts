"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { sendMail } from "@/lib/mail/sendMail";
import { sendGoogleMail } from "@/lib/mail/sendGoogleMail";
import { buildFiscalReceiptPdf } from "@/lib/receipts/buildFiscalReceiptPdf";
import { stripe } from "@/lib/stripe/server";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
};

type AppointmentRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  service_id: string | null;
  service_name_snapshot: string | null;
  service_price_cents_snapshot: number | null;
  notes_internal: string | null;
  start_at: string | null;
  end_at: string | null;
};

type AppointmentDetailLookupRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
  person?: { full_name: string | null } | { full_name: string | null }[] | null;
};

type SalesOrderContextRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  cash_register_id: string | null;
  status: string | null;
  currency_code: string | null;
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

type PaymentContextRow = {
  id: string;
  tenant_id: string | null;
  sales_order_id: string | null;
  cash_register_id: string | null;
  payment_method_id: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string | null;
};

type CashRegisterRow = {
  id: string;
  tenant_id: string | null;
  register_code: string | null;
  name: string | null;
  status: string | null;
  created_at: string | null;
};

type TenantPdfProfileRow = {
  id: string;
  slug: string | null;
  display_name: string | null;
  legal_name: string | null;
  invoice_address_line1: string | null;
  invoice_address_line2: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
  invoice_prefix: string | null;
  kleinunternehmer_text: string | null;
};

type CustomerPdfPersonRow = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type CustomerPdfProfileRow = {
  id: string;
  person_id: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  person?: CustomerPdfPersonRow | CustomerPdfPersonRow[] | null;
};

type PdfServiceRow = {
  id: string;
  description?: string | null;
  duration_minutes?: number | null;
};

function buildRechnungenUrl(input?: {
  appointmentId?: string | null;
  salesOrderId?: string | null;
  paymentId?: string | null;
  receiptId?: string | null;
  success?: string | null;
  error?: string | null;
}) {
  const url = new URL("/rechnungen", "http://local");
  const appointmentId = String(input?.appointmentId ?? "").trim();
  const salesOrderId = String(input?.salesOrderId ?? "").trim();
  const paymentId = String(input?.paymentId ?? "").trim();
  const receiptId = String(input?.receiptId ?? "").trim();
  const success = String(input?.success ?? "").trim();
  const error = String(input?.error ?? "").trim();
  if (appointmentId) url.searchParams.set("appointmentId", appointmentId);
  if (salesOrderId) url.searchParams.set("salesOrder", salesOrderId);
  if (paymentId) url.searchParams.set("payment", paymentId);
  if (receiptId) url.searchParams.set("receipt", receiptId);
  if (success) url.searchParams.set("success", success);
  if (error) url.searchParams.set("error", error);
  return url.pathname + (url.search ? url.search : "");
}

function readMetaLineValue(existing: string | null | undefined, prefix: string) {
  const lines = String(existing ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean);
  const match = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
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

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function parseMoneyToCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s+/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback = 1) {
  const raw = Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.round(raw));
}

function toGrossNumber(cents: number) {
  return Number((cents / 100).toFixed(2));
}

async function requireContext() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const typedProfile = (profile ?? null) as UserProfileRow | null;
  const effectiveTenantId = await getEffectiveTenantId({
    role: typedProfile?.role ?? "PRACTITIONER",
    tenant_id: typedProfile?.tenant_id ?? null,
    calendar_tenant_id: typedProfile?.calendar_tenant_id ?? null,
  });

  return { admin, user, effectiveTenantId };
}

async function resolvePaymentMethodId(admin: any, tenantId: string, requestedCode: string) {
  const normalized = requestedCode.trim().toUpperCase();
  const { data, error } = await admin
    .from("payment_methods")
    .select("id, code, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message ?? "Zahlungsarten konnten nicht geladen werden.");

  const rows = data ?? [];
  const aliases: Record<string, string[]> = {
    CASH: ["CASH", "BAR", "BARE", "cash"],
    CARD: ["CARD", "KARTE", "CARD_PRESENT", "card_present"],
    TRANSFER: ["TRANSFER", "UEBERWEISUNG", "ÜBERWEISUNG", "BANK", "BANK_TRANSFER", "bank_transfer"],
  };
  const acceptable = aliases[normalized] ?? [normalized];

  for (const row of rows) {
    const code = String(row.code ?? "").trim();
    const name = String(row.name ?? "").trim().toUpperCase();
    if (acceptable.includes(code) || acceptable.includes(code.toUpperCase()) || acceptable.includes(name)) {
      return String(row.id);
    }
  }

  throw new Error(`Keine aktive Zahlungsart für ${requestedCode} gefunden.`);
}

function isLegacyCashRegister(row: CashRegisterRow | null | undefined) {
  const registerCode = String(row?.register_code ?? "").trim().toUpperCase();
  const name = String(row?.name ?? "").trim().toUpperCase();
  const tenantId = String(row?.tenant_id ?? "").trim().toUpperCase();
  return registerCode.startsWith("LEGACY") || name.includes("LEGACY") || tenantId.startsWith("LEGACY");
}

async function resolveCashRegister(admin: any, tenantId: string) {
  const { data, error } = await admin
    .from("cash_registers")
    .select("id, tenant_id, register_code, name, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message ?? "Kassa konnte nicht geladen werden.");

  const rows = ((data ?? []) as CashRegisterRow[])
    .filter((row) => row?.id)
    .filter((row) => !isLegacyCashRegister(row));

  if (rows.length === 0) {
    throw new Error("Für diesen Tenant wurde keine aktive Kassa gefunden.");
  }

  const activeRows = rows.filter((row) => {
    const status = String(row.status ?? "").trim().toUpperCase();
    return status !== "INACTIVE" && status !== "ARCHIVED";
  });

  const usableRows = activeRows.length > 0 ? activeRows : rows;
  const preferred =
    usableRows.find((row) => String(row.status ?? "").trim().toUpperCase() === "ACTIVE") ??
    usableRows.find((row) => String(row.status ?? "").trim().toUpperCase() === "DRAFT") ??
    usableRows[0] ??
    null;

  if (!preferred?.id) {
    throw new Error("Für diesen Tenant wurde keine verwendbare Kassa gefunden.");
  }

  return preferred;
}

async function resolveSalesOrder(admin: any, salesOrderId: string) {
  const { data, error } = await admin
    .from("sales_orders")
    .select("id, tenant_id, customer_id, appointment_id, cash_register_id, status, currency_code, grand_total, created_at")
    .eq("id", salesOrderId)
    .maybeSingle();
  if (error || !data) throw new Error("Sales Order konnte nicht geladen werden.");
  return data as SalesOrderContextRow;
}

function assertCashRegisterConsistency(input: {
  salesOrderCashRegisterId?: string | null;
  paymentCashRegisterId?: string | null;
  resolvedCashRegisterId?: string | null;
}) {
  const values = [
    String(input.salesOrderCashRegisterId ?? "").trim(),
    String(input.paymentCashRegisterId ?? "").trim(),
    String(input.resolvedCashRegisterId ?? "").trim(),
  ].filter(Boolean);

  const unique = Array.from(new Set(values));
  if (unique.length > 1) {
    throw new Error("Kassen-Zuordnung ist inkonsistent. Sales Order, Payment und Receipt müssen dieselbe Kassa verwenden.");
  }

  return unique[0] ?? "";
}

function isCardPaymentMethodCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "CARD" || normalized === "KARTE" || normalized === "CARD_PRESENT";
}

function isTransferPaymentMethodCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "TRANSFER" || normalized === "UEBERWEISUNG" || normalized === "ÜBERWEISUNG" || normalized === "BANK_TRANSFER";
}



async function createStripeTerminalIntentForPayment(input: {
  amountCents: number;
  currencyCode?: string | null;
  paymentId: string;
  salesOrderId: string;
  tenantId: string;
}) {
  const intent = await stripe.paymentIntents.create({
    amount: input.amountCents,
    currency: String(input.currencyCode ?? "EUR").trim().toLowerCase() || "eur",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: {
      payment_id: input.paymentId,
      sales_order_id: input.salesOrderId,
      tenant_id: input.tenantId,
    },
  });

  return intent;
}

async function loadPaymentMethodCodeById(admin: any, paymentMethodId: string | null | undefined) {
  const id = String(paymentMethodId ?? "").trim();
  if (!id) return "";

  const { data, error } = await admin
    .from("payment_methods")
    .select("code, name")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "Zahlungsart konnte nicht geladen werden.");

  return String((data as { code?: string | null } | null)?.code ?? "").trim().toUpperCase();
}

function roundTaxPortionFromGross(totalCents: number, taxRate: number) {
  if (!Number.isFinite(taxRate) || taxRate <= 0) return 0;
  return Math.round(totalCents * (taxRate / (100 + taxRate)));
}

async function nextReceiptNumber(admin: any, cashRegisterId: string) {
  const { data, error } = await admin
    .from("fiscal_receipts")
    .select("receipt_number")
    .eq("cash_register_id", cashRegisterId);

  if (error) throw new Error(error.message ?? "Receipt-Nummer konnte nicht berechnet werden.");

  const maxNo = (data ?? []).reduce((max: number, row: any) => {
    const digits = String(row?.receipt_number ?? "").replace(/\D/g, "");
    const n = Number(digits || "0");
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return String(maxNo + 1).padStart(6, "0");
}


type FiscalEventInsert = {
  tenantId: string;
  cashRegisterId?: string | null;
  fiscalReceiptId?: string | null;
  performedBy?: string | null;
  eventType: string;
  notes?: string | null;
  referenceData?: Record<string, unknown> | null;
};

async function insertFiscalEventSafe(admin: any, input: FiscalEventInsert) {
  const payload = {
    tenant_id: input.tenantId,
    cash_register_id: input.cashRegisterId ?? null,
    fiscal_receipt_id: input.fiscalReceiptId ?? null,
    event_type: input.eventType,
    performed_by: input.performedBy ?? null,
    notes: input.notes ?? null,
    reference_data: input.referenceData ?? null,
  };

  const { error } = await admin.from("fiscal_events").insert(payload);
  return { ok: !error, error };
}


function isReceiptCancelled(value: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "CANCELLED" || normalized === "REVERSED";
}

function isStornoReceiptType(value: string | null | undefined, verificationNotes?: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "REVERSAL") return true;
  return String(verificationNotes ?? "").includes("Stornobeleg zu");
}

function normalizeReceiptStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function buildVerificationNoteForCancellation(existing: string | null | undefined, cancelledAt: string) {
  const base = String(existing ?? "").trim();
  const suffix = `MVP-Storno am ${cancelledAt}`;
  if (!base) return suffix;
  if (base.includes(suffix)) return base;
  return `${base} | ${suffix}`;
}

function buildVerificationNoteForRealCancellation(existing: string | null | undefined, stornoReceiptNumber: string, cancelledAt: string) {
  const base = String(existing ?? "").trim();
  const suffix = `Storniert durch Beleg ${stornoReceiptNumber} am ${cancelledAt}`;
  if (!base) return suffix;
  if (base.includes(suffix)) return base;
  return `${base} | ${suffix}`;
}

function buildVerificationNoteForStornoReceipt(originalReceiptNumber: string, cancelledAt: string) {
  return `Stornobeleg zu ${originalReceiptNumber} am ${cancelledAt}`;
}

async function insertFiscalFailureSafe(
  admin: any,
  input: {
    tenantId: string;
    cashRegisterId?: string | null;
    salesOrderId?: string | null;
    paymentId?: string | null;
    fiscalReceiptId?: string | null;
    failedStep: string;
    errorMessage: string;
    createdBy?: string | null;
    errorDetail?: Record<string, unknown> | null;
  }
) {
  await admin.from("fiscal_event_failures").insert({
    tenant_id: input.tenantId,
    cash_register_id: input.cashRegisterId ?? null,
    sales_order_id: input.salesOrderId ?? null,
    payment_id: input.paymentId ?? null,
    fiscal_receipt_id: input.fiscalReceiptId ?? null,
    failed_step: input.failedStep,
    error_message: input.errorMessage,
    error_detail: input.errorDetail ?? null,
    created_by: input.createdBy ?? null,
  });
}





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

function buildProviderLogoPath(input: {
  invoicePrefix?: string | null;
  legalName?: string | null;
  slug?: string | null;
}) {
  const prefix = String(input.invoicePrefix ?? "").trim().toUpperCase();
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const legalName = String(input.legalName ?? "").trim().toLowerCase();

  const byPrefix: Record<string, string> = {
    RAD: "/logos/radu-craus.png",
    RAL: "/logos/raluca-craus.png",
    ALE: "/logos/alexandra-sacadat.png",
    BAR: "/logos/barbara-eder.png",
  };

  if (byPrefix[prefix]) return byPrefix[prefix];
  if (slug.includes("radu")) return "/logos/radu-craus.png";
  if (slug.includes("raluca")) return "/logos/raluca-craus.png";
  if (slug.includes("alex")) return "/logos/alexandra-sacadat.png";
  if (slug.includes("barbara")) return "/logos/barbara-eder.png";
  if (legalName.includes("radu")) return "/logos/radu-craus.png";
  if (legalName.includes("raluca")) return "/logos/raluca-craus.png";
  if (legalName.includes("alex")) return "/logos/alexandra-sacadat.png";
  if (legalName.includes("barbara")) return "/logos/barbara-eder.png";
  return "";
}

function combineAddressLine2(zip?: string | null, city?: string | null, extra?: string | null) {
  const zipCity = [String(zip ?? "").trim(), String(city ?? "").trim()].filter(Boolean).join(" ");
  return zipCity || String(extra ?? "").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function buildCustomerAddressSnapshot(source: unknown) {
  return {
    address1: firstNonEmpty(
      readFirstString(source, [["customer_address1"], ["customer", "address1"], ["customer", "address_line1"], ["address_line1"]]),
      readFirstString(source, [["person", "address1"], ["person", "address_line1"]]),
    ),
    address2: firstNonEmpty(
      readFirstString(source, [["customer_address2"], ["customer", "address2"], ["customer", "address_line2"], ["address_line2"]]),
      readFirstString(source, [["person", "address2"], ["person", "address_line2"]]),
    ),
    address3: firstNonEmpty(
      readFirstString(source, [["customer_address3"], ["customer", "country"], ["country"]]),
      readFirstString(source, [["person", "country"]]),
    ),
  };
}

function buildReceiptEmailSubject(receiptNumber: string, providerName: string) {
  const cleanReceiptNumber = String(receiptNumber ?? "").trim() || "—";
  const cleanProviderName = String(providerName ?? "").trim() || "Magnifique CRM";
  return `Beleg ${cleanReceiptNumber} – ${cleanProviderName}`;
}

function buildReceiptEmailText(input: {
  customerName?: string | null;
  receiptNumber: string;
  providerName?: string | null;
  paymentMethodLabel?: string | null;
  amountLabel?: string | null;
}) {
  const customerName = String(input.customerName ?? "").trim();
  const providerName = String(input.providerName ?? "").trim() || "Magnifique CRM";
  const paymentMethodLabel = String(input.paymentMethodLabel ?? "").trim() || "—";
  const amountLabel = String(input.amountLabel ?? "").trim() || "—";
  const greeting = customerName ? `Hallo ${customerName},` : "Hallo,";

  return [
    greeting,
    "",
    `anbei bzw. zur Ansicht dein Beleg ${input.receiptNumber}.`,
    `Betrag: ${amountLabel}`,
    `Zahlungsart: ${paymentMethodLabel}`,
    "",
    "Vielen Dank für deinen Besuch.",
    "",
    `Liebe Grüße`,
    providerName,
  ].join("\n");
}


function renderMailTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = variables[key];
    return typeof value === "string" ? value : "";
  });
}

function buildReceiptEmailTemplateVariables(input: {
  customerName?: string | null;
  receiptNumber: string;
  providerName?: string | null;
  paymentMethodLabel?: string | null;
  amountLabel?: string | null;
}) {
  return {
    customer_name: String(input.customerName ?? "").trim() || "Kundin",
    receipt_number: String(input.receiptNumber ?? "").trim(),
    provider_name: String(input.providerName ?? "").trim() || "Magnifique CRM",
    payment_method: String(input.paymentMethodLabel ?? "").trim() || "—",
    amount: String(input.amountLabel ?? "").trim() || "—",
  };
}

function normalizePhoneForWhatsApp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let normalized = raw.replace(/[^\d+]/g, "");
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith("0")) normalized = `+43${normalized.slice(1)}`;
  if (!normalized.startsWith("+")) normalized = `+${normalized}`;
  return normalized.replace(/[^\d]/g, "");
}

function buildReceiptWhatsAppText(receiptNumber: string, providerName: string, amountLabel: string) {
  return `Hallo, hier ist dein Beleg ${receiptNumber}${amountLabel && amountLabel !== "—" ? ` über ${amountLabel}` : ""}.

Liebe Grüße
${providerName || "Magnifique CRM"}`;
}

function buildReceiptWhatsAppHref(phoneDigits: string, message: string) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${text}`;
}

function formatGrossAmountLabel(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function formatReceiptDateTimeLabel(value: string | null | undefined) {
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

async function loadReceiptDeliveryRows(admin: any, fiscalReceiptId: string) {
  const { data, error } = await admin
    .from("receipt_deliveries")
    .select("id, tenant_id, fiscal_receipt_id, channel, status, recipient, subject, message_preview, provider, provider_message_id, sent_by, sent_at, failed_at, error_message, created_at, updated_at")
    .eq("fiscal_receipt_id", fiscalReceiptId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message ?? "Versandhistorie konnte nicht geladen werden.");
  return (data ?? []) as ReceiptDeliveryRow[];
}

export async function sendFiscalReceiptEmail(formData: FormData) {
  const receiptId = String(formData.get("receipt_id") ?? "").trim();
  const returnQuery = String(formData.get("return_query") ?? "").trim();

  if (!receiptId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: "Beleg konnte nicht zugeordnet werden." }));
  }

  const { admin, user, effectiveTenantId } = await requireContext();

  const { data: receiptRaw, error: receiptError } = await admin
    .from("fiscal_receipts")
    .select(`
      id,
      tenant_id,
      sales_order_id,
      payment_id,
      receipt_number,
      receipt_type,
      status,
      issued_at,
      currency_code,
      turnover_value_cents,
      receipt_payload_canonical,
      verification_notes
    `)
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError || !receiptRaw) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beleg konnte nicht geladen werden." }));
  }

  const receipt = receiptRaw as {
    id: string;
    tenant_id: string | null;
    sales_order_id: string | null;
    payment_id: string | null;
    receipt_number: string | null;
    receipt_type: string | null;
    status: string | null;
    issued_at: string | null;
    currency_code: string | null;
    turnover_value_cents: number | null;
    receipt_payload_canonical: string | null;
    verification_notes: string | null;
  };

  const tenantId = String(receipt.tenant_id ?? "").trim();
  if (!tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beleg hat keinen Tenant." }));
  }

  if (effectiveTenantId && effectiveTenantId !== tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Dieser Beleg gehört nicht zum aktiven Tenant." }));
  }

  const isCancelled = isReceiptCancelled(receipt.status) || isStornoReceiptType(receipt.receipt_type, receipt.verification_notes);
  if (isCancelled) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Stornierte Belege können nicht per E-Mail versendet werden." }));
  }

  const payload = parsePayload(receipt.receipt_payload_canonical);
  const receiptNumber = String(receipt.receipt_number ?? "").trim() || receipt.id;

  const salesOrderId = String(receipt.sales_order_id ?? "").trim();
  let customerName =
    readFirstString(payload, [["customer_name"], ["person_name"], ["customer", "full_name"], ["customer", "name"]]) || "";
  let customerEmail =
    firstNonEmpty(
      readFirstString(payload, [["customer_email"], ["customer", "email"], ["email"]]),
      readFirstString(payload, [["person_email"]]),
    ) || "";

  if (salesOrderId) {
    const { data: salesOrderRaw } = await admin
      .from("sales_orders")
      .select("id, customer_id")
      .eq("id", salesOrderId)
      .maybeSingle();

    const customerProfileId = String((salesOrderRaw as { customer_id?: string | null } | null)?.customer_id ?? "").trim();
    if (customerProfileId) {
      const { data: customerProfileRaw } = await admin
        .from("customer_profiles")
        .select(`id, person:persons ( full_name, email, phone )`)
        .eq("id", customerProfileId)
        .maybeSingle();

      const personJoin = firstJoin((customerProfileRaw as any)?.person);
      customerName = firstNonEmpty(String(personJoin?.full_name ?? ""), customerName);
      customerEmail = firstNonEmpty(String(personJoin?.email ?? ""), customerEmail);
    }
  }

  if (!customerEmail) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beim Kunden ist keine E-Mail-Adresse hinterlegt." }));
  }

  const { data: tenantMailSettingsRaw } = await admin
    .from("tenants")
    .select("display_name, email, mail_sender_name, mail_reply_to_email, mail_subject_template, mail_body_template, mail_delivery_mode, mail_is_active")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantMailSettings = (tenantMailSettingsRaw ?? null) as {
    display_name?: string | null;
    email?: string | null;
    mail_sender_name?: string | null;
    mail_reply_to_email?: string | null;
    mail_subject_template?: string | null;
    mail_body_template?: string | null;
    mail_delivery_mode?: string | null;
    mail_is_active?: boolean | null;
  } | null;

  const providerName =
    readFirstString(payload, [["provider_name"], ["tenant_display_name"], ["tenant_name"], ["tenant", "display_name"]]) ||
    String(tenantMailSettings?.display_name ?? "").trim();

  const tenantMailIsActive = tenantMailSettings?.mail_is_active !== false;
  if (!tenantMailIsActive) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "E-Mail-Versand ist für diesen Behandler aktuell deaktiviert." }));
  }

  const senderEmail =
    String(tenantMailSettings?.email ?? "").trim();
  const senderName =
    String(tenantMailSettings?.mail_sender_name ?? "").trim() ||
    providerName ||
    String(tenantMailSettings?.display_name ?? "").trim() ||
    "Magnifique CRM";
  const replyToEmail =
    String(tenantMailSettings?.mail_reply_to_email ?? "").trim() ||
    senderEmail;

  if (!senderEmail) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Für diesen Behandler ist keine Absender-E-Mail hinterlegt." }));
  }

  let paymentMethodLabel = "—";
  const paymentId = String(receipt.payment_id ?? "").trim();
  if (paymentId) {
    const { data: paymentRaw } = await admin
      .from("payments")
      .select(`id, payment_method:payment_methods ( code, name )`)
      .eq("id", paymentId)
      .maybeSingle();

    const paymentMethod = firstJoin((paymentRaw as any)?.payment_method);
    paymentMethodLabel = String(paymentMethod?.name ?? paymentMethod?.code ?? "—").trim() || "—";
  }

  const amountLabel = formatGrossAmountLabel(
    typeof receipt.turnover_value_cents === "number" ? receipt.turnover_value_cents / 100 : null,
    receipt.currency_code || "EUR"
  );

  const templateVariables = buildReceiptEmailTemplateVariables({
    customerName,
    receiptNumber,
    providerName,
    paymentMethodLabel,
    amountLabel,
  });

  const subjectTemplate =
    String(tenantMailSettings?.mail_subject_template ?? "").trim() ||
    "Beleg {receipt_number} – {provider_name}";
  const bodyTemplate =
    String(tenantMailSettings?.mail_body_template ?? "").trim() ||
    "Hallo {customer_name},\n\nanbei bzw. zur Ansicht dein Beleg {receipt_number}.\nBetrag: {amount}\nZahlungsart: {payment_method}\n\nVielen Dank für deinen Besuch.\n\nLiebe Grüße\n{provider_name}";

  const subject = renderMailTemplate(subjectTemplate, templateVariables).trim() || buildReceiptEmailSubject(receiptNumber, providerName);
  const text = renderMailTemplate(bodyTemplate, templateVariables).trim() || buildReceiptEmailText({
    customerName,
    receiptNumber,
    providerName,
    paymentMethodLabel,
    amountLabel,
  });

  const { data: receiptLineRowsRaw, error: receiptLinesError } = await admin
    .from("fiscal_receipt_lines")
    .select("name, quantity, unit_price_gross, line_total_gross")
    .eq("fiscal_receipt_id", receiptId)
    .order("created_at", { ascending: true });

  if (receiptLinesError) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: receiptLinesError.message ?? "Belegpositionen konnten nicht geladen werden." }));
  }

  const receiptLineRows = ((receiptLineRowsRaw ?? []) as Array<{
    name?: string | null;
    quantity?: number | null;
    unit_price_gross?: number | null;
    line_total_gross?: number | null;
  }>).map((line) => ({
    name: String(line.name ?? "Position").trim() || "Position",
    quantity: Number(line.quantity ?? 0) || 0,
    unitPriceGross: Number(line.unit_price_gross ?? 0) || 0,
    lineTotalGross: Number(line.line_total_gross ?? 0) || 0,
  }));

  const pdfAttachment = await buildFiscalReceiptPdf({
    receiptNumber,
    issuedAtLabel: formatReceiptDateTimeLabel(readFirstString(payload, [["issued_at"]]) || null) !== "—"
      ? formatReceiptDateTimeLabel(readFirstString(payload, [["issued_at"]]) || null)
      : formatReceiptDateTimeLabel((receipt as { issued_at?: string | null }).issued_at ?? null),
    providerName: providerName || "Magnifique CRM",
    customerName: customerName || "—",
    paymentMethodLabel,
    amountLabel,
    currencyCode: receipt.currency_code || "EUR",
    lines: receiptLineRows,
    note: isCancelled ? "Dieser Beleg ist storniert." : null,
  });

  const pdfFilename = `Beleg-${receiptNumber}.pdf`;

  const deliveryInsert = {
    tenant_id: tenantId,
    fiscal_receipt_id: receiptId,
    channel: "EMAIL",
    status: "PENDING",
    recipient: customerEmail,
    subject,
    message_preview: text.slice(0, 500),
    sent_by: user.id,
  };

  const { data: deliveryRaw, error: deliveryInsertError } = await admin
    .from("receipt_deliveries")
    .insert(deliveryInsert)
    .select("id")
    .single();

  if (deliveryInsertError || !deliveryRaw?.id) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: deliveryInsertError?.message ?? "Versandlog konnte nicht angelegt werden." }));
  }

  const deliveryId = String(deliveryRaw.id);
  let redirectUrl = "";

  try {
    const deliveryMode = String(tenantMailSettings?.mail_delivery_mode ?? "").trim().toLowerCase();

    const mailResult =
      deliveryMode === "oauth_user"
        ? await sendGoogleMail({
            to: customerEmail,
            subject,
            text,
            replyTo: replyToEmail || undefined,
            senderName: senderName || undefined,
            senderEmail: senderEmail || undefined,
            attachments: [
              {
                filename: pdfFilename,
                content: pdfAttachment,
                contentType: "application/pdf",
              },
            ],
          })
        : await sendMail({
            to: customerEmail,
            subject,
            text,
            replyTo: replyToEmail || undefined,
            senderName: senderName || undefined,
            senderEmail: senderEmail || undefined,
          });

    const sentAt = new Date().toISOString();
    const { error: deliveryUpdateError } = await admin
      .from("receipt_deliveries")
      .update({
        status: "SENT",
        provider: mailResult.provider,
        provider_message_id: mailResult.messageId ?? null,
        sent_at: sentAt,
        failed_at: null,
        error_message: null,
      })
      .eq("id", deliveryId);

    if (deliveryUpdateError) {
      throw new Error(deliveryUpdateError.message ?? "Versandlog konnte nicht finalisiert werden.");
    }

    await insertFiscalEventSafe(admin, {
      tenantId,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "RECEIPT_DELIVERY_SENT",
      notes: `Beleg per E-Mail an ${customerEmail} versendet.`,
      referenceData: {
        receipt_id: receiptId,
        delivery_id: deliveryId,
        channel: "EMAIL",
        recipient: customerEmail,
        subject,
        provider: mailResult.provider,
        provider_message_id: mailResult.messageId ?? null,
        sender_email: senderEmail || null,
        sender_name: senderName || null,
        reply_to_email: replyToEmail || null,
        sent_at: sentAt,
      },
    });

    redirectUrl = buildRechnungenUrlFromReturnQuery(returnQuery, {
      receiptId,
      success: `Beleg ${receiptNumber} per E-Mail versendet ✅`,
    });
  } catch (error: any) {
    const failedAt = new Date().toISOString();
    const message = String(error?.message ?? "E-Mail-Versand fehlgeschlagen.").trim() || "E-Mail-Versand fehlgeschlagen.";

    await admin
      .from("receipt_deliveries")
      .update({
        status: "FAILED",
        failed_at: failedAt,
        error_message: message,
      })
      .eq("id", deliveryId);

    await insertFiscalEventSafe(admin, {
      tenantId,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "RECEIPT_DELIVERY_FAILED",
      notes: `E-Mail-Versand an ${customerEmail} fehlgeschlagen.`,
      referenceData: {
        receipt_id: receiptId,
        delivery_id: deliveryId,
        channel: "EMAIL",
        recipient: customerEmail,
        subject,
        sender_email: senderEmail || null,
        sender_name: senderName || null,
        reply_to_email: replyToEmail || null,
        failed_at: failedAt,
        error_message: message,
      },
    });

    redirectUrl = buildRechnungenUrlFromReturnQuery(returnQuery, {
      receiptId,
      error: message,
    });
  }

  revalidatePath("/rechnungen");
  redirect(redirectUrl);
}

export async function openFiscalReceiptWhatsApp(formData: FormData) {
  const receiptId = String(formData.get("receipt_id") ?? "").trim();
  const returnQuery = String(formData.get("return_query") ?? "").trim();

  if (!receiptId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: "Beleg konnte nicht zugeordnet werden." }));
  }

  const { admin, user, effectiveTenantId } = await requireContext();

  const { data: receiptRaw, error: receiptError } = await admin
    .from("fiscal_receipts")
    .select(`
      id,
      tenant_id,
      sales_order_id,
      payment_id,
      receipt_number,
      receipt_type,
      status,
      issued_at,
      currency_code,
      turnover_value_cents,
      receipt_payload_canonical,
      verification_notes
    `)
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError || !receiptRaw) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beleg konnte nicht geladen werden." }));
  }

  const receipt = receiptRaw as {
    id: string;
    tenant_id: string | null;
    sales_order_id: string | null;
    payment_id: string | null;
    receipt_number: string | null;
    receipt_type: string | null;
    status: string | null;
    issued_at: string | null;
    currency_code: string | null;
    turnover_value_cents: number | null;
    receipt_payload_canonical: string | null;
    verification_notes: string | null;
  };

  const tenantId = String(receipt.tenant_id ?? "").trim();
  if (!tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beleg hat keinen Tenant." }));
  }

  if (effectiveTenantId && effectiveTenantId !== tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Dieser Beleg gehört nicht zum aktiven Tenant." }));
  }

  const isCancelled = isReceiptCancelled(receipt.status) || isStornoReceiptType(receipt.receipt_type, receipt.verification_notes);
  if (isCancelled) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Stornierte Belege können nicht per WhatsApp vorbereitet werden." }));
  }

  const payload = parsePayload(receipt.receipt_payload_canonical);
  const receiptNumber = String(receipt.receipt_number ?? "").trim() || receipt.id;

  const salesOrderId = String(receipt.sales_order_id ?? "").trim();
  let customerPhone = "";

  if (salesOrderId) {
    const { data: salesOrderRaw } = await admin
      .from("sales_orders")
      .select("id, customer_id")
      .eq("id", salesOrderId)
      .maybeSingle();

    const customerProfileId = String((salesOrderRaw as { customer_id?: string | null } | null)?.customer_id ?? "").trim();
    if (customerProfileId) {
      const { data: customerProfileRaw } = await admin
        .from("customer_profiles")
        .select(`id, person:persons ( phone )`)
        .eq("id", customerProfileId)
        .maybeSingle();

      const personJoin = firstJoin((customerProfileRaw as any)?.person);
      customerPhone = String(personJoin?.phone ?? "").trim();
    }
  }

  const normalizedPhone = normalizePhoneForWhatsApp(customerPhone);
  if (!normalizedPhone) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beim Kunden ist keine WhatsApp-fähige Telefonnummer hinterlegt." }));
  }

  const { data: tenantRaw } = await admin
    .from("tenants")
    .select("display_name")
    .eq("id", tenantId)
    .maybeSingle();

  const providerName =
    readFirstString(payload, [["provider_name"], ["tenant_display_name"], ["tenant_name"], ["tenant", "display_name"]]) ||
    String((tenantRaw as { display_name?: string | null } | null)?.display_name ?? "").trim() ||
    "Magnifique CRM";

  const amountLabel = formatGrossAmountLabel(
    typeof receipt.turnover_value_cents === "number" ? receipt.turnover_value_cents / 100 : null,
    receipt.currency_code || "EUR"
  );
  const subject = buildReceiptEmailSubject(receiptNumber, providerName);
  const whatsappText = buildReceiptWhatsAppText(receiptNumber, providerName, amountLabel);
  const whatsappHref = buildReceiptWhatsAppHref(normalizedPhone, whatsappText);

  const deliveryInsert = {
    tenant_id: tenantId,
    fiscal_receipt_id: receiptId,
    channel: "WHATSAPP",
    status: "PENDING",
    recipient: normalizedPhone,
    subject,
    message_preview: whatsappText.slice(0, 500),
    sent_by: user.id,
  };

  const { data: deliveryRaw, error: deliveryInsertError } = await admin
    .from("receipt_deliveries")
    .insert(deliveryInsert)
    .select("id")
    .single();

  if (deliveryInsertError || !deliveryRaw?.id) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: deliveryInsertError?.message ?? "WhatsApp-Log konnte nicht angelegt werden." }));
  }

  const deliveryId = String(deliveryRaw.id);
  let redirectUrl = whatsappHref;

  try {
    const openedAt = new Date().toISOString();
    const { error: deliveryUpdateError } = await admin
      .from("receipt_deliveries")
      .update({
        status: "SENT",
        provider: "WHATSAPP_LINK",
        provider_message_id: null,
        sent_at: openedAt,
        failed_at: null,
        error_message: null,
      })
      .eq("id", deliveryId);

    if (deliveryUpdateError) {
      throw new Error(deliveryUpdateError.message ?? "WhatsApp-Log konnte nicht finalisiert werden.");
    }

    await insertFiscalEventSafe(admin, {
      tenantId,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "RECEIPT_DELIVERY_SENT",
      notes: `Beleg per WhatsApp an ${normalizedPhone} vorbereitet.`,
      referenceData: {
        receipt_id: receiptId,
        delivery_id: deliveryId,
        channel: "WHATSAPP",
        recipient: normalizedPhone,
        subject,
        provider: "WHATSAPP_LINK",
        opened_at: openedAt,
        whatsapp_href: whatsappHref,
      },
    });
  } catch (error: any) {
    const failedAt = new Date().toISOString();
    const message = String(error?.message ?? "WhatsApp-Versand konnte nicht protokolliert werden.").trim() || "WhatsApp-Versand konnte nicht protokolliert werden.";

    await admin
      .from("receipt_deliveries")
      .update({
        status: "FAILED",
        failed_at: failedAt,
        error_message: message,
      })
      .eq("id", deliveryId);

    await insertFiscalEventSafe(admin, {
      tenantId,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "RECEIPT_DELIVERY_FAILED",
      notes: `WhatsApp-Versand an ${normalizedPhone} konnte nicht protokolliert werden.`,
      referenceData: {
        receipt_id: receiptId,
        delivery_id: deliveryId,
        channel: "WHATSAPP",
        recipient: normalizedPhone,
        subject,
        failed_at: failedAt,
        error_message: message,
      },
    });

    redirectUrl = buildRechnungenUrlFromReturnQuery(returnQuery, {
      receiptId,
      error: message,
    });
  }

  revalidatePath("/rechnungen");
  redirect(redirectUrl);
}

export async function cancelFiscalReceiptMvp(formData: FormData) {
  const receiptId = String(formData.get("receipt_id") ?? "").trim();
  const returnQuery = String(formData.get("return_query") ?? "").trim();

  if (!receiptId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: "Beleg konnte nicht zugeordnet werden." }));
  }

  const { admin, user, effectiveTenantId } = await requireContext();

  const { data: receiptRaw, error: receiptError } = await admin
    .from("fiscal_receipts")
    .select(`
      id,
      tenant_id,
      sales_order_id,
      payment_id,
      cash_register_id,
      receipt_number,
      receipt_type,
      status,
      issued_at,
      currency_code,
      turnover_value_cents,
      sum_tax_set_normal,
      sum_tax_set_reduced1,
      sum_tax_set_reduced2,
      sum_tax_set_zero,
      chain_previous_receipt_id,
      chain_previous_hash,
      receipt_payload_hash,
      receipt_payload_canonical,
      signature_algorithm,
      verification_notes
    `)
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError || !receiptRaw) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Fiscal Receipt konnte nicht geladen werden." }));
  }

  const receipt = receiptRaw as {
    id: string;
    tenant_id: string | null;
    sales_order_id: string | null;
    payment_id: string | null;
    cash_register_id: string | null;
    receipt_number: string | null;
    receipt_type: string | null;
    status: string | null;
    issued_at: string | null;
    currency_code: string | null;
    turnover_value_cents: number | null;
    sum_tax_set_normal: number | null;
    sum_tax_set_reduced1: number | null;
    sum_tax_set_reduced2: number | null;
    sum_tax_set_zero: number | null;
    chain_previous_receipt_id: string | null;
    chain_previous_hash: string | null;
    receipt_payload_hash: string | null;
    receipt_payload_canonical: string | null;
    signature_algorithm: string | null;
    verification_notes: string | null;
  };

  const tenantId = String(receipt.tenant_id ?? "").trim();
  const salesOrderId = String(receipt.sales_order_id ?? "").trim() || null;
  const paymentId = String(receipt.payment_id ?? "").trim() || null;
  const currentStatus = normalizeReceiptStatus(receipt.status);
  const receiptType = String(receipt.receipt_type ?? "").trim().toUpperCase();

  if (!tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Beleg hat keinen Tenant." }));
  }

  if (effectiveTenantId && effectiveTenantId !== tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Dieser Beleg gehört nicht zum aktiven Tenant." }));
  }

  if (currentStatus === "REVERSED" || currentStatus === "CANCELLED") {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, success: "Beleg war bereits storniert." }));
  }

  if (String(receipt.verification_notes ?? "").includes("Stornobeleg zu") || receiptType === "REVERSAL") {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Ein Stornobeleg kann nicht nochmals storniert werden." }));
  }

  const { data: existingStornoRows } = await admin
    .from("fiscal_events")
    .select("id, reference_data")
    .eq("fiscal_receipt_id", receiptId)
    .eq("event_type", "RECEIPT_CANCELLED")
    .order("created_at", { ascending: false })
    .limit(1);

  const existingStornoRef = String((((existingStornoRows ?? [])[0] as any)?.reference_data ?? {})?.storno_receipt_id ?? "").trim();
  if (existingStornoRef) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId: existingStornoRef, success: "Stornobeleg war bereits vorhanden." }));
  }

  const { data: receiptLineRowsRaw, error: receiptLinesError } = await admin
    .from("fiscal_receipt_lines")
    .select("source_line_id, name, quantity, unit_price_gross, tax_rate, line_total_gross")
    .eq("fiscal_receipt_id", receiptId)
    .order("created_at", { ascending: true });

  if (receiptLinesError) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: receiptLinesError.message ?? "Receipt-Zeilen konnten nicht geladen werden." }));
  }

  const receiptLines = (receiptLineRowsRaw ?? []) as Array<{
    source_line_id: string | null;
    name: string | null;
    quantity: number | null;
    unit_price_gross: number | null;
    tax_rate: number | null;
    line_total_gross: number | null;
  }>;

  if (receiptLines.length === 0) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: "Für den Beleg wurden keine Receipt-Zeilen gefunden." }));
  }

  const cancelledAt = new Date().toISOString();
  const stornoReceiptNumber = await nextReceiptNumber(admin, String(receipt.cash_register_id ?? "").trim());

  const payloadBefore = parsePayload(receipt.receipt_payload_canonical);
  const customerName =
    readFirstString(payloadBefore, [
      ["customer_name"],
      ["person_name"],
      ["customer", "full_name"],
      ["customer", "name"],
    ]) || null;
  const providerName =
    readFirstString(payloadBefore, [
      ["provider_name"],
      ["tenant_display_name"],
      ["tenant_name"],
      ["tenant", "display_name"],
    ]) || null;

  const stornoPayloadLines = receiptLines.map((line) => ({
    source_line_id: line.source_line_id,
    name: line.name ?? "Position",
    quantity: Number(line.quantity ?? 0) || 0,
    unit_price_gross: -Math.abs(Math.round(Number(line.unit_price_gross ?? 0) * 100)),
    tax_rate: Number(line.tax_rate ?? 0) || 0,
    line_total_gross: -Math.abs(Math.round(Number(line.line_total_gross ?? 0) * 100)),
  }));

  const stornoPayload = {
    receipt_id: null,
    cash_register_id: receipt.cash_register_id,
    sales_order_id: receipt.sales_order_id,
    payment_id: null,
    receipt_number: stornoReceiptNumber,
    receipt_type: "STANDARD",
    issued_at: cancelledAt,
    currency_code: receipt.currency_code || "EUR",
    customer_name: customerName,
    provider_name: providerName,
    turnover_value_cents: -Math.abs(Number(receipt.turnover_value_cents ?? 0) || 0),
    original_receipt_id: receipt.id,
    original_receipt_number: receipt.receipt_number,
    lines: stornoPayloadLines,
  };
  const stornoPayloadCanonical = JSON.stringify(stornoPayload);
  const stornoPayloadHash = createHash("sha256").update(stornoPayloadCanonical).digest("hex");

  const { data: stornoInsert, error: stornoInsertError } = await admin
    .from("fiscal_receipts")
    .insert({
      tenant_id: tenantId,
      cash_register_id: receipt.cash_register_id,
      sales_order_id: receipt.sales_order_id,
      payment_id: null,
      receipt_number: stornoReceiptNumber,
      receipt_type: "STANDARD",
      status: "REQUESTED",
      issued_at: cancelledAt,
      currency_code: receipt.currency_code || "EUR",
      sum_tax_set_normal: -Math.abs(Number(receipt.sum_tax_set_normal ?? 0) || 0),
      sum_tax_set_reduced1: -Math.abs(Number(receipt.sum_tax_set_reduced1 ?? 0) || 0),
      sum_tax_set_reduced2: -Math.abs(Number(receipt.sum_tax_set_reduced2 ?? 0) || 0),
      sum_tax_set_zero: -Math.abs(Number(receipt.sum_tax_set_zero ?? 0) || 0),
      turnover_value_cents: -Math.abs(Number(receipt.turnover_value_cents ?? 0) || 0),
      created_by: user.id,
      chain_previous_receipt_id: receipt.id,
      chain_previous_hash: receipt.receipt_payload_hash,
      receipt_payload_canonical: stornoPayloadCanonical,
      receipt_payload_hash: stornoPayloadHash,
      signature_algorithm: receipt.signature_algorithm || "SIMULATED_SHA256",
      signature_created_at: cancelledAt,
      signature_state: "SIMULATED",
      verification_status: "VALID",
      verification_checked_at: cancelledAt,
      verification_notes: buildVerificationNoteForStornoReceipt(String(receipt.receipt_number ?? ""), cancelledAt),
    })
    .select("id")
    .single();

  if (stornoInsertError || !stornoInsert?.id) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: "storno_receipt_insert",
      errorMessage: stornoInsertError?.message ?? "Stornobeleg konnte nicht erstellt werden.",
      createdBy: user.id,
      errorDetail: stornoInsertError ? { code: stornoInsertError.code, details: stornoInsertError.details, hint: stornoInsertError.hint } : null,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: stornoInsertError?.message ?? "Stornobeleg konnte nicht erstellt werden." }));
  }

  const stornoReceiptId = String(stornoInsert.id);

  const stornoReceiptLinesPayload = receiptLines.map((line) => ({
    fiscal_receipt_id: stornoReceiptId,
    source_line_id: line.source_line_id,
    name: line.name ?? "Position",
    quantity: Number(line.quantity ?? 0) || 0,
    unit_price_gross: -Math.abs(Number(line.unit_price_gross ?? 0) || 0),
    tax_rate: Number(line.tax_rate ?? 0) || 0,
    line_total_gross: -Math.abs(Number(line.line_total_gross ?? 0) || 0),
  }));

  const { error: stornoLinesInsertError } = await admin
    .from("fiscal_receipt_lines")
    .insert(stornoReceiptLinesPayload);

  if (stornoLinesInsertError) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: stornoReceiptId,
      failedStep: "storno_receipt_lines_insert",
      errorMessage: stornoLinesInsertError.message ?? "Storno-Receipt-Zeilen konnten nicht erstellt werden.",
      createdBy: user.id,
      errorDetail: stornoLinesInsertError ? { code: stornoLinesInsertError.code, details: stornoLinesInsertError.details, hint: stornoLinesInsertError.hint } : null,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: stornoLinesInsertError.message ?? "Storno-Receipt-Zeilen konnten nicht erstellt werden." }));
  }

  const { error: updateOriginalError } = await admin
    .from("fiscal_receipts")
    .update({
      status: "REVERSED",
      verification_notes: buildVerificationNoteForRealCancellation(receipt.verification_notes, stornoReceiptNumber, cancelledAt),
      updated_at: cancelledAt,
    })
    .eq("id", receiptId);

  if (updateOriginalError) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: "original_receipt_mark_reversed",
      errorMessage: updateOriginalError.message ?? "Originalbeleg konnte nicht auf storniert gesetzt werden.",
      createdBy: user.id,
      errorDetail: updateOriginalError ? { code: updateOriginalError.code, details: updateOriginalError.details, hint: updateOriginalError.hint } : null,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updateOriginalError.message ?? "Originalbeleg konnte nicht auf storniert gesetzt werden." }));
  }

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: receipt.cash_register_id,
    fiscalReceiptId: receiptId,
    performedBy: user.id,
    eventType: "RECEIPT_CANCELLED",
    notes: "Originalbeleg storniert. Echter Stornobeleg erstellt.",
    referenceData: {
      receipt_id: receiptId,
      receipt_number: receipt.receipt_number,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      cancelled_at: cancelledAt,
      previous_status: receipt.status,
      cancellation_mode: "REAL_STORNO_RECEIPT",
      storno_receipt_id: stornoReceiptId,
      storno_receipt_number: stornoReceiptNumber,
    },
  });

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: receipt.cash_register_id,
    fiscalReceiptId: stornoReceiptId,
    performedBy: user.id,
    eventType: "STANDARD_RECEIPT_CREATED",
    notes: "Stornobeleg erfolgreich erzeugt.",
    referenceData: {
      receipt_id: stornoReceiptId,
      receipt_number: stornoReceiptNumber,
      receipt_type: "STANDARD",
      receipt_kind: "STORNO",
      original_receipt_id: receiptId,
      original_receipt_number: receipt.receipt_number,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      storno_payment_id: null,
      cancelled_at: cancelledAt,
      turnover_value_cents: -Math.abs(Number(receipt.turnover_value_cents ?? 0) || 0),
    },
  });

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: receipt.cash_register_id,
    fiscalReceiptId: stornoReceiptId,
    performedBy: user.id,
    eventType: "RECEIPT_VERIFICATION_SUCCEEDED",
    notes: "Simulierte Verifikation für Stornobeleg erfolgreich abgeschlossen.",
    referenceData: {
      receipt_id: stornoReceiptId,
      receipt_number: stornoReceiptNumber,
      receipt_type: "STANDARD",
      receipt_kind: "STORNO",
      verification_status: "VALID",
      signature_state: "SIMULATED",
      checked_at: cancelledAt,
      original_receipt_id: receiptId,
    },
  });

  revalidatePath("/rechnungen");
  redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId: stornoReceiptId, success: `Stornobeleg ${stornoReceiptNumber} erstellt ✅` }));
}

export async function createSalesOrderFromAppointment(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!appointmentId) redirect(buildRechnungenUrl({ error: "Termin konnte nicht zugeordnet werden." }));

  const { admin, user, effectiveTenantId } = await requireContext();
  const { data: appointmentRaw, error: appointmentError } = await admin
    .from("appointments")
    .select("id, tenant_id, person_id, service_id, service_name_snapshot, service_price_cents_snapshot, notes_internal, start_at, end_at")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointmentRaw) redirect(buildRechnungenUrl({ appointmentId, error: "Termin konnte nicht geladen werden." }));

  const appointment = appointmentRaw as AppointmentRow;
  const tenantId = String(appointment.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, error: "Termin hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, error: "Dieser Termin gehört nicht zum aktiven Tenant." }));

  const status = normalizeAppointmentStatus(readMetaLineValue(appointment.notes_internal, "Status:"));
  if (status !== "completed") redirect(buildRechnungenUrl({ appointmentId, error: "Nur Termine mit Status Gekommen dürfen abgerechnet werden." }));

  const cashRegister = await resolveCashRegister(admin, tenantId);

  const primaryName =
    String(formData.get("primary_name") ?? "").trim() ||
    String(appointment.service_name_snapshot ?? "").trim() ||
    readMetaLineValue(appointment.notes_internal, "Dienstleistung:") ||
    readMetaLineValue(appointment.notes_internal, "Titel:") ||
    "Termin";
  const primaryQuantity = parsePositiveInt(formData.get("primary_quantity"), 1);
  const primaryPriceCents = Math.max(0, parseMoneyToCents(formData.get("primary_price")) || Number(appointment.service_price_cents_snapshot ?? 0) || 0);
  const primaryTaxRate = Number(String(formData.get("primary_tax_rate") ?? "20").replace(",", "."));
  const safePrimaryTaxRate = Number.isFinite(primaryTaxRate) ? primaryTaxRate : 20;
  if (!primaryName) redirect(buildRechnungenUrl({ appointmentId, error: "Bitte mindestens eine abrechenbare Position angeben." }));

  const addExtraLine = String(formData.get("add_extra_line") ?? "0") === "1";
  const extraServiceId = String(formData.get("extra_service_id") ?? "").trim();
  const extraNameRaw = String(formData.get("extra_name") ?? "").trim();
  const extraQuantity = parsePositiveInt(formData.get("extra_quantity"), 1);
  const extraPriceCentsInput = parseMoneyToCents(formData.get("extra_price"));
  const extraTaxRate = Number(String(formData.get("extra_tax_rate") ?? "20").replace(",", "."));
  const safeExtraTaxRate = Number.isFinite(extraTaxRate) ? extraTaxRate : 20;

  let extraLine: { referenceId: string | null; name: string; quantity: number; priceCents: number; taxRate: number; lineType: "SERVICE" | "ITEM" } | null = null;
  if (addExtraLine) {
    let fallbackServicePriceCents = 0;
    let fallbackServiceName = "Zusatzleistung";
    if (extraServiceId) {
      const { data: serviceRow } = await admin
        .from("services")
        .select("id, name, default_price_cents")
        .eq("id", extraServiceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (serviceRow?.id) {
        fallbackServicePriceCents = Number(serviceRow.default_price_cents ?? 0) || 0;
        fallbackServiceName = String(serviceRow.name ?? "Zusatzleistung").trim() || "Zusatzleistung";
      }
    }
    const finalExtraName = extraNameRaw || fallbackServiceName;
    const finalExtraPriceCents = Math.max(0, extraPriceCentsInput || fallbackServicePriceCents || 0);
    if (finalExtraName && finalExtraPriceCents > 0) {
      extraLine = {
        referenceId: extraServiceId || null,
        name: finalExtraName,
        quantity: extraQuantity,
        priceCents: finalExtraPriceCents,
        taxRate: safeExtraTaxRate,
        lineType: extraServiceId ? "SERVICE" : "ITEM",
      };
    }
  }

  const primaryLineTotalCents = primaryPriceCents * primaryQuantity;
  let totalCents = primaryLineTotalCents;
  let taxTotalCents = roundTaxPortionFromGross(primaryLineTotalCents, safePrimaryTaxRate);

  const { data: salesOrderInsert, error: salesOrderError } = await admin
    .from("sales_orders")
    .insert({
      tenant_id: tenantId,
      appointment_id: appointment.id,
      customer_id: appointment.person_id,
      cash_register_id: cashRegister.id,
      status: "DRAFT",
      currency_code: "EUR",
      subtotal_gross: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (salesOrderError || !salesOrderInsert?.id) {
    redirect(buildRechnungenUrl({ appointmentId, error: salesOrderError?.message ?? "Sales Order konnte nicht erstellt werden." }));
  }

  const salesOrderId = String(salesOrderInsert.id);

  const { error: primaryLineError } = await admin.from("sales_order_lines").insert({
    sales_order_id: salesOrderId,
    line_type: "SERVICE",
    reference_id: appointment.service_id ?? appointment.id,
    name: primaryName,
    description: `Quelle: Termin ${appointment.id}`,
    quantity: primaryQuantity,
    unit_price_gross: toGrossNumber(primaryPriceCents),
    discount_amount: 0,
    tax_rate: safePrimaryTaxRate,
    line_total_gross: toGrossNumber(primaryLineTotalCents),
    sort_order: 10,
  });

  if (primaryLineError) redirect(buildRechnungenUrl({ appointmentId, error: primaryLineError.message ?? "Hauptposition konnte nicht erstellt werden." }));

  if (extraLine) {
    const extraLineTotalCents = extraLine.priceCents * extraLine.quantity;
    taxTotalCents += roundTaxPortionFromGross(extraLineTotalCents, extraLine.taxRate);
    totalCents += extraLineTotalCents;

    const { error: extraLineError } = await admin.from("sales_order_lines").insert({
      sales_order_id: salesOrderId,
      line_type: extraLine.lineType,
      reference_id: extraLine.referenceId,
      name: extraLine.name,
      description: `Quelle: Termin ${appointment.id}`,
      quantity: extraLine.quantity,
      unit_price_gross: toGrossNumber(extraLine.priceCents),
      discount_amount: 0,
      tax_rate: extraLine.taxRate,
      line_total_gross: toGrossNumber(extraLineTotalCents),
      sort_order: 20,
    });

    if (extraLineError) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: extraLineError.message ?? "Zusatzposition konnte nicht erstellt werden." }));
  }

  const { error: totalsError } = await admin
    .from("sales_orders")
    .update({ subtotal_gross: toGrossNumber(totalCents), tax_total: toGrossNumber(taxTotalCents), grand_total: toGrossNumber(totalCents) })
    .eq("id", salesOrderId);

  if (totalsError) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: totalsError.message ?? "Sales-Order-Summen konnten nicht aktualisiert werden." }));

  revalidatePath("/rechnungen");
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, success: "Sales Order erstellt ✅" }));
}

export async function createPaymentForSalesOrder(formData: FormData) {
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!salesOrderId) redirect(buildRechnungenUrl({ appointmentId, error: "Sales Order konnte nicht zugeordnet werden." }));

  const { admin, user, effectiveTenantId } = await requireContext();
  const salesOrder = await resolveSalesOrder(admin, salesOrderId);

  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: "Sales Order hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: "Diese Sales Order gehört nicht zum aktiven Tenant." }));

  const { data: lineRows, error: linesError } = await admin.from("sales_order_lines").select("line_total_gross").eq("sales_order_id", salesOrderId);
  if (linesError) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: "Sales-Order-Positionen konnten nicht geladen werden." }));

  const totalGross = typeof salesOrder.grand_total === "number" && salesOrder.grand_total > 0
    ? salesOrder.grand_total
    : (lineRows ?? []).reduce((sum: number, row: any) => sum + Number(row?.line_total_gross ?? 0), 0);
  const totalCents = Math.max(0, Math.round(totalGross * 100));
  const paidAmountCents = Math.max(0, parseMoneyToCents(formData.get("payment_amount")) || totalCents);
  const paymentMethodCode = String(formData.get("payment_method") ?? "CASH").trim().toUpperCase();
  const paymentMethodId = await resolvePaymentMethodId(admin, tenantId, paymentMethodCode);
  const paymentNotes = String(formData.get("payment_notes") ?? "").trim();
  const createdAt = new Date().toISOString();
  const resolvedCashRegister = await resolveCashRegister(admin, tenantId);
  const cashRegisterId = assertCashRegisterConsistency({
    salesOrderCashRegisterId: salesOrder.cash_register_id,
    resolvedCashRegisterId: resolvedCashRegister.id,
  }) || resolvedCashRegister.id;
  const cashRegister = { id: cashRegisterId };

  const isCard = isCardPaymentMethodCode(paymentMethodCode);
  const isTransfer = isTransferPaymentMethodCode(paymentMethodCode);
  const paymentStatus = isCard ? "PENDING" : "COMPLETED";
  const provider = isCard ? "STRIPE_TERMINAL" : "MANUAL";
  const paidAt = isCard ? null : createdAt;
  const providerResponse = isCard
    ? {
        phase: "payment_intent_pending",
        method: "card",
        created_at: createdAt,
      }
    : {
        phase: "completed",
        method: isTransfer ? "transfer" : "cash",
        completed_at: createdAt,
      };

  const { data: paymentInsert, error: paymentError } = await admin
    .from("payments")
    .insert({
      tenant_id: tenantId,
      sales_order_id: salesOrderId,
      cash_register_id: cashRegister.id,
      payment_method_id: paymentMethodId,
      amount: toGrossNumber(paidAmountCents),
      currency_code: salesOrder.currency_code || "EUR",
      direction: "INBOUND",
      status: paymentStatus,
      paid_at: paidAt,
      external_reference: paymentNotes || null,
      recorded_by: user.id,
      provider,
      provider_transaction_id: null,
      provider_response_json: providerResponse,
      failure_reason: null,
    })
    .select("id")
    .single();

  if (paymentError || !paymentInsert?.id) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, error: paymentError?.message ?? "Payment konnte nicht erstellt werden." }));
  }

  const paymentId = String(paymentInsert.id);

  if (isCard) {
    try {
      const intent = await createStripeTerminalIntentForPayment({
        amountCents: paidAmountCents,
        currencyCode: salesOrder.currency_code || "EUR",
        paymentId,
        salesOrderId,
        tenantId,
      });

      await admin
        .from("payments")
        .update({
          provider: "STRIPE_TERMINAL",
          provider_transaction_id: intent.id,
          provider_response_json: {
            phase: "payment_intent_created",
            created_at: createdAt,
            stripe_payment_intent_id: intent.id,
            stripe_status: intent.status,
            has_client_secret: Boolean(intent.client_secret),
          },
          failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);
    } catch (stripeError: any) {
      const message =
        String(stripeError?.message ?? "Stripe PaymentIntent konnte nicht erstellt werden.").trim() ||
        "Stripe PaymentIntent konnte nicht erstellt werden.";

      await admin
        .from("payments")
        .update({
          status: "FAILED",
          provider: "STRIPE_TERMINAL",
          provider_response_json: {
            phase: "payment_intent_failed",
            failed_at: new Date().toISOString(),
            error_message: message,
          },
          failure_reason: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: message }));
    }
  } else {
    await admin
      .from("sales_orders")
      .update({ status: "COMPLETED", completed_at: createdAt, cash_register_id: cashRegister.id })
      .eq("id", salesOrderId);
  }

  revalidatePath("/rechnungen");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  const successMessage = isCard ? "Kartenzahlung mit Stripe vorbereitet ✅" : "Payment erfasst ✅";
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, success: successMessage }));
}

export async function startCardPaymentForCheckout(formData: FormData) {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!paymentId || !salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht zugeordnet werden." }));
  }

  const { admin, effectiveTenantId } = await requireContext();
  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Sales Order hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Diese Sales Order gehört nicht zum aktiven Tenant." }));

  const { data: paymentRaw, error: paymentError } = await admin
    .from("payments")
    .select("id, tenant_id, sales_order_id, payment_method_id, status, external_reference")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError || !paymentRaw) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht geladen werden." }));

  const payment = paymentRaw as { id: string; tenant_id: string | null; sales_order_id: string | null; payment_method_id: string | null; status: string | null; external_reference: string | null };
  if (String(payment.tenant_id ?? "").trim() !== tenantId || String(payment.sales_order_id ?? "").trim() !== salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment gehört nicht zur aktuellen Sales Order." }));
  }

  const methodCode = await loadPaymentMethodCodeById(admin, payment.payment_method_id);
  if (!isCardPaymentMethodCode(methodCode)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Nur Kartenzahlungen können gestartet werden." }));
  }

  const status = String(payment.status ?? "").trim().toUpperCase();
  if (status !== "PENDING") {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Kartenzahlung ist nicht mehr startbar." }));
  }

  const providerReference = String(payment.external_reference ?? "").trim() || `SIM-${Date.now()}`;
  const startedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: "PROCESSING",
      external_reference: providerReference,
      provider: "STRIPE_TERMINAL",
      provider_response_json: {
        phase: "processing",
        started_at: startedAt,
        provider_reference: providerReference,
      },
      failure_reason: null,
      updated_at: startedAt,
    })
    .eq("id", paymentId);

  if (updateError) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: updateError.message ?? "Kartenzahlung konnte nicht gestartet werden." }));
  }

  revalidatePath("/rechnungen");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, success: "Kartenzahlung gestartet ✅" }));
}

export async function completeCardPaymentForCheckout(formData: FormData) {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!paymentId || !salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht zugeordnet werden." }));
  }

  const { admin, effectiveTenantId } = await requireContext();
  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Sales Order hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Diese Sales Order gehört nicht zum aktiven Tenant." }));

  const { data: paymentRaw, error: paymentError } = await admin
    .from("payments")
    .select("id, tenant_id, sales_order_id, payment_method_id, status, provider_transaction_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError || !paymentRaw) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht geladen werden." }));

  const payment = paymentRaw as { id: string; tenant_id: string | null; sales_order_id: string | null; payment_method_id: string | null; status: string | null; provider_transaction_id: string | null };
  if (String(payment.tenant_id ?? "").trim() !== tenantId || String(payment.sales_order_id ?? "").trim() !== salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment gehört nicht zur aktuellen Sales Order." }));
  }

  const methodCode = await loadPaymentMethodCodeById(admin, payment.payment_method_id);
  if (!isCardPaymentMethodCode(methodCode)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Nur Kartenzahlungen können abgeschlossen werden." }));
  }

  const status = String(payment.status ?? "").trim().toUpperCase();
  if (!["PENDING", "PROCESSING"].includes(status)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Kartenzahlung ist nicht in einem abschließbaren Zustand." }));
  }

  const completedAt = new Date().toISOString();
  const providerTransactionId = String(payment.provider_transaction_id ?? "").trim() || `SIM-TX-${Date.now()}`;

  const { error: updatePaymentError } = await admin
    .from("payments")
    .update({
      status: "COMPLETED",
      paid_at: completedAt,
      provider: "STRIPE_TERMINAL",
      provider_transaction_id: providerTransactionId,
      provider_response_json: {
        phase: "completed",
        completed_at: completedAt,
        provider_transaction_id: providerTransactionId,
      },
      failure_reason: null,
      updated_at: completedAt,
    })
    .eq("id", paymentId);

  if (updatePaymentError) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: updatePaymentError.message ?? "Kartenzahlung konnte nicht abgeschlossen werden." }));
  }

  await admin
    .from("sales_orders")
    .update({ status: "COMPLETED", completed_at: completedAt })
    .eq("id", salesOrderId);

  revalidatePath("/rechnungen");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, success: "Kartenzahlung abgeschlossen ✅" }));
}

export async function failCardPaymentForCheckout(formData: FormData) {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "Terminalzahlung fehlgeschlagen").trim() || "Terminalzahlung fehlgeschlagen";
  if (!paymentId || !salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht zugeordnet werden." }));
  }

  const { admin, effectiveTenantId } = await requireContext();
  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Sales Order hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Diese Sales Order gehört nicht zum aktiven Tenant." }));

  const { data: paymentRaw, error: paymentError } = await admin
    .from("payments")
    .select("id, tenant_id, sales_order_id, payment_method_id, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError || !paymentRaw) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht geladen werden." }));

  const payment = paymentRaw as { id: string; tenant_id: string | null; sales_order_id: string | null; payment_method_id: string | null; status: string | null };
  if (String(payment.tenant_id ?? "").trim() !== tenantId || String(payment.sales_order_id ?? "").trim() !== salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment gehört nicht zur aktuellen Sales Order." }));
  }

  const methodCode = await loadPaymentMethodCodeById(admin, payment.payment_method_id);
  if (!isCardPaymentMethodCode(methodCode)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Nur Kartenzahlungen können fehlschlagen." }));
  }

  const status = String(payment.status ?? "").trim().toUpperCase();
  if (!["PENDING", "PROCESSING"].includes(status)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Kartenzahlung ist nicht in einem fehlerschreibbaren Zustand." }));
  }

  const failedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: "FAILED",
      provider: "STRIPE_TERMINAL",
      provider_response_json: {
        phase: "failed",
        failed_at: failedAt,
        reason,
      },
      failure_reason: reason,
      updated_at: failedAt,
    })
    .eq("id", paymentId);

  if (updateError) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: updateError.message ?? "Kartenzahlung konnte nicht als fehlgeschlagen markiert werden." }));
  }

  revalidatePath("/rechnungen");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, success: "Kartenzahlung als fehlgeschlagen markiert ⚠️" }));
}

export async function cancelCardPaymentForCheckout(formData: FormData) {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!paymentId || !salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht zugeordnet werden." }));
  }

  const { admin, effectiveTenantId } = await requireContext();
  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Sales Order hat keinen Tenant." }));
  if (effectiveTenantId && effectiveTenantId !== tenantId) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Diese Sales Order gehört nicht zum aktiven Tenant." }));

  const { data: paymentRaw, error: paymentError } = await admin
    .from("payments")
    .select("id, tenant_id, sales_order_id, payment_method_id, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError || !paymentRaw) redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment konnte nicht geladen werden." }));

  const payment = paymentRaw as { id: string; tenant_id: string | null; sales_order_id: string | null; payment_method_id: string | null; status: string | null };
  if (String(payment.tenant_id ?? "").trim() !== tenantId || String(payment.sales_order_id ?? "").trim() !== salesOrderId) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Payment gehört nicht zur aktuellen Sales Order." }));
  }

  const methodCode = await loadPaymentMethodCodeById(admin, payment.payment_method_id);
  if (!isCardPaymentMethodCode(methodCode)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Nur Kartenzahlungen können abgebrochen werden." }));
  }

  const status = String(payment.status ?? "").trim().toUpperCase();
  if (!["PENDING", "PROCESSING"].includes(status)) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Kartenzahlung ist nicht in einem abbrechbaren Zustand." }));
  }

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: "CANCELLED",
      provider: "STRIPE_TERMINAL",
      provider_response_json: {
        phase: "cancelled",
        cancelled_at: cancelledAt,
      },
      failure_reason: null,
      updated_at: cancelledAt,
    })
    .eq("id", paymentId);

  if (updateError) {
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: updateError.message ?? "Kartenzahlung konnte nicht abgebrochen werden." }));
  }

  revalidatePath("/rechnungen");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, success: "Kartenzahlung abgebrochen." }));
}



async function createFiscalReceiptForPaymentInternal(input: {
  admin: any;
  userId: string;
  effectiveTenantId: string | null;
  appointmentId?: string | null;
  salesOrderId: string;
  paymentId: string;
}) {
  const { admin, userId, effectiveTenantId } = input;
  const appointmentId = String(input.appointmentId ?? "").trim();
  const salesOrderId = String(input.salesOrderId ?? "").trim();
  const paymentId = String(input.paymentId ?? "").trim();

  if (!salesOrderId || !paymentId) {
    throw new Error("Sales Order oder Payment fehlt für Fiscal.");
  }

  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const tenantId = String(salesOrder.tenant_id ?? "").trim();
  if (!tenantId) throw new Error("Sales Order hat keinen Tenant.");
  if (effectiveTenantId && effectiveTenantId !== tenantId) {
    throw new Error("Diese Sales Order gehört nicht zum aktiven Tenant.");
  }

  const { data: paymentRaw, error: paymentError } = await admin
    .from("payments")
    .select("id, tenant_id, sales_order_id, cash_register_id, payment_method_id, amount, currency_code, status, paid_at, created_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !paymentRaw) {
    throw new Error("Payment konnte für Fiscal nicht geladen werden.");
  }

  const payment = paymentRaw as PaymentContextRow;

  if (String(payment.status ?? "").trim().toUpperCase() !== "COMPLETED") {
    throw new Error("Fiscal darf erst nach erfolgreichem Payment erzeugt werden.");
  }

  const { data: existingReceiptRows } = await admin
    .from("fiscal_receipts")
    .select("id")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false })
    .limit(1);

  const existingReceiptId = String(((existingReceiptRows ?? [])[0] as any)?.id ?? "").trim();
  if (existingReceiptId) {
    return {
      receiptId: existingReceiptId,
      alreadyExisted: true,
    };
  }

  const salesOrderCashRegisterId = String(salesOrder.cash_register_id ?? "").trim();
  const paymentCashRegisterId = String(payment.cash_register_id ?? "").trim();

  let cashRegisterId =
    assertCashRegisterConsistency({
      salesOrderCashRegisterId,
      paymentCashRegisterId,
      resolvedCashRegisterId: null,
    }) || salesOrderCashRegisterId || paymentCashRegisterId;

  if (!cashRegisterId) {
    const resolvedCashRegister = await resolveCashRegister(admin, tenantId);
    cashRegisterId = resolvedCashRegister.id;
  }

  if (!cashRegisterId) {
    throw new Error("Für diese Zahlung ist keine Kassa zugeordnet.");
  }

  const cashRegister = { id: cashRegisterId };

  const appointmentLookupId = String(salesOrder.appointment_id ?? appointmentId ?? "").trim();
  let appointmentDetails: AppointmentDetailLookupRow | null = null;
  if (appointmentLookupId) {
    const { data: appointmentDetailsRaw } = await admin
      .from("appointments")
      .select(`
        id, tenant_id, person_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name )
      `)
      .eq("id", appointmentLookupId)
      .maybeSingle();
    appointmentDetails = (appointmentDetailsRaw ?? null) as AppointmentDetailLookupRow | null;
  }

  const appointmentTenant = firstJoin(appointmentDetails?.tenant);
  const appointmentPerson = firstJoin(appointmentDetails?.person);
  const customerName = String(appointmentPerson?.full_name ?? "").trim() || null;
  const providerName = String(appointmentTenant?.display_name ?? "").trim() || null;

  const { data: lineRows, error: linesError } = await admin
    .from("sales_order_lines")
    .select("id, sales_order_id, name, quantity, unit_price_gross, tax_rate, line_total_gross, created_at")
    .eq("sales_order_id", salesOrderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (linesError) throw new Error("Sales-Order-Zeilen konnten nicht geladen werden.");

  const salesOrderLines = (lineRows ?? []) as SalesOrderLineRow[];
  if (salesOrderLines.length === 0) throw new Error("Für die Sales Order gibt es keine Positionen.");

  const totalCents = salesOrderLines.reduce((sum, line) => sum + Math.round(Number(line.line_total_gross ?? 0) * 100), 0);
  let normalCents = 0;
  let reduced1Cents = 0;
  let reduced2Cents = 0;
  let zeroCents = 0;

  const payloadLines = salesOrderLines.map((line) => {
    const qty = Number(line.quantity ?? 0) || 0;
    const unitGross = Math.round(Number(line.unit_price_gross ?? 0) * 100);
    const lineGross = Math.round(Number(line.line_total_gross ?? 0) * 100);
    const taxRate = Number(line.tax_rate ?? 0) || 0;
    if (taxRate >= 19) normalCents += lineGross;
    else if (taxRate >= 12) reduced2Cents += lineGross;
    else if (taxRate > 0) reduced1Cents += lineGross;
    else zeroCents += lineGross;
    return {
      source_line_id: line.id,
      name: line.name ?? "Position",
      quantity: qty,
      unit_price_gross: unitGross,
      tax_rate: taxRate,
      line_total_gross: lineGross,
    };
  });

  const receiptNumber = await nextReceiptNumber(admin, cashRegister.id);
  const issuedAt = new Date().toISOString();

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: cashRegister.id,
    performedBy: userId,
    eventType: "RECEIPT_CREATION_STARTED",
    notes: "Fiscal-Receipt-Erstellung aus Sales Order + Payment gestartet.",
    referenceData: {
      appointment_id: appointmentId || null,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      line_count: salesOrderLines.length,
      customer_name: customerName,
      provider_name: providerName,
      source: "manual_or_batch_repair",
    },
  });

  const { data: previousReceiptRows } = await admin
    .from("fiscal_receipts")
    .select("id, receipt_payload_hash")
    .eq("cash_register_id", cashRegister.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const previousReceipt = ((previousReceiptRows ?? [])[0] ?? null) as {
    id?: string | null;
    receipt_payload_hash?: string | null;
  } | null;

  const payload = {
    receipt_id: null,
    cash_register_id: cashRegister.id,
    sales_order_id: salesOrderId,
    payment_id: paymentId,
    receipt_number: receiptNumber,
    issued_at: issuedAt,
    currency_code: payment.currency_code || salesOrder.currency_code || "EUR",
    customer_name: customerName,
    provider_name: providerName,
    turnover_value_cents: totalCents,
    lines: payloadLines,
  };

  const payloadCanonical = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadCanonical).digest("hex");

  const { data: receiptInsert, error: receiptError } = await admin
    .from("fiscal_receipts")
    .insert({
      tenant_id: tenantId,
      cash_register_id: cashRegister.id,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      issued_at: issuedAt,
      currency_code: payment.currency_code || salesOrder.currency_code || "EUR",
      sum_tax_set_normal: normalCents,
      sum_tax_set_reduced1: reduced1Cents,
      sum_tax_set_reduced2: reduced2Cents,
      sum_tax_set_zero: zeroCents,
      turnover_value_cents: totalCents,
      created_by: userId,
      chain_previous_receipt_id: previousReceipt?.id ?? null,
      chain_previous_hash: previousReceipt?.receipt_payload_hash ?? null,
      receipt_payload_canonical: payloadCanonical,
      receipt_payload_hash: payloadHash,
      signature_algorithm: "SIMULATED_SHA256",
      signature_created_at: issuedAt,
      signature_state: "SIMULATED",
      verification_status: "VALID",
      verification_checked_at: issuedAt,
      verification_notes: "Simulierter Fiscal-Receipt aus Sales Order + Payment erstellt.",
    })
    .select("id")
    .single();

  if (receiptError || !receiptInsert?.id) {
    const failureMessage = receiptError?.message ?? "Fiscal Receipt konnte nicht erstellt werden.";
    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      performedBy: userId,
      eventType: "RECEIPT_CREATION_FAILED",
      notes: failureMessage,
      referenceData: {
        appointment_id: appointmentId || null,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        source: "manual_or_batch_repair",
      },
    });
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      salesOrderId,
      paymentId,
      failedStep: "receipt_insert",
      errorMessage: failureMessage,
      createdBy: userId,
      errorDetail: receiptError ? { code: receiptError.code, details: receiptError.details, hint: receiptError.hint } : null,
    });
    throw new Error(failureMessage);
  }

  const receiptId = String(receiptInsert.id);

  const receiptLinePayload = salesOrderLines.map((line) => ({
    fiscal_receipt_id: receiptId,
    source_line_id: line.id,
    name: line.name ?? "Position",
    quantity: Number(line.quantity ?? 0) || 0,
    unit_price_gross: Number(line.unit_price_gross ?? 0) || 0,
    tax_rate: Number(line.tax_rate ?? 0) || 0,
    line_total_gross: Number(line.line_total_gross ?? 0) || 0,
  }));

  const { error: receiptLinesError } = await admin.from("fiscal_receipt_lines").insert(receiptLinePayload);
  if (receiptLinesError) {
    const failureMessage = receiptLinesError.message ?? "Fiscal-Receipt-Zeilen konnten nicht erstellt werden.";
    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      fiscalReceiptId: receiptId,
      performedBy: userId,
      eventType: "RECEIPT_CREATION_FAILED",
      notes: failureMessage,
      referenceData: {
        appointment_id: appointmentId || null,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_id: receiptId,
        source: "manual_or_batch_repair",
      },
    });
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: "receipt_lines_insert",
      errorMessage: failureMessage,
      createdBy: userId,
      errorDetail: receiptLinesError ? { code: receiptLinesError.code, details: receiptLinesError.details, hint: receiptLinesError.hint } : null,
    });
    throw new Error(failureMessage);
  }

  await admin.from("payments").update({ cash_register_id: cashRegister.id }).eq("id", paymentId);
  await admin.from("sales_orders").update({ cash_register_id: cashRegister.id }).eq("id", salesOrderId);

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: cashRegister.id,
    fiscalReceiptId: receiptId,
    performedBy: userId,
    eventType: "STANDARD_RECEIPT_CREATED",
    notes: "Fiscal-Receipt und Receipt-Zeilen erfolgreich erzeugt.",
    referenceData: {
      appointment_id: appointmentId || null,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      turnover_value_cents: totalCents,
      line_count: receiptLinePayload.length,
      customer_name: customerName,
      provider_name: providerName,
      source: "manual_or_batch_repair",
    },
  });

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId: cashRegister.id,
    fiscalReceiptId: receiptId,
    performedBy: userId,
    eventType: "RECEIPT_VERIFICATION_SUCCEEDED",
    notes: "Simulierte Verifikation erfolgreich abgeschlossen.",
    referenceData: {
      receipt_id: receiptId,
      verification_status: "VALID",
      signature_state: "SIMULATED",
      checked_at: issuedAt,
      source: "manual_or_batch_repair",
    },
  });

  return {
    receiptId,
    alreadyExisted: false,
  };
}


export async function createFiscalReceiptForPayment(formData: FormData) {
  const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const returnQuery = String(formData.get("return_query") ?? "").trim();

  if (!salesOrderId || !paymentId) {
    if (returnQuery) {
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: "Sales Order oder Payment fehlt für Fiscal." }));
    }
    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: "Sales Order oder Payment fehlt für Fiscal." }));
  }

  const { admin, user, effectiveTenantId } = await requireContext();

  try {
    const result = await createFiscalReceiptForPaymentInternal({
      admin,
      userId: user.id,
      effectiveTenantId,
      appointmentId,
      salesOrderId,
      paymentId,
    });

    revalidatePath("/rechnungen");

    if (returnQuery) {
      redirect(
        buildRechnungenUrlFromReturnQuery(returnQuery, {
          receiptId: result.receiptId,
          success: result.alreadyExisted ? "Fiscal Receipt bereits vorhanden ✅" : "Fiscal Receipt erzeugt ✅",
        })
      );
    }

    redirect(
      buildRechnungenUrl({
        appointmentId,
        salesOrderId,
        paymentId,
        receiptId: result.receiptId,
        success: result.alreadyExisted ? "Fiscal Receipt bereits vorhanden ✅" : "Fiscal Receipt erzeugt ✅",
      })
    );
  } catch (error: any) {
    const message = String(error?.message ?? "Fiscal Receipt konnte nicht erzeugt werden.").trim();

    if (returnQuery) {
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: message }));
    }

    redirect(buildRechnungenUrl({ appointmentId, salesOrderId, paymentId, error: message }));
  }
}

export async function backfillReadyFiscalReceipts(formData: FormData) {
  const returnQuery = String(formData.get("return_query") ?? "").trim();
  const { admin, user, effectiveTenantId } = await requireContext();

  let query = admin
    .from("payments")
    .select("id, tenant_id, sales_order_id")
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(200);

  if (effectiveTenantId) {
    query = query.eq("tenant_id", effectiveTenantId);
  }

  const { data: paymentRows, error: paymentError } = await query;

  if (paymentError) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: paymentError.message ?? "Payments konnten nicht geladen werden." }));
  }

  const payments = (paymentRows ?? []) as Array<{
    id: string;
    tenant_id: string | null;
    sales_order_id: string | null;
  }>;

  const paymentIds = payments.map((p) => String(p.id ?? "").trim()).filter(Boolean);

  if (paymentIds.length === 0) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { success: "Keine offenen Fiscal-Fälle gefunden ✅" }));
  }

  const { data: existingReceiptRows, error: existingReceiptError } = await admin
    .from("fiscal_receipts")
    .select("payment_id")
    .in("payment_id", paymentIds);

  if (existingReceiptError) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: existingReceiptError.message ?? "Vorhandene Fiscal-Belege konnten nicht geprüft werden." }));
  }

  const existingPaymentIds = new Set(
    ((existingReceiptRows ?? []) as Array<{ payment_id: string | null }>)
      .map((row) => String(row.payment_id ?? "").trim())
      .filter(Boolean)
  );

  const missing = payments.filter((payment) => {
    const paymentId = String(payment.id ?? "").trim();
    const salesOrderId = String(payment.sales_order_id ?? "").trim();
    return paymentId && salesOrderId && !existingPaymentIds.has(paymentId);
  });

  if (missing.length === 0) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { success: "Alle erfolgreichen Zahlungen haben bereits Fiscal-Belege ✅" }));
  }

  let repaired = 0;
  let failed = 0;

  for (const payment of missing) {
    const paymentId = String(payment.id ?? "").trim();
    const salesOrderId = String(payment.sales_order_id ?? "").trim();

    try {
      await createFiscalReceiptForPaymentInternal({
        admin,
        userId: user.id,
        effectiveTenantId,
        appointmentId: null,
        salesOrderId,
        paymentId,
      });
      repaired += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/rechnungen");

  const message = `Auto-Nachzug fertig: ${repaired} erstellt, ${failed} fehlgeschlagen.`;
  redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { success: message }));
}


type EditableReceiptLineInput = {
  sourceLineId: string | null;
  serviceId: string | null;
  lineType: "SERVICE" | "ITEM";
  name: string;
  quantity: number;
  unitPriceGross: number;
  lineTotalGross: number;
  taxRate: number;
};

type ReceiptEditSnapshot = {
  receiptId: string;
  salesOrderId: string;
  paymentId: string | null;
  customerName: string | null;
  providerName: string | null;
  turnoverValueCents: number;
  lineCount: number;
  lines: Array<{
    sourceLineId: string | null;
    serviceId: string | null;
    lineType: "SERVICE" | "ITEM";
    name: string;
    quantity: number;
    unitPriceGross: number;
    lineTotalGross: number;
    taxRate: number;
  }>;
};

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
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readFirstString(source: unknown, candidates: string[][]) {
  for (const path of candidates) {
    const value = getNestedValue(source, path);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function parseMoneyToGross(value: string) {
  return toGrossNumber(parseMoneyToCents(value));
}

function buildRechnungenUrlFromReturnQuery(returnQuery: string | null | undefined, patch?: {
  receiptId?: string | null;
  success?: string | null;
  error?: string | null;
}) {
  const params = new URLSearchParams(String(returnQuery ?? ''));
  params.delete('success');
  params.delete('error');

  const receiptId = String(patch?.receiptId ?? '').trim();
  const success = String(patch?.success ?? '').trim();
  const error = String(patch?.error ?? '').trim();

  if (receiptId) params.set('receipt', receiptId);
  if (success) params.set('success', success);
  if (error) params.set('error', error);

  const qs = params.toString();
  return `/rechnungen${qs ? `?${qs}` : ''}`;
}

function parseEditableReceiptLines(raw: string): EditableReceiptLineInput[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const name = String(row.name ?? '').trim();
      const quantity = parsePositiveInt(String(row.quantity ?? '1') as unknown as FormDataEntryValue, 1);
      const unitPriceGross = parseMoneyToGross(String(row.unitPriceGross ?? '0'));
      const lineTotalGross = parseMoneyToGross(String(row.lineTotalGross ?? '0'));
      const taxRateRaw = Number(String(row.taxRate ?? '20').replace(',', '.'));
      const taxRate = Number.isFinite(taxRateRaw) ? taxRateRaw : 20;
      const serviceId = String(row.serviceId ?? '').trim() || null;
      const lineTypeRaw = String(row.lineType ?? (serviceId ? 'SERVICE' : 'ITEM')).trim().toUpperCase();
      const lineType: "SERVICE" | "ITEM" = lineTypeRaw === 'SERVICE' ? 'SERVICE' : 'ITEM';
      return {
        sourceLineId: String(row.sourceLineId ?? '').trim() || null,
        serviceId,
        lineType,
        name,
        quantity,
        unitPriceGross,
        lineTotalGross,
        taxRate,
      };
    })
    .filter((row) => row.name && row.quantity > 0 && row.lineTotalGross >= 0);
}


function buildReceiptEditSnapshot(input: {
  receiptId: string;
  salesOrderId: string;
  paymentId?: string | null;
  customerName?: string | null;
  providerName?: string | null;
  turnoverValueCents?: number | null;
  lines: EditableReceiptLineInput[];
}): ReceiptEditSnapshot {
  return {
    receiptId: input.receiptId,
    salesOrderId: input.salesOrderId,
    paymentId: input.paymentId ?? null,
    customerName: String(input.customerName ?? '').trim() || null,
    providerName: String(input.providerName ?? '').trim() || null,
    turnoverValueCents: Math.max(0, Number(input.turnoverValueCents ?? 0) || 0),
    lineCount: input.lines.length,
    lines: input.lines.map((line) => ({
      sourceLineId: line.sourceLineId,
      serviceId: line.serviceId,
      lineType: line.lineType,
      name: line.name,
      quantity: line.quantity,
      unitPriceGross: line.unitPriceGross,
      lineTotalGross: line.lineTotalGross,
      taxRate: line.taxRate,
    })),
  };
}

async function insertReceiptEditedEventSafe(
  admin: any,
  input: {
    tenantId: string;
    cashRegisterId?: string | null;
    fiscalReceiptId: string;
    performedBy?: string | null;
    notes: string;
    referenceData: Record<string, unknown>;
  }
) {
  const eventPayload: FiscalEventInsert = {
    tenantId: input.tenantId,
    cashRegisterId: input.cashRegisterId ?? null,
    fiscalReceiptId: input.fiscalReceiptId,
    performedBy: input.performedBy ?? null,
    eventType: 'STANDARD_RECEIPT_CREATED',
    notes: input.notes,
    referenceData: {
      ...(input.referenceData ?? {}),
      audit_action: 'receipt_edited',
    },
  };

  const result = await insertFiscalEventSafe(admin, eventPayload);
  return result;
}

export async function updateFiscalReceiptDetails(formData: FormData) {
  const receiptId = String(formData.get('receipt_id') ?? '').trim();
  const customerName = String(formData.get('customer_name') ?? '').trim();
  const customerEmail = String(formData.get('customer_email') ?? '').trim();
  const customerPhone = String(formData.get('customer_phone') ?? '').trim();
  const providerName = String(formData.get('provider_name') ?? '').trim();
  const returnQuery = String(formData.get('return_query') ?? '').trim();
  const linesRaw = String(formData.get('lines_json') ?? '[]');

  if (!receiptId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { error: 'Beleg konnte nicht zugeordnet werden.' }));
  }

  const { admin, user, effectiveTenantId } = await requireContext();

  const { data: receiptRaw, error: receiptError } = await admin
    .from('fiscal_receipts')
    .select('id, tenant_id, sales_order_id, payment_id, cash_register_id, currency_code, receipt_number, turnover_value_cents, receipt_payload_canonical')
    .eq('id', receiptId)
    .maybeSingle();

  if (receiptError || !receiptRaw) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: 'Fiscal Receipt konnte nicht geladen werden.' }));
  }

  const receipt = receiptRaw as {
    id: string;
    tenant_id: string | null;
    sales_order_id: string | null;
    payment_id: string | null;
    cash_register_id: string | null;
    currency_code: string | null;
    receipt_number: string | null;
    turnover_value_cents: number | null;
    receipt_payload_canonical: string | null;
  };

  const tenantId = String(receipt.tenant_id ?? '').trim();
  const salesOrderId = String(receipt.sales_order_id ?? '').trim();
  const paymentId = String(receipt.payment_id ?? '').trim() || null;
  if (!tenantId || !salesOrderId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: 'Beleg ist unvollständig und kann nicht bearbeitet werden.' }));
  }
  if (effectiveTenantId && effectiveTenantId !== tenantId) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: 'Dieser Beleg gehört nicht zum aktiven Tenant.' }));
  }

  const editableLines = parseEditableReceiptLines(linesRaw);
  if (editableLines.length === 0) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: 'Bitte mindestens eine Leistung erfassen.' }));
  }

  const salesOrder = await resolveSalesOrder(admin, salesOrderId);
  const personId = String(salesOrder.customer_id ?? '').trim();

  const payloadBefore = parsePayload(receipt.receipt_payload_canonical);
  const payloadBeforeLines = Array.isArray(payloadBefore?.lines) ? (payloadBefore.lines as Record<string, unknown>[]) : [];
  const beforeSnapshot = buildReceiptEditSnapshot({
    receiptId,
    salesOrderId,
    paymentId,
    customerName:
      readFirstString(payloadBefore, [
        ['customer_name'],
        ['person_name'],
        ['customer', 'full_name'],
        ['customer', 'name'],
      ]) || customerName || null,
    providerName:
      readFirstString(payloadBefore, [
        ['provider_name'],
        ['tenant_display_name'],
        ['tenant_name'],
        ['tenant', 'display_name'],
      ]) || providerName || null,
    turnoverValueCents: receipt.turnover_value_cents,
lines: payloadBeforeLines.map((line) => {
  const qty = Number(line.quantity ?? 0) || 0;
  const unitGrossCents = Number(line.unit_price_gross ?? 0) || 0;
  const totalGrossCents = Number(line.line_total_gross ?? 0) || 0;
  const taxRate = Number(line.tax_rate ?? 0) || 0;
  const serviceId = String(line.reference_id ?? '').trim() || null;
  const lineType: "SERVICE" | "ITEM" = serviceId ? "SERVICE" : "ITEM";

  return {
    sourceLineId: String(line.source_line_id ?? '').trim() || null,
    serviceId,
    lineType,
    name: String(line.name ?? '').trim(),
    quantity: qty,
    unitPriceGross: toGrossNumber(unitGrossCents),
    lineTotalGross: toGrossNumber(totalGrossCents),
    taxRate,
  } satisfies EditableReceiptLineInput;
}),
  });

  const { data: existingSalesLinesRaw, error: existingSalesLinesError } = await admin
    .from('sales_order_lines')
    .select('id, reference_id, line_type, name, quantity, unit_price_gross, line_total_gross, tax_rate, sort_order')
    .eq('sales_order_id', salesOrderId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (existingSalesLinesError) {
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: existingSalesLinesError.message ?? 'Sales-Order-Zeilen konnten nicht geladen werden.' }));
  }

  const existingSalesLines = (existingSalesLinesRaw ?? []) as Array<{
    id: string;
    reference_id: string | null;
    line_type: string | null;
    name: string | null;
    quantity: number | null;
    unit_price_gross: number | null;
    line_total_gross: number | null;
    tax_rate: number | null;
    sort_order: number | null;
  }>;
  const existingIds = new Set(existingSalesLines.map((line) => line.id));
  const keptIds = new Set(editableLines.map((line) => line.sourceLineId).filter(Boolean) as string[]);
  const removedIds = existingSalesLines.map((line) => line.id).filter((id) => !keptIds.has(id));

  if (personId) {
    const personUpdatePayload = {
      full_name: customerName || null,
      email: customerEmail || null,
      phone: customerPhone || null,
    };

    const { error: personError } = await admin
      .from('persons')
      .update(personUpdatePayload)
      .eq('id', personId);

    if (personError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'person_update',
        errorMessage: personError.message ?? 'Kundendaten konnten nicht gespeichert werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: personError.message ?? 'Kundendaten konnten nicht gespeichert werden.' }));
    }
  }

  if (removedIds.length > 0) {
    const { error: deleteReceiptLinesError } = await admin
      .from('fiscal_receipt_lines')
      .delete()
      .eq('fiscal_receipt_id', receiptId)
      .in('source_line_id', removedIds);
    if (deleteReceiptLinesError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'receipt_lines_delete',
        errorMessage: deleteReceiptLinesError.message ?? 'Entfernte Receipt-Zeilen konnten nicht gelöscht werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: deleteReceiptLinesError.message ?? 'Entfernte Receipt-Zeilen konnten nicht gelöscht werden.' }));
    }

    const { error: deleteSalesLinesError } = await admin
      .from('sales_order_lines')
      .delete()
      .eq('sales_order_id', salesOrderId)
      .in('id', removedIds);
    if (deleteSalesLinesError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'sales_order_lines_delete',
        errorMessage: deleteSalesLinesError.message ?? 'Entfernte Leistungen konnten nicht gelöscht werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: deleteSalesLinesError.message ?? 'Entfernte Leistungen konnten nicht gelöscht werden.' }));
    }
  }

  let nextSortOrder = existingSalesLines.reduce((max, line) => Math.max(max, Number(line.sort_order ?? 0)), 0) + 10;
  const finalLines: Array<EditableReceiptLineInput & { sourceLineId: string }> = [];

  for (const line of editableLines) {
    const taxRate = Number.isFinite(line.taxRate) ? line.taxRate : 20;
    const lineType: "SERVICE" | "ITEM" = line.serviceId ? 'SERVICE' : line.lineType;
    if (line.sourceLineId && existingIds.has(line.sourceLineId)) {
      const { error: updateLineError } = await admin
        .from('sales_order_lines')
        .update({
          line_type: lineType,
          reference_id: line.serviceId,
          name: line.name,
          quantity: line.quantity,
          unit_price_gross: line.unitPriceGross,
          tax_rate: taxRate,
          line_total_gross: line.lineTotalGross,
          updated_at: new Date().toISOString(),
        })
        .eq('id', line.sourceLineId)
        .eq('sales_order_id', salesOrderId);

      if (updateLineError) {
        await insertFiscalFailureSafe(admin, {
          tenantId,
          cashRegisterId: receipt.cash_register_id,
          salesOrderId,
          paymentId,
          fiscalReceiptId: receiptId,
          failedStep: 'sales_order_line_update',
          errorMessage: updateLineError.message ?? 'Leistung konnte nicht aktualisiert werden.',
          createdBy: user.id,
        });
        redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updateLineError.message ?? 'Leistung konnte nicht aktualisiert werden.' }));
      }

      finalLines.push({ ...line, serviceId: line.serviceId, lineType, taxRate, sourceLineId: line.sourceLineId });
      continue;
    }

    const { data: insertedLine, error: insertLineError } = await admin
      .from('sales_order_lines')
      .insert({
        sales_order_id: salesOrderId,
        line_type: lineType,
        reference_id: line.serviceId,
        name: line.name,
        description: `Nachbearbeitet aus Fiscal Receipt ${receiptId}`,
        quantity: line.quantity,
        unit_price_gross: line.unitPriceGross,
        discount_amount: 0,
        tax_rate: taxRate,
        line_total_gross: line.lineTotalGross,
        sort_order: nextSortOrder,
      })
      .select('id')
      .single();

    if (insertLineError || !insertedLine?.id) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'sales_order_line_insert',
        errorMessage: insertLineError?.message ?? 'Neue Leistung konnte nicht angelegt werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: insertLineError?.message ?? 'Neue Leistung konnte nicht angelegt werden.' }));
    }

    finalLines.push({ ...line, serviceId: line.serviceId, lineType, taxRate, sourceLineId: String(insertedLine.id) });
    nextSortOrder += 10;
  }

  let totalCents = 0;
  let taxTotalCents = 0;
  let normalCents = 0;
  let reduced1Cents = 0;
  let reduced2Cents = 0;
  let zeroCents = 0;

  const payloadLines = finalLines.map((line) => {
    const lineTotalCents = Math.max(0, Math.round(line.lineTotalGross * 100));
    const unitPriceCents = Math.max(0, Math.round(line.unitPriceGross * 100));
    totalCents += lineTotalCents;
    taxTotalCents += roundTaxPortionFromGross(lineTotalCents, line.taxRate);

    if (line.taxRate >= 19) normalCents += lineTotalCents;
    else if (line.taxRate >= 12) reduced2Cents += lineTotalCents;
    else if (line.taxRate > 0) reduced1Cents += lineTotalCents;
    else zeroCents += lineTotalCents;

    return {
      source_line_id: line.sourceLineId,
      reference_id: line.serviceId,
      line_type: line.lineType,
      name: line.name,
      quantity: line.quantity,
      unit_price_gross: unitPriceCents,
      tax_rate: line.taxRate,
      line_total_gross: lineTotalCents,
    };
  });

  const afterSnapshot = buildReceiptEditSnapshot({
    receiptId,
    salesOrderId,
    paymentId,
    customerName: customerName || beforeSnapshot.customerName,
    providerName: providerName || beforeSnapshot.providerName,
    turnoverValueCents: totalCents,
    lines: finalLines,
  });

  const payload = {
    receipt_id: receiptId,
    cash_register_id: receipt.cash_register_id,
    sales_order_id: salesOrderId,
    payment_id: receipt.payment_id,
    receipt_number: receipt.receipt_number,
    issued_at: new Date().toISOString(),
    currency_code: receipt.currency_code || salesOrder.currency_code || 'EUR',
    customer_name: customerName || beforeSnapshot.customerName || null,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    payment_method: readFirstString(payloadBefore, [['payment_method'], ['payment_method_name'], ['payment', 'method_name'], ['payment', 'method'], ['payment', 'payment_method_name']]) || null,
    provider_name: providerName || beforeSnapshot.providerName || null,
    turnover_value_cents: totalCents,
    lines: payloadLines,
  };
  const payloadCanonical = JSON.stringify(payload);
  const payloadHash = createHash('sha256').update(payloadCanonical).digest('hex');
  const editedAt = new Date().toISOString();

  const { error: updateSalesOrderError } = await admin
    .from('sales_orders')
    .update({
      subtotal_gross: toGrossNumber(totalCents),
      tax_total: toGrossNumber(taxTotalCents),
      grand_total: toGrossNumber(totalCents),
      updated_at: editedAt,
    })
    .eq('id', salesOrderId);

  if (updateSalesOrderError) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: 'sales_order_update',
      errorMessage: updateSalesOrderError.message ?? 'Sales Order Summen konnten nicht aktualisiert werden.',
      createdBy: user.id,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updateSalesOrderError.message ?? 'Sales Order Summen konnten nicht aktualisiert werden.' }));
  }

  if (paymentId) {
    const { error: updatePaymentError } = await admin
      .from('payments')
      .update({ amount: toGrossNumber(totalCents), updated_at: editedAt })
      .eq('id', paymentId);
    if (updatePaymentError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'payment_update',
        errorMessage: updatePaymentError.message ?? 'Payment konnte nicht an die neue Summe angepasst werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updatePaymentError.message ?? 'Payment konnte nicht an die neue Summe angepasst werden.' }));
    }
  }

  const { error: updateReceiptError } = await admin
    .from('fiscal_receipts')
    .update({
      turnover_value_cents: totalCents,
      sum_tax_set_normal: normalCents,
      sum_tax_set_reduced1: reduced1Cents,
      sum_tax_set_reduced2: reduced2Cents,
      sum_tax_set_zero: zeroCents,
      receipt_payload_canonical: payloadCanonical,
      receipt_payload_hash: payloadHash,
      signature_created_at: editedAt,
      signature_state: 'SIMULATED',
      verification_status: 'VALID',
      verification_checked_at: editedAt,
      verification_notes: 'Beleg im Slideover nachbearbeitet und vollständig synchronisiert.',
      updated_at: editedAt,
    })
    .eq('id', receiptId);

  if (updateReceiptError) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: 'receipt_update',
      errorMessage: updateReceiptError.message ?? 'Fiscal Receipt konnte nicht aktualisiert werden.',
      createdBy: user.id,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updateReceiptError.message ?? 'Fiscal Receipt konnte nicht aktualisiert werden.' }));
  }

  const { data: existingReceiptLinesRaw, error: existingReceiptLinesError } = await admin
    .from('fiscal_receipt_lines')
    .select('id, source_line_id')
    .eq('fiscal_receipt_id', receiptId);
  if (existingReceiptLinesError) {
    await insertFiscalFailureSafe(admin, {
      tenantId,
      cashRegisterId: receipt.cash_register_id,
      salesOrderId,
      paymentId,
      fiscalReceiptId: receiptId,
      failedStep: 'receipt_lines_load',
      errorMessage: existingReceiptLinesError.message ?? 'Receipt-Zeilen konnten nicht geladen werden.',
      createdBy: user.id,
    });
    redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: existingReceiptLinesError.message ?? 'Receipt-Zeilen konnten nicht geladen werden.' }));
  }
  const existingReceiptLines = (existingReceiptLinesRaw ?? []) as { id: string; source_line_id: string | null }[];
  const receiptLineBySource = new Map(existingReceiptLines.map((line) => [String(line.source_line_id ?? ''), line]));
  const finalSourceIds = finalLines.map((line) => line.sourceLineId);
  const removableReceiptLineIds = existingReceiptLines
    .filter((line) => !finalSourceIds.includes(String(line.source_line_id ?? '')))
    .map((line) => line.id);

  if (removableReceiptLineIds.length > 0) {
    const { error: removeReceiptLinesError } = await admin
      .from('fiscal_receipt_lines')
      .delete()
      .eq('fiscal_receipt_id', receiptId)
      .in('id', removableReceiptLineIds);
    if (removeReceiptLinesError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'receipt_lines_remove_obsolete',
        errorMessage: removeReceiptLinesError.message ?? 'Veraltete Receipt-Zeilen konnten nicht entfernt werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: removeReceiptLinesError.message ?? 'Veraltete Receipt-Zeilen konnten nicht entfernt werden.' }));
    }
  }

  for (const line of finalLines) {
    const existingReceiptLine = receiptLineBySource.get(line.sourceLineId);
    const receiptLinePayload = {
      fiscal_receipt_id: receiptId,
      source_line_id: line.sourceLineId,
      name: line.name,
      quantity: line.quantity,
      unit_price_gross: line.unitPriceGross,
      tax_rate: line.taxRate,
      line_total_gross: line.lineTotalGross,
    };

    if (existingReceiptLine?.id) {
      const { error: updateReceiptLineError } = await admin
        .from('fiscal_receipt_lines')
        .update(receiptLinePayload)
        .eq('id', existingReceiptLine.id)
        .eq('fiscal_receipt_id', receiptId);
      if (updateReceiptLineError) {
        await insertFiscalFailureSafe(admin, {
          tenantId,
          cashRegisterId: receipt.cash_register_id,
          salesOrderId,
          paymentId,
          fiscalReceiptId: receiptId,
          failedStep: 'receipt_line_update',
          errorMessage: updateReceiptLineError.message ?? 'Receipt-Zeile konnte nicht aktualisiert werden.',
          createdBy: user.id,
        });
        redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: updateReceiptLineError.message ?? 'Receipt-Zeile konnte nicht aktualisiert werden.' }));
      }
      continue;
    }

    const { error: insertReceiptLineError } = await admin.from('fiscal_receipt_lines').insert(receiptLinePayload);
    if (insertReceiptLineError) {
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: receipt.cash_register_id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: 'receipt_line_insert',
        errorMessage: insertReceiptLineError.message ?? 'Neue Receipt-Zeile konnte nicht erstellt werden.',
        createdBy: user.id,
      });
      redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, error: insertReceiptLineError.message ?? 'Neue Receipt-Zeile konnte nicht erstellt werden.' }));
    }
  }

  await insertReceiptEditedEventSafe(admin, {
    tenantId,
    cashRegisterId: receipt.cash_register_id,
    fiscalReceiptId: receiptId,
    performedBy: user.id,
    notes: 'Fiscal Receipt im Slideover bearbeitet und DB vollständig synchronisiert.',
    referenceData: {
      receipt_id: receiptId,
      receipt_number: receipt.receipt_number,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      edited_at: editedAt,
      changed_customer_name: beforeSnapshot.customerName !== afterSnapshot.customerName,
      changed_provider_name: beforeSnapshot.providerName !== afterSnapshot.providerName,
      before_turnover_value_cents: beforeSnapshot.turnoverValueCents,
      after_turnover_value_cents: afterSnapshot.turnoverValueCents,
      before_line_count: beforeSnapshot.lineCount,
      after_line_count: afterSnapshot.lineCount,
      before_snapshot: beforeSnapshot,
      after_snapshot: afterSnapshot,
    },
  });

  revalidatePath('/rechnungen');
  redirect(buildRechnungenUrlFromReturnQuery(returnQuery, { receiptId, success: 'Beleg aktualisiert ✅' }));
}

// Inline checkout actions appended for calendar slideover flow

type InlineSalesOrderLine = {
  name: string;
  quantity: number;
  unitPriceGross: number;
  taxRate: number;
  lineTotalGross: number;
};

type InlineActionResult = {
  ok: boolean;
  error?: string;
  success?: string;
  appointmentId?: string;
  salesOrderId?: string;
  paymentId?: string;
  receiptId?: string;
  salesOrder?: {
    id: string;
    status: string;
    currencyCode: string;
    totalCents: number;
    taxTotalCents: number;
    createdAt: string;
    lines: InlineSalesOrderLine[];
  };
  payment?: {
    id: string;
    amountGross: number;
    currencyCode: string;
    methodCode: string;
    status: string;
    paidAt: string | null;
  };
  receipt?: {
    id: string;
    receiptNumber: string;
    status: string;
    verificationStatus: string | null;
    issuedAt: string;
    turnoverValueCents: number;
    currencyCode: string;
    lineCount: number;
  };
};

export async function createSalesOrderFromAppointmentInline(formData: FormData): Promise<InlineActionResult> {
  try {
    const appointmentId = String(formData.get("appointment_id") ?? "").trim();
    if (!appointmentId) throw new Error("Termin konnte nicht zugeordnet werden.");

    const { admin, user, effectiveTenantId } = await requireContext();
    const { data: appointmentRaw, error: appointmentError } = await admin
      .from("appointments")
      .select("id, tenant_id, person_id, service_id, service_name_snapshot, service_price_cents_snapshot, notes_internal, start_at, end_at")
      .eq("id", appointmentId)
      .maybeSingle();

    if (appointmentError || !appointmentRaw) throw new Error("Termin konnte nicht geladen werden.");

    const appointment = appointmentRaw as AppointmentRow;
    const tenantId = String(appointment.tenant_id ?? "").trim();
    if (!tenantId) throw new Error("Termin hat keinen Tenant.");
    if (effectiveTenantId && effectiveTenantId !== tenantId) throw new Error("Dieser Termin gehört nicht zum aktiven Tenant.");

    const status = normalizeAppointmentStatus(readMetaLineValue(appointment.notes_internal, "Status:"));
    if (status !== "completed") throw new Error("Nur Termine mit Status Gekommen dürfen abgerechnet werden.");

    const cashRegister = await resolveCashRegister(admin, tenantId);

    const primaryName =
      String(formData.get("primary_name") ?? "").trim() ||
      String(appointment.service_name_snapshot ?? "").trim() ||
      readMetaLineValue(appointment.notes_internal, "Dienstleistung:") ||
      readMetaLineValue(appointment.notes_internal, "Titel:") ||
      "Termin";
    const primaryQuantity = parsePositiveInt(formData.get("primary_quantity"), 1);
    const primaryPriceCents = Math.max(0, parseMoneyToCents(formData.get("primary_price")) || Number(appointment.service_price_cents_snapshot ?? 0) || 0);
    const primaryTaxRate = Number(String(formData.get("primary_tax_rate") ?? "20").replace(",", "."));
    const safePrimaryTaxRate = Number.isFinite(primaryTaxRate) ? primaryTaxRate : 20;
    if (!primaryName) throw new Error("Bitte mindestens eine abrechenbare Position angeben.");

    const addExtraLine = String(formData.get("add_extra_line") ?? "0") === "1";
    const extraServiceId = String(formData.get("extra_service_id") ?? "").trim();
    const extraNameRaw = String(formData.get("extra_name") ?? "").trim();
    const extraQuantity = parsePositiveInt(formData.get("extra_quantity"), 1);
    const extraPriceCentsInput = parseMoneyToCents(formData.get("extra_price"));
    const extraTaxRate = Number(String(formData.get("extra_tax_rate") ?? "20").replace(",", "."));
    const safeExtraTaxRate = Number.isFinite(extraTaxRate) ? extraTaxRate : 20;

    let extraLine: { referenceId: string | null; name: string; quantity: number; priceCents: number; taxRate: number; lineType: "SERVICE" | "ITEM" } | null = null;
    if (addExtraLine) {
      let fallbackServicePriceCents = 0;
      let fallbackServiceName = "Zusatzleistung";
      if (extraServiceId) {
        const { data: serviceRow } = await admin
          .from("services")
          .select("id, name, default_price_cents")
          .eq("id", extraServiceId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (serviceRow?.id) {
          fallbackServicePriceCents = Number(serviceRow.default_price_cents ?? 0) || 0;
          fallbackServiceName = String(serviceRow.name ?? "Zusatzleistung").trim() || "Zusatzleistung";
        }
      }
      const finalExtraName = extraNameRaw || fallbackServiceName;
      const finalExtraPriceCents = Math.max(0, extraPriceCentsInput || fallbackServicePriceCents || 0);
      if (finalExtraName && finalExtraPriceCents > 0) {
        extraLine = {
          referenceId: extraServiceId || null,
          name: finalExtraName,
          quantity: extraQuantity,
          priceCents: finalExtraPriceCents,
          taxRate: safeExtraTaxRate,
          lineType: extraServiceId ? "SERVICE" : "ITEM",
        };
      }
    }

    const primaryLineTotalCents = primaryPriceCents * primaryQuantity;
    let totalCents = primaryLineTotalCents;
    let taxTotalCents = roundTaxPortionFromGross(primaryLineTotalCents, safePrimaryTaxRate);

    const { data: salesOrderInsert, error: salesOrderError } = await admin
      .from("sales_orders")
      .insert({
        tenant_id: tenantId,
        appointment_id: appointment.id,
        customer_id: appointment.person_id,
        cash_register_id: cashRegister.id,
        status: "DRAFT",
        currency_code: "EUR",
        subtotal_gross: 0,
        discount_total: 0,
        tax_total: 0,
        grand_total: 0,
        created_by: user.id,
      })
      .select("id, created_at")
      .single();

    if (salesOrderError || !salesOrderInsert?.id) throw new Error(salesOrderError?.message ?? "Sales Order konnte nicht erstellt werden.");

    const salesOrderId = String(salesOrderInsert.id);
    const lineSummary: InlineSalesOrderLine[] = [
      {
        name: primaryName,
        quantity: primaryQuantity,
        unitPriceGross: toGrossNumber(primaryPriceCents),
        taxRate: safePrimaryTaxRate,
        lineTotalGross: toGrossNumber(primaryLineTotalCents),
      },
    ];

    const { error: primaryLineError } = await admin.from("sales_order_lines").insert({
      sales_order_id: salesOrderId,
      line_type: "SERVICE",
      reference_id: appointment.service_id ?? appointment.id,
      name: primaryName,
      description: `Quelle: Termin ${appointment.id}`,
      quantity: primaryQuantity,
      unit_price_gross: toGrossNumber(primaryPriceCents),
      discount_amount: 0,
      tax_rate: safePrimaryTaxRate,
      line_total_gross: toGrossNumber(primaryLineTotalCents),
      sort_order: 10,
    });

    if (primaryLineError) throw new Error(primaryLineError.message ?? "Hauptposition konnte nicht erstellt werden.");

    if (extraLine) {
      const extraLineTotalCents = extraLine.priceCents * extraLine.quantity;
      taxTotalCents += roundTaxPortionFromGross(extraLineTotalCents, extraLine.taxRate);
      totalCents += extraLineTotalCents;

      const { error: extraLineError } = await admin.from("sales_order_lines").insert({
        sales_order_id: salesOrderId,
        line_type: extraLine.lineType,
        reference_id: extraLine.referenceId,
        name: extraLine.name,
        description: `Quelle: Termin ${appointment.id}`,
        quantity: extraLine.quantity,
        unit_price_gross: toGrossNumber(extraLine.priceCents),
        discount_amount: 0,
        tax_rate: extraLine.taxRate,
        line_total_gross: toGrossNumber(extraLineTotalCents),
        sort_order: 20,
      });

      if (extraLineError) throw new Error(extraLineError.message ?? "Zusatzposition konnte nicht erstellt werden.");
      lineSummary.push({
        name: extraLine.name,
        quantity: extraLine.quantity,
        unitPriceGross: toGrossNumber(extraLine.priceCents),
        taxRate: extraLine.taxRate,
        lineTotalGross: toGrossNumber(extraLineTotalCents),
      });
    }

    const { error: totalsError } = await admin
      .from("sales_orders")
      .update({ subtotal_gross: toGrossNumber(totalCents), tax_total: toGrossNumber(taxTotalCents), grand_total: toGrossNumber(totalCents) })
      .eq("id", salesOrderId);

    if (totalsError) throw new Error(totalsError.message ?? "Sales-Order-Summen konnten nicht aktualisiert werden.");

    revalidatePath("/rechnungen");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");

    return {
      ok: true,
      success: "Sales Order erstellt ✅",
      appointmentId,
      salesOrderId,
      salesOrder: {
        id: salesOrderId,
        status: "DRAFT",
        currencyCode: "EUR",
        totalCents,
        taxTotalCents,
        createdAt: String((salesOrderInsert as any).created_at ?? new Date().toISOString()),
        lines: lineSummary,
      },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Sales Order konnte nicht erstellt werden." };
  }
}

export async function createPaymentForSalesOrderInline(formData: FormData): Promise<InlineActionResult> {
  try {
    const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
    const appointmentId = String(formData.get("appointment_id") ?? "").trim();
    if (!salesOrderId) throw new Error("Sales Order konnte nicht zugeordnet werden.");

    const { admin, user, effectiveTenantId } = await requireContext();
    const salesOrder = await resolveSalesOrder(admin, salesOrderId);

    const tenantId = String(salesOrder.tenant_id ?? "").trim();
    if (!tenantId) throw new Error("Sales Order hat keinen Tenant.");
    if (effectiveTenantId && effectiveTenantId !== tenantId) throw new Error("Diese Sales Order gehört nicht zum aktiven Tenant.");

    const { data: lineRows, error: linesError } = await admin.from("sales_order_lines").select("line_total_gross").eq("sales_order_id", salesOrderId);
    if (linesError) throw new Error("Sales-Order-Positionen konnten nicht geladen werden.");

    const totalGross = typeof salesOrder.grand_total === "number" && salesOrder.grand_total > 0
      ? salesOrder.grand_total
      : (lineRows ?? []).reduce((sum: number, row: any) => sum + Number(row?.line_total_gross ?? 0), 0);
    const totalCents = Math.max(0, Math.round(totalGross * 100));
    const paidAmountCents = Math.max(0, parseMoneyToCents(formData.get("payment_amount")) || totalCents);
    const paymentMethodCode = String(formData.get("payment_method") ?? "CASH").trim().toUpperCase();
    const paymentMethodId = await resolvePaymentMethodId(admin, tenantId, paymentMethodCode);
    const paymentNotes = String(formData.get("payment_notes") ?? "").trim();
    const createdAt = new Date().toISOString();
    const resolvedCashRegister = await resolveCashRegister(admin, tenantId);
    const cashRegisterId = assertCashRegisterConsistency({
      salesOrderCashRegisterId: salesOrder.cash_register_id,
      resolvedCashRegisterId: resolvedCashRegister.id,
    }) || resolvedCashRegister.id;
    const cashRegister = { id: cashRegisterId };

    const isCard = isCardPaymentMethodCode(paymentMethodCode);
    const isTransfer = isTransferPaymentMethodCode(paymentMethodCode);
    const paymentStatus = isCard ? "PENDING" : "COMPLETED";
    const provider = isCard ? "STRIPE_TERMINAL" : "MANUAL";
    const paidAt = isCard ? null : createdAt;
    const providerResponse = isCard
      ? {
          phase: "payment_intent_pending",
          method: "card",
          created_at: createdAt,
        }
      : {
          phase: "completed",
          method: isTransfer ? "transfer" : "cash",
          completed_at: createdAt,
        };

    const { data: paymentInsert, error: paymentError } = await admin
      .from("payments")
      .insert({
        tenant_id: tenantId,
        sales_order_id: salesOrderId,
        cash_register_id: cashRegister.id,
        payment_method_id: paymentMethodId,
        amount: toGrossNumber(paidAmountCents),
        currency_code: salesOrder.currency_code || "EUR",
        direction: "INBOUND",
        status: paymentStatus,
        paid_at: paidAt,
        external_reference: paymentNotes || null,
        recorded_by: user.id,
        provider,
        provider_transaction_id: null,
        provider_response_json: providerResponse,
        failure_reason: null,
      })
      .select("id")
      .single();

    if (paymentError || !paymentInsert?.id) {
      throw new Error(paymentError?.message ?? "Payment konnte nicht erstellt werden.");
    }

    const paymentId = String(paymentInsert.id);

    if (isCard) {
      try {
        const intent = await createStripeTerminalIntentForPayment({
          amountCents: paidAmountCents,
          currencyCode: salesOrder.currency_code || "EUR",
          paymentId,
          salesOrderId,
          tenantId,
        });

        await admin
          .from("payments")
          .update({
            provider: "STRIPE_TERMINAL",
            provider_transaction_id: intent.id,
            provider_response_json: {
              phase: "payment_intent_created",
              created_at: createdAt,
              stripe_payment_intent_id: intent.id,
              stripe_status: intent.status,
              has_client_secret: Boolean(intent.client_secret),
            },
            failure_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentId);
      } catch (stripeError: any) {
        const message =
          String(stripeError?.message ?? "Stripe PaymentIntent konnte nicht erstellt werden.").trim() ||
          "Stripe PaymentIntent konnte nicht erstellt werden.";

        await admin
          .from("payments")
          .update({
            status: "FAILED",
            provider: "STRIPE_TERMINAL",
            provider_response_json: {
              phase: "payment_intent_failed",
              failed_at: new Date().toISOString(),
              error_message: message,
            },
            failure_reason: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentId);

        throw new Error(message);
      }
    } else {
      await admin.from("sales_orders").update({ status: "COMPLETED", completed_at: createdAt, cash_register_id: cashRegister.id }).eq("id", salesOrderId);
    }

    revalidatePath("/rechnungen");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");

    return {
      ok: true,
      success: isCard ? "Kartenzahlung mit Stripe vorbereitet ✅" : "Payment erfasst ✅",
      appointmentId,
      salesOrderId,
      paymentId,
      payment: {
        id: paymentId,
        amountGross: toGrossNumber(paidAmountCents),
        currencyCode: salesOrder.currency_code || "EUR",
        methodCode: paymentMethodCode,
        status: paymentStatus,
        paidAt: paidAt ?? null,
      },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Payment konnte nicht erstellt werden." };
  }
}

export async function createFiscalReceiptForPaymentInline(formData: FormData): Promise<InlineActionResult> {
  try {
    const salesOrderId = String(formData.get("sales_order_id") ?? "").trim();
    const paymentId = String(formData.get("payment_id") ?? "").trim();
    const appointmentId = String(formData.get("appointment_id") ?? "").trim();
    if (!salesOrderId || !paymentId) throw new Error("Sales Order oder Payment fehlt für Fiscal.");

    const { admin, user, effectiveTenantId } = await requireContext();
    const salesOrder = await resolveSalesOrder(admin, salesOrderId);
    const tenantId = String(salesOrder.tenant_id ?? "").trim();
    if (!tenantId) throw new Error("Sales Order hat keinen Tenant.");
    if (effectiveTenantId && effectiveTenantId !== tenantId) throw new Error("Diese Sales Order gehört nicht zum aktiven Tenant.");

    const { data: paymentRaw, error: paymentError } = await admin
      .from("payments")
      .select("id, tenant_id, sales_order_id, cash_register_id, payment_method_id, amount, currency_code, status, paid_at, created_at")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError || !paymentRaw) throw new Error("Payment konnte für Fiscal nicht geladen werden.");
    const payment = paymentRaw as PaymentContextRow;

    if (String(payment.status ?? "").trim().toUpperCase() !== "COMPLETED") {
      throw new Error("Fiscal darf erst nach erfolgreichem Payment erzeugt werden.");
    }

    const { data: existingReceiptRows } = await admin
      .from("fiscal_receipts")
      .select("id, receipt_number, status, verification_status, issued_at, turnover_value_cents, currency_code")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1);
    const existingReceipt = ((existingReceiptRows ?? [])[0] ?? null) as any;
    if (existingReceipt?.id) {
      return {
        ok: true,
        success: "Fiscal Receipt bereits vorhanden ✅",
        appointmentId,
        salesOrderId,
        paymentId,
        receiptId: String(existingReceipt.id),
        receipt: {
          id: String(existingReceipt.id),
          receiptNumber: String(existingReceipt.receipt_number ?? ""),
          status: String(existingReceipt.status ?? "REQUESTED"),
          verificationStatus: existingReceipt.verification_status ?? null,
          issuedAt: String(existingReceipt.issued_at ?? new Date().toISOString()),
          turnoverValueCents: Number(existingReceipt.turnover_value_cents ?? 0) || 0,
          currencyCode: String(existingReceipt.currency_code ?? payment.currency_code ?? salesOrder.currency_code ?? "EUR"),
          lineCount: 0,
        },
      };
    }

    const resolvedCashRegister = await resolveCashRegister(admin, tenantId);
    const cashRegisterId = assertCashRegisterConsistency({
      salesOrderCashRegisterId: salesOrder.cash_register_id,
      paymentCashRegisterId: payment.cash_register_id,
      resolvedCashRegisterId: resolvedCashRegister.id,
    }) || resolvedCashRegister.id;
    const cashRegister = { id: cashRegisterId };

    const appointmentLookupId = String(salesOrder.appointment_id ?? appointmentId ?? "").trim();
    let appointmentDetails: AppointmentDetailLookupRow | null = null;
    if (appointmentLookupId) {
      const { data: appointmentDetailsRaw } = await admin
        .from("appointments")
        .select(`
          id, tenant_id, person_id,
          tenant:tenants ( display_name ),
          person:persons ( full_name )
        `)
        .eq("id", appointmentLookupId)
        .maybeSingle();
      appointmentDetails = (appointmentDetailsRaw ?? null) as AppointmentDetailLookupRow | null;
    }

    const appointmentTenant = firstJoin(appointmentDetails?.tenant);
    const appointmentPerson = firstJoin(appointmentDetails?.person);
    const customerName = String(appointmentPerson?.full_name ?? "").trim() || null;
    const providerName = String(appointmentTenant?.display_name ?? "").trim() || null;

    const { data: lineRows, error: linesError } = await admin
      .from("sales_order_lines")
      .select("id, sales_order_id, name, quantity, unit_price_gross, tax_rate, line_total_gross, created_at")
      .eq("sales_order_id", salesOrderId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (linesError) throw new Error("Sales-Order-Zeilen konnten nicht geladen werden.");
    const salesOrderLines = (lineRows ?? []) as SalesOrderLineRow[];
    if (salesOrderLines.length === 0) throw new Error("Für die Sales Order gibt es keine Positionen.");

    const totalCents = salesOrderLines.reduce((sum, line) => sum + Math.round(Number(line.line_total_gross ?? 0) * 100), 0);
    let normalCents = 0;
    let reduced1Cents = 0;
    let reduced2Cents = 0;
    let zeroCents = 0;

    const payloadLines = salesOrderLines.map((line) => {
      const qty = Number(line.quantity ?? 0) || 0;
      const unitGross = Math.round(Number(line.unit_price_gross ?? 0) * 100);
      const lineGross = Math.round(Number(line.line_total_gross ?? 0) * 100);
      const taxRate = Number(line.tax_rate ?? 0) || 0;
      if (taxRate >= 19) normalCents += lineGross;
      else if (taxRate >= 12) reduced2Cents += lineGross;
      else if (taxRate > 0) reduced1Cents += lineGross;
      else zeroCents += lineGross;
      return {
        source_line_id: line.id,
        name: line.name ?? "Position",
        quantity: qty,
        unit_price_gross: unitGross,
        tax_rate: taxRate,
        line_total_gross: lineGross,
      };
    });

    const receiptNumber = await nextReceiptNumber(admin, cashRegister.id);
    const issuedAt = new Date().toISOString();

    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      performedBy: user.id,
      eventType: "RECEIPT_CREATION_STARTED",
      notes: "Fiscal-Receipt-Erstellung aus Sales Order + Payment gestartet.",
      referenceData: {
        appointment_id: appointmentId || null,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        line_count: salesOrderLines.length,
        customer_name: customerName,
        provider_name: providerName,
      },
    });

    const { data: previousReceiptRows } = await admin
      .from("fiscal_receipts")
      .select("id, receipt_payload_hash")
      .eq("cash_register_id", cashRegister.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const previousReceipt = ((previousReceiptRows ?? [])[0] ?? null) as { id?: string | null; receipt_payload_hash?: string | null } | null;

    const payload = {
      receipt_id: null,
      cash_register_id: cashRegister.id,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      issued_at: issuedAt,
      currency_code: payment.currency_code || salesOrder.currency_code || "EUR",
      customer_name: customerName,
      provider_name: providerName,
      turnover_value_cents: totalCents,
      lines: payloadLines,
    };
    const payloadCanonical = JSON.stringify(payload);
    const payloadHash = createHash("sha256").update(payloadCanonical).digest("hex");

    const { data: receiptInsert, error: receiptError } = await admin
      .from("fiscal_receipts")
      .insert({
        tenant_id: tenantId,
        cash_register_id: cashRegister.id,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        issued_at: issuedAt,
        currency_code: payment.currency_code || salesOrder.currency_code || "EUR",
        sum_tax_set_normal: normalCents,
        sum_tax_set_reduced1: reduced1Cents,
        sum_tax_set_reduced2: reduced2Cents,
        sum_tax_set_zero: zeroCents,
        turnover_value_cents: totalCents,
        created_by: user.id,
        chain_previous_receipt_id: previousReceipt?.id ?? null,
        chain_previous_hash: previousReceipt?.receipt_payload_hash ?? null,
        receipt_payload_canonical: payloadCanonical,
        receipt_payload_hash: payloadHash,
        signature_algorithm: "SIMULATED_SHA256",
        signature_created_at: issuedAt,
        signature_state: "SIMULATED",
        verification_status: "VALID",
        verification_checked_at: issuedAt,
        verification_notes: "Simulierter Fiscal-Receipt aus Sales Order + Payment erstellt.",
      })
      .select("id")
      .single();

    if (receiptError || !receiptInsert?.id) {
      const failureMessage = receiptError?.message ?? "Fiscal Receipt konnte nicht erstellt werden.";
      await insertFiscalEventSafe(admin, {
        tenantId,
        cashRegisterId: cashRegister.id,
        performedBy: user.id,
        eventType: "RECEIPT_CREATION_FAILED",
        notes: failureMessage,
        referenceData: {
          appointment_id: appointmentId || null,
          sales_order_id: salesOrderId,
          payment_id: paymentId,
          receipt_number: receiptNumber,
        },
      });
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: cashRegister.id,
        salesOrderId,
        paymentId,
        failedStep: "receipt_insert",
        errorMessage: failureMessage,
        createdBy: user.id,
        errorDetail: receiptError ? { code: receiptError.code, details: receiptError.details, hint: receiptError.hint } : null,
      });
      throw new Error(failureMessage);
    }

    const receiptId = String(receiptInsert.id);

    const receiptLinePayload = salesOrderLines.map((line) => ({
      fiscal_receipt_id: receiptId,
      source_line_id: line.id,
      name: line.name ?? "Position",
      quantity: Number(line.quantity ?? 0) || 0,
      unit_price_gross: Number(line.unit_price_gross ?? 0) || 0,
      tax_rate: Number(line.tax_rate ?? 0) || 0,
      line_total_gross: Number(line.line_total_gross ?? 0) || 0,
    }));

    const { error: receiptLinesError } = await admin.from("fiscal_receipt_lines").insert(receiptLinePayload);
    if (receiptLinesError) {
      const failureMessage = receiptLinesError.message ?? "Fiscal-Receipt-Zeilen konnten nicht erstellt werden.";
      await insertFiscalEventSafe(admin, {
        tenantId,
        cashRegisterId: cashRegister.id,
        fiscalReceiptId: receiptId,
        performedBy: user.id,
        eventType: "RECEIPT_CREATION_FAILED",
        notes: failureMessage,
        referenceData: {
          appointment_id: appointmentId || null,
          sales_order_id: salesOrderId,
          payment_id: paymentId,
          receipt_id: receiptId,
        },
      });
      await insertFiscalFailureSafe(admin, {
        tenantId,
        cashRegisterId: cashRegister.id,
        salesOrderId,
        paymentId,
        fiscalReceiptId: receiptId,
        failedStep: "receipt_lines_insert",
        errorMessage: failureMessage,
        createdBy: user.id,
        errorDetail: receiptLinesError ? { code: receiptLinesError.code, details: receiptLinesError.details, hint: receiptLinesError.hint } : null,
      });
      throw new Error(failureMessage);
    }

    await admin.from("payments").update({ cash_register_id: cashRegister.id }).eq("id", paymentId);
    await admin.from("sales_orders").update({ cash_register_id: cashRegister.id }).eq("id", salesOrderId);

    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "STANDARD_RECEIPT_CREATED",
      notes: "Fiscal-Receipt und Receipt-Zeilen erfolgreich erzeugt.",
      referenceData: {
        appointment_id: appointmentId || null,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_id: receiptId,
        receipt_number: receiptNumber,
        turnover_value_cents: totalCents,
        line_count: receiptLinePayload.length,
        customer_name: customerName,
        provider_name: providerName,
      },
    });

    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId: cashRegister.id,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "RECEIPT_VERIFICATION_SUCCEEDED",
      notes: "Simulierte Verifikation erfolgreich abgeschlossen.",
      referenceData: {
        receipt_id: receiptId,
        verification_status: "VALID",
        signature_state: "SIMULATED",
        checked_at: issuedAt,
      },
    });

    revalidatePath("/rechnungen");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");

    return {
      ok: true,
      success: "Fiscal Receipt erzeugt ✅",
      appointmentId,
      salesOrderId,
      paymentId,
      receiptId,
      receipt: {
        id: receiptId,
        receiptNumber,
        status: "REQUESTED",
        verificationStatus: "VALID",
        issuedAt,
        turnoverValueCents: totalCents,
        currencyCode: payment.currency_code || salesOrder.currency_code || "EUR",
        lineCount: receiptLinePayload.length,
      },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Fiscal Receipt konnte nicht erstellt werden." };
  }
}
