import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type PaymentResultStatus = "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const paymentId = String(body.payment_id ?? "").trim();
    const status = String(body.status ?? "").trim().toUpperCase() as PaymentResultStatus;
    const provider = String(body.provider ?? "STRIPE_TERMINAL").trim();
    const providerTransactionId = String(body.provider_transaction_id ?? "").trim() || null;
    const failureReason = String(body.failure_reason ?? "").trim() || null;
    const providerResponse = body.provider_response ?? null;

    if (!paymentId) {
      return NextResponse.json({ error: "payment_id fehlt." }, { status: 400 });
    }

    if (!["PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const { data: existingPayment, error: existingPaymentError } = await admin
      .from("payments")
      .select("id, status")
      .eq("id", paymentId)
      .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json(
        {
          error: existingPaymentError.message ?? "Payment konnte nicht geladen werden.",
          step: "load_payment",
        },
        { status: 500 }
      );
    }

    if (!existingPayment?.id) {
      return NextResponse.json(
        {
          error: "Payment nicht gefunden.",
          step: "load_payment",
          payment_id: paymentId,
        },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      status,
      provider,
      provider_transaction_id: providerTransactionId,
      provider_response_json: providerResponse,
      failure_reason: failureReason,
    };

    if (status === "COMPLETED") {
      updatePayload.paid_at = new Date().toISOString();
    }

    const { error: updateError } = await admin
      .from("payments")
      .update(updatePayload)
      .eq("id", paymentId);

    if (updateError) {
      return NextResponse.json(
        {
          error: updateError.message ?? "Payment konnte nicht aktualisiert werden.",
          step: "update_payment",
        },
        { status: 500 }
      );
    }

    const { data: updatedPayment, error: reloadError } = await admin
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (reloadError) {
      return NextResponse.json(
        {
          error: reloadError.message ?? "Aktualisiertes Payment konnte nicht geladen werden.",
          step: "reload_payment",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      payment: updatedPayment ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "Payment-Result konnte nicht verarbeitet werden.",
        step: "unexpected",
      },
      { status: 500 }
    );
  }
}