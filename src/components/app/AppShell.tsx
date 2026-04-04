import { Container } from "@/components/ui/page";
import { TopNav } from "@/components/app/TopNav";
import ChatSlideover from "@/components/chat/ChatSlideover";
import ReminderSlideover from "@/components/reminders/ReminderSlideover";
import WaitlistSlideover from "@/components/dashboard/WaitlistSlideover";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import type { Item } from "@/components/calendar/types";
import GoogleCalendarSetupSlideover from "@/components/calendar/GoogleCalendarSetupSlideover";

type ReminderRow = {
  id: string;
  start_at: string;
  end_at: string;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  notes_internal: string | null;
  tenant?:
    | { id?: string | null; display_name: string | null }
    | { id?: string | null; display_name: string | null }[]
    | null;
  person?:
    | { full_name: string | null; phone: string | null; email?: string | null }
    | { full_name: string | null; phone: string | null; email?: string | null }[]
    | null;
};

type WaitlistRow = {
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
};

type WaitlistItem = {
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

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

function firstJoin<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function parseTitle(notes: string | null) {
  if (!notes) return "Termin";
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => line.toLowerCase().startsWith("titel:"));
  return titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() || "Termin" : "Termin";
}

function parseNote(notes: string | null) {
  if (!notes) return "";
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean);
  const noteLine = lines.find((line) => line.toLowerCase().startsWith("notiz:"));
  return noteLine ? noteLine.replace(/^notiz:\s*/i, "").trim() : "";
}

function parseStatus(notes: string | null) {
  if (!notes) return "scheduled" as const;
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean);
  const statusLine = lines.find((line) => line.toLowerCase().startsWith("status:"));
  const value = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "scheduled";
  if (value === "completed") return "completed" as const;
  if (value === "cancelled") return "cancelled" as const;
  if (value === "no_show") return "no_show" as const;
  return "scheduled" as const;
}

export default async function AppShell({ children, userLabel, rightSlot, tenantId, currentUserId }: { children: React.ReactNode; userLabel?: string; rightSlot?: React.ReactNode; tenantId: string | null; currentUserId: string; }) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const userId = currentUserId;

  let googleSetupAlertCount = 0;
  let googleLoadError: string | null = null;
  let googleCalendars: CalendarListItem[] = [];
  let googleSavedDefault: string | null = null;

  if (userId) {
    const { data: googleTokenRow } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token, default_calendar_id")
      .eq("user_id", userId)
      .maybeSingle();

    const hasRefreshToken = Boolean(googleTokenRow?.refresh_token);
    const hasDefaultCalendar = Boolean(googleTokenRow?.default_calendar_id);
    googleSavedDefault = (googleTokenRow as any)?.default_calendar_id ?? null;

    if (!googleTokenRow || !hasRefreshToken || !hasDefaultCalendar) googleSetupAlertCount = 1;

    try {
      const token = await getValidGoogleAccessToken();
      const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Kalenderliste konnte nicht geladen werden");
      googleCalendars = ((json?.items ?? []) as CalendarListItem[]).sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
    } catch (e: any) {
      googleLoadError = e?.message ?? String(e);
      googleSetupAlertCount = 1;
    }
  }

  let effectiveReminderTenantId: string | null = null;
  let userRole: string = "PRACTITIONER";

  if (userId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    userRole = profile?.role ?? "PRACTITIONER";
    effectiveReminderTenantId = await getEffectiveTenantId({
      role: userRole,
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });
  }

  let remindersQuery = admin
    .from("appointments")
    .select(`
      id,
      start_at,
      end_at,
      reminder_at,
      reminder_sent_at,
      notes_internal,
      tenant:tenants ( id, display_name ),
      person:persons ( full_name, phone, email )
    `)
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", new Date().toISOString())
    .order("reminder_at", { ascending: true })
    .limit(25);

  if (effectiveReminderTenantId) remindersQuery = remindersQuery.eq("tenant_id", effectiveReminderTenantId);
  const { data: remindersRaw } = await remindersQuery;

  const reminderItems = ((remindersRaw ?? []) as ReminderRow[])
    .filter((row) => {
      const status = parseStatus(row.notes_internal);
      return status !== "cancelled" && status !== "completed" && status !== "no_show";
    })
    .map((row) => {
      const tenant = firstJoin(row.tenant);
      const person = firstJoin(row.person);
      const item: Item & { reminderAt: string | null } = {
        id: row.id,
        start_at: row.start_at,
        end_at: row.end_at,
        title: parseTitle(row.notes_internal),
        note: parseNote(row.notes_internal),
        status: parseStatus(row.notes_internal),
        tenantId: String(tenant?.id ?? ""),
        tenantName: tenant?.display_name ?? "",
        customerProfileId: null,
        customerName: person?.full_name ?? "Walk-in",
        customerPhone: person?.phone ?? null,
        customerEmail: person?.email ?? null,
        reminderSentAt: row.reminder_sent_at ?? null,
        canOpenCustomerProfile: true,
        canCreateFollowUp: false,
        canDeleteAppointment: false,
        reminderAt: row.reminder_at ?? null,
      };
      return item;
    });

  let waitlistQuery = admin
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

  if (effectiveReminderTenantId) waitlistQuery = waitlistQuery.eq("tenant_id", effectiveReminderTenantId);
  const { data: waitlistRaw } = await waitlistQuery;

  const activeWaitlistRows = ((waitlistRaw ?? []) as WaitlistRow[]).filter(
    (row) => String(row.status ?? "active").toLowerCase() === "active"
  );

  const waitlistCustomerProfileIds = Array.from(new Set(activeWaitlistRows.map((row) => String(row.customer_profile_id ?? "").trim()).filter(Boolean)));
  const waitlistPersonIds = Array.from(new Set(activeWaitlistRows.map((row) => String(row.person_id ?? "").trim()).filter(Boolean)));

  const { data: waitlistProfilesRaw } = waitlistCustomerProfileIds.length === 0
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

  const { data: waitlistPersonsRaw } = waitlistPersonIds.length === 0
    ? { data: [] as unknown[] }
    : await admin.from("persons").select("id, full_name, phone").in("id", waitlistPersonIds);

  const { data: waitlistTenantsRaw } = userRole === "ADMIN" || !effectiveReminderTenantId
    ? await admin.from("tenants").select("id, display_name")
    : await admin.from("tenants").select("id, display_name").eq("id", effectiveReminderTenantId);

  const waitlistTenantNameById = new Map<string, string>();
  for (const tenant of ((waitlistTenantsRaw ?? []) as { id: string; display_name: string | null }[])) {
    waitlistTenantNameById.set(String(tenant.id), tenant.display_name ?? "Behandler");
  }

  const waitlistProfileMap = new Map<string, { customerName: string; phone: string | null; personId: string | null; tenantId: string | null }>();
  const customerProfileByTenantAndPerson = new Map<string, string>();
  const personMap = new Map<string, { customerName: string; phone: string | null }>();

  for (const raw of (waitlistPersonsRaw ?? []) as { id: string; full_name: string | null; phone: string | null }[]) {
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
    const tenantIdResolved = String(raw.tenant_id ?? "").trim() || null;
    waitlistProfileMap.set(String(raw.id), {
      customerName: String(person?.full_name ?? "").trim() || "Kunde",
      phone: String(person?.phone ?? "").trim() || null,
      personId,
      tenantId: tenantIdResolved,
    });
    if (personId && tenantIdResolved) customerProfileByTenantAndPerson.set(`${tenantIdResolved}::${personId}`, String(raw.id));
  }

  const waitlistItems: WaitlistItem[] = activeWaitlistRows
    .map((row) => {
      const rawProfileId = String(row.customer_profile_id ?? "").trim() || null;
      const profileInfo = rawProfileId ? waitlistProfileMap.get(rawProfileId) : undefined;
      const personId = String(row.person_id ?? "").trim() || profileInfo?.personId || null;
      const resolvedProfileId = rawProfileId && waitlistProfileMap.has(rawProfileId)
        ? rawProfileId
        : personId
          ? customerProfileByTenantAndPerson.get(`${row.tenant_id}::${personId}`) ?? null
          : null;
      const personInfo = personId ? personMap.get(personId) : undefined;
      return {
        id: row.id,
        customerProfileId: resolvedProfileId,
        tenantId: row.tenant_id,
        tenantName: waitlistTenantNameById.get(row.tenant_id) ?? "Behandler",
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
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="clientique-shell">
      <TopNav
        userLabel={userLabel}
        userEmail={null}
        rightSlot={rightSlot}
        tenantId={tenantId}
        currentUserId={currentUserId}
        reminderCount={reminderItems.length}
        waitlistCount={waitlistItems.length}
        googleSetupAlertCount={googleSetupAlertCount}
      />

      <main className="min-h-screen pl-0 pt-24 md:pl-[96px] md:pt-6">
        <Container className="max-w-[1400px]">{children}</Container>
      </main>

      <ChatSlideover tenantId={tenantId} currentUserId={currentUserId} currentUserName={userLabel ?? ""} />
      <ReminderSlideover items={reminderItems} currentUserEmail={null} />
      <WaitlistSlideover items={waitlistItems} />
      <GoogleCalendarSetupSlideover calendars={googleCalendars} savedDefault={googleSavedDefault} loadError={googleLoadError} />
    </div>
  );
}
