import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PaymentRow = {
  id: string;
  tenant_id: string | null;
  sales_order_id: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  provider: string | null;
  provider_transaction_id: string | null;
  provider_response_json: Record<string, unknown> | null;
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

function toAmountCents(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function isTestSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY ?? "").trim().startsWith("sk_test_");
}

function isSimulatedReader(reader: Stripe.Terminal.Reader) {
  const label = String(reader.label ?? "").trim().toLowerCase();
  const deviceType = String((reader as { device_type?: string | null }).device_type ?? "").trim().toLowerCase();
  return label.includes("simulated reader") || deviceType.includes("simulated");
}

function isReaderBlockingActionStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "in_progress" || normalized === "pending";
}

function isReaderRecoverableActionStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "failed" || normalized === "succeeded" || normalized === "canceled" || normalized === "cancelled";
}

function rankReader(reader: Stripe.Terminal.Reader) {
  const status = String(reader.status ?? "").trim().toLowerCase();
  const actionStatus = String(reader.action?.status ?? "").trim().toLowerCase();
  if (status === "online" && !actionStatus) return 0;
  if (status === "online" && isReaderRecoverableActionStatus(actionStatus)) return 1;
  if (status === "online") return 2;
  if (status === "offline") return 4;
  return 3;
}

async function maybeClearReaderAction(reader: Stripe.Terminal.Reader) {
  const actionStatus = String(reader.action?.status ?? "").trim().toLowerCase();
  if (!isReaderRecoverableActionStatus(actionStatus)) return reader;
  try {
    return await stripe.terminal.readers.cancelAction(reader.id);
  } catch {
    return reader;
  }
}

async function ensurePaymentIntent(payment: PaymentRow) {
  const existingIntentId = String(payment.provider_transaction_id ?? "").trim();
  if (existingIntentId) return existingIntentId;

  const amountCents = toAmountCents(payment.amount);
  if (amountCents <= 0) {
    throw new Error("Payment-Betrag ist ungültig.");
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: String(payment.currency_code ?? "EUR").trim().toLowerCase() || "eur",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: {
      payment_id: payment.id,
      sales_order_id: String(payment.sales_order_id ?? "").trim(),
      tenant_id: String(payment.tenant_id ?? "").trim(),
    },
  });

  const admin = supabaseAdmin();
  const providerPayload = {
    ...(payment.provider_response_json ?? {}),
    phase: "payment_intent_created_for_reader",
    created_at: new Date().toISOString(),
    stripe_payment_intent_id: intent.id,
    stripe_status: intent.status,
    has_client_secret: Boolean(intent.client_secret),
  };

  const { error } = await admin
    .from("payments")
    .update({
      provider: "STRIPE_TERMINAL",
      provider_transaction_id: intent.id,
      provider_response_json: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (error) {
    throw new Error(error.message ?? "PaymentIntent konnte intern nicht gespeichert werden.");
  }

  return intent.id;
}

function isLiveReader(
  reader: Stripe.Response<Stripe.Terminal.Reader | { deleted?: boolean }>
): reader is Stripe.Response<Stripe.Terminal.Reader> {
  return !("deleted" in reader && reader.deleted === true);
}

async function resolveReader(requestedReaderId: string) {
  if (requestedReaderId) {
    const requested = await stripe.terminal.readers.retrieve(requestedReaderId);

    if (!isLiveReader(requested)) {
      throw new Error(`Reader ${requestedReaderId} wurde gelöscht oder existiert nicht mehr.`);
    }

    return maybeClearReaderAction(requested);
  }
  const list = await stripe.terminal.readers.list({ limit: 100 });
  const ordered = [...list.data].sort((a, b) => rankReader(a) - rankReader(b));
  const candidate = ordered[0] ?? null;
  return candidate ? maybeClearReaderAction(candidate) : null;
}

export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  let paymentId = "";

  try {
    const body = await req.json();
    paymentId = String(body?.payment_id ?? "").trim();
    const requestedReaderId = String(body?.reader_id ?? "").trim();

    if (!paymentId) {
      return jsonNoStore({ error: "payment_id fehlt." }, { status: 400 });
    }

    const reader = await resolveReader(requestedReaderId);
    if (!reader?.id) {
      return jsonNoStore({ error: "Kein verfügbarer Reader gefunden." }, { status: 400 });
    }

    const readerStatus = String(reader.status ?? "").trim().toLowerCase();
    const readerActionStatus = String(reader.action?.status ?? "").trim().toLowerCase();
    if (readerStatus !== "online") {
      return jsonNoStore({ error: `Reader ${reader.label ?? reader.id} ist aktuell nicht online.` }, { status: 409 });
    }
    if (isReaderBlockingActionStatus(readerActionStatus)) {
      return jsonNoStore({ error: `Reader ${reader.label ?? reader.id} ist gerade beschäftigt (${readerActionStatus}).` }, { status: 409 });
    }

    const { data: payment, error } = await admin
      .from("payments")
      .select("id, tenant_id, sales_order_id, amount, currency_code, status, provider, provider_transaction_id, provider_response_json")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      return jsonNoStore({ error: error.message ?? "Payment konnte nicht geladen werden." }, { status: 500 });
    }

    if (!payment?.id) {
      return jsonNoStore({ error: "Payment wurde nicht gefunden." }, { status: 404 });
    }

    const normalizedStatus = String(payment.status ?? "").trim().toUpperCase();
    if (normalizedStatus === "COMPLETED") {
      return jsonNoStore({ error: "Payment ist bereits abgeschlossen.", should_reload: true }, { status: 409 });
    }
    if (normalizedStatus === "PROCESSING") {
      return jsonNoStore({ error: "Payment läuft bereits am Terminal.", should_reload: true }, { status: 409 });
    }
    if (normalizedStatus === "CANCELLED") {
      return jsonNoStore({ error: "Dieses Payment wurde bereits abgebrochen.", should_reload: true }, { status: 409 });
    }

    const paymentIntentId = await ensurePaymentIntent(payment as PaymentRow);

    const processedReader = await stripe.terminal.readers.processPaymentIntent(reader.id, {
      payment_intent: paymentIntentId,
      process_config: {
        skip_tipping: true,
        enable_customer_cancellation: true,
      },
    });

    const autoPresentedTestCard = isTestSecretKey() && isSimulatedReader(processedReader);

    if (autoPresentedTestCard) {
      await stripe.testHelpers.terminal.readers.presentPaymentMethod(processedReader.id, {});
    }

    const providerPayload = {
      ...((payment.provider_response_json as Record<string, unknown> | null) ?? {}),
      phase: autoPresentedTestCard ? "sent_to_reader_and_auto_presented" : "sent_to_reader",
      sent_to_reader_at: new Date().toISOString(),
      reader_id: processedReader.id,
      reader_label: processedReader.label ?? null,
      reader_status: processedReader.status ?? null,
      reader_action: {
        status: processedReader.action?.status ?? null,
        type: processedReader.action?.type ?? null,
      },
      stripe_payment_intent_id: paymentIntentId,
      auto_presented_test_card: autoPresentedTestCard,
    };

    const { error: updateError } = await admin
      .from("payments")
      .update({
        status: "PROCESSING",
        provider: "STRIPE_TERMINAL",
        provider_transaction_id: paymentIntentId,
        provider_response_json: providerPayload,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    if (updateError) {
      throw new Error(updateError.message ?? "Payment konnte nicht auf PROCESSING gesetzt werden.");
    }

    if (payment.sales_order_id) {
      await admin
        .from("sales_orders")
        .update({
          status: "OPEN",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.sales_order_id);
    }

    return jsonNoStore({
      ok: true,
      payment_id: paymentId,
      payment_intent_id: paymentIntentId,
      auto_presented_test_card: autoPresentedTestCard,
      poll_recommended: true,
      reader: {
        id: processedReader.id,
        label: processedReader.label ?? null,
        status: processedReader.status ?? null,
        actionStatus: processedReader.action?.status ?? null,
        actionType: processedReader.action?.type ?? null,
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "Payment konnte nicht an den Reader gesendet werden.").trim() || "Payment konnte nicht an den Reader gesendet werden.";

    if (paymentId) {
      await admin
        .from("payments")
        .update({
          status: "FAILED",
          failure_reason: message,
          provider_response_json: {
            phase: "reader_send_failed",
            failed_at: new Date().toISOString(),
            error_message: message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);
    }

    if (error instanceof Stripe.errors.StripeError) {
      return jsonNoStore({ error: message, retry_allowed: true }, { status: 400 });
    }

    return jsonNoStore({ error: message, retry_allowed: true }, { status: 500 });
  }
}
