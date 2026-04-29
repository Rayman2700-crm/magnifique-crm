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

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^0-9+]/g, "")
    .trim();
}

function digitsOnly(value: string | null | undefined) {
  return normalizePhone(value).replace(/[^0-9]/g, "");
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

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const from = String(form.get("From") ?? "");
    const to = String(form.get("To") ?? "");
    const body = String(form.get("Body") ?? "").trim();
    const messageSid = String(form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "");
    const profileName = String(form.get("ProfileName") ?? "");
    const waId = String(form.get("WaId") ?? "");

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
