import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import DashboardCalendarCardClient from "@/components/calendar/DashboardCalendarCardClient";
import OpenSlotsSlideover from "@/components/dashboard/OpenSlotsSlideover";
import WaitlistSlideover from "@/components/dashboard/WaitlistSlideover";
import DashboardServicesCard from "@/components/dashboard/DashboardServicesCard";

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

type TodayAppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  notes_internal: string | null;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
  person?:
    | { full_name: string | null; phone: string | null }
    | { full_name: string | null; phone: string | null }[]
    | null;
};

type ReminderCountRow = {
  id: string;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  notes_internal: string | null;
};

type RecentCustomerRow = {
  id: string;
  created_at: string;
  display_name: string | null;
  person_id: string;
  person?:
    | { full_name: string | null; phone: string | null }
    | { full_name: string | null; phone: string | null }[]
    | null;
  tenant?: { display_name: string | null } | { display_name: string | null }[] | null;
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

type CalendarServiceRow = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
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

function parseTitle(notes: string | null) {
  if (!notes) return "Termin";

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => line.toLowerCase().startsWith("titel:"));
  return titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() || "Termin" : "Termin";
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

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
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

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "K"
  );
}

function tenantTheme(tenantName: string): ThemeLike {
  const n = (tenantName || "").toLowerCase();

  if (n.includes("radu")) {
    return {
      bg: "rgba(59,130,246,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(59,130,246,0.38)",
    };
  }

  if (n.includes("raluca")) {
    return {
      bg: "rgba(168,85,247,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(168,85,247,0.38)",
    };
  }

  if (n.includes("alexandra")) {
    return {
      bg: "rgba(34,197,94,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(34,197,94,0.38)",
    };
  }

  if (n.includes("barbara")) {
    return {
      bg: "rgba(249,115,22,0.16)",
      text: "#F7F7F5",
      subText: "rgba(247,247,245,0.72)",
      border: "rgba(249,115,22,0.38)",
    };
  }

  return {
    bg: "rgba(255,255,255,0.04)",
    text: "#F7F7F5",
    subText: "rgba(247,247,245,0.72)",
    border: "rgba(255,255,255,0.12)",
  };
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
  const content = (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="flex min-h-[132px] flex-col justify-between gap-4 p-5">
        <div>
          <div className="text-sm font-medium text-[var(--text-muted)]">{label}</div>
          {subtext ? <div className="mt-1 text-xs text-white/45">{subtext}</div> : null}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div
            className="text-[30px] font-semibold leading-none tracking-tight"
            style={{ color: accentColor ?? "var(--text)" }}
          >
            {value}
          </div>

          {href ? (
            <span
              className="inline-flex h-8 items-center justify-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{
                color: accentColor ?? "var(--primary)",
                backgroundColor: accentColor ? `${accentColor}14` : "var(--accent-soft)",
                border: `1px solid ${accentColor ? `${accentColor}30` : "rgba(214,195,163,0.24)"}`,
              }}
            >
              öffnen
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function InvoiceCreateCard() {
  return (
    <Card className="h-full border-[var(--border)] bg-[var(--surface)] hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="flex min-h-[132px] flex-col justify-between gap-4 p-5">
        <div>
          <div className="text-sm font-medium text-[var(--text-muted)]">Rechnungen</div>
          <div className="mt-1 text-xs text-white/45">Neue Rechnung direkt starten</div>
        </div>

        <div>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-[16px] border px-4 text-sm font-medium transition hover:bg-white/10"
            style={{
              borderColor: "rgba(214,195,163,0.28)",
              backgroundColor: "rgba(214,195,163,0.12)",
              color: "var(--primary)",
            }}
          >
            + Rechnung erstellen
          </button>
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

  let todayAppointmentsQuery = supabase
    .from("appointments")
    .select(`
      id,
      start_at,
      end_at,
      notes_internal,
      tenant:tenants ( display_name ),
      person:persons ( full_name, phone )
    `)
    .gte("start_at", startOfToday.toISOString())
    .lt("start_at", endOfToday.toISOString());

  if (!isAdmin && effectiveReminderTenantId) {
    todayAppointmentsQuery = todayAppointmentsQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  todayAppointmentsQuery = todayAppointmentsQuery.order("start_at", { ascending: true }).limit(6);

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

  const recentCustomersBaseQuery = admin
    .from("customer_profiles")
    .select(`
      id,
      created_at,
      display_name,
      person_id,
      person:persons ( full_name, phone ),
      tenant:tenants ( display_name )
    `)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentCustomersQuery =
    isAdmin || !effectiveCustomerTenantId
      ? recentCustomersBaseQuery
      : recentCustomersBaseQuery.eq("tenant_id", effectiveCustomerTenantId);

  const slotsWindowEnd = new Date(startOfToday);
  slotsWindowEnd.setDate(slotsWindowEnd.getDate() + 90);

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

  const [
    todayCountResult,
    weekCountResult,
    customersCountResult,
    activeServicesCountResult,
    todayAppointmentsResult,
    reminderCountResult,
    recentCustomersResult,
    openSlotsResult,
    activeWaitlistResult,
    calendarServicesResult,
  ] = await Promise.all([
    todayCountQuery,
    weekCountQuery,
    customersCountQuery,
    activeServicesCountQuery,
    todayAppointmentsQuery,
    reminderCountQuery,
    recentCustomersQuery,
    openSlotsQuery,
    activeWaitlistQuery,
    calendarServicesQuery,
  ]);

  const todayAppointments = (todayAppointmentsResult.data ?? []) as TodayAppointmentRow[];
  const recentCustomers = (recentCustomersResult.data ?? []) as RecentCustomerRow[];
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
    person?: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
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
    <div className="space-y-6">
      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-5 md:p-7">
            <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-5 md:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-[24px] border"
                    style={{ borderColor: profileTheme.border, background: profileTheme.bg }}
                  >
                    <img
                      src={`/users/${user?.id}.png`}
                      alt="Benutzerfoto"
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                      Clientique Dashboard
                    </div>
                    <div className="mt-2 truncate text-[30px] font-semibold leading-none tracking-tight text-[var(--text)]">
                      {displayName}
                    </div>
                    <div className="mt-2 text-sm text-[var(--text-muted)]">
                      {tenantDisplayName ?? "Studioansicht"}
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 sm:min-w-[180px]">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Heute</div>
                  <div className="mt-2 text-base font-medium text-[var(--text)]">{currentDateLabel}</div>
                  <div className="mt-1 text-sm text-[var(--primary)]">{currentTimeLabel} Uhr</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              <DashboardStatCard label="Termine heute" value={String(todayCount)} subtext="Heute im Plan" />
              <DashboardStatCard label="Termine Woche" value={String(weekCount)} subtext="Diese Woche" />
              <DashboardStatCard label="Kunden gesamt" value={String(customersCount)} subtext="Gespeicherte Profile" />

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

              <InvoiceCreateCard />

              <DashboardStatCard
                label="Freie Termine"
                value={String(openSlots.length)}
                subtext="Kurzfristig frei"
                href="/dashboard?openSlots=1"
                accentColor={openSlots.length === 0 ? "#34d399" : "#fb923c"}
              />
              <DashboardStatCard
                label="Aktive Warteliste"
                value={String(waitlistItems.length)}
                subtext="Kunden warten"
                href="/dashboard?openWaitlist=1"
                accentColor={waitlistItems.length === 0 ? "#34d399" : "#a855f7"}
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

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--text)]">Nächste Termine heute</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">
                  Die nächsten Einträge für den laufenden Tag.
                </div>
              </div>
              <Link href="/calendar">
                <Button variant="secondary" size="sm">Zum Kalender</Button>
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {todayAppointments.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-6 text-sm text-[var(--text-muted)]">
                  Für heute sind noch keine Termine angelegt.
                </div>
              ) : (
                todayAppointments.map((appointment) => {
                  const tenant = firstJoin(appointment.tenant);
                  const person = firstJoin(appointment.person);
                  const customerName = person?.full_name ?? "Walk-in";
                  const customerPhone = person?.phone ?? "";
                  const theme = tenantTheme(tenant?.display_name ?? "");

                  return (
                    <div
                      key={appointment.id}
                      className="rounded-[24px] border p-4 md:p-5"
                      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="rounded-[18px] border px-4 py-3 text-center" style={{ borderColor: theme.border, backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <div className="text-[20px] font-bold leading-none" style={{ color: theme.text }}>
                              {formatTime(appointment.start_at)}
                            </div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.subText }}>
                              bis {formatTime(appointment.end_at)}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-lg font-semibold" style={{ color: theme.text }}>
                              {parseTitle(appointment.notes_internal)}
                            </div>
                            <div className="mt-1 truncate text-sm" style={{ color: theme.text }}>
                              {customerName}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: theme.subText }}>
                              <Badge className="border border-white/10 bg-white/10 text-white">{tenant?.display_name ?? "Behandler"}</Badge>
                              {customerPhone ? <span>{customerPhone}</span> : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {customerPhone ? (
                            <Link href={`/customers?q=${encodeURIComponent(customerPhone)}`}>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                              >
                                Kunde öffnen
                              </Button>
                            </Link>
                          ) : null}

                          <Link href="/calendar">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="bg-white/10 text-white hover:bg-white/15"
                            >
                              Plan ansehen
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-[var(--text)]">Neue Kunden</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Zuletzt angelegte Kundenprofile.</div>
              </div>
              <Link href="/customers">
                <Button variant="secondary" size="sm">Alle Kunden</Button>
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {recentCustomers.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-6 text-sm text-[var(--text-muted)]">
                  Noch keine Kunden im System.
                </div>
              ) : (
                recentCustomers.map((customer) => {
                  const person = firstJoin(customer.person);
                  const tenant = firstJoin(customer.tenant);
                  const name = person?.full_name ?? customer.display_name ?? "Unbekannter Kunde";
                  const phone = person?.phone ?? "Kein Telefon";

                  return (
                    <Link
                      key={customer.id}
                      href={`/customers?q=${encodeURIComponent(person?.phone ?? name)}`}
                      className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/20 p-3.5 transition hover:border-white/20 hover:bg-black/30"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-[var(--text)]">
                        {getInitials(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--text)]">{name}</div>
                        <div className="truncate text-xs text-[var(--text-muted)]">{phone}</div>
                      </div>
                      <div className="text-right text-xs text-white/45">
                        <div>{tenant?.display_name ?? "—"}</div>
                        <div className="mt-1">
                          {new Intl.DateTimeFormat("de-AT", {
                            day: "2-digit",
                            month: "2-digit",
                          }).format(new Date(customer.created_at))}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <OpenSlotsSlideover items={openSlotItems} />
      <WaitlistSlideover items={waitlistItems} />
    </div>
  );
}
