import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const amountCents = Number(body.amount_cents ?? 0);
    const currency = String(body.currency ?? "eur").toLowerCase();
    const paymentId = String(body.payment_id ?? "").trim();
    const salesOrderId = String(body.sales_order_id ?? "").trim();
    const tenantId = String(body.tenant_id ?? "").trim();

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { error: "Ungültiger Betrag." },
        { status: 400 }
      );
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      metadata: {
        payment_id: paymentId,
        sales_order_id: salesOrderId,
        tenant_id: tenantId,
      },
    });

    return NextResponse.json({
      id: intent.id,
      client_secret: intent.client_secret,
      status: intent.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "PaymentIntent konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}