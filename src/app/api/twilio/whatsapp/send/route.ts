import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function supabaseAdmin() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("whatsapp:")) return raw;
  const cleaned = raw.replace(/[^0-9+]/g, "");
  return cleaned ? `whatsapp:${cleaned}` : "";
}

async function sendTwilioWhatsapp(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
}) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`;
  const payload = new URLSearchParams();

  payload.set("From", params.from);
  payload.set("To", params.to);
  payload.set("Body", params.body);
  if (params.statusCallback) payload.set("StatusCallback", params.statusCallback);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `Twilio request failed with ${response.status}`;
    throw new Error(message);
  }

  return data as {
    sid?: string;
    status?: string;
    from?: string;
    to?: string;
    body?: string;
  };
}

function mapInitialTwilioStatus(status: string | null | undefined) {
  const normalized = String(status ?? "queued").toLowerCase();
  if (["accepted", "scheduled", "queued"].includes(normalized)) return "QUEUED";
  if (["sending", "sent"].includes(normalized)) return "SENT";
  if (normalized === "delivered") return "DELIVERED";
  if (normalized === "read") return "READ";
  if (["failed", "undelivered", "canceled"].includes(normalized)) return "FAILED";
  return "QUEUED";
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht eingeloggt." }, { status: 401 });
  }

  let conversationId = "";
  let body = "";

  try {
    const json = await request.json();
    conversationId = String(json.conversationId ?? "").trim();
    body = String(json.body ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger Request." }, { status: 400 });
  }

  if (!conversationId || !body) {
    return NextResponse.json({ ok: false, error: "Konversation und Nachricht sind erforderlich." }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("customer_conversations")
    .select(
      `
        id,
        tenant_id,
        person_id,
        customer_profile_id,
        channel,
        external_contact,
        external_contact_normalized
      `
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return NextResponse.json({ ok: false, error: "Konversation nicht gefunden oder kein Zugriff." }, { status: 404 });
  }

  if (conversation.channel !== "WHATSAPP") {
    return NextResponse.json({ ok: false, error: "Diese Route unterstützt aktuell nur WhatsApp." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from("communication_settings")
    .select("whatsapp_enabled, twilio_account_sid, twilio_whatsapp_from")
    .eq("tenant_id", conversation.tenant_id)
    .maybeSingle();

  const accountSid = settings?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const from = normalizeWhatsappNumber(settings?.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM);
  const to = normalizeWhatsappNumber(conversation.external_contact_normalized || conversation.external_contact);
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  const statusCallback = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/api/twilio/whatsapp/status` : undefined;

  if (!accountSid || !authToken || !from || !to) {
    const { data: failedMessage } = await supabase
      .from("customer_messages")
      .insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        person_id: conversation.person_id,
        customer_profile_id: conversation.customer_profile_id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body,
        provider: "TWILIO",
        status: "FAILED",
        whatsapp_from: from || null,
        whatsapp_to: to || null,
        sent_by_user_id: user.id,
        error_message: "Twilio ist noch nicht vollständig konfiguriert.",
        metadata: {
          missing: {
            accountSid: !accountSid,
            authToken: !authToken,
            from: !from,
            to: !to,
          },
        },
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json(
      {
        ok: false,
        error: "Twilio ist noch nicht vollständig konfiguriert.",
        messageId: failedMessage?.id ?? null,
      },
      { status: 400 }
    );
  }

  try {
    const twilioMessage = await sendTwilioWhatsapp({
      accountSid,
      authToken,
      from,
      to,
      body,
      statusCallback,
    });

    const status = mapInitialTwilioStatus(twilioMessage.status);
    const now = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("customer_messages")
      .insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        person_id: conversation.person_id,
        customer_profile_id: conversation.customer_profile_id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body,
        provider: "TWILIO",
        provider_message_id: twilioMessage.sid ?? null,
        whatsapp_from: from,
        whatsapp_to: to,
        status,
        sent_by_user_id: user.id,
        sent_at: status === "QUEUED" ? null : now,
        metadata: {
          twilio_initial_status: twilioMessage.status ?? null,
          status_callback: statusCallback ?? null,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    await supabase
      .from("customer_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversation.id);

    return NextResponse.json({ ok: true, messageId: inserted.id, twilioSid: twilioMessage.sid ?? null, status });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Twilio-Sendung fehlgeschlagen.";

    const { data: failedMessage } = await supabase
      .from("customer_messages")
      .insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        person_id: conversation.person_id,
        customer_profile_id: conversation.customer_profile_id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body,
        provider: "TWILIO",
        status: "FAILED",
        whatsapp_from: from,
        whatsapp_to: to,
        sent_by_user_id: user.id,
        error_message: errorMessage,
        metadata: {
          source: "twilio_send_route",
        },
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json({ ok: false, error: errorMessage, messageId: failedMessage?.id ?? null }, { status: 502 });
  }
}
