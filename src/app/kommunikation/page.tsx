import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

export const dynamic = "force-dynamic";

type SearchParams =
  | { c?: string; status?: string }
  | Promise<{ c?: string; status?: string }>;

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
};

type TemplateRow = {
  id: string;
  title: string;
  category: string;
  channel: string;
  body: string;
  is_global: boolean;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

function conversationName(row: ConversationRow) {
  const person = firstJoin<any>(row.person);
  return person?.full_name || row.external_contact || "Unbekannter Kontakt";
}

function tenantName(row: ConversationRow) {
  const tenant = firstJoin<any>(row.tenant);
  return tenant?.display_name || "Studio";
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

async function sendCommunicationReply(formData: FormData) {
  "use server";

  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const statusFilter = String(formData.get("status_filter") ?? "open").trim() || "open";
  const body = String(formData.get("body") ?? "").trim();

  if (!conversationId || !body) {
    redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}${conversationId ? `&c=${encodeURIComponent(conversationId)}` : ""}`);
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
        external_contact
      `
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}`);
  }

  await supabase.from("customer_messages").insert({
    conversation_id: conversation.id,
    tenant_id: conversation.tenant_id,
    person_id: conversation.person_id,
    customer_profile_id: conversation.customer_profile_id,
    direction: "OUTBOUND",
    channel: conversation.channel ?? "WHATSAPP",
    body,
    provider: "CRM_TEST",
    status: "SENT",
    whatsapp_from: "crm:test",
    whatsapp_to: conversation.external_contact,
    sent_by_user_id: user.id,
    sent_at: new Date().toISOString(),
    metadata: {
      source: "kommunikation_page_reply_v2",
      note: "Noch nicht über Twilio gesendet. Nur CRM-Testnachricht.",
    },
  });

  await supabase
    .from("customer_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversation.id);

  redirect(`/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}`);
}

export default async function KommunikationPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const selectedParam = typeof sp?.c === "string" ? sp.c : null;
  const statusFilter = typeof sp?.status === "string" ? sp.status : "open";

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
      `
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

  const { data: conversationsRaw, error: conversationsError } = await conversationsQuery;
  const conversations = (conversationsRaw ?? []) as ConversationRow[];
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedParam) ??
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
          error_message
        `
      )
      .eq("conversation_id", selectedConversation.id)
      .order("created_at", { ascending: true })
      .limit(200);

    messages = (messagesRaw ?? []) as MessageRow[];
  }

  const { data: templatesRaw } = await supabase
    .from("message_templates")
    .select("id, title, category, channel, body, is_global")
    .eq("is_active", true)
    .order("is_global", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);

  const templates = (templatesRaw ?? []) as TemplateRow[];
  const selectedPerson = selectedConversation ? firstJoin<any>(selectedConversation.person) : null;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <section className="rounded-[32px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(31,24,19,0.82)_0%,rgba(19,15,12,0.78)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-[24px]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#d6c3a3]">
              Kundenkommunikation
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#f7efe2]">
              Kommunikation
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/55">
              Zentrale Inbox für WhatsApp-Nachrichten, Vorlagen und später automatische Termin- und Nachsorge-Kommunikation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/kommunikation?status=open"
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                statusFilter !== "closed" && statusFilter !== "all"
                  ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/14 text-[#f7efe2]"
                  : "border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/[0.06]"
              }`}
            >
              Offen
            </Link>
            <Link
              href="/kommunikation?status=all"
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                statusFilter === "all"
                  ? "border-[#d6c3a3]/35 bg-[#d6c3a3]/14 text-[#f7efe2]"
                  : "border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/[0.06]"
              }`}
            >
              Alle
            </Link>
            <button
              type="button"
              disabled
              className="rounded-full border border-[#d6c3a3]/22 bg-[#d6c3a3]/12 px-4 py-2 text-sm font-semibold text-[#f7efe2]/80 opacity-75"
              title="Neue Konversation kommt nach der Twilio-Grundroute"
            >
              + Neue Nachricht
            </button>
          </div>
        </div>

        {conversationsError ? (
          <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
            Fehler beim Laden der Konversationen: {conversationsError.message}
          </div>
        ) : null}

        <div className="grid min-h-[650px] gap-4 lg:grid-cols-[330px_minmax(0,1fr)_320px]">
          <aside className="overflow-hidden rounded-[26px] border border-white/[0.07] bg-black/[0.16]">
            <div className="border-b border-white/[0.07] p-4">
              <div className="text-sm font-semibold text-[#f7efe2]">Inbox</div>
              <div className="mt-1 text-xs text-white/45">{conversations.length} Konversation(en)</div>
            </div>

            <div className="clientique-scrollbar max-h-[585px] overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/50">
                  Noch keine Konversationen. Im nächsten Schritt legen wir eine Test-Konversation an und danach kommt Twilio.
                </div>
              ) : (
                conversations.map((conversation) => {
                  const active = selectedConversation?.id === conversation.id;
                  const name = conversationName(conversation);
                  const unread = Number(conversation.unread_count ?? 0);

                  return (
                    <Link
                      key={conversation.id}
                      href={`/kommunikation?status=${statusFilter}&c=${conversation.id}`}
                      className={`mb-1 block rounded-[20px] border p-3 transition ${
                        active
                          ? "border-[#d6c3a3]/26 bg-[#d6c3a3]/10"
                          : "border-transparent bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.045]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#f7efe2]">{name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-[#d6c3a3]/60">
                            {tenantName(conversation)} · {channelLabel(conversation.channel)}
                          </div>
                        </div>
                        {unread > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[10px] font-bold text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-white/48">
                        {conversation.last_message_preview || "Noch keine Nachricht gespeichert."}
                      </div>
                      <div className="mt-2 text-[11px] text-white/35">
                        {formatDateTime(conversation.last_message_at ?? conversation.created_at)}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-h-[650px] flex-col overflow-hidden rounded-[26px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,248,240,0.045)_0%,rgba(255,248,240,0.018)_100%)]">
            {selectedConversation ? (
              <>
                <div className="border-b border-white/[0.07] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-lg font-semibold tracking-[-0.02em] text-[#f7efe2]">
                        {conversationName(selectedConversation)}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {channelLabel(selectedConversation.channel)} · {tenantName(selectedConversation)} · Status {selectedConversation.status}
                      </div>
                    </div>
                    {selectedConversation.customer_profile_id ? (
                      <Link
                        href={`/customers/${selectedConversation.customer_profile_id}`}
                        className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                      >
                        Zum Kundenprofil
                      </Link>
                    ) : selectedPerson?.id ? (
                      <Link
                        href={`/customers?person=${selectedPerson.id}`}
                        className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                      >
                        Kunden suchen
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="clientique-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full min-h-[420px] items-center justify-center rounded-[22px] border border-dashed border-white/10 text-center">
                      <div className="max-w-sm p-6">
                        <div className="text-lg font-semibold text-[#f7efe2]">Noch kein Verlauf</div>
                        <p className="mt-2 text-sm leading-6 text-white/48">
                          Diese Konversation ist angelegt, aber es wurden noch keine Nachrichten gespeichert.
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const outbound = message.direction === "OUTBOUND";
                      const internal = message.direction === "INTERNAL_NOTE";
                      return (
                        <div
                          key={message.id}
                          className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[78%] rounded-[22px] border px-4 py-3 ${
                              internal
                                ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                                : outbound
                                  ? "border-[#d6c3a3]/24 bg-[#d6c3a3]/14 text-[#fff7e8]"
                                  : "border-white/[0.08] bg-black/[0.20] text-white/82"
                            }`}
                          >
                            <div className="whitespace-pre-wrap text-sm leading-6">{message.body}</div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/40">
                              <span>{formatDateTime(message.sent_at ?? message.received_at ?? message.created_at)}</span>
                              <span>{message.status}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form action={sendCommunicationReply} className="border-t border-white/[0.07] p-4">
                  <input type="hidden" name="conversation_id" value={selectedConversation.id} />
                  <input type="hidden" name="status_filter" value={statusFilter} />
                  <div className="rounded-[22px] border border-white/10 bg-black/[0.18] p-3">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[#d6c3a3]/75">
                      Antwort schreiben
                    </label>
                    <textarea
                      name="body"
                      rows={3}
                      placeholder="Nachricht eingeben…"
                      className="clientique-scrollbar min-h-[92px] w-full resize-none rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm leading-6 text-[#f7efe2] outline-none placeholder:text-white/32 focus:border-[#d6c3a3]/30 focus:bg-white/[0.055]"
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-white/42">
                        Testmodus: Die Nachricht wird im CRM gespeichert, aber noch nicht über Twilio versendet.
                      </p>
                      <button
                        type="submit"
                        className="rounded-full border border-[#d6c3a3]/35 bg-[#d6c3a3]/88 px-5 py-2.5 text-sm font-semibold text-[#1b120b] shadow-[0_14px_35px_rgba(214,195,163,0.16)] transition hover:bg-[#ead6b4]"
                      >
                        Senden
                      </button>
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex h-full min-h-[650px] items-center justify-center p-6 text-center">
                <div className="max-w-md">
                  <div className="text-2xl font-semibold tracking-[-0.04em] text-[#f7efe2]">
                    Kommunikation bereit
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Die Inbox-Seite ist vorbereitet. Als Nächstes legen wir eine Test-Konversation an, damit du den Verlauf direkt siehst.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[26px] border border-white/[0.07] bg-black/[0.16] p-4">
              <div className="text-sm font-semibold text-[#f7efe2]">Vorlagen</div>
              <div className="mt-1 text-xs text-white/45">Globale und tenant-spezifische Texte</div>

              <div className="mt-4 space-y-2">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-[#f7efe2]">{template.title}</div>
                      <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-white/45">
                        {template.is_global ? "Global" : "Eigen"}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#d6c3a3]/55">{template.category}</div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/45">{template.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-[#d6c3a3]/14 bg-[#d6c3a3]/8 p-4">
              <div className="text-sm font-semibold text-[#f7efe2]">Nächster technischer Schritt</div>
              <ol className="mt-3 space-y-2 text-xs leading-5 text-white/55">
                <li>1. Antwortfunktion im CRM testen</li>
                <li>2. Eingehende Twilio-Webhook-Route bauen</li>
                <li>3. Twilio-Send-Route aktivieren</li>
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
