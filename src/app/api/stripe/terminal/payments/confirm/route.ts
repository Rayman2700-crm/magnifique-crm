import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SalesOrderRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  cash_register_id: string | null;
  status: string | null;
  currency_code: string | null;
  grand_total: number | null;
};

type PaymentRow = {
  id: string;
  tenant_id: string | null;
  sales_order_id: string | null;
  cash_register_id: string | null;
  payment_method_id: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  paid_at: string | null;
  provider_transaction_id: string | null;
  provider_response_json: Record<string, unknown> | null;
  failure_reason?: string | null;
};

type CashRegisterRow = {
  id: string;
  tenant_id: string | null;
  register_code: string | null;
  name: string | null;
  status: string | null;
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
  reference_id?: string | null;
  line_type?: string | null;
};

type AppointmentDetailLookupRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
  person?: { full_name: string | null } | { full_name: string | null }[] | null;
};

function jsonNoStore(body: any, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...(init ?? {}),
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function normalizePaymentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized == "PENDING") return "Ausstehend";
  if (normalized == "PROCESSING") return "Wird verarbeitet";
  if (normalized == "COMPLETED") return "Bezahlt";
  if (normalized == "FAILED") return "Fehlgeschlagen";
  if (normalized == "CANCELLED") return "Abgebrochen";
  return normalized || "—";
}

function mapStripeStatusBase(intentStatus: string) {
  switch (intentStatus) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_capture":
      return "PENDING";
    case "processing":
      return "PROCESSING";
    case "succeeded":
      return "COMPLETED";
    case "canceled":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

function resolveTerminalPaymentStatus(input: {
  intentStatus: string;
  providerPayload: Record<string, unknown>;
  currentPaymentStatus: string | null | undefined;
}) {
  const normalizedIntentStatus = String(input.intentStatus ?? "").trim().toLowerCase();
  const currentPaymentStatus = String(input.currentPaymentStatus ?? "").trim().toUpperCase();
  const providerPayload = input.providerPayload ?? {};
  const phase = String(providerPayload.phase ?? "").trim().toLowerCase();
  const readerAction = providerPayload.reader_action as Record<string, unknown> | undefined;
  const readerActionStatus = String(readerAction?.status ?? "").trim().toLowerCase();
  const hasReaderContext =
    Boolean(String(providerPayload.reader_id ?? "").trim()) ||
    phase.includes("reader") ||
    phase.includes("sent_to_reader") ||
    phase.includes("terminal_starting");

  if (normalizedIntentStatus === "requires_payment_method") {
    const terminalStillWorking =
      currentPaymentStatus === "PROCESSING" &&
      (readerActionStatus === "in_progress" ||
        readerActionStatus === "pending" ||
        phase.includes("sent_to_reader") ||
        phase.includes("reader_busy") ||
        phase.includes("terminal_starting"));

    if (terminalStillWorking) {
      return "PROCESSING";
    }

    if (hasReaderContext || currentPaymentStatus === "PROCESSING") {
      return "FAILED";
    }
    return "PENDING";
  }

  return mapStripeStatusBase(normalizedIntentStatus);
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

async function nextReceiptNumber(admin: any, cashRegisterId: string) {
  const { data, error } = await admin
    .from("fiscal_receipts")
    .select("receipt_number")
    .eq("cash_register_id", cashRegisterId)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message ?? "Receipt-Nummer konnte nicht berechnet werden.");

  const maxNo = (data ?? []).reduce((max: number, row: any) => {
    const digits = String(row?.receipt_number ?? "").replace(/\D/g, "");
    const n = Number(digits || "0");
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return String(maxNo + 1).padStart(6, "0");
}

async function insertFiscalEventSafe(
  admin: any,
  input: {
    tenantId: string;
    cashRegisterId?: string | null;
    fiscalReceiptId?: string | null;
    performedBy?: string | null;
    eventType: string;
    notes?: string | null;
    referenceData?: Record<string, unknown> | null;
  }
) {
  await admin.from("fiscal_events").insert({
    tenant_id: input.tenantId,
    cash_register_id: input.cashRegisterId ?? null,
    fiscal_receipt_id: input.fiscalReceiptId ?? null,
    event_type: input.eventType,
    performed_by: input.performedBy ?? null,
    notes: input.notes ?? null,
    reference_data: input.referenceData ?? null,
  });
}

async function createFiscalReceiptIfMissing(input: {
  admin: any;
  payment: PaymentRow;
  salesOrder: SalesOrderRow;
}) {
  const { admin, payment, salesOrder } = input;
  const paymentId = String(payment.id ?? "").trim();
  const salesOrderId = String(salesOrder.id ?? "").trim();
  const tenantId = String(salesOrder.tenant_id ?? payment.tenant_id ?? "").trim();

  if (!paymentId || !salesOrderId || !tenantId) {
    throw new Error("Fiscal konnte nicht erzeugt werden: fehlender Payment-/Sales-Order-/Tenant-Kontext.");
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
      id: String(existingReceipt.id),
      receiptNumber: String(existingReceipt.receipt_number ?? ""),
      status: String(existingReceipt.status ?? "REQUESTED"),
      verificationStatus: existingReceipt.verification_status ?? null,
      issuedAt: String(existingReceipt.issued_at ?? new Date().toISOString()),
      turnoverValueCents: Number(existingReceipt.turnover_value_cents ?? 0) || 0,
      currencyCode: String(existingReceipt.currency_code ?? payment.currency_code ?? salesOrder.currency_code ?? "EUR"),
      lineCount: 0,
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

  const appointmentLookupId = String(salesOrder.appointment_id ?? "").trim();
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
    .select("id, sales_order_id, name, quantity, unit_price_gross, tax_rate, line_total_gross, created_at, reference_id, line_type")
    .eq("sales_order_id", salesOrderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (linesError) throw new Error(linesError.message ?? "Sales-Order-Zeilen konnten nicht geladen werden.");
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
      reference_id: line.reference_id ?? null,
      line_type: String(line.line_type ?? "ITEM").trim().toUpperCase() === "SERVICE" ? "SERVICE" : "ITEM",
      name: line.name ?? "Position",
      quantity: qty,
      unit_price_gross: unitGross,
      tax_rate: taxRate,
      line_total_gross: lineGross,
    };
  });

  const receiptNumber = await nextReceiptNumber(admin, cashRegisterId);
  const issuedAt = new Date().toISOString();

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId,
    eventType: "RECEIPT_CREATION_STARTED",
    notes: "Automatische Fiscal-Receipt-Erstellung nach erfolgreicher Stripe-Terminal-Zahlung gestartet.",
    referenceData: {
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      line_count: salesOrderLines.length,
      customer_name: customerName,
      provider_name: providerName,
      source: "stripe_terminal_confirm_route",
    },
  });

  const { data: previousReceiptRows } = await admin
    .from("fiscal_receipts")
    .select("id, receipt_payload_hash")
    .eq("cash_register_id", cashRegisterId)
    .order("created_at", { ascending: false })
    .limit(1);
  const previousReceipt = ((previousReceiptRows ?? [])[0] ?? null) as {
    id?: string | null;
    receipt_payload_hash?: string | null;
  } | null;

  const payload = {
    receipt_id: null,
    cash_register_id: cashRegisterId,
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
      cash_register_id: cashRegisterId,
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
      created_by: null,
      chain_previous_receipt_id: previousReceipt?.id ?? null,
      chain_previous_hash: previousReceipt?.receipt_payload_hash ?? null,
      receipt_payload_canonical: payloadCanonical,
      receipt_payload_hash: payloadHash,
      signature_algorithm: "SIMULATED_SHA256",
      signature_created_at: issuedAt,
      signature_state: "SIMULATED",
      verification_status: "VALID",
      verification_checked_at: issuedAt,
      verification_notes: "Automatisch nach erfolgreicher Stripe-Terminal-Zahlung erzeugt.",
    })
    .select("id")
    .single();

  if (receiptError || !receiptInsert?.id) {
    const failureMessage = receiptError?.message ?? "Fiscal Receipt konnte nicht erstellt werden.";
    await insertFiscalEventSafe(admin, {
      tenantId,
      cashRegisterId,
      eventType: "RECEIPT_CREATION_FAILED",
      notes: failureMessage,
      referenceData: {
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        source: "stripe_terminal_confirm_route",
      },
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
      cashRegisterId,
      fiscalReceiptId: receiptId,
      eventType: "RECEIPT_CREATION_FAILED",
      notes: failureMessage,
      referenceData: {
        sales_order_id: salesOrderId,
        payment_id: paymentId,
        receipt_id: receiptId,
        source: "stripe_terminal_confirm_route",
      },
    });
    throw new Error(failureMessage);
  }

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId,
    fiscalReceiptId: receiptId,
    eventType: "STANDARD_RECEIPT_CREATED",
    notes: "Fiscal Receipt nach erfolgreicher Stripe-Terminal-Zahlung automatisch erzeugt.",
    referenceData: {
      sales_order_id: salesOrderId,
      payment_id: paymentId,
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      line_count: salesOrderLines.length,
      source: "stripe_terminal_confirm_route",
    },
  });

  await insertFiscalEventSafe(admin, {
    tenantId,
    cashRegisterId,
    fiscalReceiptId: receiptId,
    eventType: "RECEIPT_VERIFICATION_SUCCEEDED",
    notes: "Simulierte Verifikation erfolgreich abgeschlossen.",
    referenceData: {
      receipt_id: receiptId,
      verification_status: "VALID",
      signature_state: "SIMULATED",
      checked_at: issuedAt,
      source: "stripe_terminal_confirm_route",
    },
  });

  return {
    id: receiptId,
    receiptNumber,
    status: "CREATED",
    verificationStatus: "VALID",
    issuedAt,
    turnoverValueCents: totalCents,
    currencyCode: payment.currency_code || salesOrder.currency_code || "EUR",
    lineCount: salesOrderLines.length,
    alreadyExisted: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const paymentId = String(req.nextUrl.searchParams.get("payment_id") ?? "").trim();
    if (!paymentId) {
      return jsonNoStore({ error: "payment_id fehlt." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: paymentRaw, error: paymentError } = await admin
      .from("payments")
      .select("id, tenant_id, sales_order_id, cash_register_id, payment_method_id, amount, currency_code, status, paid_at, provider_transaction_id, provider_response_json, failure_reason")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) {
      return jsonNoStore({ error: paymentError.message ?? "Payment konnte nicht geladen werden." }, { status: 500 });
    }

    if (!paymentRaw?.id) {
      return jsonNoStore({ error: "Payment wurde nicht gefunden." }, { status: 404 });
    }

    const payment = paymentRaw as PaymentRow;
    const salesOrderId = String(payment.sales_order_id ?? "").trim();
    const { data: salesOrderRaw, error: salesOrderError } = salesOrderId
      ? await admin
          .from("sales_orders")
          .select("id, tenant_id, customer_id, appointment_id, cash_register_id, status, currency_code, grand_total")
          .eq("id", salesOrderId)
          .maybeSingle()
      : { data: null, error: null };

    if (salesOrderError) {
      return jsonNoStore({ error: salesOrderError.message ?? "Sales Order konnte nicht geladen werden." }, { status: 500 });
    }

    const salesOrder = (salesOrderRaw ?? null) as SalesOrderRow | null;
    const stripeIntentId = String(payment.provider_transaction_id ?? "").trim();
    const providerPayload = (payment.provider_response_json ?? {}) as Record<string, unknown>;
    const readerInfo = {
      id: String(providerPayload?.reader_id ?? "").trim() || null,
      label: String(providerPayload?.reader_label ?? "").trim() || null,
      status: String(providerPayload?.reader_status ?? "").trim() || null,
      action_status: String((providerPayload?.reader_action as Record<string, unknown> | undefined)?.status ?? "").trim() || null,
      action_type: String((providerPayload?.reader_action as Record<string, unknown> | undefined)?.type ?? "").trim() || null,
      last_seen_at: null as number | null,
    };

    let stripeStatus = String(providerPayload?.stripe_status ?? "").trim() || null;
    let stripeLastError = String(providerPayload?.error_message ?? "").trim() || null;

    if (stripeIntentId) {
      const intent = await stripe.paymentIntents.retrieve(stripeIntentId);
      stripeStatus = String(intent.status ?? "").trim() || stripeStatus;
      stripeLastError = String(intent.last_payment_error?.message ?? "").trim() || stripeLastError;

      const mappedStatus = resolveTerminalPaymentStatus({
        intentStatus: intent.status,
        providerPayload,
        currentPaymentStatus: payment.status,
      });
      const shouldUpdatePayment =
        mappedStatus !== String(payment.status ?? "").trim().toUpperCase() ||
        stripeLastError !== String(payment.failure_reason ?? "").trim();

      if (shouldUpdatePayment) {
        const nextProviderPayload = {
          ...providerPayload,
          phase:
            mappedStatus === "COMPLETED"
              ? "terminal_completed"
              : mappedStatus === "CANCELLED"
                ? "terminal_cancelled"
                : mappedStatus === "FAILED"
                  ? "terminal_failed"
                  : "terminal_pending",
          stripe_status: stripeStatus,
          checked_at: new Date().toISOString(),
          error_message: stripeLastError,
        };

        await admin
          .from("payments")
          .update({
            status: mappedStatus,
            paid_at: mappedStatus === "COMPLETED" ? payment.paid_at ?? new Date().toISOString() : payment.paid_at,
            failure_reason:
              mappedStatus === "FAILED" || mappedStatus === "CANCELLED"
                ? stripeLastError || payment.failure_reason || "Stripe verlangt erneut eine Zahlungsmethode."
                : null,
            provider_response_json: nextProviderPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        payment.status = mappedStatus;
        payment.paid_at = mappedStatus === "COMPLETED" ? payment.paid_at ?? new Date().toISOString() : payment.paid_at;
        payment.failure_reason =
          mappedStatus === "FAILED" || mappedStatus === "CANCELLED"
            ? stripeLastError || payment.failure_reason || "Stripe verlangt erneut eine Zahlungsmethode."
            : null;
        payment.provider_response_json = nextProviderPayload;
      }
    }

    let receipt: { id: string | null; receipt_number: string | null } | null = null;
    if (String(payment.status ?? "").trim().toUpperCase() === "COMPLETED" && salesOrder?.id) {
      await admin
        .from("sales_orders")
        .update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", salesOrder.id);

      const receiptRow = await createFiscalReceiptIfMissing({
        admin,
        payment,
        salesOrder,
      });

      receipt = {
        id: receiptRow.id,
        receipt_number: receiptRow.receiptNumber,
      };
    }

    const normalizedPaymentStatus = String(payment.status ?? "").trim().toUpperCase();
    const terminalDone = Boolean(receipt?.id) || ["FAILED", "CANCELLED", "COMPLETED"].includes(normalizedPaymentStatus);
    const terminalState = receipt?.id ? "SUCCEEDED" : normalizedPaymentStatus;

    return jsonNoStore({
      ok: true,
      payment: {
        id: payment.id,
        status: payment.status ?? null,
        status_label: normalizePaymentStatus(payment.status),
        failure_reason: payment.failure_reason ?? null,
      },
      stripe: {
        id: stripeIntentId || null,
        status: stripeStatus,
        last_error: stripeLastError,
      },
      receipt,
      reader: readerInfo,
      terminal_done: terminalDone,
      terminal_state: terminalState,
      should_reload: Boolean(receipt?.id),
      retry_allowed: ["FAILED", "CANCELLED"].includes(normalizedPaymentStatus),
    });
  } catch (error: any) {
    return jsonNoStore({ error: String(error?.message ?? "Payment-Status konnte nicht geprüft werden.") }, { status: 500 });
  }
}
