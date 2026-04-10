import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function normalizePaymentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "PENDING") return "Ausstehend";
  if (normalized === "PROCESSING") return "Wird verarbeitet";
  if (normalized === "COMPLETED") return "Bezahlt";
  if (normalized === "FAILED") return "Fehlgeschlagen";
  if (normalized === "CANCELLED") return "Abgebrochen";
  return normalized || "—";
}

function mapStripeStatus(intentStatus: string) {
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

export async function GET(req: NextRequest) {
  try {
    const paymentId = String(req.nextUrl.searchParams.get("payment_id") ?? "").trim();
    if (!paymentId) {
      return NextResponse.json({ error: "payment_id fehlt." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: payment, error } = await admin
      .from("payments")
      .select("id, sales_order_id, status, paid_at, provider_transaction_id, provider_response_json")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message ?? "Payment konnte nicht geladen werden." }, { status: 500 });
    }

    if (!payment?.id) {
      return NextResponse.json({ error: "Payment wurde nicht gefunden." }, { status: 404 });
    }

    const intentId = String(payment.provider_transaction_id ?? "").trim();
    if (!intentId) {
      return NextResponse.json({
        ok: true,
        payment: {
          id: payment.id,
          status: payment.status ?? null,
          status_label: normalizePaymentStatus(payment.status),
          paid_at: payment.paid_at ?? null,
        },
        stripe: null,
      });
    }

    const intent = await stripe.paymentIntents.retrieve(intentId);
    const mappedStatus = mapStripeStatus(intent.status);

    const updatePayload: Record<string, unknown> = {
      status: mappedStatus,
      provider: "STRIPE_TERMINAL",
      provider_transaction_id: intent.id,
      provider_response_json: intent as unknown as Record<string, unknown>,
      failure_reason: intent.last_payment_error?.message?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (mappedStatus === "COMPLETED") {
      updatePayload.paid_at = new Date().toISOString();
    }

    await admin.from("payments").update(updatePayload).eq("id", paymentId);

    if (payment.sales_order_id) {
      await admin
        .from("sales_orders")
        .update({
          status: mappedStatus === "COMPLETED" ? "COMPLETED" : "OPEN",
          ...(mappedStatus === "COMPLETED" ? { completed_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.sales_order_id);
    }

    return NextResponse.json({
      ok: true,
      payment: {
        id: payment.id,
        status: mappedStatus,
        status_label: normalizePaymentStatus(mappedStatus),
      },
      stripe: {
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        reader_action: intent.next_action?.type ?? null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Payment-Status konnte nicht geprüft werden." },
      { status: 500 }
    );
  }
}
