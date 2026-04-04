import Link from "next/link";
import { addCustomerNote, addCustomerToWaitlist, updateCustomerWaitlistStatus } from "./actions";
import { deleteAppointment } from "./appointments/actions";
import PhotoUpload from "./PhotoUpload";
import ScrollToTab from "./ScrollToTab";
import CustomerMediaGalleryClient from "./CustomerMediaGalleryClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

type IntakeRow = {
  id: string;
  created_at: string | null;
  signed_at: string | null;
  status: string | null;
};

type ServiceRow = {
  id: string;
  name: string;
  tenant_id: string | null;
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

function tenantThemeByName(name: string) {
  const n = (name || "").toLowerCase();

  let bg = "rgba(255,255,255,0.04)";
  let text = "rgba(255,255,255,0.95)";
  let subText = "rgba(255,255,255,0.75)";
  let border = "rgba(255,255,255,0.14)";
  let pillBg = "rgba(255,255,255,0.08)";

  if (n.includes("radu")) {
    bg = "rgba(59,130,246,0.14)";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    border = "rgba(59,130,246,0.28)";
    pillBg = "rgba(59,130,246,0.18)";
  } else if (n.includes("raluca")) {
    bg = "rgba(168,85,247,0.14)";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    border = "rgba(168,85,247,0.28)";
    pillBg = "rgba(168,85,247,0.18)";
  } else if (n.includes("alexandra")) {
    bg = "rgba(34,197,94,0.14)";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    border = "rgba(34,197,94,0.28)";
    pillBg = "rgba(34,197,94,0.18)";
  } else if (n.includes("barbara")) {
    bg = "rgba(249,115,22,0.14)";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    border = "rgba(249,115,22,0.28)";
    pillBg = "rgba(249,115,22,0.18)";
  }

  return { bg, text, subText, border, pillBg };
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

function statusBadgeClasses(status: CustomerStatus) {
  switch (status) {
    case "Aktiv":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "Inaktiv":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "Ohne Folgetermin":
      return "border-white/10 bg-white/5 text-white/80";
    default:
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  }
}

function StatusIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span
        aria-label="ausgefüllt"
        title="Fragebogen ausgefüllt"
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "rgba(34,197,94,0.18)",
          border: "1px solid rgba(34,197,94,0.35)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-label="nicht ausgefüllt"
      title="Fragebogen nicht ausgefüllt"
      style={{
        display: "inline-flex",
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "rgba(239,68,68,0.18)",
        border: "1px solid rgba(239,68,68,0.35)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path
          d="M18 6L6 18M6 6l12 12"
          stroke="#ef4444"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
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
    "inline-flex h-[38px] items-center justify-center whitespace-nowrap rounded-[12px] px-[14px] text-[13px] font-extrabold no-underline border";

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
    <Card className="border-[var(--border)] bg-[var(--surface)]">
      <CardContent className="min-h-[126px] p-5">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <div className="mt-4 text-[30px] font-semibold leading-none tracking-tight text-[var(--text)]">
          {value}
        </div>
        <div className="mt-3 text-sm text-white/50">{subtext}</div>
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
  const theme = tenantThemeByName(tenantLabel);

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

  const customerStatus = getCustomerStatus(lastVisitAt, nextAppointmentAt, visitCount);
  const daysSinceLastVisit = countDaysSince(lastVisitAt);

  const { data: notes } = await supabase
    .from("customer_notes")
    .select("id, note, created_at, updated_at, created_by")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(100);

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
    .from("customer_media")
    .select("id, storage_path, original_name, mime_type, size_bytes, created_at")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: servicesRaw } = tenantId
    ? await supabase
        .from("services")
        .select("id, name, tenant_id, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name", { ascending: true })
    : { data: [] };

  const services = ((servicesRaw ?? []) as ServiceRow[]).filter((service) => !!service.name);
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

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Telefon</div>
                        <div className="mt-2 text-sm font-medium text-[var(--text)]">
                          {person?.phone || "—"}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">E-Mail</div>
                        <div className="mt-2 truncate text-sm font-medium text-[var(--text)]">
                          {person?.email || "—"}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Geburtstag</div>
                        <div className="mt-2 text-sm font-medium text-[var(--text)]">
                          {fmtDateOrDash(person?.birthday)}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Fragebogen Datum</div>
                        <div className="mt-2 text-sm font-medium text-[var(--text)]">
                          {fmtDateTimeOrDash(intakeCreatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
                    <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Letzter Besuch</div>
                      <div className="mt-2 text-base font-medium text-[var(--text)]">
                        {fmtDateOrDash(lastVisitAt)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">
                        {daysSinceLastVisit !== null ? `${daysSinceLastVisit} Tage her` : "Noch kein Besuch"}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Nächster Termin</div>
                      <div className="mt-2 text-base font-medium text-[var(--text)]">
                        {fmtDateOrDash(nextAppointmentAt)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">
                        {nextAppointmentAt ? "Folgetermin vorhanden" : "Kein Termin geplant"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/customers/${customerProfileId}/edit`}>
                        <Button variant="secondary" size="sm">Bearbeiten</Button>
                      </Link>

                      <Link href={`/customers/${customerProfileId}/intake`} className="inline-flex">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-[14px] border px-3 text-sm font-semibold"
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

                    <Link href={`/customers/${customerProfileId}/appointments/new`}>
                      <Button size="sm">Neuer Termin</Button>
                    </Link>
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

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                subtext={nextAppointmentAt ? `Nächster Termin: ${fmtDateOrDash(nextAppointmentAt)}` : "Kein Folgetermin"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="space-y-6">
          <SectionCard
            id="appointments"
            title="Termine"
            description="Kommende und vergangene Termine dieses Kunden."
            action={
              <Link href={`/customers/${customerProfileId}/appointments/new`}>
                <Button size="sm">Neuer Termin</Button>
              </Link>
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

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link href={`/customers/${customerProfileId}/appointments/${appointment.id}/edit`}>
                            <Button variant="secondary" size="sm">Bearbeiten</Button>
                          </Link>

                          <form action={deleteAppointment.bind(null, customerProfileId, appointment.id)}>
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-[14px] border border-red-400/25 bg-red-400/10 px-3 text-sm text-red-200"
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
        </section>

        <aside className="space-y-6">
          <SectionCard
            title="Dateien"
            description="Fotos und Dokumente dieses Kunden."
          >
            <PhotoUpload customerProfileId={customerProfileId} />

            <div className="mt-5">
              <CustomerMediaGalleryClient
                customerProfileId={customerProfileId}
                items={((photos as PhotoRow[] | null) ?? []).map((photo) => ({
                  id: photo.id,
                  url: photo.storage_path,
                  originalName: photo.original_name ?? null,
                  mimeType: photo.mime_type ?? null,
                  sizeBytes: photo.size_bytes ?? null,
                  createdAt: photo.created_at,
                }))}
              />
            </div>
          </SectionCard>
        </aside>
      </div>
    </main>
  );
}
