import Link from "next/link";
import { addCustomerNote, addCustomerToWaitlist, updateCustomerWaitlistStatus } from "./actions";
import { deleteAppointment } from "@/app/customers/[id]/appointments/actions";
import PhotoUpload from "./PhotoUpload";
import ScrollToTab from "./ScrollToTab";
import CustomerMediaGalleryClient from "./CustomerMediaGalleryClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CustomerAppointmentLauncher from "@/app/customers/[id]/CustomerAppointmentLauncher";
import AppointmentEditLauncher from "@/app/customers/[id]/AppointmentEditLauncher";

type Person = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
};

type NoteRow = {
  id: string;
  note: string;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type AppointmentRow = {
  id: string;
  person_id: string;
  tenant_id: string | null;
  start_at: string | null;
  end_at: string | null;
  notes_internal: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  created_at: string;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
};

type SalesOrderRow = {
  id: string;
  customer_id: string | null;
  appointment_id: string | null;
  status: string | null;
  currency_code: string | null;
  grand_total: number | null;
  created_at: string | null;
};

type SalesOrderLineRow = {
  id: string;
  sales_order_id: string | null;
  name: string | null;
  quantity: number | null;
  unit_price_gross: number | null;
  line_total_gross: number | null;
  sort_order?: number | null;
  created_at: string | null;
};

type PaymentRow = {
  id: string;
  sales_order_id: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string | null;
};

type WaitlistRow = {
  id: string;
  customer_profile_id: string;
  service_title: string | null;
  preferred_staff_id: string | null;
  preferred_days: string[] | null;
  time_from: string | null;
  time_to: string | null;
  priority: string | null;
  notes: string | null;
  short_notice_ok: boolean | null;
  reachable_today: boolean | null;
  requested_recently_at: string | null;
  status: string | null;
  created_at: string;
};


type CustomerConversationRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  customer_profile_id: string | null;
  channel: string | null;
  status: string | null;
  subject: string | null;
  external_contact: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  created_at: string | null;
};

type CustomerMessageRow = {
  id: string;
  conversation_id: string;
  direction: string | null;
  channel: string | null;
  body: string | null;
  status: string | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string | null;
};

type IntakeRow = {
  id: string;
  created_at: string | null;
  signed_at: string | null;
  status: string | null;
};

type ServiceRow = {
  id: string;
  name: string;
  tenant_id: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

type CustomerStatus = "Neu" | "Aktiv" | "Inaktiv" | "Ohne Folgetermin";
type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

type CustomerProfileBase = {
  id: string;
  person_id: string | null;
  tenant_id: string | null;
  created_at: string | null;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function parseLines(notesInternal: string | null) {
  return (notesInternal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readLineValue(lines: string[], prefix: string) {
  const line = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function getAppointmentTitle(notesInternal: string | null) {
  const lines = parseLines(notesInternal);
  const title = readLineValue(lines, "Titel:");
  if (title) return title;
  return lines[0] || "Termin";
}

function getAppointmentNote(notesInternal: string | null) {
  const lines = parseLines(notesInternal);
  const note = readLineValue(lines, "Notiz:");
  return note || null;
}

function getAppointmentStatus(notesInternal: string | null): AppointmentStatus | null {
  const lines = parseLines(notesInternal);
  const raw = readLineValue(lines, "Status:").toLowerCase();

  if (!raw) return null;
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  if (raw === "no_show") return "no_show";
  return "scheduled";
}


function parseBuffer(notesInternal: string | null) {
  const raw = readLineValue(parseLines(notesInternal), "Buffer:");
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function appointmentStatusLabel(status: AppointmentStatus | null, startAt: string | null) {
  if (status === "completed") return "Gekommen";
  if (status === "cancelled") return "Abgesagt";
  if (status === "no_show") return "Nicht gekommen";

  if (startAt) {
    const d = new Date(startAt);
    if (!Number.isNaN(d.getTime()) && d < new Date()) {
      return "Legacy";
    }
  }

  return "Geplant";
}

function appointmentStatusClasses(status: AppointmentStatus | null, startAt: string | null) {
  if (status === "completed") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "cancelled") {
    return "border-white/10 bg-white/5 text-white/75";
  }
  if (status === "no_show") {
    return "border-red-400/20 bg-red-400/10 text-red-200";
  }

  if (startAt) {
    const d = new Date(startAt);
    if (!Number.isNaN(d.getTime()) && d < new Date()) {
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    }
  }

  return "border-sky-400/20 bg-sky-400/10 text-sky-200";
}

function fmtDateTimeOrDash(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDateOrDash(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function countDaysSince(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const perDay = 1000 * 60 * 60 * 24;

  return Math.max(0, Math.floor(diff / perDay));
}

function getCustomerStatus(
  lastVisitAt: string | null,
  nextAppointmentAt: string | null,
  visitCount: number
): CustomerStatus {
  if (visitCount === 0) return "Neu";
  if (!lastVisitAt) return "Neu";

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const lastVisitDate = new Date(lastVisitAt);
  if (Number.isNaN(lastVisitDate.getTime())) return "Neu";

  if (lastVisitDate >= thirtyDaysAgo) return "Aktiv";
  if (!nextAppointmentAt && lastVisitDate < sixtyDaysAgo) return "Inaktiv";
  if (!nextAppointmentAt) return "Ohne Folgetermin";
  return "Aktiv";
}

const WAITLIST_STAFF_PREFIX = "Behandlerwunsch:";

function readWaitlistPreferredStaff(notes?: string | null) {
  const lines = String(notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const staffLine = lines.find((line) => line.startsWith(WAITLIST_STAFF_PREFIX));
  if (!staffLine) return null;

  return staffLine.slice(WAITLIST_STAFF_PREFIX.length).trim() || null;
}

function readWaitlistVisibleNotes(notes?: string | null) {
  const lines = String(notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter((line) => !line.startsWith(WAITLIST_STAFF_PREFIX));
  return filtered.join("\n").trim() || null;
}

function fmtTimeRange(timeFrom?: string | null, timeTo?: string | null) {
  if (timeFrom && timeTo) return `${timeFrom}–${timeTo}`;
  if (timeFrom) return `ab ${timeFrom}`;
  if (timeTo) return `bis ${timeTo}`;
  return "Ganztägig";
}

function buildWaitlistTimeOptions() {
  const options: string[] = [];
  for (let hour = 8; hour <= 20; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);
    options.push(`${String(hour).padStart(2, "0")}:30`);
  }
  return options;
}

function waitlistPriorityLabel(priority?: string | null) {
  const normalized = String(priority ?? "").toLowerCase();
  if (normalized === "high") return "Dringend";
  if (normalized === "low") return "Flexibel";
  return "Normal";
}

function waitlistPriorityClasses(priority?: string | null) {
  const normalized = String(priority ?? "").toLowerCase();
  if (normalized === "high") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  if (normalized === "low") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/5 text-white/75";
}

function waitlistStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "contacted") return "Kontaktiert";
  if (normalized === "booked") return "Gebucht";
  if (normalized === "expired") return "Abgelaufen";
  if (normalized === "removed") return "Entfernt";
  return "Aktiv";
}

function waitlistStatusClasses(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "booked") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (normalized === "contacted") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  if (normalized === "expired" || normalized === "removed") {
    return "border-white/10 bg-white/5 text-white/60";
  }
  return "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200";
}

function waitlistRecentRequestLabel(value?: string | null) {
  if (!value) return null;
  const requestedAt = new Date(value);
  if (Number.isNaN(requestedAt.getTime())) return "Zuletzt angefragt";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (requestedAt >= todayStart) return "Heute angefragt";
  if (requestedAt >= yesterdayStart) return "Gestern angefragt";
  return `Anfrage: ${fmtDateTimeOrDash(value)}`;
}


function communicationStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CLOSED") return "Erledigt";
  if (normalized === "ARCHIVED") return "Archiviert";
  return "Offen";
}

function communicationStatusClasses(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CLOSED") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (normalized === "ARCHIVED") return "border-white/10 bg-white/5 text-white/55";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

function communicationChannelLabel(channel?: string | null) {
  const normalized = String(channel ?? "").toUpperCase();
  if (normalized === "WHATSAPP") return "WhatsApp";
  if (normalized === "EMAIL") return "E-Mail";
  if (normalized === "SMS") return "SMS";
  if (normalized === "PORTAL") return "Portal";
  return "Kommunikation";
}

function communicationDirectionLabel(direction?: string | null) {
  const normalized = String(direction ?? "").toUpperCase();
  if (normalized === "INBOUND") return "Empfangen";
  if (normalized === "OUTBOUND") return "Gesendet";
  if (normalized === "INTERNAL_NOTE") return "Interne Notiz";
  return "Nachricht";
}

function communicationMessageStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "READ") return "Gelesen";
  if (normalized === "DELIVERED") return "Zugestellt";
  if (normalized === "SENT") return "Gesendet";
  if (normalized === "RECEIVED") return "Empfangen";
  if (normalized === "FAILED") return "Fehler";
  if (normalized === "QUEUED") return "Wartet";
  return normalized || "—";
}

function communicationPreviewText(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || "Keine Vorschau vorhanden.";
}

function normalizePhoneForTel(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

function normalizePhoneForWhatsApp(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

function buildWhatsAppText(name?: string | null) {
  const n = name ?? "";
  return `Hallo ${n}, hier ist Magnifique Beauty Institut.`;
}

function ContactButton({
  label,
  href,
  variant = "dark",
}: {
  label: string;
  href: string;
  variant?: "dark" | "whatsapp";
}) {
  const baseStyle =
    "inline-flex h-[38px] w-full items-center justify-center whitespace-nowrap rounded-[12px] px-[14px] text-[13px] font-extrabold no-underline border";

  const className =
    variant === "whatsapp"
      ? `${baseStyle} border-black/20 bg-[#25D366] text-black`
      : `${baseStyle} border-white/15 bg-white/10 text-white`;

  const isExternal = href.startsWith("http");

  return (
    <a
      href={href}
      className={className}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {label}
    </a>
  );
}

function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035] hover:shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <CardContent className="flex min-h-[150px] h-full flex-col justify-between p-5">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <div className="mt-4 text-[clamp(18px,2.5vw,26px)] font-semibold truncate leading-tight tracking-tight text-[var(--text)]" title={value}>
          {value}
        </div>
        <div className="mt-4 text-sm text-white/50">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <CardContent className="p-5 md:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id={id} className="text-xl font-semibold text-[var(--text)]">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-[var(--text-muted)]">{description}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}


function formatEuroFromGross(value: number | null | undefined, currencyCode: string | null | undefined = "EUR") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

function normalizeSalesOrderStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePaymentStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?:
    | { error?: string; success?: string; tab?: string }
    | Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const p = await params;
  const customerProfileId = p.id;
  const sp = searchParams ? await searchParams : undefined;

  const supabase = supabaseAdmin();

  const { data: customerProfile, error } = await supabase
    .from("customer_profiles")
    .select("id, person_id, tenant_id, created_at")
    .eq("id", customerProfileId)
    .maybeSingle<CustomerProfileBase>();

  if (error || !customerProfile) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Kunde nicht gefunden</h1>
          <Link href="/customers">
            <Button variant="secondary">Zurück</Button>
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">DB-Fehler / keine Daten</div>
          <div className="mt-2">
            <strong>ID:</strong> {customerProfileId}
          </div>
          <div className="mt-2">
            <strong>Error:</strong> {error?.message ?? "no data returned"}
          </div>
        </div>
      </main>
    );
  }

  const personId = customerProfile.person_id;
  const tenantId = customerProfile.tenant_id;

  const [{ data: person }, { data: tenant }] = await Promise.all([
    personId
      ? supabase
          .from("persons")
          .select("id, full_name, phone, email, birthday")
          .eq("id", personId)
          .maybeSingle<Person>()
      : Promise.resolve({ data: null }),
    tenantId
      ? supabase
          .from("tenants")
          .select("id, display_name")
          .eq("id", tenantId)
          .maybeSingle<{ id: string; display_name: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  const tenantLabel = tenant?.display_name || tenantId || "";

  const { data: intakeLatest } = await supabase
    .from("intake_forms")
    .select("id, created_at, signed_at, status")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<IntakeRow>();

  const intakeStatus = String(intakeLatest?.status ?? "").toUpperCase();
  const intakeIsDone = !!intakeLatest && intakeStatus === "SIGNED";
  const intakeIsDraft = !!intakeLatest && intakeStatus === "DRAFT";
  const intakeCreatedAt = intakeLatest?.created_at || intakeLatest?.signed_at || null;

  const { data: appointmentsRaw } = personId
    ? await supabase
        .from("appointments")
        .select(`
          id,
          person_id,
          tenant_id,
          start_at,
          end_at,
          notes_internal,
          google_calendar_id,
          google_event_id,
          created_at,
          tenant:tenants ( display_name )
        `)
        .eq("person_id", personId)
        .order("start_at", { ascending: false })
        .limit(100)
    : { data: [] };

  const appointments = (appointmentsRaw ?? []) as AppointmentRow[];

  let visitCount = 0;
  let noShowCount = 0;
  let cancelledCount = 0;
  let lastVisitAt: string | null = null;
  let nextAppointmentAt: string | null = null;

  const now = new Date();

  for (const appointment of appointments) {
    if (!appointment.start_at) continue;
    const startDate = new Date(appointment.start_at);
    if (Number.isNaN(startDate.getTime())) continue;

    const explicitStatus = getAppointmentStatus(appointment.notes_internal);
    const isPast = startDate < now;

    if (isPast) {
      if (explicitStatus === "no_show") {
        noShowCount += 1;
        continue;
      }

      if (explicitStatus === "cancelled") {
        cancelledCount += 1;
        continue;
      }

      visitCount += 1;
      if (!lastVisitAt || new Date(lastVisitAt) < startDate) {
        lastVisitAt = appointment.start_at;
      }
    } else {
      if (explicitStatus === "cancelled") {
        cancelledCount += 1;
        continue;
      }

      if (!nextAppointmentAt || new Date(nextAppointmentAt) > startDate) {
        nextAppointmentAt = appointment.start_at;
      }
    }
  }

  const daysSinceLastVisit = countDaysSince(lastVisitAt);

  const { data: notes } = await supabase
    .from("customer_notes")
    .select("id, note, created_at, updated_at, created_by")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(100);


  let communicationConversations: CustomerConversationRow[] = [];
  if (personId) {
    const { data: conversationsRaw, error: conversationsError } = await supabase
      .from("customer_conversations")
      .select("id, tenant_id, person_id, customer_profile_id, channel, status, subject, external_contact, last_message_at, last_message_preview, unread_count, created_at")
      .or(`person_id.eq.${personId},customer_profile_id.eq.${customerProfileId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (conversationsError) {
      console.error("Customer communication conversations select error:", conversationsError);
    }

    communicationConversations = (conversationsRaw ?? []) as CustomerConversationRow[];
  } else {
    const { data: conversationsRaw, error: conversationsError } = await supabase
      .from("customer_conversations")
      .select("id, tenant_id, person_id, customer_profile_id, channel, status, subject, external_contact, last_message_at, last_message_preview, unread_count, created_at")
      .eq("customer_profile_id", customerProfileId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (conversationsError) {
      console.error("Customer communication conversations select error:", conversationsError);
    }

    communicationConversations = (conversationsRaw ?? []) as CustomerConversationRow[];
  }

  const communicationConversationIds = communicationConversations.map((conversation) => conversation.id);

  const { data: communicationMessagesRaw, error: communicationMessagesError } = communicationConversationIds.length
    ? await supabase
        .from("customer_messages")
        .select("id, conversation_id, direction, channel, body, status, provider, provider_message_id, sent_at, received_at, created_at")
        .in("conversation_id", communicationConversationIds)
        .order("created_at", { ascending: false })
        .limit(60)
    : { data: [], error: null };

  if (communicationMessagesError) {
    console.error("Customer communication messages select error:", communicationMessagesError);
  }

  const communicationMessages = (communicationMessagesRaw ?? []) as CustomerMessageRow[];
  const communicationMessagesByConversationId = new Map<string, CustomerMessageRow[]>();
  for (const message of communicationMessages) {
    const group = communicationMessagesByConversationId.get(message.conversation_id) ?? [];
    group.push(message);
    communicationMessagesByConversationId.set(message.conversation_id, group);
  }

  for (const [conversationId, group] of communicationMessagesByConversationId.entries()) {
    communicationMessagesByConversationId.set(
      conversationId,
      [...group].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
    );
  }

  const latestCommunicationConversation = communicationConversations[0] ?? null;
  const latestCommunicationMessages = latestCommunicationConversation
    ? (communicationMessagesByConversationId.get(latestCommunicationConversation.id) ?? []).slice(-8)
    : [];
  const totalCommunicationUnread = communicationConversations.reduce(
    (sum, conversation) => sum + (Number(conversation.unread_count ?? 0) || 0),
    0
  );
  const openCommunicationCount = communicationConversations.filter(
    (conversation) => String(conversation.status ?? "OPEN").toUpperCase() === "OPEN"
  ).length;
  const communicationOpenHref = latestCommunicationConversation
    ? `/kommunikation?status=all&c=${latestCommunicationConversation.id}&panel=chats`
    : `/kommunikation?status=all&panel=chats`;

  const { data: waitlistEntriesRaw, error: waitlistError } = await supabase
    .from("appointment_waitlist")
    .select(`
      id,
      customer_profile_id,
      service_title,
      preferred_staff_id,
      preferred_days,
      time_from,
      time_to,
      priority,
      notes,
      short_notice_ok,
      reachable_today,
      requested_recently_at,
      status,
      created_at
    `)
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (waitlistError) {
    console.error("Waitlist select error:", waitlistError);
  }

  const waitlistEntries: WaitlistRow[] = Array.isArray(waitlistEntriesRaw)
    ? (waitlistEntriesRaw as WaitlistRow[])
    : [];
  const activeWaitlistEntries = waitlistEntries.filter(
    (entry) => String(entry.status ?? "active").toLowerCase() === "active"
  );

  const { data: photos } = await supabase
    .from("customer_photos")
    .select("id, storage_path, original_name, mime_type, size_bytes, created_at")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(200);

  const photoRows = ((photos as PhotoRow[] | null) ?? []);
  const photoPaths = photoRows
    .map((photo) => photo.storage_path)
    .filter((path): path is string => !!path);

  const signedUrlMap = new Map<string, string | null>();
  if (photoPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("customer-photos")
      .createSignedUrls(photoPaths, 60 * 60);

    for (const entry of signedUrls ?? []) {
      if (entry.path) {
        signedUrlMap.set(entry.path, entry.signedUrl ?? null);
      }
    }
  }

  const { data: servicesRaw } = tenantId
    ? await supabase
        .from("services")
        .select("id, name, tenant_id, duration_minutes, buffer_minutes, default_price_cents, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name", { ascending: true })
    : { data: [] };

  const services = ((servicesRaw ?? []) as ServiceRow[]).filter((service) => !!service.name);

  const { data: salesOrdersRaw } = personId
    ? await supabase
        .from("sales_orders")
        .select("id, customer_id, appointment_id, status, currency_code, grand_total, created_at")
        .eq("customer_id", personId)
        .order("created_at", { ascending: false })
        .limit(250)
    : { data: [] };

  const salesOrders = ((salesOrdersRaw ?? []) as SalesOrderRow[]).filter((row) => !!row.id);
  const salesOrderIds = salesOrders.map((row) => row.id);

  const { data: salesOrderLinesRaw } = salesOrderIds.length
    ? await supabase
        .from("sales_order_lines")
        .select("id, sales_order_id, name, quantity, unit_price_gross, line_total_gross, sort_order, created_at")
        .in("sales_order_id", salesOrderIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] };

  const salesOrderLines = (salesOrderLinesRaw ?? []) as SalesOrderLineRow[];

  const { data: paymentsRaw } = salesOrderIds.length
    ? await supabase
        .from("payments")
        .select("id, sales_order_id, amount, currency_code, status, paid_at, created_at")
        .in("sales_order_id", salesOrderIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const payments = (paymentsRaw ?? []) as PaymentRow[];

  const paymentRowsByOrderId = new Map<string, PaymentRow[]>();
  for (const payment of payments) {
    const key = String(payment.sales_order_id ?? "").trim();
    if (!key) continue;
    const group = paymentRowsByOrderId.get(key) ?? [];
    group.push(payment);
    paymentRowsByOrderId.set(key, group);
  }

  const linesByOrderId = new Map<string, SalesOrderLineRow[]>();
  for (const line of salesOrderLines) {
    const key = String(line.sales_order_id ?? "").trim();
    if (!key) continue;
    const group = linesByOrderId.get(key) ?? [];
    group.push(line);
    linesByOrderId.set(key, group);
  }

  let totalRevenueGross = 0;
  let paidOrderCount = 0;
  let totalAddonRevenueGross = 0;
  const mostBookedServiceCounts = new Map<string, number>();
  const addonCounts = new Map<string, { qty: number; revenue: number }>();

  for (const order of salesOrders) {
    const orderId = String(order.id ?? "").trim();
    if (!orderId) continue;

    const orderPayments = paymentRowsByOrderId.get(orderId) ?? [];
    const completedPayments = orderPayments.filter((payment) => normalizePaymentStatus(payment.status) === "COMPLETED");
    const orderIsCompleted = normalizeSalesOrderStatus(order.status) === "COMPLETED";

    let realizedGross = 0;
    if (completedPayments.length > 0) {
      realizedGross = completedPayments.reduce((sum, payment) => sum + (Number(payment.amount ?? 0) || 0), 0);
    } else if (orderIsCompleted) {
      realizedGross = Number(order.grand_total ?? 0) || 0;
    }

    if (realizedGross > 0) {
      totalRevenueGross += realizedGross;
      paidOrderCount += 1;
    }

    const orderLines = [...(linesByOrderId.get(orderId) ?? [])].sort((a, b) => {
      const sa = Number(a.sort_order ?? 0);
      const sb = Number(b.sort_order ?? 0);
      if (sa !== sb) return sa - sb;
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    });

    const primaryLine = orderLines[0] ?? null;
    if (primaryLine?.name && realizedGross > 0) {
      mostBookedServiceCounts.set(primaryLine.name, (mostBookedServiceCounts.get(primaryLine.name) ?? 0) + 1);
    }

    for (const extraLine of orderLines.slice(1)) {
      const extraName = String(extraLine.name ?? "").trim();
      if (!extraName || realizedGross <= 0) continue;
      const quantity = Number(extraLine.quantity ?? 0) || 1;
      const revenue = Number(extraLine.line_total_gross ?? 0) || (Number(extraLine.unit_price_gross ?? 0) || 0) * quantity;
      totalAddonRevenueGross += revenue;
      const current = addonCounts.get(extraName) ?? { qty: 0, revenue: 0 };
      current.qty += quantity;
      current.revenue += revenue;
      addonCounts.set(extraName, current);
    }
  }

  const topServiceEntries = [...mostBookedServiceCounts.entries()].sort((a, b) => b[1] - a[1]);
  const mostBookedService = topServiceEntries[0]?.[0] ?? "—";
  const mostBookedServiceCount = topServiceEntries[0]?.[1] ?? 0;
  const topAddonEntries = [...addonCounts.entries()]
    .sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue)
    .slice(0, 3);

  const historicalAppointmentCount = appointments.filter((appointment) => {
    if (!appointment.start_at) return false;
    const startDate = new Date(appointment.start_at);
    return !Number.isNaN(startDate.getTime()) && startDate < now;
  }).length;

  const attendedRate = historicalAppointmentCount > 0 ? (visitCount / historicalAppointmentCount) * 100 : 0;
  const cancelledRate = historicalAppointmentCount > 0 ? (cancelledCount / historicalAppointmentCount) * 100 : 0;
  const noShowRate = historicalAppointmentCount > 0 ? (noShowCount / historicalAppointmentCount) * 100 : 0;

  const averageRevenuePerVisitGross = visitCount > 0 ? totalRevenueGross / visitCount : 0;
  const averageRevenuePerPaidOrderGross = paidOrderCount > 0 ? totalRevenueGross / paidOrderCount : 0;

  const waitlistTimeOptions = buildWaitlistTimeOptions();

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <ScrollToTab />

      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-5 md:p-7">
            <div
              className="rounded-[28px] border p-5 md:p-6"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                      Clientique Kundenprofil
                    </div>
                    <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-[var(--text)]">
                      {person?.full_name || "Unbekannter Kunde"}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                    <Link href={`/customers/${customerProfileId}/edit`}>
                      <Button variant="secondary" size="sm">Bearbeiten</Button>
                    </Link>

                    <CustomerAppointmentLauncher
                      customerProfileId={customerProfileId}
                      customerName={person?.full_name || ""}
                      customerPhone={person?.phone || ""}
                      customerTenantId={tenantId}
                      customerTenantLabel={tenantLabel || null}
                      services={services}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Telefon</div>
                    <div className="mt-2 break-all text-base font-semibold text-[var(--text)]">
                      {person?.phone || "—"}
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      {person?.phone ? (
                        <>
                          <ContactButton
                            label="Anrufen"
                            href={`tel:${normalizePhoneForTel(person.phone)}`}
                          />
                          <ContactButton
                            label="WhatsApp"
                            href={`https://wa.me/${normalizePhoneForWhatsApp(person.phone)}?text=${encodeURIComponent(
                              buildWhatsAppText(person.full_name)
                            )}`}
                            variant="whatsapp"
                          />
                        </>
                      ) : (
                        <span className="text-sm text-white/45">Keine Telefonnummer hinterlegt</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">E-Mail</div>
                    <div className="mt-2 break-all text-base font-semibold text-[var(--text)]">
                      {person?.email || "—"}
                    </div>
                    <div className="mt-4 w-full">
                      {person?.email ? (
                        <ContactButton
                          label="E-Mail schreiben"
                          href={`mailto:${person.email}`}
                        />
                      ) : (
                        <span className="text-sm text-white/45">Keine E-Mail hinterlegt</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Geburtstag</div>
                    <div className="mt-2 text-base font-semibold text-[var(--text)]">
                      {fmtDateOrDash(person?.birthday)}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Fragebogen Datum</div>
                    <div className="mt-2 text-base font-semibold text-[var(--text)]">
                      {fmtDateTimeOrDash(intakeCreatedAt)}
                    </div>
                    <div className="mt-4">
                      <Link href={`/customers/${customerProfileId}/intake`} className="inline-flex w-full">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-[14px] border px-3 text-sm font-semibold"
                          style={
                            intakeIsDone
                              ? {
                                  backgroundColor: "#10b981",
                                  borderColor: "rgba(52, 211, 153, 0.75)",
                                  color: "#ffffff",
                                  boxShadow: "0 10px 24px rgba(16,185,129,0.28)",
                                }
                              : intakeIsDraft
                                ? {
                                    backgroundColor: "#f59e0b",
                                    borderColor: "rgba(251, 191, 36, 0.75)",
                                    color: "#111827",
                                    boxShadow: "0 10px 24px rgba(245,158,11,0.28)",
                                  }
                                : {
                                    backgroundColor: "#ef4444",
                                    borderColor: "rgba(248, 113, 113, 0.75)",
                                    color: "#ffffff",
                                    boxShadow: "0 10px 24px rgba(239,68,68,0.28)",
                                  }
                          }
                        >
                          {intakeIsDone ? "Fragebogen ausgefüllt" : intakeIsDraft ? "Fragebogen fortsetzen" : "Fragebogen ausfüllen"}
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {sp?.success ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {sp.success}
              </div>
            ) : null}

            {sp?.error ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {sp.error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <a href="#customer-value" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Kundenwert
              </a>
              <a href="#appointments" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Termine
              </a>
              <a href="#waitlist" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Warteliste
              </a>
              <a href="#communication" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Kommunikation
                {totalCommunicationUnread > 0 ? (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">
                    {totalCommunicationUnread}
                  </span>
                ) : null}
              </a>
              <a href="#notes" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Notizen
              </a>
              <a href="#files" className="inline-flex h-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Dateien
              </a>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 items-stretch sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Besuche"
                value={String(visitCount)}
                subtext={lastVisitAt ? `Letzter Besuch: ${fmtDateOrDash(lastVisitAt)}` : "Noch kein Besuch"}
              />
              <MetricCard
                label="No-Shows"
                value={String(noShowCount)}
                subtext={noShowCount > 0 ? "Bitte beobachten" : "Bisher zuverlässig"}
              />
              <MetricCard
                label="Abgesagt"
                value={String(cancelledCount)}
                subtext={cancelledCount > 0 ? "Terminabsagen vorhanden" : "Keine Absagen"}
              />
              <MetricCard
                label="Letzter Besuch"
                value={daysSinceLastVisit !== null ? `${daysSinceLastVisit} Tage` : "—"}
                subtext={lastVisitAt ? fmtDateOrDash(lastVisitAt) : "Kein Besuch"}
              />
              <MetricCard
                label="Nächster Termin"
                value={fmtDateOrDash(nextAppointmentAt)}
                subtext={nextAppointmentAt ? "Folgetermin vorhanden" : "Kein Termin geplant"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="mt-6 space-y-6">
        <section className="space-y-6">
          <SectionCard
            id="customer-value"
            title="Kundenwert"
            description="Umsatz, Lieblingsleistungen, Zusatzkäufe und Terminverhalten dieses Kunden."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Gesamtumsatz"
                value={formatEuroFromGross(totalRevenueGross)}
                subtext={paidOrderCount > 0 ? `${paidOrderCount} bezahlte Rechnung${paidOrderCount === 1 ? "" : "en"}` : "Noch kein Umsatz"}
              />
              <MetricCard
                label="Ø pro Besuch"
                value={visitCount > 0 ? formatEuroFromGross(averageRevenuePerVisitGross) : "—"}
                subtext={visitCount > 0 ? `Ø je Besuch · ${String(visitCount)} Besuch${visitCount === 1 ? "" : "e"}` : "Noch keine Besuchsdaten"}
              />
              <MetricCard
                label="Meistgebuchte Leistung"
                value={mostBookedService}
                subtext={mostBookedServiceCount > 0 ? `${mostBookedServiceCount}× gebucht` : "Noch keine Leistungsdaten"}
              />
              <MetricCard
                label="Zusatzkäufe"
                value={topAddonEntries.length > 0 ? String(topAddonEntries.reduce((sum, entry) => sum + entry[1].qty, 0)) : "0"}
                subtext={totalAddonRevenueGross > 0 ? `${formatEuroFromGross(totalAddonRevenueGross)} Zusatzumsatz` : "Noch keine Zusatzkäufe"}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Terminquote</div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 px-3 py-3 text-center">
                    <div className="text-xs text-emerald-200/80">Gekommen</div>
                    <div className="mt-2 text-lg font-semibold text-emerald-100">{formatPercent(attendedRate)}</div>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-center">
                    <div className="text-xs text-white/70">Abgesagt</div>
                    <div className="mt-2 text-lg font-semibold text-white">{formatPercent(cancelledRate)}</div>
                  </div>
                  <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 px-3 py-3 text-center">
                    <div className="text-xs text-red-200/80">Nicht gekommen</div>
                    <div className="mt-2 text-lg font-semibold text-red-100">{formatPercent(noShowRate)}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-white/50">
                  Basis: {historicalAppointmentCount} vergangene Termin{historicalAppointmentCount === 1 ? "" : "e"}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Top Leistungen</div>
                <div className="mt-4 space-y-3">
                  {topServiceEntries.slice(0, 3).length > 0 ? topServiceEntries.slice(0, 3).map(([serviceName, count]) => (
                    <div key={serviceName} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-3">
                      <div className="min-w-0 truncate text-sm font-medium text-white/90">{serviceName}</div>
                      <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                        {count}×
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/55">
                      Noch keine Leistungsdaten vorhanden.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Zusatzprodukte / Extras</div>
                <div className="mt-4 space-y-3">
                  {topAddonEntries.length > 0 ? topAddonEntries.map(([addonName, info]) => (
                    <div key={addonName} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white/90">{addonName}</div>
                        <div className="mt-1 text-xs text-white/50">{formatEuroFromGross(info.revenue)} Umsatz</div>
                      </div>
                      <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                        {info.qty}×
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/55">
                      Noch keine Zusatzkäufe vorhanden.
                    </div>
                  )}
                </div>
                <div className="mt-3 text-sm text-white/50">
                  Ø Rechnung: {paidOrderCount > 0 ? formatEuroFromGross(averageRevenuePerPaidOrderGross) : "—"}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="communication"
            title="Kommunikation"
            description="WhatsApp-Verlauf, offene Kundenchats und letzte Nachrichten direkt im Kundenprofil."
            action={
              <Link href={communicationOpenHref}>
                <Button variant="secondary" size="sm">Chat öffnen</Button>
              </Link>
            }
          >
            {communicationConversations.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-5 text-white/60">
                Noch kein Kommunikationsverlauf vorhanden.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Chats</div>
                      <div className="mt-1 text-lg font-semibold text-white">{communicationConversations.length}</div>
                    </div>
                    <div className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-amber-100/60">Offen</div>
                      <div className="mt-1 text-lg font-semibold text-amber-100">{openCommunicationCount}</div>
                    </div>
                    <div className="rounded-[18px] border border-blue-400/20 bg-blue-400/10 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-blue-100/60">Ungelesen</div>
                      <div className="mt-1 text-lg font-semibold text-blue-100">{totalCommunicationUnread}</div>
                    </div>
                  </div>

                  {communicationConversations.slice(0, 5).map((conversation) => {
                    const isLatest = latestCommunicationConversation?.id === conversation.id;
                    return (
                      <Link
                        key={conversation.id}
                        href={`/kommunikation?status=all&c=${conversation.id}&panel=chats`}
                        className={`block rounded-[22px] border p-4 no-underline transition hover:bg-white/[0.06] ${
                          isLatest ? "border-[#d8c1a0]/30 bg-[#d8c1a0]/10" : "border-white/10 bg-black/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-white">
                                {communicationChannelLabel(conversation.channel)}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${communicationStatusClasses(conversation.status)}`}>
                                {communicationStatusLabel(conversation.status)}
                              </span>
                            </div>
                            <div className="mt-2 line-clamp-2 text-sm text-white/65">
                              {communicationPreviewText(conversation.last_message_preview)}
                            </div>
                            <div className="mt-2 text-xs text-white/40">
                              {fmtDateTimeOrDash(conversation.last_message_at || conversation.created_at)}
                            </div>
                          </div>
                          {Number(conversation.unread_count ?? 0) > 0 ? (
                            <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-bold text-white">
                              {conversation.unread_count}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  {latestCommunicationConversation ? (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--primary)]">Letzter Verlauf</div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {communicationChannelLabel(latestCommunicationConversation.channel)} · {communicationStatusLabel(latestCommunicationConversation.status)}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            {fmtDateTimeOrDash(latestCommunicationConversation.last_message_at || latestCommunicationConversation.created_at)}
                          </div>
                        </div>
                        <Link
                          href={`/kommunikation?status=all&c=${latestCommunicationConversation.id}&panel=chats`}
                          className="inline-flex h-9 items-center justify-center rounded-[14px] border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white no-underline hover:bg-white/[0.14]"
                        >
                          Verlauf öffnen
                        </Link>
                      </div>

                      <div className="mt-4 space-y-3">
                        {latestCommunicationMessages.length === 0 ? (
                          <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                            Noch keine Nachrichten in diesem Verlauf.
                          </div>
                        ) : (
                          latestCommunicationMessages.map((message) => {
                            const isOutbound = String(message.direction ?? "").toUpperCase() === "OUTBOUND";
                            return (
                              <div
                                key={message.id}
                                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[82%] rounded-[18px] border px-4 py-3 ${
                                    isOutbound
                                      ? "border-[#d8c1a0]/24 bg-[#d8c1a0]/12 text-white"
                                      : "border-white/10 bg-black/30 text-white/90"
                                  }`}
                                >
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {communicationPreviewText(message.body)}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                                    <span>{fmtDateTimeOrDash(message.created_at || message.sent_at || message.received_at)}</span>
                                    <span>·</span>
                                    <span>{communicationDirectionLabel(message.direction)}</span>
                                    <span>·</span>
                                    <span>{communicationMessageStatusLabel(message.status)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                      Noch kein Verlauf ausgewählt.
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard
              id="appointments"
              title="Termine"
              description="Kommende und vergangene Termine dieses Kunden."
              action={
                <CustomerAppointmentLauncher
                  customerProfileId={customerProfileId}
                  customerName={person?.full_name || ""}
                  customerPhone={person?.phone || ""}
                  customerTenantId={tenantId}
                  customerTenantLabel={tenantLabel || null}
                  services={services}
                />
              }
            >
              {appointments.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/60">
                  Keine Termine vorhanden.
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((appointment) => {
                    const startText = fmtDateTimeOrDash(appointment.start_at);
                    const endText = fmtDateTimeOrDash(appointment.end_at);
                    const tenantDisplayName = firstJoin(appointment.tenant)?.display_name || "Behandler";
                    const title = getAppointmentTitle(appointment.notes_internal);
                    const note = getAppointmentNote(appointment.notes_internal);
                    const status = getAppointmentStatus(appointment.notes_internal);

                    return (
                      <div
                        key={appointment.id}
                        className="rounded-[24px] border border-white/10 bg-black/20 p-4 md:p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm text-white/45">{tenantDisplayName}</div>
                            <div className="mt-1 truncate text-lg font-semibold text-white">{title}</div>
                            <div className="mt-2 text-sm text-white/70">
                              {startText} – {endText}
                            </div>
                            {note ? <div className="mt-2 text-sm text-white/60">{note}</div> : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${appointmentStatusClasses(
                                  status,
                                  appointment.start_at
                                )}`}
                              >
                                {appointmentStatusLabel(status, appointment.start_at)}
                              </span>
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[140px] lg:justify-end">
                            <AppointmentEditLauncher
                              appointmentId={appointment.id}
                              startAt={appointment.start_at}
                              endAt={appointment.end_at}
                              notesInternal={appointment.notes_internal}
                            />

                            <form action={deleteAppointment.bind(null, customerProfileId, appointment.id)} className="w-full">
                              <button
                                type="submit"
                                className="inline-flex h-9 w-full items-center justify-center rounded-[14px] border border-red-400/25 bg-red-400/10 px-3 text-sm text-red-200"
                              >
                                Löschen
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="waitlist"
              title="Warteliste"
              description="Freigewordene Termine schneller an diesen Kunden vergeben."
              action={
                <span className="inline-flex rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
                  Aktiv: {activeWaitlistEntries.length}
                </span>
              }
            >
              <form
                action={addCustomerToWaitlist.bind(null, customerProfileId)}
                className="grid gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4 md:grid-cols-2"
              >
                <input type="hidden" name="preferred_staff_name" value={tenantLabel || ""} />
                <input type="hidden" name="preferred_days" value="" />
                <input type="hidden" name="priority" value="normal" />
                <input type="hidden" name="requested_recently_preset" value="" />

                <div className="md:col-span-2">
                  <label className="text-xs text-white/80">Behandlung</label>
                  <select
                    name="service_name"
                    defaultValue=""
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                    required
                  >
                    <option value="" disabled>
                      Dienstleistung auswählen
                    </option>
                    {services.map((service) => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                  {services.length === 0 ? (
                    <div className="mt-2 text-xs text-amber-200">
                      Keine aktiven Dienstleistungen für diesen Behandler gefunden.
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-white/80">Zeit von</label>
                  <select
                    name="time_from"
                    defaultValue=""
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                  >
                    <option value="">Beliebig</option>
                    {waitlistTimeOptions.map((time) => (
                      <option key={`from-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-white/80">Zeit bis</label>
                  <select
                    name="time_to"
                    defaultValue=""
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                  >
                    <option value="">Beliebig</option>
                    {waitlistTimeOptions.map((time) => (
                      <option key={`to-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-white/80">Notiz</label>
                  <textarea
                    name="notes"
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                    placeholder="z. B. nur vormittags oder flexibel"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Zur Warteliste hinzufügen
                  </button>
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {waitlistEntries.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/60">
                    Noch kein Wartelisten-Eintrag vorhanden.
                  </div>
                ) : (
                  waitlistEntries.map((entry) => (
                    <div key={entry.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${waitlistStatusClasses(entry.status)}`}>
                              {waitlistStatusLabel(entry.status)}
                            </span>
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${waitlistPriorityClasses(entry.priority)}`}>
                              {waitlistPriorityLabel(entry.priority)}
                            </span>
                          </div>

                          <div className="mt-3 text-lg font-semibold text-white">
                            {entry.service_title || "Ohne konkrete Behandlung"}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/65">
                            <span>Behandler: {readWaitlistPreferredStaff(entry.notes) || "egal"}</span>
                            <span>Tageszeit: {fmtTimeRange(entry.time_from, entry.time_to)}</span>
                            <span>
                              Tage: {entry.preferred_days && entry.preferred_days.length > 0 ? entry.preferred_days.join(", ") : "flexibel"}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.short_notice_ok ? (
                              <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                Kurzfristig möglich
                              </span>
                            ) : null}
                            {entry.reachable_today ? (
                              <span className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
                                Heute erreichbar
                              </span>
                            ) : null}
                            {waitlistRecentRequestLabel(entry.requested_recently_at) ? (
                              <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                                {waitlistRecentRequestLabel(entry.requested_recently_at)}
                              </span>
                            ) : null}
                          </div>

                          {readWaitlistVisibleNotes(entry.notes) ? <div className="mt-2 whitespace-pre-wrap text-sm text-white/75">{readWaitlistVisibleNotes(entry.notes)}</div> : null}

                          <div className="mt-3 text-xs text-white/40">
                            Erstellt: {fmtDateTimeOrDash(entry.created_at)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {String(entry.status ?? "active").toLowerCase() === "active" ? (
                            <>
                              <form action={updateCustomerWaitlistStatus.bind(null, customerProfileId, entry.id, "contacted")}>
                                <button
                                  type="submit"
                                  className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-sm text-sky-200"
                                >
                                  Kontaktiert
                                </button>
                              </form>
                              <form action={updateCustomerWaitlistStatus.bind(null, customerProfileId, entry.id, "removed")}>
                                <button
                                  type="submit"
                                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                                >
                                  Entfernen
                                </button>
                              </form>
                            </>
                          ) : String(entry.status ?? "").toLowerCase() === "contacted" ? (
                            <>
                              <form action={updateCustomerWaitlistStatus.bind(null, customerProfileId, entry.id, "booked")}>
                                <button
                                  type="submit"
                                  className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
                                >
                                  Als gebucht markieren
                                </button>
                              </form>
                              <form action={updateCustomerWaitlistStatus.bind(null, customerProfileId, entry.id, "active")}>
                                <button
                                  type="submit"
                                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                                >
                                  Wieder aktiv
                                </button>
                              </form>
                            </>
                          ) : (
                            <form action={updateCustomerWaitlistStatus.bind(null, customerProfileId, entry.id, "active")}>
                              <button
                                type="submit"
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                              >
                                Reaktivieren
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard
              id="notes"
              title="Notizen"
              description="Interne Hinweise und Verlauf zum Kunden."
            >
              <form action={addCustomerNote.bind(null, customerProfileId)} className="mb-4 space-y-3">
                <textarea
                  name="note"
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Neue Notiz hinzufügen..."
                  required
                />
                <button
                  type="submit"
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                >
                  Notiz speichern
                </button>
              </form>

              {(notes as NoteRow[] | null)?.length ? (
                <div className="space-y-3">
                  {(notes as NoteRow[]).map((note) => (
                    <div key={note.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <div className="whitespace-pre-wrap text-sm text-white/85">{note.note}</div>
                      <div className="mt-3 text-xs text-white/40">
                        Erstellt: {fmtDateTimeOrDash(note.created_at)}
                        {note.updated_at !== note.created_at ? ` • Aktualisiert: ${fmtDateTimeOrDash(note.updated_at)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/60">
                  Noch keine Notizen vorhanden.
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="files"
              title="Dateien"
              description="Fotos und Dokumente dieses Kunden."
            >
              <PhotoUpload customerProfileId={customerProfileId} />

              <div className="mt-5">
                <CustomerMediaGalleryClient
                  customerProfileId={customerProfileId}
                  items={photoRows.map((photo) => ({
                    id: photo.id,
                    url: signedUrlMap.get(photo.storage_path) ?? null,
                    originalName: photo.original_name ?? null,
                    mimeType: photo.mime_type ?? null,
                    sizeBytes: photo.size_bytes ?? null,
                    createdAt: photo.created_at,
                  }))}
                />
              </div>
            </SectionCard>
          </div>
        </section>
      </div>
    </main>
  );
}
