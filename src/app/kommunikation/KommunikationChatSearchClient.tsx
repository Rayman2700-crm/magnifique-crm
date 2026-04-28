"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PersonLike = {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type TenantLike = {
  id?: string | null;
  display_name?: string | null;
};

type ConversationItem = {
  id: string;
  channel: string;
  status: string;
  subject: string | null;
  external_contact: string | null;
  external_contact_normalized: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  person?: PersonLike | null;
  tenant?: TenantLike | null;
};

type CustomerItem = {
  id: string;
  tenant_id: string;
  person_id: string;
  created_at?: string | null;
  person?: PersonLike | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function conversationName(row: ConversationItem): string {
  return String(row.person?.full_name || row.external_contact || "Unbekannter Kontakt");
}

function tenantName(row: ConversationItem): string {
  return String(row.tenant?.display_name || "Studio");
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

function customerName(row: CustomerItem): string {
  return String(row.person?.full_name || "Unbenannter Kunde");
}

function customerMeta(row: CustomerItem) {
  const parts = [row.person?.phone, row.person?.email].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Keine Kontaktdaten";
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesQuery(values: Array<unknown>, query: string) {
  const q = normalize(query).trim();
  if (!q) return true;
  return values.some((value) => normalize(value).includes(q));
}

function CountBadge({ count }: { count: number }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (safeCount <= 0) return null;
  return (
    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_5px_14px_rgba(47,121,255,0.32)]">
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}

export default function KommunikationChatSearchClient({
  statusFilter,
  selectedConversationId,
  initialSearch,
  conversations,
  customers,
  openCount = 0,
  closedCount = 0,
  allCount = 0,
}: {
  statusFilter: string;
  selectedConversationId: string | null;
  initialSearch?: string;
  conversations: ConversationItem[];
  customers: CustomerItem[];
  openCount?: number;
  closedCount?: number;
  allCount?: number;
}) {
  const [query, setQuery] = useState(initialSearch ?? "");
  const trimmedQuery = query.trim();

  const filteredCustomers = useMemo(() => {
    if (!trimmedQuery) return [];
    return customers
      .filter((customer) =>
        matchesQuery(
          [
            customer.person?.full_name,
            customer.person?.phone,
            customer.person?.email,
          ],
          trimmedQuery,
        ),
      )
      .slice(0, 12);
  }, [customers, trimmedQuery]);

  const filteredConversations = useMemo(() => {
    if (!trimmedQuery) return conversations;
    return conversations.filter((conversation) =>
      matchesQuery(
        [
          conversation.person?.full_name,
          conversation.person?.phone,
          conversation.person?.email,
          conversation.external_contact,
          conversation.external_contact_normalized,
          conversation.last_message_preview,
          conversation.subject,
        ],
        trimmedQuery,
      ),
    );
  }, [conversations, trimmedQuery]);

  return (
    <>
      <div className="mb-3">
        <label className="sr-only" htmlFor="kommunikation-kundensuche">
          Kundensuche
        </label>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.055] px-4 py-3 text-sm text-white/70 transition focus-within:border-[#d6c3a3]/35 focus-within:bg-white/[0.07]">
          <span className="text-white/42" aria-hidden="true">
            ⌕
          </span>
          <input
            id="kommunikation-kundensuche"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kundensuche"
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#f7efe2] outline-none placeholder:text-white/36"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-xs text-white/50 transition hover:bg-white/[0.1] hover:text-white/80"
              aria-label="Suche leeren"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Link
          href="/kommunikation?status=open&panel=chats"
          className={`inline-flex h-10 items-center justify-center rounded-full border px-2 text-center text-xs font-semibold transition ${statusFilter !== "closed" && statusFilter !== "all" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/16 text-[#f7efe2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.06] hover:text-white/75"}`}
        >
          <span className="inline-flex items-center justify-center">Offen<CountBadge count={openCount} /></span>
        </Link>
        <Link
          href="/kommunikation?status=closed&panel=chats"
          className={`inline-flex h-10 items-center justify-center rounded-full border px-2 text-center text-xs font-semibold transition ${statusFilter === "closed" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/16 text-[#f7efe2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.06] hover:text-white/75"}`}
        >
          <span className="inline-flex items-center justify-center">Erledigt<CountBadge count={closedCount} /></span>
        </Link>
        <Link
          href="/kommunikation?status=all&panel=chats"
          className={`inline-flex h-10 items-center justify-center rounded-full border px-2 text-center text-xs font-semibold transition ${statusFilter === "all" ? "border-[#d6c3a3]/30 bg-[#d6c3a3]/16 text-[#f7efe2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.06] hover:text-white/75"}`}
        >
          <span className="inline-flex items-center justify-center">Alle<CountBadge count={allCount} /></span>
        </Link>
      </div>

      <div className="mb-4 h-px w-full bg-white/[0.09] shadow-[0_1px_0_rgba(214,195,163,0.045)]" aria-hidden="true" />

      {trimmedQuery ? (
        <div className="mb-4 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d6c3a3]/65">
              Kunden
            </div>
            <div className="rounded-full bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/40">
              {filteredCustomers.length}
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="text-xs leading-5 text-white/42">
              Keine Kunden zur Suche gefunden.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCustomers.map((customer) => {
                const name = customerName(customer);
                return (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.045]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6c3a3]/20 bg-[#d6c3a3]/10 text-xs font-bold text-[#f7efe2]">
                      {initials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#f7efe2]">
                        {name}
                      </div>
                      <div className="truncate text-xs text-white/42">
                        {customerMeta(customer)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        {filteredConversations.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 p-5 text-sm leading-6 text-white/45">
            {trimmedQuery
              ? "Keine passenden Chats gefunden."
              : "Noch keine WhatsApp-Konversationen."}
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const active = selectedConversationId === conversation.id;
            const name = conversationName(conversation);
            const unread = Number(conversation.unread_count ?? 0);

            return (
              <Link
                key={conversation.id}
                href={`/kommunikation?status=${encodeURIComponent(statusFilter)}&c=${encodeURIComponent(conversation.id)}&panel=chats`}
                className={`group relative flex gap-3 rounded-[24px] border p-3 transition ${
                  active
                    ? "border-[#d6c3a3]/24 bg-[#d6c3a3]/12"
                    : "border-transparent bg-transparent hover:border-white/[0.06] hover:bg-white/[0.035]"
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d6c3a3]/24 bg-[#d6c3a3]/12 text-sm font-bold text-[#f7efe2]">
                  {initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="truncate text-sm font-bold text-[#f7efe2]">
                      {name}
                    </div>
                    <div className="shrink-0 text-[11px] text-white/42">
                      {formatDateTime(
                        conversation.last_message_at || conversation.created_at,
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-semibold text-[#d6c3a3]/48">
                    <span className="truncate">
                      {tenantName(conversation)} · {channelLabel(conversation.channel)}
                    </span>
                    {conversation.status === "CLOSED" ? (
                      <span className="shrink-0 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-100/60">
                        Erledigt
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-5 text-white/48">
                    {conversation.last_message_preview ||
                      conversation.subject ||
                      "Neue Konversation"}
                  </div>
                </div>

                {unread > 0 ? (
                  <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
