import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { CLIENTIQUE_DEMO_TENANT_ID, isDemoTenantId } from "@/lib/demoMode";
import { Card, CardContent } from "@/components/ui/card";
import DashboardCalendarCardClient from "@/components/calendar/DashboardCalendarCardClient";
import OpenSlotsSlideover from "@/components/dashboard/OpenSlotsSlideover";
import WaitlistSlideover from "@/components/dashboard/WaitlistSlideover";
import DashboardServicesCard from "@/components/dashboard/DashboardServicesCard";
import DashboardInvoiceSlideover from "@/components/dashboard/DashboardInvoiceSlideover";
import OpenCreateAppointmentButton from "@/components/dashboard/OpenCreateAppointmentButton";
import { cn } from "@/lib/cn";

type TenantRow = {
  id: string;
  display_name: string | null;
};

type LegendUser = {
  tenantId: string;
  filterTenantId: string;
  userId: string;
  fullName: string | null;
  tenantDisplayName: string;
  avatarUrl?: string | null;
  avatarRingColor?: string | null;
};

type ReminderCountRow = {
  id: string;
  start_at: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  notes_internal: string | null;
};

type NextAppointmentRow = {
  id: string;
  start_at: string | null;
  tenant_id: string | null;
  notes_internal: string | null;
};

type OpenSlotRow = {
  id: string;
  appointment_id: string;
  tenant_id: string;
  start_at: string;
  end_at: string;
  status: string;
  created_at: string;
};

type OpenSlotDisplayItem = {
  id: string;
  appointmentId: string;
  tenantId: string;
  tenantName: string;
  startAt: string;
  endAt: string;
  waitlistCount: number;
  immediateCount: number;
};

type WaitlistDashboardItem = {
  id: string;
  customerProfileId: string | null;
  tenantId: string;
  tenantName: string;
  customerName: string;
  phone: string | null;
  serviceTitle: string | null;
  priority: string | null;
  shortNoticeOk: boolean;
  reachableToday: boolean;
  requestedRecentlyAt: string | null;
  createdAt: string;
  profileExists: boolean;
};

type FiscalReceiptRow = {
  id: string;
  status: string | null;
  turnover_value_cents: number | null;
  issued_at: string | null;
  created_at: string;
};

type CalendarServiceRow = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

type DashboardCustomerOption = {
  id: string;
  tenantId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
};

type DashboardCustomerRow = {
  id: string;
  tenant_id: string | null;
  person_id: string | null;
  created_at: string | null;
  person:
    | {
        id: string | null;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday?: string | null;
      }
    | {
        id: string | null;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday?: string | null;
      }[]
    | null;
  tenant:
    | {
        id: string | null;
        display_name: string | null;
      }
    | {
        id: string | null;
        display_name: string | null;
      }[]
    | null;
};

type ThemeLike = {
  bg: string;
  text: string;
  subText: string;
  border: string;
};

function firstJoin<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function parseStatus(notes: string | null) {
  if (!notes) return "scheduled";

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const statusLine = lines.find((line) => line.toLowerCase().startsWith("status:"));
  const value = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "scheduled";

  if (value === "completed") return "completed";
  if (value === "cancelled") return "cancelled";
  if (value === "no_show") return "no_show";
  return "scheduled";
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatCurrentTime(date: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uniqueStrings(values: unknown) {
  const input = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  return Array.from(new Set(input.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function uniqueCalendarIds(...groups: unknown[]) {
  return Array.from(new Set(groups.flatMap((group) => uniqueStrings(group))));
}

const STUDIO_TARGETS = [
  { key: "studio_radu", label: "Studio Radu", calendarId: "radu.craus@gmail.com" },
  { key: "studio_raluca", label: "Studio Raluca", calendarId: "raluca.magnifique@gmail.com" },
] as const;

const STUDIO_TARGET_IDS = new Set<string>(STUDIO_TARGETS.map((target) => target.calendarId));

type GoogleConnectionRow = {
  id: string;
  connection_label: string | null;
  google_account_email: string | null;
  google_account_name: string | null;
  connection_type: string | null;
  is_primary: boolean | null;
  is_read_only: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  default_calendar_id?: string | null;
  enabled_calendar_ids?: unknown;
};


function getNameInitials(value: string | null | undefined) {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}


function isDateWithinNextDays(date: Date, days: number) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days + 1);
  return date >= start && date < end;
}

function getNextBirthdayDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const next = new Date(now.getFullYear(), parsed.getMonth(), parsed.getDate());
  next.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (next < today) {
    next.setFullYear(next.getFullYear() + 1);
  }

  return next;
}

function formatCompactCustomerDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatBirthdayDueLabel(value: Date | null | undefined) {
  if (!value) return "—";

  const target = new Date(value);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Morgen";
  if (diffDays > 1 && diffDays <= 6) return `in ${diffDays} Tagen`;

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
  }).format(target);
}

function formatNextAppointmentLabel(value: string | null | undefined) {
  if (!value) return "Kein Termin";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Kein Termin";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);

  const timeLabel = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  if (date >= todayStart && date < tomorrowStart) return `Heute · ${timeLabel}`;
  if (date >= tomorrowStart && date < dayAfterTomorrowStart) return `Morgen · ${timeLabel}`;

  const dayLabel = new Intl.DateTimeFormat("de-AT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return `${dayLabel} · ${timeLabel}`;
}

function immediateCandidateScore(row: {
  short_notice_ok?: boolean | null;
  reachable_today?: boolean | null;
  requested_recently_at?: string | null;
}) {
  let score = 0;
  if (row.short_notice_ok) score += 5;
  if (row.reachable_today) score += 4;

  if (row.requested_recently_at) {
    const requestedAt = new Date(row.requested_recently_at);
    if (!Number.isNaN(requestedAt.getTime())) {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekAgo = new Date(todayStart);
      weekAgo.setDate(weekAgo.getDate() - 7);

      if (requestedAt >= todayStart) score += 5;
      else if (requestedAt >= yesterdayStart) score += 3;
      else if (requestedAt >= weekAgo) score += 1;
    }
  }

  return score;
}

function tenantTheme(tenantName: string): ThemeLike {
  const n = (tenantName || "").toLowerCase();

  if (n.includes("radu")) {
    return {
      bg: "rgba(59,130,246,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(59,130,246,0.45)",
    };
  }

  if (n.includes("raluca")) {
    return {
      bg: "rgba(168,85,247,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(168,85,247,0.45)",
    };
  }

  if (n.includes("alexandra")) {
    return {
      bg: "rgba(34,197,94,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(34,197,94,0.45)",
    };
  }

  if (n.includes("barbara")) {
    return {
      bg: "rgba(249,115,22,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(249,115,22,0.45)",
    };
  }

  return {
    bg: "rgba(255,255,255,0.04)",
    text: "#F7F7F5",
    subText: "rgba(247,247,245,0.72)",
    border: "rgba(255,255,255,0.16)",
  };
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[24px] w-[24px] md:h-[24px] md:w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M10 14 19 5" />
      <path d="M13 5h6v6" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[24px] w-[24px] md:h-[24px] md:w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7.5v9" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

function DashboardActionPill({
  label,
  accentColor,
  icon,
  compact = false,
}: {
  label?: string;
  accentColor?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  const actionStyle = {
    "--action-bg": accentColor ? `${accentColor}16` : "rgba(255,255,255,0.05)",
    "--action-bg-hover": accentColor ? `${accentColor}28` : "rgba(255,255,255,0.10)",
    "--action-border": accentColor ? `${accentColor}38` : "rgba(255,255,255,0.12)",
    "--action-border-hover": accentColor ? `${accentColor}70` : "rgba(255,255,255,0.22)",
    "--action-color": compact ? (accentColor ?? "rgba(255,255,255,0.82)") : "rgba(255,255,255,0.80)",
    "--action-color-hover": "#ffffff",
  } as React.CSSProperties;

  return (
    <span
      className={`inline-flex items-center justify-center border border-[color:var(--action-border)] bg-[color:var(--action-bg)] font-semibold uppercase tracking-[0.12em] text-[color:var(--action-color)] shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition duration-200 ease-out hover:-translate-y-[2px] hover:border-[color:var(--action-border-hover)] hover:bg-[color:var(--action-bg-hover)] hover:text-[color:var(--action-color-hover)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.24)] active:translate-y-0 active:scale-[0.97] ${
        compact
          ? "h-10 w-10 rounded-full px-0 md:h-9 md:w-9 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110"
          : "h-9 rounded-[16px] px-3 text-[9px]"
      }`}
      style={actionStyle}
    >
      {icon ?? label}
    </span>
  );
}

function DashboardStatCard({
  label,
  value,
  subtext,
  href,
  accentColor,
  className,
}: {
  label: string;
  value: string;
  subtext?: string;
  href?: string;
  accentColor?: string;
  className?: string;
}) {
  const card = (
    <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_34px_84px_rgba(0,0,0,0.30)]">
      <CardContent className="flex min-h-[114px] flex-col p-4 sm:min-h-[126px] sm:p-4.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-1 items-start gap-3">
            <div
              className="shrink-0 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[28px] lg:text-[31px]"
              style={{ color: accentColor ?? "var(--text)" }}
            >
              {value}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium leading-5 text-[var(--text-muted)] sm:text-[12px]">{label}</div>
              {subtext ? <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">{subtext}</div> : null}
            </div>
          </div>
          {href ? <DashboardActionPill icon={<OpenIcon />} compact accentColor={accentColor} /> : null}
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}



function AppointmentsOverviewCard({
  todayCount,
  weekCount,
  nextAppointmentLabel,
}: {
  todayCount: string;
  weekCount: string;
  nextAppointmentLabel: string;
}) {
  return (
    <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_34px_84px_rgba(0,0,0,0.30)]">
      <CardContent className="flex min-h-[114px] flex-col p-4 sm:min-h-[126px] sm:p-4.5">
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-start gap-3">
              <div className="shrink-0 text-[29px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[31px]">
                {todayCount}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium leading-5 text-[var(--text-muted)] sm:text-[12px]">Termine</div>
                <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">Heute, Woche und nächster Slot</div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-[#d6c3a3] shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition duration-200 ease-out hover:-translate-y-[2px] hover:border-white/24 hover:bg-white/[0.12] hover:shadow-[0_16px_36px_rgba(0,0,0,0.24)] active:translate-y-0 active:scale-[0.97] md:h-9 md:w-9 md:border-white/10 md:bg-white/[0.04] md:hover:border-white/20 md:hover:bg-white/[0.10] [&_*]:!shadow-none [&_button]:!m-0 [&_button]:!items-center [&_button]:!justify-center [&_button]:!rounded-full [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!p-0 [&_button]:!text-[#d6c3a3] [&_button]:!shadow-none [&_button:hover]:!bg-transparent md:[&_button]:!h-9 md:[&_button]:!w-9 [&_svg]:!h-[24px] [&_svg]:!w-[24px] md:[&_svg]:!h-[24px] md:[&_svg]:!w-[24px]]">
                <OpenCreateAppointmentButton accentColor="#d6c3a3" />
              </span>
              <Link href="/calendar" className="shrink-0" aria-label="Kalender öffnen">
                <DashboardActionPill icon={<OpenIcon />} compact accentColor="#d6c3a3" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Heute</div>
              <div className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[23px]">
                {todayCount}
              </div>
            </div>

            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Woche</div>
              <div className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[23px]">
                {weekCount}
              </div>
            </div>

            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Nächste</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight text-[var(--text)] sm:text-[12px]">
                {nextAppointmentLabel}
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Kalenderstatus</div>
                <div className="mt-1 truncate text-[11px] font-medium text-white/80 sm:text-[11px]">
                  {todayCount} heute · {weekCount} diese Woche
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-[rgba(214,195,163,0.20)] bg-[rgba(214,195,163,0.08)] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#d6c3a3]">
                Live
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerOverviewCard({
  value,
  subtext,
  newThisWeek,
  birthdaysNext7Days,
  nextBirthdayCustomerName,
  nextBirthdayCustomerHref,
  nextBirthdayLabel,
  latestCustomerName,
  latestCustomerDateLabel,
}: {
  value: string;
  subtext?: string;
  newThisWeek: string;
  birthdaysNext7Days: string;
  nextBirthdayCustomerName: string;
  nextBirthdayCustomerHref: string | null;
  nextBirthdayLabel: string;
  latestCustomerName: string;
  latestCustomerDateLabel: string;
}) {
  return (
    <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_34px_84px_rgba(0,0,0,0.30)]">
      <CardContent className="flex min-h-[114px] flex-col p-4 sm:min-h-[126px] sm:p-4.5">
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-start gap-3">
              <div className="shrink-0 text-[29px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[31px]">
                {value}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium leading-5 text-[var(--text-muted)] sm:text-[12px]">Kunden gesamt</div>
                {subtext ? <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">{subtext}</div> : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link href="/customers/new" className="shrink-0" aria-label="Neuer Kunde">
                <DashboardActionPill icon={<PlusCircleIcon />} compact accentColor="#d6c3a3" />
              </Link>

              <Link href="/customers" className="shrink-0" aria-label="Kunden öffnen">
                <DashboardActionPill icon={<OpenIcon />} compact accentColor="#d6c3a3" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Neu 7 Tage</div>
              <div className="mt-1 text-[19px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[21px]">
                {newThisWeek}
              </div>
            </div>

            {nextBirthdayCustomerHref ? (
              <Link
                href={nextBirthdayCustomerHref}
                className="group rounded-[20px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.044)_0%,rgba(255,248,240,0.014)_100%)] px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(214,195,163,0.20)] hover:bg-[rgba(214,195,163,0.055)]"
                aria-label={`Geburtstagskunden öffnen: ${nextBirthdayCustomerName}`}
              >
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Geburtstage</div>
                  <div className="mt-1 text-[19px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[21px]">
                    {birthdaysNext7Days}
                  </div>
                  <div className="mt-1.5 break-words text-[11px] font-semibold leading-tight text-white/84">
                    {nextBirthdayCustomerName}
                  </div>
                  <div className="mt-1 whitespace-nowrap text-[9px] font-medium text-[#d6c3a3]">{nextBirthdayLabel}</div>
                </div>
              </Link>
            ) : (
              <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)] backdrop-blur-md">
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Geburtstage</div>
                <div className="mt-1 text-[19px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[21px]">
                  {birthdaysNext7Days}
                </div>
                <div className="mt-1.5 break-words text-[11px] font-semibold leading-tight text-white/38">Keine fälligen Geburtstage</div>
                <div className="mt-1 whitespace-nowrap text-[9px] font-medium text-white/32">—</div>
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.12em] text-white/45">Zuletzt hinzugefügt</div>
                <div className="mt-1 truncate text-[11px] font-medium text-white/80 sm:text-[11px]">
                  {latestCustomerName}
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-[rgba(214,195,163,0.16)] bg-[rgba(214,195,163,0.08)] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {latestCustomerDateLabel}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceCreateCard({
  todayRevenueCents,
  todayReceiptCount,
  openReceiptCount,
  weekRevenueCents,
  monthRevenueCents,
  hasRecentReceipt,
  closingDateKey,
}: {
  todayRevenueCents: number;
  todayReceiptCount: number;
  openReceiptCount: number;
  weekRevenueCents: number;
  monthRevenueCents: number;
  hasRecentReceipt: boolean;
  closingDateKey: string;
}) {
  const formatMoney = (cents: number) => {
    const euros = cents / 100;
    return new Intl.NumberFormat("de-AT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(euros);
  };

  const now = new Date();

  const getIsoWeek = (date: Date) => {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const currentWeekLabel = `KW ${getIsoWeek(now)}`;
  const currentMonthLabel = new Intl.DateTimeFormat("de-AT", {
    month: "short",
    year: "numeric",
  })
    .format(now)
    .replace(".", "");

  return (
    <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,248,240,0.05)_0%,rgba(255,248,240,0.015)_100%)] shadow-[0_28px_76px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_36px_88px_rgba(0,0,0,0.30)] lg:col-span-2 xl:col-span-2 2xl:col-span-2">
      <CardContent className="flex min-h-[114px] flex-col p-4 sm:min-h-[126px] sm:p-4.5">
        <div className="flex h-full flex-col gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[var(--text-muted)] sm:text-[14px]">Rechnungen</div>
              <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">
                Abrechnen, prüfen und direkt weitermachen
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link href="/dashboard?invoice=1" className="shrink-0" aria-label="Neue Rechnung">
                <DashboardActionPill icon={<PlusCircleIcon />} compact accentColor="#d6c3a3" />
              </Link>

              <Link href="/rechnungen" className="shrink-0" aria-label="Belege öffnen">
                <DashboardActionPill icon={<OpenIcon />} compact accentColor="#d6c3a3" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 sm:gap-2.5">
            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-2.5 py-3 sm:px-3.5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[8px] uppercase tracking-[0.12em] text-white/45 sm:text-[9px]">Heute</div>
              <div className="mt-1 text-[13px] font-semibold text-white sm:text-[14px]">{formatMoney(todayRevenueCents)}</div>
              <div className="mt-0.5 text-[8px] text-white/40 sm:text-[9px]">{todayReceiptCount} Belege</div>
            </div>

            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-2.5 py-3 sm:px-3.5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[8px] uppercase tracking-[0.12em] text-white/45 sm:text-[9px]">Woche</div>
              <div className="mt-1 text-[13px] font-semibold text-white sm:text-[14px]">{formatMoney(weekRevenueCents)}</div>
              <div className="mt-0.5 text-[8px] text-white/40 sm:text-[9px]">{currentWeekLabel}</div>
            </div>

            <div className="rounded-[20px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.012)_100%)] backdrop-blur-md px-2.5 py-3 sm:px-3.5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="text-[8px] uppercase tracking-[0.12em] text-white/45 sm:text-[9px]">Monat</div>
              <div className="mt-1 text-[13px] font-semibold text-white sm:text-[14px]">{formatMoney(monthRevenueCents)}</div>
              <div className="mt-0.5 text-[8px] text-white/40 sm:text-[9px]">{currentMonthLabel}</div>
            </div>
          </div>

          <div className="mt-auto pt-3 space-y-1.5">
            <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-4">
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=day`}
                className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:-translate-y-[1px] hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                Tagesabschluss
              </Link>
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=month`}
                className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:-translate-y-[1px] hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                Monatsabschluss
              </Link>
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=year`}
                className="hidden sm:inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:-translate-y-[1px] hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                Jahresabschluss
              </Link>
              <Link
                href="/dashboard?invoice=1"
                className="hidden sm:inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-[14px] bg-[linear-gradient(180deg,#d8c19f_0%,#cfb289_100%)] px-3 text-[13px] font-medium text-[#1b140f] shadow-[0_10px_28px_rgba(214,195,163,0.24)] transition hover:brightness-[1.03]"
              >
                + Rechnung
              </Link>
            </div>

            {openReceiptCount > 0 ? (
              <Link
                href="/rechnungen?filter=open"
                className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:-translate-y-[1px] hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                Offen prüfen ({openReceiptCount})
              </Link>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function resolveStorageAvatarUrl(raw: string | null | undefined, admin: ReturnType<typeof supabaseAdmin>) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, "").replace(/^avatars\//i, "");
  const { data } = admin.storage.from("avatars").getPublicUrl(normalized);
  return data?.publicUrl ?? null;
}


function getProfileAvatarTheme(name: string | null | undefined, avatarRingColor: string | null | undefined) {
  const custom = String(avatarRingColor ?? "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(custom)) {
    const hex = custom.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return {
      border: custom,
      bg: `rgba(${r}, ${g}, ${b}, 0.16)`,
    };
  }

  return tenantTheme(name ?? "");
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  let fullName: string | null = null;
  let tenantDisplayName: string | null = null;
  let creatorTenantId: string | null = null;
  let effectiveCustomerTenantId: string | null = null;
  let role: string = "PRACTITIONER";
  let avatarUrl: string | null = null;
  let avatarRingColor: string | null = null;
  let effectiveReminderTenantId: string | null = null;
  let isAdmin = false;
  let googleStatusLabel = "Getrennt";
  let googleStatusConnected = false;
  let selectedStudioLabel = "Kein verbundener Schreibkalender";
  let activeCalendarCount = 0;
  let extraCalendarLabel = "0 aktiv";
  let lastSyncLabel = "—";
  let isDemoMode = false;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, avatar_path, tenant_id, calendar_tenant_id, role, avatar_ring_color")
      .eq("user_id", user.id)
      .maybeSingle();

    fullName = profile?.full_name ?? null;
    role = profile?.role ?? "PRACTITIONER";
    isAdmin = role === "ADMIN";

    avatarUrl = resolveStorageAvatarUrl(profile?.avatar_path ?? null, admin);
    avatarRingColor = profile?.avatar_ring_color ?? null;

    effectiveCustomerTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    effectiveReminderTenantId = effectiveCustomerTenantId;
    creatorTenantId = profile?.calendar_tenant_id ?? profile?.tenant_id ?? null;
    isDemoMode = isDemoTenantId(effectiveCustomerTenantId) || isDemoTenantId(creatorTenantId) || isDemoTenantId(profile?.tenant_id ?? null);

    const profileTenantForDisplay =
      profile?.role === "ADMIN"
        ? profile?.tenant_id ?? null
        : profile?.calendar_tenant_id ?? profile?.tenant_id ?? null;

    if (profileTenantForDisplay) {
      const { data: tenant } = await admin
        .from("tenants")
        .select("display_name")
        .eq("id", profileTenantForDisplay)
        .maybeSingle();

      tenantDisplayName = tenant?.display_name ?? null;
    }

    const [{ data: tokenRow }, { data: connectionRows }] = await Promise.all([
      admin
        .from("google_oauth_tokens")
        .select("default_calendar_id, enabled_calendar_ids, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("google_oauth_connections")
        .select(
          "id, connection_label, google_account_email, google_account_name, connection_type, is_primary, is_read_only, is_active, default_calendar_id, enabled_calendar_ids, created_at, updated_at"
        )
        .eq("owner_user_id", user.id)
        .order("updated_at", { ascending: false }),
    ]);

    const connections = (Array.isArray(connectionRows) ? connectionRows : []) as GoogleConnectionRow[];
    const activeConnections = connections.filter((row) => row.is_active === true);
    const writableConnections = activeConnections.filter((row) => row.is_read_only !== true);
    const primaryWritableConnection =
      writableConnections.find((row) => row.is_primary) ?? writableConnections[0] ?? null;

    const connectionEnabledCalendarIds = uniqueCalendarIds(
      ...activeConnections.map((row) => row.enabled_calendar_ids ?? [])
    );
    const enabledCalendarIds = uniqueCalendarIds(
      (tokenRow as any)?.enabled_calendar_ids ?? [],
      connectionEnabledCalendarIds
    );

    const defaultCalendarId =
      String((tokenRow as any)?.default_calendar_id ?? "").trim() ||
      activeConnections
        .map((row) => String(row.default_calendar_id ?? "").trim())
        .find(Boolean) ||
      STUDIO_TARGETS[0].calendarId;

    const connectedStudioIds = new Set<string>(
      STUDIO_TARGETS.filter((target) =>
        activeConnections.some((row) => {
          const email = String(row.google_account_email ?? "").trim().toLowerCase();
          const label = String(row.connection_label ?? "").trim().toLowerCase();
          const connectionDefault = String(row.default_calendar_id ?? "").trim().toLowerCase();
          return (
            email === target.calendarId.toLowerCase() ||
            label === target.label.toLowerCase() ||
            label === `${target.label.split(" ")[1] ?? ""} studio`.toLowerCase() ||
            connectionDefault === target.calendarId.toLowerCase()
          );
        })
      ).map((target) => target.calendarId)
    );

    const activeCalendarIds = activeConnections.length > 0
      ? uniqueCalendarIds(Array.from(connectedStudioIds), enabledCalendarIds)
      : [];
    const enabledExtraIds = activeCalendarIds.filter((id) => !STUDIO_TARGET_IDS.has(id));

    googleStatusConnected = activeConnections.length > 0;
    googleStatusLabel = googleStatusConnected ? "Verbunden" : "Getrennt";

    const selectedStudioTarget = STUDIO_TARGETS.find((target) => target.calendarId === defaultCalendarId) ?? null;
    selectedStudioLabel = selectedStudioTarget?.label ?? "Kein verbundener Schreibkalender";
    activeCalendarCount = activeCalendarIds.length;
    extraCalendarLabel = isAdmin ? `${enabledExtraIds.length} aktiv` : "Nur Admin";
    lastSyncLabel = formatDateTime((tokenRow as any)?.updated_at ?? primaryWritableConnection?.updated_at ?? null);
  }

  const tenantsQuery = admin
    .from("tenants")
    .select("id, display_name")
    .order("display_name", { ascending: true });

  const legendUsersQuery = admin
    .from("user_profiles")
    .select("user_id, tenant_id, calendar_tenant_id, full_name, role, avatar_path, avatar_ring_color");

  const [{ data: tenantsRaw }, { data: userProfilesRaw }] = await Promise.all([
    tenantsQuery,
    legendUsersQuery,
  ]);

  const tenantRows = (tenantsRaw ?? []) as TenantRow[];
  const calendarTenantRows = isDemoMode
    ? tenantRows.filter((tenant) => tenant.id === CLIENTIQUE_DEMO_TENANT_ID)
    : tenantRows;

  const tenantNameById = new Map<string, string>();
  for (const t of tenantRows) {
    tenantNameById.set(t.id, t.display_name ?? "Behandler");
  }

  const legendUsers: LegendUser[] = Array.from(
    new Map(
      (userProfilesRaw ?? [])
        .filter((p) => !!p.user_id && !!(p.calendar_tenant_id || p.tenant_id))
        .map((p) => {
          const rawTenantId = String((p.tenant_id as string | null) ?? "").trim();
          const rawCalendarTenantId = String((p.calendar_tenant_id as string | null) ?? "").trim();
          const resolvedTenantId = rawCalendarTenantId || rawTenantId;

          return [
            String(p.user_id),
            {
              tenantId: rawTenantId || resolvedTenantId,
              filterTenantId: resolvedTenantId,
              userId: p.user_id as string,
              fullName: (p.full_name as string | null) ?? null,
              tenantDisplayName:
                tenantNameById.get(resolvedTenantId) ??
                tenantNameById.get(rawTenantId) ??
                "Behandler",
              avatarUrl: resolveStorageAvatarUrl((p as any).avatar_path ?? null, admin),
              avatarRingColor: (p as any).avatar_ring_color ?? null,
            } satisfies LegendUser,
          ] as const;
        })
    ).values()
  );

  const calendarLegendUsers = isDemoMode
    ? legendUsers.filter((entry) => entry.filterTenantId === CLIENTIQUE_DEMO_TENANT_ID || entry.tenantId === CLIENTIQUE_DEMO_TENANT_ID)
    : legendUsers;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const startOfWeek = new Date(startOfToday);
  const weekday = startOfWeek.getDay();
  const diffToMonday = (weekday + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const closingDateKey = now.toISOString().slice(0, 10);

  let todayCountQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("start_at", startOfToday.toISOString())
    .lt("start_at", endOfToday.toISOString());

  if (isDemoMode) {
    todayCountQuery = todayCountQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    todayCountQuery = todayCountQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let weekCountQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("start_at", startOfWeek.toISOString())
    .lt("start_at", endOfWeek.toISOString());

  if (isDemoMode) {
    weekCountQuery = weekCountQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    weekCountQuery = weekCountQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let nextAppointmentQuery = supabase
    .from("appointments")
    .select("id, start_at, tenant_id, notes_internal")
    .gte("start_at", now.toISOString())
    .order("start_at", { ascending: true })
    .limit(16);

  if (isDemoMode) {
    nextAppointmentQuery = nextAppointmentQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    nextAppointmentQuery = nextAppointmentQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const customersCountQuery =
    isAdmin || !effectiveCustomerTenantId
      ? admin.from("customer_profiles").select("id", { count: "exact", head: true })
      : admin
          .from("customer_profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", effectiveCustomerTenantId);

  const servicesCardTenantId =
    role === "ADMIN" ? null : creatorTenantId ?? effectiveCustomerTenantId ?? null;
  const servicesCardTenantName =
    role === "ADMIN"
      ? "Alle Behandler"
      : (servicesCardTenantId ? tenantNameById.get(servicesCardTenantId) : null) ??
        tenantDisplayName ??
        "Behandler";

  const activeServicesCountQuery =
    isAdmin
      ? admin.from("services").select("id", { count: "exact", head: true }).eq("is_active", true)
      : admin
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", servicesCardTenantId ?? effectiveCustomerTenantId ?? "")
          .eq("is_active", true);

  let reminderCountQuery = admin
    .from("appointments")
    .select(`
      id,
      start_at,
      reminder_at,
      reminder_sent_at,
      notes_internal
    `)
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", now.toISOString());

  if (isDemoMode) {
    reminderCountQuery = reminderCountQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    reminderCountQuery = reminderCountQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const slotsWindowEnd = new Date(startOfToday);
  slotsWindowEnd.setDate(slotsWindowEnd.getDate() + 90);

  let receiptsQuery = admin
    .from("fiscal_receipts")
    .select("id, status, turnover_value_cents, issued_at, created_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (isDemoMode) {
    receiptsQuery = receiptsQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    receiptsQuery = receiptsQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let openSlotsQuery = admin
    .from("appointment_open_slots")
    .select("id, appointment_id, tenant_id, start_at, end_at, status, created_at")
    .eq("status", "open")
    // Freie Slots sollen sichtbar bleiben, solange das Zeitfenster noch nicht vorbei ist.
    .gte("end_at", now.toISOString())
    .lt("start_at", slotsWindowEnd.toISOString())
    .order("start_at", { ascending: true });

  // Admin sieht alle freien Slots. Normale Benutzer sehen nur ihren Tenant.
  if (isDemoMode) {
    openSlotsQuery = openSlotsQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    openSlotsQuery = openSlotsQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let activeWaitlistQuery = admin
    .from("appointment_waitlist")
    .select(`
      id,
      tenant_id,
      customer_profile_id,
      person_id,
      service_title,
      priority,
      short_notice_ok,
      reachable_today,
      requested_recently_at,
      status,
      created_at
    `);

  // Admin sieht alle aktiven Wartelisten-Einträge. Normale Benutzer sehen nur ihren Tenant.
  if (isDemoMode) {
    activeWaitlistQuery = activeWaitlistQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  } else if (!isAdmin && effectiveReminderTenantId) {
    activeWaitlistQuery = activeWaitlistQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let calendarServicesQuery = admin
    .from("services")
    .select("id, tenant_id, name, duration_minutes, buffer_minutes, default_price_cents, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (isDemoMode) {
    calendarServicesQuery = calendarServicesQuery.eq("tenant_id", CLIENTIQUE_DEMO_TENANT_ID);
  }

  const dashboardCustomersBaseQuery = admin
    .from("customer_profiles")
    .select(`
      id,
      tenant_id,
      person_id,
      created_at,
      person:persons (
        id,
        full_name,
        phone,
        email,
        birthday
      ),
      tenant:tenants (
        id,
        display_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(600);

  const dashboardCustomersQuery =
    isAdmin || !effectiveCustomerTenantId
      ? dashboardCustomersBaseQuery
      : dashboardCustomersBaseQuery.eq("tenant_id", effectiveCustomerTenantId);

  const [
    todayCountResult,
    weekCountResult,
    customersCountResult,
    nextAppointmentResult,
    activeServicesCountResult,
    reminderCountResult,
    openSlotsResult,
    activeWaitlistResult,
    calendarServicesResult,
    dashboardCustomersResult,
    receiptsResult,
  ] = await Promise.all([
    todayCountQuery,
    weekCountQuery,
    customersCountQuery,
    nextAppointmentQuery,
    activeServicesCountQuery,
    reminderCountQuery,
    openSlotsQuery,
    activeWaitlistQuery,
    calendarServicesQuery,
    dashboardCustomersQuery,
    receiptsQuery,
  ]);

  const openSlots = (openSlotsResult.data ?? []) as OpenSlotRow[];
  const activeWaitlistRows = ((activeWaitlistResult.data ?? []) as {
    id: string;
    tenant_id: string;
    customer_profile_id: string | null;
    person_id: string | null;
    service_title: string | null;
    priority: string | null;
    short_notice_ok: boolean | null;
    reachable_today: boolean | null;
    requested_recently_at: string | null;
    status: string | null;
    created_at: string;
  }[]).filter((row) => String(row.status ?? "active").toLowerCase() === "active");

  const calendarServices = (calendarServicesResult.data ?? []) as CalendarServiceRow[];

  const dashboardCustomerRows = (dashboardCustomersResult.data ?? []) as DashboardCustomerRow[];

  const dashboardCustomers = dashboardCustomerRows
    .map((row) => {
      const tenantId = String(row.tenant_id ?? "").trim();
      if (!tenantId) return null;

      const person = firstJoin(row.person);

      const displayName =
        String(person?.full_name ?? "").trim() ||
        "Kunde";

      return {
        id: String(row.id),
        tenantId,
        displayName,
        phone: String(person?.phone ?? "").trim() || null,
        email: String(person?.email ?? "").trim() || null,
      } satisfies DashboardCustomerOption;
    })
    .filter(Boolean) as DashboardCustomerOption[];

  const fiscalReceipts = (receiptsResult.data ?? []) as FiscalReceiptRow[];

  const waitlistCustomerProfileIds = Array.from(
    new Set(
      activeWaitlistRows
        .map((row) => String(row.customer_profile_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const waitlistPersonIds = Array.from(
    new Set(
      activeWaitlistRows
        .map((row) => String(row.person_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const { data: waitlistProfilesRaw } =
    waitlistCustomerProfileIds.length === 0
      ? { data: [] as unknown[] }
      : await admin
          .from("customer_profiles")
          .select(`
            id,
            person_id,
            tenant_id,
            person:persons (
              full_name,
              phone
            )
          `)
          .in("id", waitlistCustomerProfileIds);

  const { data: waitlistPersonsRaw } =
    waitlistPersonIds.length === 0
      ? { data: [] as unknown[] }
      : await admin.from("persons").select("id, full_name, phone").in("id", waitlistPersonIds);

  const waitlistProfileMap = new Map<
    string,
    { customerName: string; phone: string | null; personId: string | null; tenantId: string | null }
  >();
  const customerProfileByTenantAndPerson = new Map<string, string>();
  const personMap = new Map<string, { customerName: string; phone: string | null }>();

  for (const raw of (waitlistPersonsRaw ?? []) as {
    id: string;
    full_name: string | null;
    phone: string | null;
  }[]) {
    personMap.set(String(raw.id), {
      customerName: String(raw.full_name ?? "").trim() || "Kunde",
      phone: String(raw.phone ?? "").trim() || null,
    });
  }

  for (const raw of (waitlistProfilesRaw ?? []) as {
    id: string;
    person_id: string | null;
    tenant_id: string | null;
    person?:
      | { full_name: string | null; phone: string | null }
      | { full_name: string | null; phone: string | null }[]
      | null;
  }[]) {
    const person = firstJoin(raw.person);
    const personId = String(raw.person_id ?? "").trim() || null;
    const tenantId = String(raw.tenant_id ?? "").trim() || null;
    waitlistProfileMap.set(String(raw.id), {
      customerName: String(person?.full_name ?? "").trim() || "Kunde",
      phone: String(person?.phone ?? "").trim() || null,
      personId,
      tenantId,
    });

    if (personId && tenantId) {
      customerProfileByTenantAndPerson.set(`${tenantId}::${personId}`, String(raw.id));
    }
  }

  const reminderRows = (reminderCountResult.data ?? []) as ReminderCountRow[];
  const reminderCount = reminderRows.filter((row) => {
    const status = parseStatus(row.notes_internal);
    if (status === "cancelled" || status === "completed" || status === "no_show") return false;

    const startAt = row.start_at ? new Date(row.start_at) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) return false;

    return startAt.getTime() >= Date.now();
  }).length;

  const nextAppointmentRows = (nextAppointmentResult.data ?? []) as NextAppointmentRow[];
  const nextAppointment = nextAppointmentRows.find((row) => {
    const status = parseStatus(row.notes_internal);
    return status !== "cancelled" && status !== "completed" && status !== "no_show";
  }) ?? null;
  const nextAppointmentLabel = formatNextAppointmentLabel(nextAppointment?.start_at);

  const todayCount = todayCountResult.count ?? 0;
  const weekCount = weekCountResult.count ?? 0;
  const customersCount = customersCountResult.count ?? 0;

  const todayReceiptCount = fiscalReceipts.filter((row) => {
    const issued = row.issued_at ?? row.created_at;
    const date = new Date(issued);
    return date >= startOfToday && date < endOfToday;
  }).length;

  const todayRevenueCents = fiscalReceipts.reduce((sum, row) => {
    const issued = row.issued_at ?? row.created_at;
    const date = new Date(issued);
    if (date >= startOfToday && date < endOfToday) {
      return sum + (row.turnover_value_cents ?? 0);
    }
    return sum;
  }, 0);

  const weekRevenueCents = fiscalReceipts.reduce((sum, row) => {
    const issued = row.issued_at ?? row.created_at;
    const date = new Date(issued);
    if (date >= startOfWeek && date < endOfWeek) {
      return sum + (row.turnover_value_cents ?? 0);
    }
    return sum;
  }, 0);

  const monthRevenueCents = fiscalReceipts.reduce((sum, row) => {
    const issued = row.issued_at ?? row.created_at;
    const date = new Date(issued);
    if (date >= startOfMonth && date < endOfMonth) {
      return sum + (row.turnover_value_cents ?? 0);
    }
    return sum;
  }, 0);

  const openReceiptCount = fiscalReceipts.filter((row) => {
    const status = String(row.status ?? "").toUpperCase();
    return status === "CREATED" || status === "PENDING" || status === "DRAFT";
  }).length;

  const hasRecentReceipt = fiscalReceipts.length > 0;

  const activeWaitlistCountByTenant = new Map<string, number>();
  const immediateCandidateCountByTenant = new Map<string, number>();
  for (const row of activeWaitlistRows) {
    const tenantId = String(row.tenant_id ?? "");
    if (!tenantId) continue;
    activeWaitlistCountByTenant.set(tenantId, (activeWaitlistCountByTenant.get(tenantId) ?? 0) + 1);

    if (immediateCandidateScore(row) >= 8) {
      immediateCandidateCountByTenant.set(
        tenantId,
        (immediateCandidateCountByTenant.get(tenantId) ?? 0) + 1
      );
    }
  }

  const displayName = fullName ?? user?.email ?? "Benutzer";

  const openSlotItems: OpenSlotDisplayItem[] = openSlots.map((slot) => ({
    id: slot.id,
    appointmentId: slot.appointment_id,
    tenantId: slot.tenant_id,
    tenantName: tenantNameById.get(slot.tenant_id) ?? "Behandler",
    startAt: slot.start_at,
    endAt: slot.end_at,
    waitlistCount: activeWaitlistCountByTenant.get(slot.tenant_id) ?? 0,
    immediateCount: immediateCandidateCountByTenant.get(slot.tenant_id) ?? 0,
  }));

  const waitlistItems: WaitlistDashboardItem[] = activeWaitlistRows
    .map((row) => {
      const rawProfileId = String(row.customer_profile_id ?? "").trim() || null;
      const profileInfo = rawProfileId ? waitlistProfileMap.get(rawProfileId) : undefined;
      const personId = String(row.person_id ?? "").trim() || profileInfo?.personId || null;
      const resolvedProfileId =
        rawProfileId && waitlistProfileMap.has(rawProfileId)
          ? rawProfileId
          : personId
            ? customerProfileByTenantAndPerson.get(`${row.tenant_id}::${personId}`) ?? null
            : null;
      const personInfo = personId ? personMap.get(personId) : undefined;

      return {
        id: row.id,
        customerProfileId: resolvedProfileId,
        tenantId: row.tenant_id,
        tenantName: tenantNameById.get(row.tenant_id) ?? "Behandler",
        customerName: profileInfo?.customerName ?? personInfo?.customerName ?? "Kunde",
        phone: profileInfo?.phone ?? personInfo?.phone ?? null,
        serviceTitle: row.service_title ?? null,
        priority: row.priority ?? null,
        shortNoticeOk: Boolean(row.short_notice_ok),
        reachableToday: Boolean(row.reachable_today),
        requestedRecentlyAt: row.requested_recently_at ?? null,
        createdAt: row.created_at,
        profileExists: Boolean(resolvedProfileId),
      };
    })
    .sort((a, b) => {
      const scoreDiff =
        immediateCandidateScore({
          short_notice_ok: b.shortNoticeOk,
          reachable_today: b.reachableToday,
          requested_recently_at: b.requestedRecentlyAt,
        }) -
        immediateCandidateScore({
          short_notice_ok: a.shortNoticeOk,
          reachable_today: a.reachableToday,
          requested_recently_at: a.requestedRecentlyAt,
        });

      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const newCustomers7Days = dashboardCustomerRows.filter((row) => {
    if (!row.created_at) return false;
    const createdAt = new Date(row.created_at);
    return !Number.isNaN(createdAt.getTime()) && isDateWithinNextDays(createdAt, 6);
  }).length;

  const birthdayCandidates = dashboardCustomerRows
    .map((row) => {
      const person = firstJoin(row.person);
      const nextBirthday = getNextBirthdayDate(person?.birthday ?? null);
      if (!nextBirthday || !isDateWithinNextDays(nextBirthday, 6)) return null;

      return {
        customerProfileId: row.id,
        customerName: String(person?.full_name ?? "").trim() || "Unbenannter Kunde",
        nextBirthday,
      };
    })
    .filter((x): x is { customerProfileId: string; customerName: string; nextBirthday: Date } => Boolean(x))
    .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime() || a.customerName.localeCompare(b.customerName));

  const birthdaysNext7Days = birthdayCandidates.length;
  const nextBirthdayCustomer = birthdayCandidates[0] ?? null;
  const nextBirthdayCustomerHref = nextBirthdayCustomer ? `/customers/${nextBirthdayCustomer.customerProfileId}` : null;
  const nextBirthdayCustomerName = nextBirthdayCustomer?.customerName ?? "Keine fälligen Geburtstage";
  const nextBirthdayLabel = formatBirthdayDueLabel(nextBirthdayCustomer?.nextBirthday ?? null);

  const latestCustomerRow = dashboardCustomerRows[0] ?? null;
  const latestCustomerPerson = firstJoin(latestCustomerRow?.person ?? null);
  const latestCustomerName =
    String(latestCustomerPerson?.full_name ?? "").trim() || "Kein neuer Kunde";
  const latestCustomerDateLabel = formatCompactCustomerDate(latestCustomerRow?.created_at ?? null);

  const currentDateLabel = formatShortDate(now);
  const currentTimeLabel = formatCurrentTime(now);
  const profileTheme = getProfileAvatarTheme(fullName ?? tenantDisplayName ?? displayName, avatarRingColor);

  return (
    <div className="space-y-5 lg:space-y-8">
      <section>
        <Card className="overflow-hidden border-[rgba(255,255,255,0.03)] bg-[linear-gradient(180deg,rgba(255,250,244,0.038)_0%,rgba(255,248,240,0.010)_100%)] shadow-[0_24px_68px_rgba(0,0,0,0.18)] backdrop-blur-[22px]">
          <CardContent className="px-1.5 py-2.5 sm:p-4.5 md:p-6.5 xl:p-7.5">
            <div className="relative hidden overflow-hidden rounded-[26px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(135deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.015)_42%,rgba(255,248,240,0.006)_100%)] p-5.5 shadow-[0_18px_42px_rgba(0,0,0,0.12)] backdrop-blur-[22px] sm:p-6.5 md:block md:p-7.5">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-8 top-2 h-40 w-40 rounded-full bg-[rgba(214,195,163,0.10)] blur-3xl" />
              <div className="absolute right-14 top-8 h-28 w-28 rounded-full bg-[rgba(160,122,82,0.10)] blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-24 w-1/3 rounded-full bg-[rgba(255,255,255,0.03)] blur-2xl" />
            </div>
              <div className="relative z-10 hidden md:grid md:grid-cols-[120px_minmax(0,1fr)_244px] md:items-start md:gap-x-7 md:gap-y-5">
                <Link
                  href="/profile"
                  className="hidden md:flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-[22px] border-[4px] shadow-[0_0_0_2px_rgba(11,11,12,0.9)] transition hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_rgba(11,11,12,0.9),0_14px_28px_rgba(0,0,0,0.24)]"
                  style={{ borderColor: profileTheme.border, background: profileTheme.bg }}
                  aria-label="Zum Profil"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Benutzerfoto"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-lg font-extrabold text-white/90">
                      {getNameInitials(fullName)}
                    </div>
                  )}
                </Link>

                <div className="min-w-0 pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    Magnifique Beauty Institut Dashboard
                  </div>
                  <div className="mt-2 break-words text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--text)] xl:text-[32px]">
                    {displayName}
                  </div>
                </div>

                <div className="hidden rounded-[22px] border border-[rgba(255,255,255,0.035)] bg-[linear-gradient(180deg,rgba(255,250,244,0.040)_0%,rgba(255,248,240,0.012)_100%)] px-5.5 py-5 shadow-[0_14px_30px_rgba(0,0,0,0.12)] backdrop-blur-[20px] xl:block">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Heute</div>
                  <div className="mt-2.5 text-[15px] font-semibold text-[var(--text)] sm:text-[18px]">{currentDateLabel}</div>
                  <div className="mt-1.5 text-[13px] text-[var(--primary)] sm:text-[15px]">{currentTimeLabel} Uhr</div>
                </div>

                <details className="group col-start-1 row-start-2 w-fit max-w-[calc(100vw-180px)] rounded-[20px] border border-[rgba(214,195,163,0.12)] bg-[linear-gradient(180deg,rgba(255,248,240,0.05)_0%,rgba(255,248,240,0.028)_100%)] shadow-[0_12px_30px_rgba(0,0,0,0.12)] backdrop-blur-[18px]">
                  <summary className="list-none cursor-pointer px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Google Kalender</span>
                      <span
                        className={googleStatusConnected
                          ? "inline-flex h-7 items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-200"
                          : "inline-flex h-7 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-semibold text-amber-200"}
                      >
                        {googleStatusLabel}
                      </span>
                      <Link
                        href="/calendar/google"
                        className="inline-flex h-9 shrink-0 items-center rounded-[14px] border border-white/10 bg-white/[0.04] px-3 text-[13px] font-semibold text-white/92 transition hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        Google öffnen
                      </Link>

                      <span className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition group-open:rotate-180">
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m5 8 5 5 5-5" />
                        </svg>
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-[rgba(214,195,163,0.10)] px-4 pb-3.5 pt-3">
                    <div className="grid gap-2.5 text-[13px] sm:text-[14px]">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-[var(--text-muted)]">Schreibkalender</span>
                        <span className="font-medium text-[var(--text)]">{selectedStudioLabel}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-[var(--text-muted)]">Aktive Kalender</span>
                        <span className="font-medium text-[var(--text)]">{activeCalendarCount}</span>
                        <span className="text-[var(--text-muted)]">Zusatzkalender</span>
                        <span className="font-medium text-[var(--text)]">{extraCalendarLabel}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-[var(--text-muted)]">Zuletzt aktualisiert</span>
                        <span className="font-medium text-[var(--text)]">{lastSyncLabel}</span>
                      </div>
                    </div>
                  </div>
                </details>
              </div>

              <div className="hidden md:hidden">
            </div>
            </div>

            <div className="hidden md:hidden">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] border-[2px] shadow-[0_0_0_2px_rgba(11,11,12,0.9)]"
                  style={{ borderColor: profileTheme.border, background: profileTheme.bg }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Benutzerfoto"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-[8px] font-extrabold text-white/90">
                      {getNameInitials(fullName)}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                    Magnifique Beauty Institut Dashboard
                  </div>
                  <div className="mt-1.5 break-words text-[24px] font-semibold leading-none tracking-tight text-[var(--text)]">
                    {displayName}
                  </div>

                </div>
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:mt-5.5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
              <InvoiceCreateCard
                todayRevenueCents={todayRevenueCents}
                todayReceiptCount={todayReceiptCount}
                openReceiptCount={openReceiptCount}
                weekRevenueCents={weekRevenueCents}
                monthRevenueCents={monthRevenueCents}
                hasRecentReceipt={hasRecentReceipt}
                closingDateKey={closingDateKey}
              />

              <AppointmentsOverviewCard todayCount={String(todayCount)} weekCount={String(weekCount)} nextAppointmentLabel={nextAppointmentLabel} />
              <CustomerOverviewCard
                value={String(customersCount)}
                subtext="Gespeicherte Profile"
                newThisWeek={String(newCustomers7Days)}
                birthdaysNext7Days={String(birthdaysNext7Days)}
                nextBirthdayCustomerName={nextBirthdayCustomerName}
                nextBirthdayCustomerHref={nextBirthdayCustomerHref}
                nextBirthdayLabel={nextBirthdayLabel}
                latestCustomerName={latestCustomerName}
                latestCustomerDateLabel={latestCustomerDateLabel}
              />

              <DashboardServicesCard
                activeCount={activeServicesCountResult?.count ?? 0}
                tenantId={servicesCardTenantId}
                tenantName={servicesCardTenantName}
                isAdmin={isAdmin}
                tenantOptions={tenantRows.map((tenant) => ({
                  id: tenant.id,
                  displayName: tenant.display_name ?? "Behandler",
                }))}
              />

              <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_34px_84px_rgba(0,0,0,0.30)]">
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-1 items-start gap-3">
                      <div
                        className="shrink-0 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[28px] lg:text-[31px]"
                        style={{ color: waitlistItems.length === 0 ? "#34d399" : "#a855f7" }}
                      >
                        {String(waitlistItems.length)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium leading-5 text-[var(--text-muted)] sm:text-[12px]">Aktive Warteliste</div>
                        <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">Kunden warten</div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link href="/dashboard?openWaitlist=1&waitlistAdd=1" className="shrink-0" aria-label="Kunden zur Warteliste hinzufügen">
                        <DashboardActionPill icon={<PlusCircleIcon />} compact accentColor="#a855f7" />
                      </Link>

                      <Link href="/dashboard?openWaitlist=1" className="shrink-0" aria-label="Warteliste öffnen">
                        <DashboardActionPill icon={<OpenIcon />} compact accentColor="#a855f7" />
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>

<DashboardStatCard
  label="Freie Termine"
  value={String(openSlots.length)}
  subtext="Kurzfristig frei"
  href="/dashboard?openSlots=1"
  accentColor={openSlots.length === 0 ? "#34d399" : "#fb923c"}
  className="min-h-[176px] p-3.5 sm:min-h-0 sm:p-4"
/>

<DashboardStatCard
  label="Reminder"
  value={String(reminderCount)}
  subtext="Offene Reminder"
  href="/dashboard?openReminders=1"
  accentColor={reminderCount === 0 ? "#34d399" : "#fb923c"}
  className="p-3.5 sm:p-4"
/>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="dashboard-calendar-card" className="scroll-mt-[108px]">
        <DashboardCalendarCardClient
          tenants={calendarTenantRows}
          legendUsers={calendarLegendUsers}
          services={calendarServices}
          creatorTenantId={creatorTenantId}
          isAdmin={isAdmin}
        />
      </section>

      <OpenSlotsSlideover items={openSlotItems} />
      <WaitlistSlideover items={waitlistItems} />
      <DashboardInvoiceSlideover
        tenants={calendarTenantRows.map((tenant) => ({
          id: tenant.id,
          displayName: tenant.display_name ?? "Behandler",
        }))}
        services={calendarServices.map((service) => ({
          id: service.id,
          tenantId: service.tenant_id,
          name: service.name,
          defaultPriceCents: service.default_price_cents ?? null,
        }))}
        customers={dashboardCustomers}
        selectedTenantId={servicesCardTenantId ?? effectiveCustomerTenantId ?? ""}
        currentUserName={displayName}
        currentTenantName={tenantDisplayName ?? servicesCardTenantName}
        isAdmin={isAdmin}
      />
    </div>
  );
}
