import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import DashboardCalendarCardClient from "@/components/calendar/DashboardCalendarCardClient";
import OpenSlotsSlideover from "@/components/dashboard/OpenSlotsSlideover";
import WaitlistSlideover from "@/components/dashboard/WaitlistSlideover";
import DashboardServicesCard from "@/components/dashboard/DashboardServicesCard";
import DashboardInvoiceSlideover from "@/components/dashboard/DashboardInvoiceSlideover";
import OpenCreateAppointmentButton from "@/components/dashboard/OpenCreateAppointmentButton";

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
};

type ReminderCountRow = {
  id: string;
  reminder_at: string | null;
  reminder_sent_at: string | null;
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
    <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M10 14 19 5" />
      <path d="M13 5h6v6" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7" />
      <path d="M8.5 12h7" />
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
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[16px] border ${
        compact ? "h-9 w-9 px-0 sm:h-10 sm:w-10" : "h-9 px-3 text-[10px] sm:h-10 sm:px-4 sm:text-[11px]"
      } font-semibold uppercase tracking-[0.12em]`}
      style={{
        color: accentColor ?? "var(--primary)",
        backgroundColor: accentColor ? `${accentColor}14` : "var(--accent-soft)",
        borderColor: accentColor ? `${accentColor}30` : "rgba(214,195,163,0.24)",
      }}
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
}: {
  label: string;
  value: string;
  subtext?: string;
  href?: string;
  accentColor?: string;
}) {
  const card = (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="flex min-h-[132px] flex-col p-4 sm:min-h-[144px] sm:p-5">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-5 text-[var(--text-muted)] sm:text-[15px]">{label}</div>
              {subtext ? <div className="mt-1 text-xs leading-5 text-white/45 sm:text-[13px]">{subtext}</div> : null}
            </div>
            {href ? <DashboardActionPill icon={<OpenIcon />} compact accentColor={accentColor} /> : null}
          </div>

          <div
            className="text-[32px] font-semibold leading-none tracking-tight sm:text-[36px] lg:text-[40px]"
            style={{ color: accentColor ?? "var(--text)" }}
          >
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}



function AppointmentsOverviewCard({
  todayCount,
  weekCount,
}: {
  todayCount: string;
  weekCount: string;
}) {
  return (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="flex min-h-[132px] flex-col p-4 sm:min-h-[144px] sm:p-5">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-5 text-[var(--text-muted)] sm:text-[15px]">Termine</div>
              <div className="mt-1 text-xs leading-5 text-white/45 sm:text-[13px]">Heute im Plan und diese Woche</div>
            </div>

            <OpenCreateAppointmentButton accentColor="#d6c3a3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Heute</div>
              <div className="mt-1 text-[32px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[36px]">
                {todayCount}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Woche</div>
              <div className="mt-1 text-[32px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[36px]">
                {weekCount}
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
}: {
  value: string;
  subtext?: string;
}) {
  return (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="flex min-h-[132px] flex-col p-4 sm:min-h-[144px] sm:p-5">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-5 text-[var(--text-muted)] sm:text-[15px]">Kunden gesamt</div>
              {subtext ? <div className="mt-1 text-xs leading-5 text-white/45 sm:text-[13px]">{subtext}</div> : null}
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

          <div className="text-[32px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[36px] lg:text-[40px]">
            {value}
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

  return (
    <Card className="h-full border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035] lg:col-span-2 xl:col-span-2 2xl:col-span-2">
      <CardContent className="flex min-h-[132px] flex-col p-4 sm:min-h-[144px] sm:p-5">
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text-muted)] sm:text-[15px]">Rechnungen</div>
              <div className="mt-1 text-xs leading-5 text-white/45 sm:text-[13px]">
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Heute</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatMoney(todayRevenueCents)}</div>
              <div className="mt-0.5 text-[11px] text-white/40">{todayReceiptCount} Belege</div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Woche</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatMoney(weekRevenueCents)}</div>
              <div className="mt-0.5 text-[11px] text-white/40">laufender Stand</div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Monat</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatMoney(monthRevenueCents)}</div>
              <div className="mt-0.5 text-[11px] text-white/40">aktueller Monat</div>
            </div>
          </div>

          <div className="mt-auto space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=day`}
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--text)] transition hover:bg-white/10"
              >
                Tagesabschluss
              </Link>
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=month`}
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--text)] transition hover:bg-white/10"
              >
                Monatsabschluss
              </Link>
              <Link
                href={`/rechnungen?closingDate=${encodeURIComponent(closingDateKey)}&closingPanel=year`}
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--text)] transition hover:bg-white/10"
              >
                Jahresabschluss
              </Link>
              <Link
                href="/dashboard?invoice=1"
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] bg-[var(--primary)] px-3 text-sm font-medium text-[var(--primary-foreground)] shadow-[0_4px_20px_rgba(214,195,163,0.18)] transition hover:opacity-90"
              >
                + Rechnung
              </Link>
            </div>

            {openReceiptCount > 0 ? (
              <Link
                href="/rechnungen?filter=open"
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--text)] transition hover:bg-white/10"
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
  let effectiveReminderTenantId: string | null = null;
  let isAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, tenant_id, calendar_tenant_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    fullName = profile?.full_name ?? null;
    role = profile?.role ?? "PRACTITIONER";
    isAdmin = role === "ADMIN";

    effectiveCustomerTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    effectiveReminderTenantId = effectiveCustomerTenantId;
    creatorTenantId = profile?.calendar_tenant_id ?? profile?.tenant_id ?? null;

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
  }

  const tenantsQuery = admin
    .from("tenants")
    .select("id, display_name")
    .order("display_name", { ascending: true });

  const legendUsersQuery = isAdmin
    ? admin.from("user_profiles").select("user_id, tenant_id, calendar_tenant_id, full_name, role")
    : user?.id
      ? admin
          .from("user_profiles")
          .select("user_id, tenant_id, calendar_tenant_id, full_name, role")
          .eq("user_id", user.id)
      : admin.from("user_profiles").select("user_id, tenant_id, calendar_tenant_id, full_name, role").limit(0);

  const [{ data: tenantsRaw }, { data: userProfilesRaw }] = await Promise.all([
    tenantsQuery,
    legendUsersQuery,
  ]);

  const tenantRows = (tenantsRaw ?? []) as TenantRow[];

  const tenantNameById = new Map<string, string>();
  for (const t of tenantRows) {
    tenantNameById.set(t.id, t.display_name ?? "Behandler");
  }

  const legendUsers: LegendUser[] = (userProfilesRaw ?? [])
    .filter((p) => !!p.user_id && !!p.calendar_tenant_id)
    .map((p) => ({
      tenantId: p.tenant_id as string,
      filterTenantId: p.calendar_tenant_id as string,
      userId: p.user_id as string,
      fullName: (p.full_name as string | null) ?? null,
      tenantDisplayName:
        tenantNameById.get((p.calendar_tenant_id as string) ?? "") ??
        tenantNameById.get((p.tenant_id as string) ?? "") ??
        "Behandler",
    }));

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

  if (!isAdmin && effectiveReminderTenantId) {
    todayCountQuery = todayCountQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let weekCountQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("start_at", startOfWeek.toISOString())
    .lt("start_at", endOfWeek.toISOString());

  if (!isAdmin && effectiveReminderTenantId) {
    weekCountQuery = weekCountQuery.eq("tenant_id", effectiveReminderTenantId);
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
      reminder_at,
      reminder_sent_at,
      notes_internal
    `)
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", now.toISOString());

  if (!isAdmin && effectiveReminderTenantId) {
    reminderCountQuery = reminderCountQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const slotsWindowEnd = new Date(startOfToday);
  slotsWindowEnd.setDate(slotsWindowEnd.getDate() + 90);

  let receiptsQuery = admin
    .from("fiscal_receipts")
    .select("id, status, turnover_value_cents, issued_at, created_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (!isAdmin && effectiveReminderTenantId) {
    receiptsQuery = receiptsQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  let openSlotsQuery = admin
    .from("appointment_open_slots")
    .select("id, appointment_id, tenant_id, start_at, end_at, status, created_at")
    .eq("status", "open")
    .gte("start_at", startOfToday.toISOString())
    .lt("start_at", slotsWindowEnd.toISOString())
    .order("start_at", { ascending: true });

  if (effectiveReminderTenantId) {
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

  if (effectiveReminderTenantId) {
    activeWaitlistQuery = activeWaitlistQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const calendarServicesQuery = admin
    .from("services")
    .select("id, tenant_id, name, duration_minutes, buffer_minutes, default_price_cents, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const dashboardCustomersBaseQuery = admin
    .from("customer_profiles")
    .select(`
      id,
      tenant_id,
      person_id,
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
    return status !== "cancelled" && status !== "completed" && status !== "no_show";
  }).length;

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

  const currentDateLabel = formatShortDate(now);
  const currentTimeLabel = formatCurrentTime(now);
  const profileTheme = tenantTheme(tenantDisplayName ?? displayName);

  return (
    <div className="space-y-4 lg:space-y-8">
      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="px-1 py-2 sm:p-5 md:p-7 xl:p-8">
            <div className="hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 sm:p-5 md:block md:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                  <div
                    className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] border-[4px] shadow-[0_0_0_2px_rgba(11,11,12,0.9)] sm:h-[80px] sm:w-[80px] md:h-[88px] md:w-[88px]"
                    style={{ borderColor: profileTheme.border, background: profileTheme.bg }}
                  >
                    <img
                      src={`/users/${user?.id}.png`}
                      alt="Benutzerfoto"
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--primary)]">
                      Magnifique Beauty Institut Dashboard
                    </div>
                    <div className="mt-2 break-words text-[28px] font-semibold leading-none tracking-tight text-[var(--text)] sm:text-[32px] md:text-[36px] xl:text-[42px]">
                      {displayName}
                    </div>
                    <div className="mt-2 text-sm text-[var(--text-muted)] sm:text-base">
                      {tenantDisplayName ?? "Studioansicht"}
                    </div>
                  </div>
                </div>

                <div className="hidden w-full rounded-[22px] border border-white/10 bg-black/20 px-5 py-4 xl:block xl:w-auto xl:min-w-[220px]">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Heute</div>
                  <div className="mt-2 text-base font-medium text-[var(--text)] sm:text-lg">{currentDateLabel}</div>
                  <div className="mt-1 text-sm text-[var(--primary)] sm:text-base">{currentTimeLabel} Uhr</div>
                </div>
              </div>
            </div>

            <div className="mt-0 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-2 py-2 md:hidden">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] border-[2px] shadow-[0_0_0_2px_rgba(11,11,12,0.9)]"
                  style={{ borderColor: profileTheme.border, background: profileTheme.bg }}
                >
                  <img
                    src={`/users/${user?.id}.png`}
                    alt="Benutzerfoto"

                  />
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                    Magnifique Beauty Institut Dashboard
                  </div>
                  <div className="mt-1.5 break-words text-[25px] font-semibold leading-none tracking-tight text-[var(--text)]">
                    {displayName}
                  </div>

                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:mt-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
              <InvoiceCreateCard
                todayRevenueCents={todayRevenueCents}
                todayReceiptCount={todayReceiptCount}
                openReceiptCount={openReceiptCount}
                weekRevenueCents={weekRevenueCents}
                monthRevenueCents={monthRevenueCents}
                hasRecentReceipt={hasRecentReceipt}
                closingDateKey={closingDateKey}
              />

              <AppointmentsOverviewCard todayCount={String(todayCount)} weekCount={String(weekCount)} />
              <CustomerOverviewCard value={String(customersCount)} subtext="Gespeicherte Profile" />

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

              <Card className="h-full border-[var(--border)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035]">
                <CardContent className="flex min-h-[132px] flex-col p-4 sm:min-h-[144px] sm:p-5">
                  <div className="flex h-full flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-5 text-[var(--text-muted)] sm:text-[15px]">Aktive Warteliste</div>
                        <div className="mt-1 text-xs leading-5 text-white/45 sm:text-[13px]">Kunden warten</div>
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

                    <div
                      className="text-[32px] font-semibold leading-none tracking-tight sm:text-[36px] lg:text-[40px]"
                      style={{ color: waitlistItems.length === 0 ? "#34d399" : "#a855f7" }}
                    >
                      {String(waitlistItems.length)}
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
              />
              <DashboardStatCard
                label="Reminder"
                value={String(reminderCount)}
                subtext="Offene Reminder"
                href="/dashboard?openReminders=1"
                accentColor={reminderCount === 0 ? "#34d399" : "#fb923c"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <DashboardCalendarCardClient
        tenants={tenantRows}
        legendUsers={legendUsers}
        services={calendarServices}
        creatorTenantId={creatorTenantId}
        isAdmin={isAdmin}
      />

      <OpenSlotsSlideover items={openSlotItems} />
      <WaitlistSlideover items={waitlistItems} />
      <DashboardInvoiceSlideover
        tenants={tenantRows.map((tenant) => ({
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
