import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET fehlt.");
  return secret;
}

function normalizePaymentStatus(intent: Stripe.PaymentIntent): "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  switch (intent.status) {
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

function extractFailureReason(intent: Stripe.PaymentIntent): string | null {
  const lastErrorMessage = intent.last_payment_error?.message?.trim();
  if (lastErrorMessage) return lastErrorMessage;
  return null;
}

async function loadPaymentByMetadataOrIntent(intent: Stripe.PaymentIntent) {
  const admin = supabaseAdmin();
  const metadataPaymentId = String(intent.metadata?.payment_id ?? "").trim();

  if (metadataPaymentId) {
    const { data, error } = await admin
      .from("payments")
      .select("id, sales_order_id, status, provider_transaction_id")
      .eq("id", metadataPaymentId)
      .maybeSingle();

    if (error) throw new Error(error.message ?? "Payment konnte nicht geladen werden.");
    if (data?.id) return data;
  }

  const { data, error } = await admin
    .from("payments")
    .select("id, sales_order_id, status, provider_transaction_id")
    .eq("provider_transaction_id", intent.id)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "Payment konnte nicht über provider_transaction_id geladen werden.");
  return data ?? null;
}

async function updateInternalPayment(intent: Stripe.PaymentIntent) {
  const admin = supabaseAdmin();
  const payment = await loadPaymentByMetadataOrIntent(intent);

  if (!payment?.id) {
    return {
      ok: false,
      reason: "payment_not_found",
      stripe_intent_id: intent.id,
    };
  }

  const mappedStatus = normalizePaymentStatus(intent);
  const failureReason = extractFailureReason(intent);

  const updatePayload: Record<string, unknown> = {
    status: mappedStatus,
    provider: "STRIPE_TERMINAL",
    provider_transaction_id: intent.id,
    provider_response_json: intent as unknown as Record<string, unknown>,
    failure_reason: failureReason,
    updated_at: new Date().toISOString(),
  };

  if (mappedStatus === "COMPLETED") {
    updatePayload.paid_at = new Date().toISOString();
  }

  const { error: updatePaymentError } = await admin
    .from("payments")
    .update(updatePayload)
    .eq("id", payment.id);

  if (updatePaymentError) {
    throw new Error(updatePaymentError.message ?? "Payment konnte nicht aktualisiert werden.");
  }

  if (payment.sales_order_id) {
    const salesOrderStatus = mappedStatus === "COMPLETED" ? "COMPLETED" : "OPEN";
    const salesOrderPayload: Record<string, unknown> = {
      status: salesOrderStatus,
      updated_at: new Date().toISOString(),
    };

    if (mappedStatus === "COMPLETED") {
      salesOrderPayload.completed_at = new Date().toISOString();
    }

    const { error: salesOrderError } = await admin
      .from("sales_orders")
      .update(salesOrderPayload)
      .eq("id", payment.sales_order_id);

    if (salesOrderError) {
      throw new Error(salesOrderError.message ?? "Sales Order konnte nicht aktualisiert werden.");
    }
  }

  return {
    ok: true,
    payment_id: payment.id,
    sales_order_id: payment.sales_order_id ?? null,
    mapped_status: mappedStatus,
    stripe_intent_id: intent.id,
  };
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Stripe-Signatur fehlt." }, { status: 400 });
    }

    const payload = await req.text();
    const event = stripe.webhooks.constructEvent(payload, signature, getWebhookSecret());

    if (
      event.type === "payment_intent.processing" ||
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const result = await updateInternalPayment(intent);

      return NextResponse.json({
        received: true,
        event_type: event.type,
        result,
      });
    }

    return NextResponse.json({
      received: true,
      ignored: true,
      event_type: event.type,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "Stripe-Webhook konnte nicht verarbeitet werden.",
      },
      { status: 400 }
    );
  }
}
