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
    },
  );
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("whatsapp:")) return raw;
  const cleaned = raw.replace(/[^0-9+]/g, "");
  return cleaned ? `whatsapp:${cleaned}` : "";
}

function safeFileName(name: string) {
  const cleaned = String(name || "datei").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(0, 120) || "datei";
}

function baseMimeType(value: string) {
  return String(value || "").toLowerCase().split(";")[0]?.trim() || "";
}

function extensionFromMime(mimeType: string) {
  const normalized = baseMimeType(mimeType);
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "mp3";
  if (normalized === "audio/mp4" || normalized === "audio/aac") return "m4a";
  if (normalized === "audio/wav") return "wav";
  return "bin";
}

function mimeFromFileName(name: string) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function normalizeMimeType(file: File) {
  const rawFromFile = String(file.type || "").toLowerCase().trim();
  const fromFile = baseMimeType(rawFromFile);
  const fromName = mimeFromFileName(file.name || "");
  const mimeType = fromFile && fromFile !== "application/octet-stream" ? fromFile : fromName;

  // HEIC/HEIF wird von vielen WhatsApp/Twilio-Flows nicht sauber als Vorschau geöffnet.
  // Lieber hart stoppen als dem Kunden eine kaputte Datei zu schicken.
  if (["image/heic", "image/heif"].includes(mimeType)) {
    throw new Error("HEIC/HEIF wird für WhatsApp nicht unterstützt. Bitte als JPG oder PNG senden.");
  }

  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "application/pdf",
    "audio/ogg",
    "audio/webm",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/aac",
    "audio/wav",
  ]);

  if (!allowed.has(mimeType)) {
    throw new Error(`Dateityp ${rawFromFile || mimeType || "unbekannt"} wird für WhatsApp aktuell nicht unterstützt. Bitte JPG, PNG, WEBP, GIF, MP4, PDF oder Audio verwenden.`);
  }

  return mimeType;
}

async function assertPublicMediaUrl(publicUrl: string, expectedMimeType: string) {
  const response = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Die hochgeladene Datei ist öffentlich nicht abrufbar (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  const normalizedContentType = baseMimeType(contentType);
  const normalizedExpectedMimeType = baseMimeType(expectedMimeType);
  if (normalizedContentType && normalizedExpectedMimeType && normalizedContentType !== normalizedExpectedMimeType) {
    throw new Error(`Falscher Content-Type im Storage: ${contentType}. Erwartet: ${expectedMimeType}.`);
  }
}

async function uploadAttachment(params: {
  admin: ReturnType<typeof supabaseAdmin>;
  file: File;
  tenantId: string;
  conversationId: string;
}) {
  const bucket = process.env.SUPABASE_COMMUNICATION_ATTACHMENTS_BUCKET || "communication-attachments";
  const mimeType = normalizeMimeType(params.file);
  const originalName = safeFileName(params.file.name || `attachment.${extensionFromMime(mimeType)}`);
  const storagePath = `${params.tenantId}/${params.conversationId}/${Date.now()}-${crypto.randomUUID()}-${originalName}`;

  const arrayBuffer = await params.file.arrayBuffer();
  const uploadBlob = new Blob([arrayBuffer], { type: mimeType });

  const { error: uploadError } = await params.admin.storage.from(bucket).upload(storagePath, uploadBlob, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Datei-Upload fehlgeschlagen: ${uploadError.message}`);
  }

  const { data: publicUrlData } = params.admin.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl || "";

  if (!publicUrl) {
    throw new Error("Für die hochgeladene Datei konnte keine öffentliche URL erzeugt werden.");
  }

  await assertPublicMediaUrl(publicUrl, mimeType);

  return {
    bucket,
    path: storagePath,
    name: params.file.name || originalName,
    type: mimeType,
    size: params.file.size,
    public_url: publicUrl,
  };
}

async function sendTwilioWhatsapp(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body?: string;
  statusCallback?: string;
  mediaUrl?: string | null;
}) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`;
  const payload = new URLSearchParams();

  payload.set("From", params.from);
  payload.set("To", params.to);
  if (params.body?.trim()) payload.set("Body", params.body.trim());
  if (params.statusCallback) payload.set("StatusCallback", params.statusCallback);
  if (params.mediaUrl) payload.append("MediaUrl", params.mediaUrl);

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

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const attachmentValue = formData.get("attachment");
    const attachment = attachmentValue instanceof File && attachmentValue.size > 0 ? attachmentValue : null;

    return {
      conversationId: String(formData.get("conversationId") ?? formData.get("conversation_id") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      mediaUrl: String(formData.get("mediaUrl") ?? formData.get("media_url") ?? "").trim() || null,
      attachment,
    };
  }

  const json = await request.json();
  return {
    conversationId: String(json.conversationId ?? json.conversation_id ?? "").trim(),
    body: String(json.body ?? "").trim(),
    mediaUrl: String(json.mediaUrl ?? json.media_url ?? "").trim() || null,
    attachment: null as File | null,
  };
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
  let mediaUrl: string | null = null;
  let attachment: File | null = null;

  try {
    const parsed = await parseRequest(request);
    conversationId = parsed.conversationId;
    body = parsed.body;
    mediaUrl = parsed.mediaUrl;
    attachment = parsed.attachment;
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger Request." }, { status: 400 });
  }

  if (!conversationId || (!body && !attachment && !mediaUrl)) {
    return NextResponse.json(
      { ok: false, error: "Konversation und Nachricht oder Datei sind erforderlich." },
      { status: 400 },
    );
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
      `,
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
  let attachmentMetadata: Record<string, unknown> | null = null;

  try {
    if (attachment) {
      const uploaded = await uploadAttachment({
        admin,
        file: attachment,
        tenantId: conversation.tenant_id,
        conversationId: conversation.id,
      });
      mediaUrl = uploaded.public_url;
      attachmentMetadata = { attachment: uploaded };
    } else if (mediaUrl) {
      attachmentMetadata = {
        attachment: {
          public_url: mediaUrl,
          source: "external_media_url",
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Datei-Upload fehlgeschlagen.";

    const { data: failedMessage } = await supabase
      .from("customer_messages")
      .insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        person_id: conversation.person_id,
        customer_profile_id: conversation.customer_profile_id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body: body || (attachment ? `📎 ${attachment.name}` : "📎 Datei"),
        provider: "TWILIO",
        status: "FAILED",
        sent_by_user_id: user.id,
        error_message: errorMessage,
        metadata: {
          source: "twilio_send_route_upload",
          attachment: attachment
            ? {
                name: attachment.name,
                type: attachment.type || "application/octet-stream",
                size: attachment.size,
              }
            : null,
        },
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json({ ok: false, error: errorMessage, messageId: failedMessage?.id ?? null }, { status: 400 });
  }

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
        body: body || (attachment ? `📎 ${attachment.name}` : "📎 Datei"),
        provider: "TWILIO",
        status: "FAILED",
        whatsapp_from: from || null,
        whatsapp_to: to || null,
        sent_by_user_id: user.id,
        error_message: "Twilio ist noch nicht vollständig konfiguriert.",
        metadata: {
          source: "twilio_send_route",
          ...(attachmentMetadata ?? {}),
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
      { status: 400 },
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
      mediaUrl,
    });

    const status = mapInitialTwilioStatus(twilioMessage.status);
    const now = new Date().toISOString();
    const isAudioAttachment = Boolean(attachmentMetadata?.attachment && String((attachmentMetadata.attachment as { type?: unknown }).type ?? "").toLowerCase().startsWith("audio/"));
    const storedBody = body || (isAudioAttachment ? "🎙 Sprachnachricht" : attachment ? `📎 ${attachment.name}` : mediaUrl ? "📎 Datei" : "");

    const { data: inserted, error: insertError } = await supabase
      .from("customer_messages")
      .insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        person_id: conversation.person_id,
        customer_profile_id: conversation.customer_profile_id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body: storedBody,
        provider: "TWILIO",
        provider_message_id: twilioMessage.sid ?? null,
        whatsapp_from: from,
        whatsapp_to: to,
        status,
        sent_by_user_id: user.id,
        sent_at: status === "QUEUED" ? null : now,
        metadata: {
          source: "twilio_send_route",
          twilio_initial_status: twilioMessage.status ?? null,
          status_callback: statusCallback ?? null,
          media_url: mediaUrl ?? null,
          ...(attachmentMetadata ?? {}),
        },
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    await supabase.from("customer_conversations").update({ unread_count: 0 }).eq("id", conversation.id);

    return NextResponse.json({
      ok: true,
      messageId: inserted.id,
      twilioSid: twilioMessage.sid ?? null,
      status,
      mediaUrl: mediaUrl ?? null,
    });
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
        body: body || (attachment ? `📎 ${attachment.name}` : "📎 Datei"),
        provider: "TWILIO",
        status: "FAILED",
        whatsapp_from: from,
        whatsapp_to: to,
        sent_by_user_id: user.id,
        error_message: errorMessage,
        metadata: {
          source: "twilio_send_route",
          media_url: mediaUrl ?? null,
          ...(attachmentMetadata ?? {}),
        },
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json({ ok: false, error: errorMessage, messageId: failedMessage?.id ?? null }, { status: 502 });
  }
}
