import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PersonRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type CustomerProfileRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  created_at: string;
};

type IncomingMedia = {
  index: number;
  url: string;
  contentType: string | null;
};

type StoredIncomingMedia = {
  index: number;
  kind: "audio" | "image" | "video" | "document" | "file";
  name: string;
  content_type: string | null;
  twilio_url: string;
  storage_path: string | null;
  public_url: string | null;
  size_bytes: number | null;
  mirror_error?: string | null;
};

const COMMUNICATION_BUCKET = "communication-attachments";

const MIME_EXTENSION: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/webm": "webm",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

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

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9+]/g, "")
    .trim();
}

function digitsOnly(value: string | null | undefined) {
  return normalizePhone(value).replace(/[^0-9]/g, "");
}

function safePathPart(value: string) {
  return String(value || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function cleanContentType(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return normalized || null;
}

function extensionForContentType(contentType: string | null | undefined) {
  const clean = cleanContentType(contentType);
  if (!clean) return "bin";
  return MIME_EXTENSION[clean] ?? clean.split("/").pop()?.replace(/[^a-z0-9]/g, "") ?? "bin";
}

function mediaKind(contentType: string | null | undefined): StoredIncomingMedia["kind"] {
  const clean = cleanContentType(contentType) ?? "";
  if (clean.startsWith("audio/")) return "audio";
  if (clean.startsWith("image/")) return "image";
  if (clean.startsWith("video/")) return "video";
  if (clean === "application/pdf") return "document";
  return "file";
}

function mediaLabel(kind: StoredIncomingMedia["kind"], fallback = "Datei") {
  switch (kind) {
    case "audio":
      return "🎙️ Sprachnachricht";
    case "image":
      return "🖼️ Bild";
    case "video":
      return "🎥 Video";
    case "document":
      return "📄 Dokument";
    default:
      return `📎 ${fallback}`;
  }
}

function twilioXmlResponse() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

async function findPersonByPhone(admin: ReturnType<typeof supabaseAdmin>, incomingPhone: string) {
  const incomingDigits = digitsOnly(incomingPhone);

  if (!incomingDigits) return null;

  const { data: persons, error } = await admin
    .from("persons")
    .select("id, full_name, phone")
    .not("phone", "is", null)
    .limit(5000);

  if (error) {
    console.error("Twilio inbound: persons lookup failed", error);
    return null;
  }

  return ((persons ?? []) as PersonRow[]).find((person) => {
    const storedDigits = digitsOnly(person.phone);
    return (
      storedDigits === incomingDigits ||
      storedDigits.endsWith(incomingDigits) ||
      incomingDigits.endsWith(storedDigits)
    );
  }) ?? null;
}

async function findTenantFromIncomingNumber(admin: ReturnType<typeof supabaseAdmin>, toNumber: string) {
  const normalizedTo = normalizePhone(toNumber);
  const normalizedWithPrefix = normalizedTo ? `whatsapp:${normalizedTo}` : "";

  const { data } = await admin
    .from("communication_settings")
    .select("tenant_id, twilio_whatsapp_from")
    .or(`twilio_whatsapp_from.eq.${normalizedTo},twilio_whatsapp_from.eq.${normalizedWithPrefix}`)
    .limit(1)
    .maybeSingle();

  return data?.tenant_id ?? process.env.TWILIO_DEFAULT_TENANT_ID ?? null;
}

async function getCustomerProfileForPerson(admin: ReturnType<typeof supabaseAdmin>, personId: string, fallbackTenantId: string | null) {
  let query = admin
    .from("customer_profiles")
    .select("id, tenant_id, person_id, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (fallbackTenantId) {
    query = query.eq("tenant_id", fallbackTenantId);
  }

  let { data } = await query.maybeSingle<CustomerProfileRow>();

  if (!data && fallbackTenantId) {
    const fallback = await admin
      .from("customer_profiles")
      .select("id, tenant_id, person_id, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<CustomerProfileRow>();
    data = fallback.data ?? null;
  }

  return data;
}

async function findOrCreateConversation(params: {
  admin: ReturnType<typeof supabaseAdmin>;
  tenantId: string;
  personId: string | null;
  customerProfileId: string | null;
  from: string;
  body: string;
}) {
  const { admin, tenantId, personId, customerProfileId, from, body } = params;
  const externalContact = normalizePhone(from);
  const externalContactNormalized = normalizePhone(from);

  let query = admin
    .from("customer_conversations")
    .select("id, tenant_id, person_id, customer_profile_id")
    .eq("tenant_id", tenantId)
    .eq("channel", "WHATSAPP")
    .eq("external_contact_normalized", externalContactNormalized)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (personId) {
    query = query.eq("person_id", personId);
  }

  const existing = await query.maybeSingle();
  if (existing.data?.id) return existing.data;

  const { data, error } = await admin
    .from("customer_conversations")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      customer_profile_id: customerProfileId,
      channel: "WHATSAPP",
      status: "OPEN",
      subject: "WhatsApp",
      external_contact: externalContact,
      external_contact_normalized: externalContactNormalized,
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 160),
      unread_count: 0,
    })
    .select("id, tenant_id, person_id, customer_profile_id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function getFormValueCaseInsensitive(form: FormData, key: string) {
  const direct = form.get(key);
  if (direct !== null) return direct;

  const wanted = key.toLowerCase();
  for (const [entryKey, entryValue] of form.entries()) {
    if (entryKey.toLowerCase() === wanted) return entryValue;
  }

  return null;
}

function getIncomingMedia(form: FormData): IncomingMedia[] {
  const numMediaRaw = getFormValueCaseInsensitive(form, "NumMedia");
  const parsedNumMedia = Math.max(0, Number.parseInt(String(numMediaRaw ?? "0"), 10) || 0);

  const discoveredIndexes = new Set<number>();
  for (let index = 0; index < parsedNumMedia; index += 1) discoveredIndexes.add(index);

  for (const [entryKey] of form.entries()) {
    const match = entryKey.match(/^MediaUrl(\d+)$/i);
    if (match) discoveredIndexes.add(Number(match[1]));
  }

  const result: IncomingMedia[] = [];

  for (const index of Array.from(discoveredIndexes).sort((a, b) => a - b)) {
    const url = String(getFormValueCaseInsensitive(form, `MediaUrl${index}`) ?? "").trim();
    if (!url) continue;
    result.push({
      index,
      url,
      contentType: cleanContentType(String(getFormValueCaseInsensitive(form, `MediaContentType${index}`) ?? "")),
    });
  }

  return result;
}

async function mirrorIncomingMedia(params: {
  admin: ReturnType<typeof supabaseAdmin>;
  tenantId: string;
  conversationId: string;
  messageSid: string;
  media: IncomingMedia[];
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const mirrored: StoredIncomingMedia[] = [];

  for (const item of params.media) {
    const initialContentType = cleanContentType(item.contentType);
    const kind = mediaKind(initialContentType);
    const extension = extensionForContentType(initialContentType);
    const baseName = `${kind === "audio" ? "sprachnachricht" : kind}-${safePathPart(params.messageSid)}-${item.index}.${extension}`;

    if (!accountSid || !authToken) {
      mirrored.push({
        index: item.index,
        kind,
        name: baseName,
        content_type: initialContentType,
        twilio_url: item.url,
        storage_path: null,
        public_url: null,
        size_bytes: null,
        mirror_error: "TWILIO_ACCOUNT_SID oder TWILIO_AUTH_TOKEN fehlt. Media konnte nicht gespiegelt werden.",
      });
      continue;
    }

    try {
      const response = await fetch(item.url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Twilio Media Download fehlgeschlagen (${response.status})`);
      }

      const finalContentType = cleanContentType(response.headers.get("content-type")) ?? initialContentType ?? "application/octet-stream";
      const finalKind = mediaKind(finalContentType);
      const finalExtension = extensionForContentType(finalContentType);
      const finalName = `${finalKind === "audio" ? "sprachnachricht" : finalKind}-${safePathPart(params.messageSid)}-${item.index}.${finalExtension}`;
      const arrayBuffer = await response.arrayBuffer();
      const storagePath = `${params.tenantId}/whatsapp/inbound/${params.conversationId}/${Date.now()}-${finalName}`;

      const { error: uploadError } = await params.admin.storage
        .from(COMMUNICATION_BUCKET)
        .upload(storagePath, new Blob([arrayBuffer], { type: finalContentType }), {
          cacheControl: "3600",
          contentType: finalContentType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = params.admin.storage
        .from(COMMUNICATION_BUCKET)
        .getPublicUrl(storagePath);

      mirrored.push({
        index: item.index,
        kind: finalKind,
        name: finalName,
        content_type: finalContentType,
        twilio_url: item.url,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        size_bytes: arrayBuffer.byteLength,
        mirror_error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Media-Fehler";
      console.error("Twilio inbound: media mirror failed", {
        messageSid: params.messageSid,
        mediaIndex: item.index,
        error: message,
      });

      mirrored.push({
        index: item.index,
        kind,
        name: baseName,
        content_type: initialContentType,
        twilio_url: item.url,
        storage_path: null,
        public_url: null,
        size_bytes: null,
        mirror_error: message,
      });
    }
  }

  return mirrored;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const from = String(form.get("From") ?? "");
    const to = String(form.get("To") ?? "");
    const incomingBody = String(form.get("Body") ?? "").trim();
    const messageSid = String(form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "");
    const profileName = String(form.get("ProfileName") ?? "");
    const waId = String(form.get("WaId") ?? "");
    const incomingMedia = getIncomingMedia(form);
    const messageType = String(getFormValueCaseInsensitive(form, "MessageType") ?? "").trim().toLowerCase();
    const firstIncomingMediaKind = incomingMedia[0]
      ? mediaKind(incomingMedia[0].contentType)
      : messageType.includes("audio") || messageType.includes("voice")
        ? "audio"
        : null;
    const mediaOnlyLabel = firstIncomingMediaKind ? mediaLabel(firstIncomingMediaKind) : "📎 Datei";
    const body = incomingBody || (incomingMedia.length > 0 || firstIncomingMediaKind ? mediaOnlyLabel : "");

    if (!from || !messageSid) {
      console.warn("Twilio inbound: missing From or MessageSid", { from, messageSid });
      return twilioXmlResponse();
    }

    const admin = supabaseAdmin();
    const tenantFromNumber = await findTenantFromIncomingNumber(admin, to);
    const person = await findPersonByPhone(admin, from);
    const profile = person ? await getCustomerProfileForPerson(admin, person.id, tenantFromNumber) : null;
    const tenantId = profile?.tenant_id ?? tenantFromNumber;

    if (!tenantId) {
      console.error("Twilio inbound: no tenant resolved. Set communication_settings.twilio_whatsapp_from or TWILIO_DEFAULT_TENANT_ID.", {
        from,
        to,
        messageSid,
      });
      return twilioXmlResponse();
    }

    const conversation = await findOrCreateConversation({
      admin,
      tenantId,
      personId: person?.id ?? null,
      customerProfileId: profile?.id ?? null,
      from,
      body,
    });

    const mirroredMedia = incomingMedia.length > 0
      ? await mirrorIncomingMedia({
          admin,
          tenantId,
          conversationId: conversation.id,
          messageSid,
          media: incomingMedia,
        })
      : [];

    const firstAttachment = mirroredMedia[0] ?? null;

    const { error: insertError } = await admin.from("customer_messages").insert({
      conversation_id: conversation.id,
      tenant_id: tenantId,
      person_id: person?.id ?? null,
      customer_profile_id: profile?.id ?? null,
      direction: "INBOUND",
      channel: "WHATSAPP",
      body,
      provider: "TWILIO",
      provider_message_id: messageSid,
      whatsapp_from: from,
      whatsapp_to: to,
      status: "RECEIVED",
      received_at: new Date().toISOString(),
      metadata: {
        profile_name: profileName || null,
        wa_id: waId || null,
        raw_from: from,
        raw_to: to,
        message_type: messageType || null,
        num_media: incomingMedia.length,
        inbound_media: mirroredMedia,
        attachment: firstAttachment
          ? {
              name: firstAttachment.name,
              type: firstAttachment.content_type,
              kind: firstAttachment.kind,
              size: firstAttachment.size_bytes,
              public_url: firstAttachment.public_url,
              storage_path: firstAttachment.storage_path,
              twilio_url: firstAttachment.twilio_url,
              mirror_error: firstAttachment.mirror_error ?? null,
            }
          : null,
      },
    });

    if (insertError) {
      console.error("Twilio inbound: insert message failed", insertError);
    }

    return twilioXmlResponse();
  } catch (error) {
    console.error("Twilio inbound webhook failed", error);
    return twilioXmlResponse();
  }
}
