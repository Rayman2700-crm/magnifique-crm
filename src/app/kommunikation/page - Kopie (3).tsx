import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import KommunikationComposerClient from "./KommunikationComposerClient";

export const dynamic = "force-dynamic";

function IconClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19.5l1.35-3.65A7.6 7.6 0 1 1 12 18.6a8.2 8.2 0 0 1-3.3-.7L5 19.5Z" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" />
      <path d="M8.5 11.5h7M8.5 8.8h5.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.25" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.35 4.1L17.5 8.5l-4.15 1.4L12 14l-1.35-4.1L6.5 8.5l4.15-1.4L12 3Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M18.5 13l.8 2.4 2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.4ZM5.7 14.5l.55 1.65 1.55.55-1.55.55-.55 1.65-.55-1.65-1.55-.55 1.55-.55.55-1.65Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}


function IconMenu() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    </svg>
  );
}

function MobilePanelMenu({
  statusFilter,
  selectedConversationId,
  activePanel,
}: {
  statusFilter: string;
  selectedConversationId?: string | null;
  activePanel: string;
}) {
  const base = `/kommunikation?status=${encodeURIComponent(statusFilter)}${selectedConversationId ? `&c=${encodeURIComponent(selectedConversationId)}` : ""}`;
  const itemClass = "flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 py-3 text-sm font-semibold text-[#f7efe2] transition hover:bg-white/[0.07]";

  return (
    <details className="relative md:hidden">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/72 transition hover:bg-white/[0.09] [&::-webkit-details-marker]:hidden">
        <IconMenu />
      </summary>
      <div className="absolute right-0 top-12 z-30 w-[230px] rounded-[24px] border border-white/[0.10] bg-[linear-gradient(180deg,rgba(36,28,22,0.98),rgba(17,13,10,0.99))] p-2 shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
        <Link
          href={`/kommunikation?status=${encodeURIComponent(statusFilter)}&panel=chats&mobileList=1`}
          className={`${itemClass} ${activePanel === "chats" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/14" : ""}`}
        >
          <IconChat />
          Chats
        </Link>
        <Link href={`${base}&panel=customer`} className={`${itemClass} mt-2 ${activePanel === "customer" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/14" : ""}`}>
          <IconUser />
          Kunde
        </Link>
        <Link href={`${base}&panel=templates`} className={`${itemClass} mt-2 ${activePanel === "templates" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/14" : ""}`}>
          <IconSparkles />
          Vorlagen
        </Link>
      </div>
    </details>
  );
}

type SearchParams =
  | {
      c?: string;
      status?: string;
      customerSearch?: string;
      template?: string;
      panel?: string;
      q?: string;
      mobileList?: string;
    }
  | Promise<{
      c?: string;
      status?: string;
      customerSearch?: string;
      template?: string;
      panel?: string;
      q?: string;
      mobileList?: string;
    }>;

type ConversationRow = {
  id: string;
  tenant_id: string;
  person_id: string | null;
  customer_profile_id: string | null;
  channel: string;
  status: string;
  subject: string | null;
  external_contact: string | null;
  external_contact_normalized: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  person?: any;
  tenant?: any;
};

type MessageRow = {
  id: string;
  direction: string;
  channel: string;
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  error_message: string | null;
  metadata?: any;
};

type TemplateRow = {
  id: string;
  title: string;
  category: string;
  channel: string;
  body: string;
  is_global: boolean;
};

type CustomerCandidateRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  created_at?: string;
  person?: any;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function conversationName(row: ConversationRow): string {
  const person = firstJoin<any>(row.person);
  return String(person?.full_name || row.external_contact || "Unbekannter Kontakt");
}

function tenantName(row: ConversationRow): string {
  const tenant = firstJoin<any>(row.tenant);
  return String(tenant?.display_name || "Studio");
}

function channelLabel(channel: string) {
  switch (channel) {
    case "WHATSAPP":
      return "WhatsApp";
    case "EMAIL":
      return "E-Mail";
    case "SMS":
      return "SMS";
    case "PORTAL":
      return "Portal";
    default:
      return channel;
  }
}

function fillTemplateBody(params: {
  body: string;
  customerName: string;
  tenantName: string;
}) {
  return params.body
    .replace(/{{\s*customer_name\s*}}/gi, params.customerName || "Kunde")
    .replace(/{{\s*tenant_name\s*}}/gi, params.tenantName || "Studio")
    .replace(/{{\s*appointment_date\s*}}/gi, "[Datum einsetzen]")
    .replace(/{{\s*appointment_time\s*}}/gi, "[Uhrzeit einsetzen]");
}

function communicationHref(params: {
  statusFilter: string;
  conversationId?: string | null;
  templateId?: string | null;
  customerSearch?: string | null;
}) {
  const query = new URLSearchParams();
  query.set("status", params.statusFilter || "open");
  if (params.conversationId) query.set("c", params.conversationId);
  if (params.templateId) query.set("template", params.templateId);
  if (params.customerSearch) query.set("customerSearch", params.customerSearch);
  return `/kommunikation?${query.toString()}`;
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("whatsapp:")) return raw;
  const cleaned = raw.replace(/[^0-9+]/g, "");
  return cleaned ? `whatsapp:${cleaned}` : "";
}

function cleanPhoneForCustomer(value: string | null | undefined) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^whatsapp:/i, "");
  return raw.replace(/[^0-9+]/g, "");
}

function normalizePhoneDigits(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[^0-9+]/g, "")
    .toLowerCase();
}

function customerCandidateName(row: CustomerCandidateRow): string {
  const person = firstJoin<any>(row.person);
  return String(person?.full_name || "Unbenannter Kunde");
}

function customerCandidateMeta(row: CustomerCandidateRow) {
  const person = firstJoin<any>(row.person);
  const parts = [person?.phone, person?.email].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Keine Kontaktdaten";
}

async function sendTwilioWhatsapp(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
  mediaUrl?: string | null;
}) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`;
  const payload = new URLSearchParams();

  payload.set("From", params.from);
  payload.set("To", params.to);
  payload.set("Body", params.body);
  if (params.statusCallback)
    payload.set("StatusCallback", params.statusCallback);
  if (params.mediaUrl) payload.set("MediaUrl", params.mediaUrl);

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
    const message =
      typeof data?.message === "string"
        ? data.message
        : `Twilio request failed with ${response.status}`;
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
  if (["failed", "undelivered", "canceled"].includes(normalized))
    return "FAILED";
  return "QUEUED";
}

async function assignConversationToCustomer(formData: FormData) {
  "use server";

  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const customerProfileId = String(
    formData.get("customer_profile_id") ?? "",
  ).trim();
  const statusFilter =
    String(formData.get("status_filter") ?? "open").trim() || "open";

  if (!conversationId || !customerProfileId) {
    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}${conversationId ? `&c=${encodeURIComponent(conversationId)}` : ""}`,
    );
  }

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login");
  }

  const { data: conversation } = await supabase
    .from("customer_conversations")
    .select("id, tenant_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}`);
  }

  const { data: customerProfile } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .eq("id", customerProfileId)
    .eq("tenant_id", conversation.tenant_id)
    .maybeSingle();

  if (!customerProfile) {
    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
    );
  }

  await supabase
    .from("customer_conversations")
    .update({
      person_id: customerProfile.person_id,
      customer_profile_id: customerProfile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  await supabase
    .from("customer_messages")
    .update({
      person_id: customerProfile.person_id,
      customer_profile_id: customerProfile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversation.id);

  redirect(
    `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
  );
}

async function createCustomerFromConversation(formData: FormData) {
  "use server";

  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const statusFilter =
    String(formData.get("status_filter") ?? "open").trim() || "open";

  if (!conversationId || !fullName) {
    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}${conversationId ? `&c=${encodeURIComponent(conversationId)}` : ""}`,
    );
  }

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login");
  }

  const { data: conversation } = await supabase
    .from("customer_conversations")
    .select("id, tenant_id, external_contact, external_contact_normalized")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}`);
  }

  const phone = cleanPhoneForCustomer(
    conversation.external_contact_normalized || conversation.external_contact,
  );

  let personId: string | null = null;

  if (phone) {
    const { data: existingPerson } = await supabase
      .from("persons")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    personId = existingPerson?.id ?? null;
  }

  if (!personId) {
    const { data: createdPerson, error: personError } = await supabase
      .from("persons")
      .insert({
        full_name: fullName,
        phone: phone || null,
      })
      .select("id")
      .single();

    if (personError || !createdPerson) {
      redirect(
        `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
      );
    }

    personId = createdPerson.id;
  }

  const { data: existingProfile } = await supabase
    .from("customer_profiles")
    .select("id")
    .eq("tenant_id", conversation.tenant_id)
    .eq("person_id", personId)
    .maybeSingle();

  let customerProfileId = existingProfile?.id ?? null;

  if (!customerProfileId) {
    const { data: createdProfile, error: profileError } = await supabase
      .from("customer_profiles")
      .insert({
        tenant_id: conversation.tenant_id,
        person_id: personId,
      })
      .select("id")
      .single();

    if (profileError || !createdProfile) {
      redirect(
        `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
      );
    }

    customerProfileId = createdProfile.id;
  }

  await supabase
    .from("customer_conversations")
    .update({
      person_id: personId,
      customer_profile_id: customerProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  await supabase
    .from("customer_messages")
    .update({
      person_id: personId,
      customer_profile_id: customerProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversation.id);

  redirect(
    `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
  );
}

async function sendCommunicationReply(formData: FormData) {
  "use server";

  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const statusFilter =
    String(formData.get("status_filter") ?? "open").trim() || "open";
  const rawBody = String(formData.get("body") ?? "").trim();
  const attachmentValue = formData.get("attachment");
  const attachmentFile =
    attachmentValue instanceof File && attachmentValue.size > 0
      ? attachmentValue
      : null;

  if (!conversationId || (!rawBody && !attachmentFile)) {
    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}${conversationId ? `&c=${encodeURIComponent(conversationId)}` : ""}`,
    );
  }

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login");
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
    redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}`);
  }

  let body = rawBody;
  let attachmentMetadata: Record<string, any> | null = null;
  let attachmentMediaUrl: string | null = null;

  if (attachmentFile) {
    const bucket =
      process.env.SUPABASE_COMMUNICATION_ATTACHMENTS_BUCKET ||
      "communication-attachments";
    const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${conversation.tenant_id}/${conversation.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, attachmentFile, {
        contentType: attachmentFile.type || "application/octet-stream",
        upsert: false,
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      attachmentMediaUrl = publicUrlData.publicUrl || null;
      attachmentMetadata = {
        attachment: {
          bucket,
          path: storagePath,
          name: attachmentFile.name,
          type: attachmentFile.type || "application/octet-stream",
          size: attachmentFile.size,
          public_url: attachmentMediaUrl,
        },
      };
    } else {
      attachmentMetadata = {
        attachment: {
          name: attachmentFile.name,
          type: attachmentFile.type || "application/octet-stream",
          size: attachmentFile.size,
          upload_error: uploadError.message,
        },
      };
    }

    const attachmentLine = `📎 ${attachmentFile.name}`;
    body = body ? `${body}\n\n${attachmentLine}` : attachmentLine;
  }

  if (conversation.channel !== "WHATSAPP") {
    await supabase.from("customer_messages").insert({
      conversation_id: conversation.id,
      tenant_id: conversation.tenant_id,
      person_id: conversation.person_id,
      customer_profile_id: conversation.customer_profile_id,
      direction: "OUTBOUND",
      channel: conversation.channel ?? "WHATSAPP",
      body,
      provider: "CRM",
      status: "FAILED",
      whatsapp_to: conversation.external_contact,
      sent_by_user_id: user.id,
      error_message:
        "Aktuell unterstützt das echte Senden nur WhatsApp-Konversationen.",
      metadata: {
        source: "kommunikation_page_templates_v5",
        ...(attachmentMetadata ?? {}),
      },
    });

    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
    );
  }

  const { data: settings } = await supabase
    .from("communication_settings")
    .select("whatsapp_enabled, twilio_account_sid, twilio_whatsapp_from")
    .eq("tenant_id", conversation.tenant_id)
    .maybeSingle();

  const accountSid =
    settings?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const from = normalizeWhatsappNumber(
    settings?.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM,
  );
  const to = normalizeWhatsappNumber(
    conversation.external_contact_normalized || conversation.external_contact,
  );
  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  const statusCallback = appBaseUrl
    ? `${appBaseUrl.replace(/\/$/, "")}/api/twilio/whatsapp/status`
    : undefined;

  if (!accountSid || !authToken || !from || !to) {
    await supabase.from("customer_messages").insert({
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
        source: "kommunikation_page_templates_v5",
        ...(attachmentMetadata ?? {}),
        missing: {
          accountSid: !accountSid,
          authToken: !authToken,
          from: !from,
          to: !to,
        },
      },
    });

    redirect(
      `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
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
      mediaUrl: attachmentMediaUrl,
    });

    const status = mapInitialTwilioStatus(twilioMessage.status);
    const now = new Date().toISOString();

    await supabase.from("customer_messages").insert({
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
      sent_at: now,
      metadata: {
        source: "kommunikation_page_templates_v5",
        twilio_initial_status: twilioMessage.status ?? null,
        status_callback: statusCallback ?? null,
        ...(attachmentMetadata ?? {}),
      },
    });

    await supabase
      .from("customer_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversation.id);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Twilio-Sendung fehlgeschlagen.";

    await supabase.from("customer_messages").insert({
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
        source: "kommunikation_page_templates_v5",
        ...(attachmentMetadata ?? {}),
      },
    });
  }

  redirect(
    `/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`,
  );
}

export default async function KommunikationPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const selectedParam = typeof sp?.c === "string" ? sp.c : null;
  const statusFilter = typeof sp?.status === "string" ? sp.status : "open";
  const customerSearchRaw =
    typeof sp?.customerSearch === "string" ? sp.customerSearch : "";
  const customerSearch = customerSearchRaw.trim().toLowerCase();
  const selectedTemplateParam =
    typeof sp?.template === "string" ? sp.template : null;
  const selectedPanel = typeof sp?.panel === "string" ? sp.panel : "chats";
  const wantsMobileChatList = sp?.mobileList === "1";
  const chatSearchRaw = typeof sp?.q === "string" ? sp.q : "";
  const chatSearch = chatSearchRaw.trim().toLowerCase();

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl p-6 text-white">
        <Link href="/login" className="underline">
          Bitte einloggen
        </Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String(profile?.role ?? "PRACTITIONER");
  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
  });

  let conversationsQuery = supabase
    .from("customer_conversations")
    .select(
      `
        id,
        tenant_id,
        person_id,
        customer_profile_id,
        channel,
        status,
        subject,
        external_contact,
        external_contact_normalized,
        unread_count,
        last_message_at,
        last_message_preview,
        created_at,
        person:persons (
          id,
          full_name,
          phone,
          email
        ),
        tenant:tenants (
          id,
          display_name
        )
      `,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (role !== "ADMIN" && effectiveTenantId) {
    conversationsQuery = conversationsQuery.eq("tenant_id", effectiveTenantId);
  } else if (role === "ADMIN" && effectiveTenantId) {
    conversationsQuery = conversationsQuery.eq("tenant_id", effectiveTenantId);
  }

  if (statusFilter === "closed") {
    conversationsQuery = conversationsQuery.eq("status", "CLOSED");
  } else if (statusFilter === "all") {
    // alle anzeigen
  } else {
    conversationsQuery = conversationsQuery.eq("status", "OPEN");
  }

  const { data: conversationsRaw, error: conversationsError } =
    await conversationsQuery;
  const allConversations = (conversationsRaw ?? []) as ConversationRow[];
  const conversations = chatSearch
    ? allConversations.filter((conversation) => {
        const person = firstJoin<any>(conversation.person);
        const haystack = [
          person?.full_name,
          person?.phone,
          person?.email,
          conversation.external_contact,
          conversation.external_contact_normalized,
          conversation.last_message_preview,
          conversation.subject,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(chatSearch);
      })
    : allConversations;

  let searchedCustomers: CustomerCandidateRow[] = [];
  if (chatSearch) {
    let searchedCustomersQuery = supabase
      .from("customer_profiles")
      .select(
        `
          id,
          tenant_id,
          person_id,
          created_at,
          person:persons (
            id,
            full_name,
            phone,
            email
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (role !== "ADMIN" && effectiveTenantId) {
      searchedCustomersQuery = searchedCustomersQuery.eq(
        "tenant_id",
        effectiveTenantId,
      );
    } else if (role === "ADMIN" && effectiveTenantId) {
      searchedCustomersQuery = searchedCustomersQuery.eq(
        "tenant_id",
        effectiveTenantId,
      );
    }

    const { data: searchedCustomersRaw } = await searchedCustomersQuery;
    searchedCustomers = ((searchedCustomersRaw ?? []) as CustomerCandidateRow[])
      .filter((candidate) => {
        const person = firstJoin<any>(candidate.person);
        const haystack = [person?.full_name, person?.phone, person?.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(chatSearch);
      })
      .slice(0, 10);
  }

  const selectedConversation = wantsMobileChatList
    ? null
    : conversations.find((conversation) => conversation.id === selectedParam) ??
      conversations[0] ??
      null;

  let messages: MessageRow[] = [];
  if (selectedConversation) {
    const { data: messagesRaw } = await supabase
      .from("customer_messages")
      .select(
        `
          id,
          direction,
          channel,
          body,
          status,
          created_at,
          sent_at,
          received_at,
          error_message,
          metadata
        `,
      )
      .eq("conversation_id", selectedConversation.id)
      .order("created_at", { ascending: true })
      .limit(200);

    messages = (messagesRaw ?? []) as MessageRow[];
  }

  let customerCandidates: CustomerCandidateRow[] = [];
  if (selectedConversation && !selectedConversation.customer_profile_id) {
    const { data: candidatesRaw } = await supabase
      .from("customer_profiles")
      .select(
        `
          id,
          tenant_id,
          person_id,
          created_at,
          person:persons (
            id,
            full_name,
            phone,
            email
          )
        `,
      )
      .eq("tenant_id", selectedConversation.tenant_id)
      .order("created_at", { ascending: false })
      .limit(200);

    const externalPhone = normalizePhoneDigits(
      selectedConversation.external_contact_normalized ||
        selectedConversation.external_contact,
    );

    customerCandidates = ((candidatesRaw ?? []) as CustomerCandidateRow[])
      .filter((candidate) => {
        if (!customerSearch) return true;
        const person = firstJoin<any>(candidate.person);
        const haystack = [person?.full_name, person?.phone, person?.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(customerSearch);
      })
      .sort((a, b) => {
        const aPhone = normalizePhoneDigits(firstJoin<any>(a.person)?.phone);
        const bPhone = normalizePhoneDigits(firstJoin<any>(b.person)?.phone);
        const aMatch = Boolean(
          externalPhone &&
          aPhone &&
          (aPhone.endsWith(externalPhone.replace(/^\+/, "")) ||
            externalPhone.endsWith(aPhone.replace(/^\+/, ""))),
        );
        const bMatch = Boolean(
          externalPhone &&
          bPhone &&
          (bPhone.endsWith(externalPhone.replace(/^\+/, "")) ||
            externalPhone.endsWith(bPhone.replace(/^\+/, ""))),
        );
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return customerCandidateName(a).localeCompare(customerCandidateName(b));
      })
      .slice(0, 12);
  }

  const { data: templatesRaw } = await supabase
    .from("message_templates")
    .select("id, title, category, channel, body, is_global")
    .eq("is_active", true)
    .order("is_global", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);

  const templates = (templatesRaw ?? []) as TemplateRow[];
  const selectedTemplate = selectedTemplateParam
    ? (templates.find((template) => template.id === selectedTemplateParam) ??
      null)
    : null;
  const draftBody =
    selectedTemplate && selectedConversation
      ? fillTemplateBody({
          body: selectedTemplate.body,
          customerName: conversationName(selectedConversation),
          tenantName: tenantName(selectedConversation),
        })
      : "";
  const activeMobilePanel = selectedPanel || "chats";
  const showMobileSidePanel = !selectedConversation || activeMobilePanel !== "chats";

  return (
    <main className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] top-[88px] z-[60] w-full min-w-0 max-w-none overflow-hidden rounded-none border-y border-white/[0.08] bg-[linear-gradient(180deg,rgba(35,28,22,0.98)_0%,rgba(15,12,9,0.99)_100%)] text-white shadow-[-30px_30px_90px_rgba(0,0,0,0.48)] md:bottom-4 md:left-auto md:right-4 md:top-[96px] md:w-[min(1040px,calc(100vw-112px))] md:min-w-[760px] md:max-w-[calc(100vw-112px)] md:resize-x md:rounded-[30px] md:border">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(214,195,163,0.15),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(88,65,45,0.18),transparent_34%)]" />

      <div className="relative flex h-full min-h-0 overflow-hidden">
        <aside className="hidden w-[54px] shrink-0 min-h-0 flex-col items-center border-r border-white/[0.07] bg-black/[0.18] py-3 md:flex">
          <Link
            href="/dashboard"
            aria-label="Kommunikation schließen"
            className="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/70 transition hover:bg-white/[0.075]"
          >
            <IconClose />
          </Link>

          <nav className="flex flex-1 flex-col items-center gap-3">
            <Link
              href={`/kommunikation?status=${encodeURIComponent(statusFilter)}${selectedConversation ? `&c=${encodeURIComponent(selectedConversation.id)}` : ""}&panel=chats`}
              title="Chats"
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedPanel === "chats" || !selectedPanel ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/18 text-[#f7efe2]" : "border-white/8 bg-white/[0.035] text-white/48 hover:bg-white/[0.06] hover:text-white/75"}`}
            >
              <IconChat />
              {conversations.some(
                (conversation) => Number(conversation.unread_count ?? 0) > 0,
              ) ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1 text-[10px] font-bold text-white">
                  {conversations.reduce(
                    (sum, conversation) =>
                      sum + Number(conversation.unread_count ?? 0),
                    0,
                  )}
                </span>
              ) : null}
            </Link>

            <Link
              href={`/kommunikation?status=${encodeURIComponent(statusFilter)}${selectedConversation ? `&c=${encodeURIComponent(selectedConversation.id)}` : ""}&panel=customer`}
              title="Kunde"
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedPanel === "customer" ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/18 text-[#f7efe2]" : "border-white/8 bg-white/[0.035] text-white/48 hover:bg-white/[0.06] hover:text-white/75"}`}
            >
              <IconUser />
            </Link>

            <Link
              href={`/kommunikation?status=${encodeURIComponent(statusFilter)}${selectedConversation ? `&c=${encodeURIComponent(selectedConversation.id)}` : ""}&panel=templates`}
              title="Vorlagen"
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedPanel === "templates" ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/18 text-[#f7efe2]" : "border-white/8 bg-white/[0.035] text-white/48 hover:bg-white/[0.06] hover:text-white/75"}`}
            >
              <IconSparkles />
            </Link>
          </nav>
        </aside>

        <aside className={`clientique-scrollbar relative min-h-0 w-full min-w-0 max-w-none overflow-auto border-r border-white/[0.07] bg-[linear-gradient(180deg,rgba(31,24,19,0.92),rgba(18,13,10,0.96))] md:w-[340px] md:min-w-[280px] md:max-w-[520px] md:resize-x md:after:absolute md:after:right-0 md:after:top-0 md:after:h-full md:after:w-1 md:after:cursor-col-resize md:after:bg-white/[0.035] md:hover:after:bg-[#d6c3a3]/25 ${showMobileSidePanel ? "block" : "hidden md:block"}`}>
          {selectedPanel === "customer" ? (
            <div className="p-4">
              <div className="relative mb-4 pr-12 md:pr-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d6c3a3]/70">
                  Kunde
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#f7efe2]">
                  Zuordnung
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Nummer einem bestehenden Kunden zuordnen oder direkt neu
                  anlegen.
                </p>
                <div className="absolute right-0 top-0 md:hidden">
                  <MobilePanelMenu
                    statusFilter={statusFilter}
                    selectedConversationId={selectedConversation?.id}
                    activePanel="customer"
                  />
                </div>
              </div>

              {selectedConversation ? (
                <div className="space-y-4">
                  {selectedConversation.customer_profile_id ? (
                    <div className="rounded-[24px] border border-emerald-300/14 bg-emerald-300/8 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/65">
                        Zugeordnet
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[#f7efe2]">
                        {conversationName(selectedConversation)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">
                        {selectedConversation.external_contact ||
                          "Keine Nummer gespeichert"}
                      </div>
                      <Link
                        href={`/customers/${selectedConversation.customer_profile_id}`}
                        className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/[0.07]"
                      >
                        Kundenprofil öffnen
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-[22px] border border-amber-300/18 bg-amber-300/8 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/70">
                          Unbekannte Nummer
                        </div>
                        <div className="mt-2 break-all text-sm font-semibold text-[#f7efe2]">
                          {selectedConversation.external_contact ||
                            selectedConversation.external_contact_normalized ||
                            "Unbekannt"}
                        </div>
                      </div>

                      <form
                        className="space-y-2"
                        action="/kommunikation"
                        method="get"
                      >
                        <input
                          type="hidden"
                          name="status"
                          value={statusFilter}
                        />
                        <input
                          type="hidden"
                          name="c"
                          value={selectedConversation.id}
                        />
                        <input type="hidden" name="panel" value="customer" />
                        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#d6c3a3]/75">
                          Kunde suchen
                        </label>
                        <input
                          name="customerSearch"
                          defaultValue={customerSearchRaw}
                          placeholder="Name, Telefon, E-Mail…"
                          className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-[#f7efe2] outline-none placeholder:text-white/32 focus:border-[#d6c3a3]/32"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/[0.08]"
                        >
                          Suchen
                        </button>
                      </form>

                      <div className="space-y-2">
                        {customerCandidates.length === 0 ? (
                          <div className="rounded-[18px] border border-dashed border-white/10 p-3 text-xs leading-5 text-white/45">
                            Keine passenden Kunden gefunden.
                          </div>
                        ) : (
                          customerCandidates.map((candidate) => {
                            const person = firstJoin<any>(candidate.person);
                            const candidatePhone = normalizePhoneDigits(
                              person?.phone,
                            );
                            const externalPhone = normalizePhoneDigits(
                              selectedConversation.external_contact_normalized ||
                                selectedConversation.external_contact,
                            );
                            const phoneMatch = Boolean(
                              externalPhone &&
                              candidatePhone &&
                              (candidatePhone.endsWith(
                                externalPhone.replace(/^\+/, ""),
                              ) ||
                                externalPhone.endsWith(
                                  candidatePhone.replace(/^\+/, ""),
                                )),
                            );

                            return (
                              <div
                                key={candidate.id}
                                className="rounded-[18px] border border-white/[0.07] bg-white/[0.035] p-3"
                              >
                                <div className="text-sm font-semibold text-[#f7efe2]">
                                  {customerCandidateName(candidate)}
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">
                                  {customerCandidateMeta(candidate)}
                                </div>
                                {phoneMatch ? (
                                  <div className="mt-1 text-[11px] font-semibold text-emerald-200/80">
                                    Telefonnummer passt wahrscheinlich
                                  </div>
                                ) : null}
                                <form
                                  action={assignConversationToCustomer}
                                  className="mt-3"
                                >
                                  <input
                                    type="hidden"
                                    name="conversation_id"
                                    value={selectedConversation.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="customer_profile_id"
                                    value={candidate.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="status_filter"
                                    value={statusFilter}
                                  />
                                  <button
                                    type="submit"
                                    className="w-full rounded-full border border-[#d6c3a3]/24 bg-[#d6c3a3]/12 px-3 py-2 text-xs font-semibold text-[#f7efe2] hover:bg-[#d6c3a3]/18"
                                  >
                                    Zuordnen
                                  </button>
                                </form>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <form
                        action={createCustomerFromConversation}
                        className="rounded-[22px] border border-[#d6c3a3]/14 bg-[#d6c3a3]/8 p-3"
                      >
                        <input
                          type="hidden"
                          name="conversation_id"
                          value={selectedConversation.id}
                        />
                        <input
                          type="hidden"
                          name="status_filter"
                          value={statusFilter}
                        />
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[#d6c3a3]/75">
                          Neuen Kunden anlegen
                        </label>
                        <input
                          name="full_name"
                          required
                          placeholder="Name des Kunden…"
                          className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-[#f7efe2] outline-none placeholder:text-white/30 focus:border-[#d6c3a3]/30"
                        />
                        <button
                          type="submit"
                          className="mt-2 w-full rounded-full border border-[#d6c3a3]/30 bg-[#d6c3a3]/88 px-3 py-2 text-xs font-semibold text-[#1b120b] hover:bg-[#ead6b4]"
                        >
                          Kunde anlegen & zuordnen
                        </button>
                      </form>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-white/10 p-4 text-sm leading-6 text-white/45">
                  Wähle einen Chat aus.
                </div>
              )}
            </div>
          ) : selectedPanel === "templates" ? (
            <div className="p-4">
              <div className="relative mb-4 pr-12 md:pr-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d6c3a3]/70">
                  Vorlagen
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#f7efe2]">
                  Schnelltexte
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Klick füllt das Antwortfeld. Danach kannst du den Text noch
                  ändern.
                </p>
                <div className="absolute right-0 top-0 md:hidden">
                  <MobilePanelMenu
                    statusFilter={statusFilter}
                    selectedConversationId={selectedConversation?.id}
                    activePanel="templates"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {templates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/48">
                    Noch keine Vorlagen vorhanden.
                  </div>
                ) : (
                  templates.map((template) => {
                    const active = selectedTemplate?.id === template.id;
                    return (
                      <Link
                        key={template.id}
                        href={
                          communicationHref({
                            statusFilter,
                            conversationId: selectedConversation?.id,
                            templateId: template.id,
                            customerSearch: customerSearchRaw,
                          }) + "&panel=templates"
                        }
                        className={`block rounded-[20px] border p-3 transition ${active ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/12" : "border-white/[0.07] bg-white/[0.035] hover:bg-white/[0.06]"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#f7efe2]">
                              {template.title}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#d6c3a3]/58">
                              {template.category}
                            </div>
                          </div>
                          {template.is_global ? (
                            <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-white/45">
                              Global
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/45">
                          {template.body}
                        </p>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[#f7efe2]">
                    Chats
                  </h2>
                  <p className="mt-1 text-xs text-white/45">
                    {conversations.length} Konversation(en)
                  </p>
                </div>
                <MobilePanelMenu
                  statusFilter={statusFilter}
                  selectedConversationId={selectedConversation?.id}
                  activePanel={activeMobilePanel}
                />
              </div>

              <form className="mb-3" action="/kommunikation" method="get">
                <input type="hidden" name="status" value={statusFilter} />
                <input type="hidden" name="panel" value="chats" />
                {selectedConversation ? (
                  <input
                    type="hidden"
                    name="c"
                    value={selectedConversation.id}
                  />
                ) : null}
                <label className="sr-only" htmlFor="kommunikation-kundensuche">
                  Kundensuche
                </label>
                <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.055] px-4 py-3 text-sm text-white/70 focus-within:border-[#d6c3a3]/30">
                  <span className="text-white/42">⌕</span>
                  <input
                    id="kommunikation-kundensuche"
                    name="q"
                    defaultValue={chatSearchRaw}
                    placeholder="Kundensuche"
                    className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#f7efe2] outline-none placeholder:text-white/36"
                  />
                </div>
              </form>

              <div className="mb-4 flex gap-2">
                <Link
                  href="/kommunikation?status=open&panel=chats"
                  className={`rounded-full border px-4 py-2 text-xs font-semibold ${statusFilter !== "closed" && statusFilter !== "all" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/16 text-[#f7efe2]" : "border-white/10 bg-white/[0.035] text-white/55"}`}
                >
                  Offen
                </Link>
                <Link
                  href="/kommunikation?status=all&panel=chats"
                  className={`rounded-full border px-4 py-2 text-xs font-semibold ${statusFilter === "all" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/16 text-[#f7efe2]" : "border-white/10 bg-white/[0.035] text-white/55"}`}
                >
                  Alle
                </Link>
              </div>

              {chatSearch ? (
                <div className="mb-4 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#d6c3a3]/65">
                    Kunden
                  </div>
                  {searchedCustomers.length === 0 ? (
                    <div className="text-xs leading-5 text-white/42">
                      Keine Kunden zur Suche gefunden.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {searchedCustomers.map((customer) => (
                        <Link
                          key={customer.id}
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.045]"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6c3a3]/20 bg-[#d6c3a3]/10 text-xs font-bold text-[#f7efe2]">
                            {customerCandidateName(customer)
                              .split(" ")
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part: string) => part[0])
                              .join("")
                              .toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-[#f7efe2]">
                              {customerCandidateName(customer)}
                            </div>
                            <div className="truncate text-xs text-white/42">
                              {customerCandidateMeta(customer)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-2">
                {conversations.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 p-5 text-sm leading-6 text-white/45">
                    Noch keine WhatsApp-Konversationen.
                  </div>
                ) : (
                  conversations.map((conversation) => {
                    const active = selectedConversation?.id === conversation.id;
                    const name = conversationName(conversation);
                    const initials =
                      name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part: string) => part[0])
                        .join("")
                        .toUpperCase() || "?";
                    const unread = Number(conversation.unread_count ?? 0);

                    return (
                      <Link
                        key={conversation.id}
                        href={
                          communicationHref({
                            statusFilter,
                            conversationId: conversation.id,
                          }) + "&panel=chats"
                        }
                        className={`group relative flex gap-3 rounded-[22px] border p-3 transition ${active ? "border-[#d6c3a3]/20 bg-[#d6c3a3]/12 shadow-[0_16px_40px_rgba(0,0,0,0.22)]" : "border-transparent bg-transparent hover:bg-white/[0.035]"}`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d6c3a3]/22 bg-[#d6c3a3]/12 text-sm font-bold text-[#f7efe2]">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-[#f7efe2]">
                              {name}
                            </div>
                            <div className="shrink-0 text-[11px] text-white/40">
                              {formatDateTime(
                                conversation.last_message_at ??
                                  conversation.created_at,
                              )}
                            </div>
                          </div>
                          <div className="mt-0.5 truncate text-[12px] font-medium text-[#d6c3a3]/48">
                            {tenantName(conversation)} ·{" "}
                            {channelLabel(conversation.channel)}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/46">
                            {conversation.last_message_preview ||
                              conversation.subject ||
                              "Keine Nachrichten"}
                          </div>
                        </div>
                        {unread > 0 ? (
                          <span className="absolute right-3 top-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        <section className={`min-w-0 flex-1 min-h-0 flex-col bg-[radial-gradient(circle_at_50%_10%,rgba(214,195,163,0.06),transparent_30%),linear-gradient(180deg,rgba(24,18,14,0.96),rgba(12,9,7,0.98))] ${selectedConversation && activeMobilePanel === "chats" ? "flex" : "hidden md:flex"}`}>
          {selectedConversation ? (
            <>
              <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.035] px-3 md:h-[74px] md:px-5">
                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                  <Link
                    href={`/kommunikation?status=${encodeURIComponent(statusFilter)}&panel=chats&mobileList=1`}
                    className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-lg font-semibold text-white/70 md:hidden"
                    aria-label="Zur Chatliste"
                  >
                    ‹
                  </Link>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d6c3a3]/22 bg-[#d6c3a3]/14 text-sm font-bold text-[#f7efe2] md:h-12 md:w-12 md:text-base">
                    {conversationName(selectedConversation)
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part: string) => part[0])
                      .join("")
                      .toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold tracking-[-0.035em] text-[#f7efe2] md:text-lg">
                      {conversationName(selectedConversation)}
                    </h2>
                    <div className="mt-0.5 truncate text-xs text-white/45">
                      {channelLabel(selectedConversation.channel)} ·{" "}
                      {tenantName(selectedConversation)} · Status{" "}
                      {selectedConversation.status}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MobilePanelMenu
                    statusFilter={statusFilter}
                    selectedConversationId={selectedConversation.id}
                    activePanel={activeMobilePanel}
                  />
                  {selectedConversation.customer_profile_id ? (
                    <Link
                      href={`/customers/${selectedConversation.customer_profile_id}`}
                      className="hidden rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-semibold text-white/68 hover:bg-white/[0.075] sm:inline-flex"
                    >
                      Kundenprofil
                    </Link>
                  ) : (
                    <Link
                      href={`/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(selectedConversation.id)}&panel=customer`}
                      className="hidden rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100/78 hover:bg-amber-300/15 sm:inline-flex"
                    >
                      Zuordnen
                    </Link>
                  )}
                </div>
              </header>

              <div className="clientique-scrollbar min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_25%_15%,rgba(214,195,163,0.055)_0_1px,transparent_1px),radial-gradient(circle_at_78%_28%,rgba(214,195,163,0.04)_0_1px,transparent_1px)] bg-[length:28px_28px] px-3 py-4 md:px-5 md:py-5">
                <div className="mx-auto flex max-w-[720px] flex-col gap-2.5 md:gap-3">
                  {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-sm rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-center text-sm leading-6 text-white/45">
                      Noch keine Nachrichten in dieser Konversation.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const outbound = message.direction === "OUTBOUND";
                      const failed = message.status === "FAILED";

                      return (
                        <div
                          key={message.id}
                          className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[86%] rounded-[20px] md:max-w-[74%] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.20)] ${failed ? "border border-red-400/24 bg-red-500/10 text-red-50" : outbound ? "rounded-br-[6px] border border-[#d6c3a3]/22 bg-[#d6c3a3]/20 text-[#fff7e8]" : "rounded-bl-[6px] border border-white/[0.07] bg-black/[0.24] text-white/86"}`}
                          >
                            <div className="whitespace-pre-wrap text-sm leading-6">
                              {message.body}
                            </div>
                            {message.metadata?.attachment?.public_url ? (
                              <a
                                href={message.metadata.attachment.public_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-[#f7efe2] hover:bg-black/30"
                              >
                                <span aria-hidden="true">📎</span>
                                <span className="truncate">
                                  {message.metadata.attachment.name || "Datei öffnen"}
                                </span>
                              </a>
                            ) : null}
                            <div className="mt-1.5 flex items-center justify-end gap-2 text-[10px] text-white/40">
                              <span>
                                {formatDateTime(
                                  message.sent_at ??
                                    message.received_at ??
                                    message.created_at,
                                )}
                              </span>
                              {outbound ? (
                                <span>
                                  {message.status === "READ" ? "✓✓" : "✓"}
                                </span>
                              ) : (
                                <span>{message.status}</span>
                              )}
                            </div>
                            {failed && message.error_message ? (
                              <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                                {message.error_message}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <KommunikationComposerClient
                action={sendCommunicationReply}
                conversationId={selectedConversation.id}
                statusFilter={statusFilter}
                draftBody={draftBody}
                selectedTemplateTitle={selectedTemplate?.title ?? null}
              />
            </>
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center p-8 text-center">
              <div className="max-w-md">
                <div className="text-2xl font-semibold tracking-[-0.04em] text-[#f7efe2]">
                  WhatsApp Inbox bereit
                </div>
                <p className="mt-2 text-sm leading-6 text-white/50">
                  Wähle links einen Chat aus oder warte auf die nächste
                  eingehende WhatsApp-Nachricht.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
