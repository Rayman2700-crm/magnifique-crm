 "use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { stripe } from "@/lib/stripe/server";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
};

type CashRegisterRow = {
  id: string;
  tenant_id: string | null;
  register_code: string | null;
  name: string | null;
  status: string | null;
  created_at: string | null;
};

type FiscalEventInsert = {
  tenantId: string;
  cashRegisterId?: string | null;
  fiscalReceiptId?: string | null;
  performedBy?: string | null;
  eventType: string;
  notes?: string | null;
  referenceData?: Record<string, unknown> | null;
};

type DashboardInvoiceLine = {
  serviceId: string | null;
  name: string;
  quantity: number;
  priceCents: number;
  taxRate: number;
  lineType: "SERVICE" | "ITEM";
};

type ResolvedCustomerProfile = {
  customerProfileId: string | null;
  customerDisplayName: string;
};

function normalizeLooseName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolveCustomerProfileByName(admin: any, tenantId: string, requestedName: string) {
  const requestedDisplay = String(requestedName ?? "").trim();
  const normalizedRequested = normalizeLooseName(requestedDisplay);
  if (!requestedDisplay || !normalizedRequested) {
    return {
      customerProfileId: null,
      customerDisplayName: requestedDisplay || "Unbekannt",
    } satisfies ResolvedCustomerProfile;
  }

  const { data, error } = await admin
    .from("customer_profiles")
    .select(`
      id,
      person:persons (
        full_name
      )
    `)
    .eq("tenant_id", tenantId)
    .limit(250);

  if (error) {
    throw new Error(error.message ?? "Kundenprofile konnten nicht geladen werden.");
  }

  const rows = (data ?? []) as Array<{
    id: string;
    person?: { full_name: string | null } | { full_name: string | null }[] | null;
  }>;

  let bestMatch: { id: string; label: string } | null = null;

  for (const row of rows) {
    const person = Array.isArray(row.person) ? row.person[0] ?? null : row.person ?? null;
    const candidates = [String(person?.full_name ?? "").trim()].filter(Boolean);

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeLooseName(candidate);
      if (!normalizedCandidate) continue;
      if (normalizedCandidate === normalizedRequested) {
        return {
          customerProfileId: String(row.id),
          customerDisplayName: candidate,
        } satisfies ResolvedCustomerProfile;
      }
      if (!bestMatch && (normalizedCandidate.includes(normalizedRequested) || normalizedRequested.includes(normalizedCandidate))) {
        bestMatch = { id: String(row.id), label: candidate };
      }
    }
  }

  if (bestMatch) {
    return {
      customerProfileId: bestMatch.id,
      customerDisplayName: bestMatch.label,
    } satisfies ResolvedCustomerProfile;
  }

  return {
    customerProfileId: null,
    customerDisplayName: requestedDisplay,
  } satisfies ResolvedCustomerProfile;
}

async function resolveCustomerProfileById(admin: any, tenantId: string, customerProfileId: string) {
  const cleanId = String(customerProfileId ?? "").trim();
  if (!cleanId) return null;

  const { data, error } = await admin
    .from("customer_profiles")
    .select(`
      id,
      person:persons (
        full_name
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Kundenprofil konnte nicht geladen werden.");
  }

  if (!data?.id) return null;
  const person = Array.isArray(data.person) ? data.person[0] ?? null : data.person ?? null;
  const displayName = String(person?.full_name ?? "").trim() || "Kunde";

  return {
    customerProfileId: String(data.id),
    customerDisplayName: displayName,
  } satisfies ResolvedCustomerProfile;
}

function buildDashboardCardUrl(input?: {
  salesOrderId?: string | null;
  paymentId?: string | null;
  success?: string | null;
  error?: string | null;
}) {
  const url = new URL("/dashboard", "http://local");
  url.searchParams.set("invoice", "1");
  const salesOrderId = String(input?.salesOrderId ?? "").trim();
  const paymentId = String(input?.paymentId ?? "").trim();
  const success = String(input?.success ?? "").trim();
  const error = String(input?.error ?? "").trim();
  if (salesOrderId) url.searchParams.set("salesOrder", salesOrderId);
  if (paymentId) url.searchParams.set("payment", paymentId);
  if (success) url.searchParams.set("success", success);
  if (error) url.searchParams.set("error", error);
  return url.pathname + (url.search ? url.search : "");
}

function buildReceiptUrl(input?: {
  receiptId?: string | null;
  success?: string | null;
  error?: string | null;
}) {
  const url = new URL("/rechnungen", "http://local");
  const receiptId = String(input?.receiptId ?? "").trim();
  const success = String(input?.success ?? "").trim();
  const error = String(input?.error ?? "").trim();
  if (receiptId) url.searchParams.set("receipt", receiptId);
  if (success) url.searchParams.set("success", success);
  if (error) url.searchParams.set("error", error);
  return url.pathname + (url.search ? url.search : "");
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
  const raw = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.round(raw));
}

function toGrossNumber(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function roundTaxPortionFromGross(totalCents: number, taxRate: number) {
  if (!Number.isFinite(taxRate) || taxRate <= 0) return 0;
  return Math.round(totalCents * (taxRate / (100 + taxRate)));
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
  const role = String(typedProfile?.role ?? "PRACTITIONER").toUpperCase();
  const effectiveTenantId = await getEffectiveTenantId({
    role,
    tenant_id: typedProfile?.tenant_id ?? null,
    calendar_tenant_id: typedProfile?.calendar_tenant_id ?? null,
  });

  return {
    admin,
    user,
    role,
    isAdmin: role === "ADMIN",
    effectiveTenantId,
    profileTenantId: typedProfile?.tenant_id ?? null,
    profileCalendarTenantId: typedProfile?.calendar_tenant_id ?? null,
  };
}

function uniqueTenantIds(...values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

async function resolvePaymentMethodId(admin: any, tenantIds: string[], requestedCode: string) {
  const normalized = requestedCode.trim().toUpperCase();
  const aliases: Record<string, string[]> = {
    CASH: ["CASH", "BAR", "BARE", "BARGELD", "BARZAHLUNG"],
    CARD: ["CARD", "KARTE", "KARTENZAHLUNG", "EC", "VISA", "MASTERCARD", "CARD_PRESENT"],
    TRANSFER: ["TRANSFER", "UEBERWEISUNG", "ÜBERWEISUNG", "BANK", "BANK_TRANSFER", "SEPA"],
  };
  const acceptable = aliases[normalized] ?? [normalized];

  for (const tenantId of tenantIds) {
    const { data, error } = await admin
      .from("payment_methods")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message ?? "Zahlungsarten konnten nicht geladen werden.");

    const rows = data ?? [];
    for (const row of rows) {
      const code = String(row.code ?? "").trim().toUpperCase();
      const name = String(row.name ?? "").trim().toUpperCase();
      if (acceptable.includes(code) || acceptable.includes(name)) {
        return String(row.id);
      }
    }

    if (rows.length === 1) {
      return String(rows[0].id);
    }
  }

  throw new Error(`Keine aktive Zahlungsart für ${requestedCode} gefunden.`);
}

async function resolveCashRegister(admin: any, tenantIds: string[]) {
  for (const tenantId of tenantIds) {
    const { data, error } = await admin
      .from("cash_registers")
      .select("id, tenant_id, register_code, name, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message ?? "Kassa konnte nicht geladen werden.");
    const row = ((data ?? [])[0] ?? null) as CashRegisterRow | null;
    if (row?.id) return row;
  }

  throw new Error("Für diesen Tenant wurde keine Kassa gefunden.");
}

async function nextReceiptNumber(admin: any, cashRegisterId: string) {
  const { data, error } = await admin
    .from("fiscal_receipts")
    .select("receipt_number")
    .eq("cash_register_id", cashRegisterId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message ?? "Receipt-Nummer konnte nicht berechnet werden.");

  const maxNo = (data ?? []).reduce((max: number, row: any) => {
    const digits = String(row?.receipt_number ?? "").replace(/\D/g, "");
    const n = Number(digits || "0");
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return String(maxNo + 1).padStart(6, "0");
}

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

  await admin.from("fiscal_events").insert(payload);
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
  return stripe.paymentIntents.create({
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
}

export async function createDashboardInvoice(formData: FormData) {
  try {
    const customerName = String(formData.get("customer_name") ?? "").trim();
    const tenantIdRaw = String(formData.get("tenant_id") ?? "").trim();
    const customerProfileIdRaw = String(formData.get("customer_profile_id") ?? "").trim();
    const serviceIdRaw = String(formData.get("service_id") ?? "").trim();
    const serviceTitleRaw = String(formData.get("service_title") ?? "").trim();
    const quantity = parsePositiveInt(formData.get("quantity"), 1);
    const taxRateRaw = Number(String(formData.get("tax_rate") ?? "0").trim().replace(",", "."));
    const taxRate = Number.isFinite(taxRateRaw) ? taxRateRaw : 0;
    const priceCents = parseMoneyToCents(formData.get("price"));
    const paymentMethodCode = String(formData.get("payment_method") ?? "CASH").trim().toUpperCase();
    const paymentNotes = String(formData.get("notes") ?? "").trim();

    if (!customerName) throw new Error("Bitte Kunde eingeben.");
    if (!serviceTitleRaw) throw new Error("Bitte Leistung eingeben oder auswählen.");
    if (!tenantIdRaw) throw new Error("Bitte Behandler wählen.");
    if (priceCents <= 0) throw new Error("Bitte einen gültigen Preis eingeben.");

    const { admin, user, isAdmin, effectiveTenantId, profileTenantId, profileCalendarTenantId } = await requireContext();
    const allowedTenantIds = uniqueTenantIds(tenantIdRaw, profileTenantId, profileCalendarTenantId, effectiveTenantId);
    if (!isAdmin && effectiveTenantId && tenantIdRaw !== effectiveTenantId) {
      throw new Error("Du kannst nur für deinen eigenen Bereich abrechnen.");
    }

    const { data: tenantRow, error: tenantError } = await admin
      .from("tenants")
      .select("id, display_name")
      .eq("id", tenantIdRaw)
      .maybeSingle();
    if (tenantError || !tenantRow?.id) throw new Error("Behandler konnte nicht geladen werden.");

    const resolvedCustomer =
      (await resolveCustomerProfileById(admin, tenantIdRaw, customerProfileIdRaw)) ??
      (await resolveCustomerProfileByName(admin, tenantIdRaw, customerName));

    let finalServiceId: string | null = null;
    let finalServiceTitle = serviceTitleRaw;
    if (serviceIdRaw) {
      const { data: serviceRow } = await admin
        .from("services")
        .select("id, tenant_id, name, default_price_cents")
        .eq("id", serviceIdRaw)
        .eq("tenant_id", tenantIdRaw)
        .maybeSingle();
      if (serviceRow?.id) {
        finalServiceId = String(serviceRow.id);
        finalServiceTitle = String(serviceRow.name ?? serviceTitleRaw).trim() || serviceTitleRaw;
      }
    }

    const cashRegister = await resolveCashRegister(admin, allowedTenantIds);
    const paymentMethodId = await resolvePaymentMethodId(admin, allowedTenantIds, paymentMethodCode);

    const customerDisplayName = resolvedCustomer.customerDisplayName || customerName;
    const providerName = String(tenantRow.display_name ?? "Behandler").trim() || "Behandler";
    const totalCents = Math.max(0, quantity * priceCents);
    const taxTotalCents = roundTaxPortionFromGross(totalCents, taxRate);
    const createdAt = new Date().toISOString();
    const isCard = isCardPaymentMethodCode(paymentMethodCode);
    const isTransfer = isTransferPaymentMethodCode(paymentMethodCode);

    const line: DashboardInvoiceLine = {
      serviceId: finalServiceId,
      name: finalServiceTitle,
      quantity,
      priceCents,
      taxRate,
      lineType: finalServiceId ? "SERVICE" : "ITEM",
    };

    const { data: salesOrderInsert, error: salesOrderError } = await admin
      .from("sales_orders")
      .insert({
        tenant_id: tenantIdRaw,
        appointment_id: null,
        customer_id: resolvedCustomer.customerProfileId,
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

    if (salesOrderError || !salesOrderInsert?.id) {
      throw new Error(salesOrderError?.message ?? "Sales Order konnte nicht erstellt werden.");
    }

    const salesOrderId = String(salesOrderInsert.id);

    const { error: lineError } = await admin.from("sales_order_lines").insert({
      sales_order_id: salesOrderId,
      line_type: line.lineType,
      reference_id: line.serviceId,
      name: line.name,
      description: "Quelle: Dashboard Schnellabrechnung",
      quantity: line.quantity,
      unit_price_gross: toGrossNumber(line.priceCents),
      discount_amount: 0,
      tax_rate: line.taxRate,
      line_total_gross: toGrossNumber(totalCents),
      sort_order: 10,
    });
    if (lineError) throw new Error(lineError.message ?? "Position konnte nicht erstellt werden.");

    const { error: totalsError } = await admin
      .from("sales_orders")
      .update({
        subtotal_gross: toGrossNumber(totalCents),
        tax_total: toGrossNumber(taxTotalCents),
        grand_total: toGrossNumber(totalCents),
      })
      .eq("id", salesOrderId);
    if (totalsError) throw new Error(totalsError.message ?? "Sales-Order-Summen konnten nicht aktualisiert werden.");

    const paymentStatus = isCard ? "PENDING" : "COMPLETED";
    const paidAt = isCard ? null : createdAt;
    const provider = isCard ? "STRIPE_TERMINAL" : "MANUAL";
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
        tenant_id: tenantIdRaw,
        sales_order_id: salesOrderId,
        cash_register_id: cashRegister.id,
        payment_method_id: paymentMethodId,
        amount: toGrossNumber(totalCents),
        currency_code: "EUR",
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
          amountCents: totalCents,
          currencyCode: "EUR",
          paymentId,
          salesOrderId,
          tenantId: tenantIdRaw,
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

      revalidatePath("/rechnungen");
      revalidatePath("/dashboard");
      redirect(
        buildDashboardCardUrl({
          salesOrderId,
          paymentId,
          success: "Dashboard-Kartenzahlung vorbereitet ✅",
        })
      );
    }

    await admin
      .from("sales_orders")
      .update({ status: "COMPLETED", completed_at: createdAt, cash_register_id: cashRegister.id })
      .eq("id", salesOrderId);

    const receiptNumber = await nextReceiptNumber(admin, cashRegister.id);
    const issuedAt = new Date().toISOString();

    await insertFiscalEventSafe(admin, {
      tenantId: tenantIdRaw,
      cashRegisterId: cashRegister.id,
      performedBy: user.id,
      eventType: "RECEIPT_CREATION_STARTED",
      notes: "Dashboard-Schnellabrechnung gestartet.",
      referenceData: {
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        customer_name: customerDisplayName,
        customer_profile_id: resolvedCustomer.customerProfileId,
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

    let normalCents = 0;
    let reduced1Cents = 0;
    let reduced2Cents = 0;
    let zeroCents = 0;
    if (taxRate >= 19) normalCents += totalCents;
    else if (taxRate >= 12) reduced2Cents += totalCents;
    else if (taxRate > 0) reduced1Cents += totalCents;
    else zeroCents += totalCents;

    const payload = {
      receipt_id: null,
      cash_register_id: cashRegister.id,
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      issued_at: issuedAt,
      currency_code: "EUR",
      customer_name: customerDisplayName,
      provider_name: providerName,
      turnover_value_cents: totalCents,
      lines: [
        {
          source_line_id: null,
          reference_id: line.serviceId,
          line_type: line.lineType,
          name: line.name,
          quantity: line.quantity,
          unit_price_gross: line.priceCents,
          tax_rate: line.taxRate,
          line_total_gross: totalCents,
        },
      ],
    };

    const payloadCanonical = JSON.stringify(payload);
    const payloadHash = createHash("sha256").update(payloadCanonical).digest("hex");

    const { data: receiptInsert, error: receiptError } = await admin
      .from("fiscal_receipts")
      .insert({
        tenant_id: tenantIdRaw,
        cash_register_id: cashRegister.id,
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        issued_at: issuedAt,
        currency_code: "EUR",
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
        verification_notes: "Dashboard-Schnellabrechnung ohne Terminbezug.",
      })
      .select("id")
      .single();

    if (receiptError || !receiptInsert?.id) {
      throw new Error(receiptError?.message ?? "Fiscal Receipt konnte nicht erstellt werden.");
    }

    const receiptId = String(receiptInsert.id);

    const { error: receiptLinesError } = await admin.from("fiscal_receipt_lines").insert({
      fiscal_receipt_id: receiptId,
      source_line_id: null,
      name: line.name,
      quantity: line.quantity,
      unit_price_gross: toGrossNumber(line.priceCents),
      tax_rate: line.taxRate,
      line_total_gross: toGrossNumber(totalCents),
    });
    if (receiptLinesError) throw new Error(receiptLinesError.message ?? "Fiscal-Receipt-Zeile konnte nicht erstellt werden.");

    await insertFiscalEventSafe(admin, {
      tenantId: tenantIdRaw,
      cashRegisterId: cashRegister.id,
      fiscalReceiptId: receiptId,
      performedBy: user.id,
      eventType: "STANDARD_RECEIPT_CREATED",
      notes: "Dashboard-Schnellabrechnung vollständig erzeugt.",
      referenceData: {
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_id: receiptId,
        receipt_number: receiptNumber,
        turnover_value_cents: totalCents,
        customer_name: customerDisplayName,
        customer_profile_id: resolvedCustomer.customerProfileId,
        provider_name: providerName,
      },
    });

    await insertFiscalEventSafe(admin, {
      tenantId: tenantIdRaw,
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
    revalidatePath("/dashboard");
    redirect(buildReceiptUrl({
      receiptId,
      success: `Dashboard-Beleg ${receiptNumber} erstellt ✅`,
    }));
  } catch (error: any) {
    const digest = String(error?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    redirect(buildDashboardCardUrl({ error: error?.message ?? "Dashboard-Rechnung konnte nicht erstellt werden." }));
  }
}
