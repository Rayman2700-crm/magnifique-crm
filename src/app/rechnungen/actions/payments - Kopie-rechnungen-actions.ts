"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type PaymentMethodCode = "CASH" | "CARD";
type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

type CreatePaymentBaseInput = {
  tenantId: string;
  salesOrderId: string;
  amount: number;
  cashRegisterId?: string | null;
  invoiceId?: string | null;
  externalReference?: string | null;
};

function normalizeAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Ungültiger Zahlungsbetrag.");
  }

  return Number(amount.toFixed(2));
}

async function getCurrentUserId() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("Nicht eingeloggt.");
  }

  return data.user.id;
}

async function getActivePaymentMethodIdForTenant(
  tenantId: string,
  code: PaymentMethodCode,
) {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, tenant_id, code, name, is_active")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Zahlungsart konnte nicht geladen werden: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error(
      `Keine aktive Zahlungsart ${code} für diesen Tenant gefunden.`,
    );
  }

  return data.id as string;
}

async function getPaymentById(paymentId: string) {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (error || !data) {
    throw new Error("Zahlung nicht gefunden.");
  }

  return data;
}

function assertStatus(
  actual: string,
  allowed: PaymentStatus[],
  message: string,
) {
  if (!allowed.includes(actual as PaymentStatus)) {
    throw new Error(message);
  }
}

export async function completeCashPayment(input: CreatePaymentBaseInput) {
  const supabase = await supabaseServer();
  const userId = await getCurrentUserId();
  const amount = normalizeAmount(input.amount);
  const paymentMethodId = await getActivePaymentMethodIdForTenant(
    input.tenantId,
    "CASH",
  );

  const payload = {
    tenant_id: input.tenantId,
    sales_order_id: input.salesOrderId,
    invoice_id: input.invoiceId ?? null,
    cash_register_id: input.cashRegisterId ?? null,
    payment_method_id: paymentMethodId,
    amount,
    currency_code: "EUR",
    direction: "INBOUND",
    status: "COMPLETED",
    paid_at: new Date().toISOString(),
    external_reference: input.externalReference ?? null,
    recorded_by: userId,
    provider: "MANUAL",
    provider_transaction_id: null,
    provider_response_json: {
      phase: "completed",
      method: "cash",
      completed_at: new Date().toISOString(),
    },
    failure_reason: null,
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Barzahlung konnte nicht gespeichert werden: ${error.message}`);
  }

  revalidatePath("/rechnungen");
  return data;
}

export async function createPendingCardPayment(input: CreatePaymentBaseInput) {
  const supabase = await supabaseServer();
  const userId = await getCurrentUserId();
  const amount = normalizeAmount(input.amount);
  const paymentMethodId = await getActivePaymentMethodIdForTenant(
    input.tenantId,
    "CARD",
  );

  const payload = {
    tenant_id: input.tenantId,
    sales_order_id: input.salesOrderId,
    invoice_id: input.invoiceId ?? null,
    cash_register_id: input.cashRegisterId ?? null,
    payment_method_id: paymentMethodId,
    amount,
    currency_code: "EUR",
    direction: "INBOUND",
    status: "PENDING",
    paid_at: null,
    external_reference: input.externalReference ?? null,
    recorded_by: userId,
    provider: "SIMULATED_TERMINAL",
    provider_transaction_id: null,
    provider_response_json: {
      phase: "created",
      method: "card",
      created_at: new Date().toISOString(),
    },
    failure_reason: null,
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Kartenzahlung konnte nicht angelegt werden: ${error.message}`,
    );
  }

  revalidatePath("/rechnungen");
  return data;
}

export async function startSimulatedCardPayment(paymentId: string) {
  const supabase = await supabaseServer();
  const payment = await getPaymentById(paymentId);

  assertStatus(
    payment.status,
    ["PENDING"],
    "Kartenzahlung ist nicht mehr startbar.",
  );

  const providerReference = payment.external_reference ?? `SIM-${Date.now()}`;

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "PROCESSING",
      external_reference: providerReference,
      provider: "SIMULATED_TERMINAL",
      provider_response_json: {
        phase: "processing",
        started_at: new Date().toISOString(),
        provider_reference: providerReference,
      },
      failure_reason: null,
    })
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Kartenzahlung konnte nicht gestartet werden: ${error.message}`,
    );
  }

  revalidatePath("/rechnungen");
  return data;
}

export async function completeSimulatedCardPayment(paymentId: string) {
  const supabase = await supabaseServer();
  const payment = await getPaymentById(paymentId);

  assertStatus(
    payment.status,
    ["PENDING", "PROCESSING"],
    "Kartenzahlung ist nicht in einem abschließbaren Zustand.",
  );

  const providerTransactionId =
    payment.provider_transaction_id ?? `SIM-TX-${Date.now()}`;

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "COMPLETED",
      paid_at: new Date().toISOString(),
      provider: "SIMULATED_TERMINAL",
      provider_transaction_id: providerTransactionId,
      provider_response_json: {
        phase: "completed",
        completed_at: new Date().toISOString(),
        provider_transaction_id: providerTransactionId,
      },
      failure_reason: null,
    })
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Kartenzahlung konnte nicht abgeschlossen werden: ${error.message}`,
    );
  }

  revalidatePath("/rechnungen");
  return data;
}

export async function failSimulatedCardPayment(
  paymentId: string,
  reason = "Terminalzahlung fehlgeschlagen",
) {
  const supabase = await supabaseServer();
  const payment = await getPaymentById(paymentId);

  assertStatus(
    payment.status,
    ["PENDING", "PROCESSING"],
    "Kartenzahlung ist nicht in einem fehlerschreibbaren Zustand.",
  );

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "FAILED",
      provider: "SIMULATED_TERMINAL",
      provider_response_json: {
        phase: "failed",
        failed_at: new Date().toISOString(),
        reason,
      },
      failure_reason: reason,
    })
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Kartenzahlung konnte nicht als fehlgeschlagen markiert werden: ${error.message}`,
    );
  }

  revalidatePath("/rechnungen");
  return data;
}

export async function cancelSimulatedCardPayment(paymentId: string) {
  const supabase = await supabaseServer();
  const payment = await getPaymentById(paymentId);

  assertStatus(
    payment.status,
    ["PENDING", "PROCESSING"],
    "Kartenzahlung ist nicht in einem abbrechbaren Zustand.",
  );

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "CANCELLED",
      provider: "SIMULATED_TERMINAL",
      provider_response_json: {
        phase: "cancelled",
        cancelled_at: new Date().toISOString(),
      },
      failure_reason: null,
    })
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Kartenzahlung konnte nicht abgebrochen werden: ${error.message}`,
    );
  }

  revalidatePath("/rechnungen");
  return data;
}