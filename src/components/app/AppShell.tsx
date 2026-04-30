import { Container } from "@/components/ui/page";
import { TopNav } from "./TopNav";
import ChatSlideover from "@/components/chat/ChatSlideover";
import ReminderSlideover from "@/components/reminders/ReminderSlideover";
import WaitlistSlideover from "@/components/dashboard/WaitlistSlideover";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { CLIENTIQUE_DEMO_CALENDAR_ID, CLIENTIQUE_DEMO_CALENDAR_LABEL, getIsDemoTenant } from "@/lib/demoMode";
import type { Item } from "@/components/calendar/types";
import GoogleCalendarSetupSlideover from "@/components/calendar/GoogleCalendarSetupSlideover";
import StudioAssistantSlideover from "@/components/assistant/StudioAssistantSlideover";
import type { ReactNode } from "react";

type ReminderRow = {
  id: string;
  start_at: string;
  end_at: string;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  status?: string | null;
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

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => line.toLowerCase().startsWith("titel:"));
  return titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() || "Termin" : "Termin";
}

function parseNote(notes: string | null) {
  if (!notes) return "";

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const noteLine = lines.find((line) => line.toLowerCase().startsWith("notiz:"));
  return noteLine ? noteLine.replace(/^notiz:\s*/i, "").trim() : "";
}

function parseStatus(notes: string | null) {
  if (!notes) return "scheduled" as const;

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const statusLine = lines.find((line) => line.toLowerCase().startsWith("status:"));
  const value = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "scheduled";

  if (value === "completed") return "completed" as const;
  if (value === "cancelled") return "cancelled" as const;
  if (value === "no_show") return "no_show" as const;
  return "scheduled" as const;
}

function resolveStorageAvatarUrl(raw: string | null | undefined, admin: ReturnType<typeof supabaseAdmin>) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, "").replace(/^avatars\//i, "");
  const { data } = admin.storage.from("avatars").getPublicUrl(normalized);
  return data?.publicUrl ?? null;
}

export default async function AppShell({
  children,
  userLabel,
  rightSlot,
  tenantId,
  currentUserId,
}: {
  children: ReactNode;
  userLabel?: string;
  rightSlot?: ReactNode;
  tenantId: string | null;
  currentUserId: string;
}) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const isDemoMode = await getIsDemoTenant(admin, tenantId);

  const userId = currentUserId;

  let resolvedUserLabel = userLabel ?? null;
  let resolvedUserEmail: string | null = null;
  let avatarUrl: string | null = null;
  let avatarRingColor: string | null = null;

  if (userId) {
    const [{ data: authUserData }, { data: navProfile }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("user_profiles")
        .select("full_name, avatar_path, avatar_ring_color")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    resolvedUserEmail = authUserData.user?.email ?? null;
    resolvedUserLabel = resolvedUserLabel ?? navProfile?.full_name ?? null;

    avatarUrl = resolveStorageAvatarUrl(navProfile?.avatar_path ?? null, admin);
    avatarRingColor = (navProfile as any)?.avatar_ring_color ?? null;
  }

  let googleSetupAlertCount = 0;
  let googleLoadError: string | null = null;
  let googleCalendars: CalendarListItem[] = [];
  let googleSavedDefault: string | null = null;

  if (userId && isDemoMode) {
    googleSetupAlertCount = 0;
    googleLoadError = null;
    googleSavedDefault = CLIENTIQUE_DEMO_CALENDAR_ID;
    googleCalendars = [
      {
        id: CLIENTIQUE_DEMO_CALENDAR_ID,
        summary: CLIENTIQUE_DEMO_CALENDAR_LABEL,
        primary: true,
        accessRole: "owner",
      },
    ];
  } else if (userId) {
    const [{ data: googleTokenRow }, { data: googleConnectionRows }] = await Promise.all([
      supabase
        .from("google_oauth_tokens")
        .select("refresh_token, default_calendar_id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("google_oauth_connections")
        .select("is_active, is_read_only, default_calendar_id")
        .eq("owner_user_id", userId),
    ]);

    const activeGoogleConnections = Array.isArray(googleConnectionRows)
      ? googleConnectionRows.filter((row: any) => row?.is_active === true)
      : [];
    const writableGoogleConnection =
      activeGoogleConnections.find((row: any) => row?.is_read_only !== true) ?? activeGoogleConnections[0] ?? null;

    const hasRefreshToken = Boolean(googleTokenRow?.refresh_token);
    const tokenDefaultCalendar = String((googleTokenRow as any)?.default_calendar_id ?? "").trim();
    const connectionDefaultCalendar = String((writableGoogleConnection as any)?.default_calendar_id ?? "").trim();

    googleSavedDefault = tokenDefaultCalendar || connectionDefaultCalendar || null;

    const hasAnyUsableGoogleConnection = hasRefreshToken || activeGoogleConnections.length > 0;

    if (!hasAnyUsableGoogleConnection) {
      googleSetupAlertCount = 1;
    }

    try {
      const token = await getValidGoogleAccessToken();

      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        if ([400, 401, 403].includes(res.status)) {
          const now = new Date().toISOString();
          await Promise.all([
            admin
              .from("google_oauth_tokens")
              .update({
                access_token: null,
                refresh_token: null,
                expires_at: null,
                default_calendar_id: null,
                enabled_calendar_ids: [],
                updated_at: now,
              })
              .eq("user_id", userId),
            admin
              .from("google_oauth_connections")
              .update({
                access_token: null,
                refresh_token: null,
                expires_at: null,
                is_active: false,
                is_primary: false,
                updated_at: now,
              })
              .eq("owner_user_id", userId),
          ]);
        }
        throw new Error(json?.error?.message ?? "Kalenderliste konnte nicht geladen werden");
      }

      googleCalendars = ((json?.items ?? []) as CalendarListItem[]).sort(
        (a, b) => Number(!!b.primary) - Number(!!a.primary)
      );
    } catch (e: any) {
      googleLoadError = e?.message ?? String(e);

      // Nicht jede Kalenderlisten-Störung ist ein Setup-Problem.
      // Wenn bereits eine aktive Google-Verbindung existiert, darf der Avatar-Badge
      // nicht fälschlich "1" anzeigen, während /calendar/google korrekt "Verbunden" zeigt.
      if (!hasAnyUsableGoogleConnection) {
        googleSetupAlertCount = 1;
      }
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
      status,
      notes_internal,
      tenant:tenants ( id, display_name ),
      person:persons ( full_name, phone, email )
    `)
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", new Date().toISOString())
    .gte("end_at", new Date().toISOString())
    .order("reminder_at", { ascending: true })
    .limit(25);

  if (effectiveReminderTenantId) {
    remindersQuery = remindersQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const { data: remindersRaw } = await remindersQuery;

  const reminderItems = ((remindersRaw ?? []) as ReminderRow[])
    .filter((row) => {
      const rawStatus = String(row.status ?? "").trim().toLowerCase();
      const derivedStatus = parseStatus(row.notes_internal);
      const status =
        rawStatus === "scheduled" ||
        rawStatus === "completed" ||
        rawStatus === "cancelled" ||
        rawStatus === "no_show"
          ? rawStatus
          : derivedStatus;

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
        status: (() => {
          const rawStatus = String(row.status ?? "").trim().toLowerCase();
          if (
            rawStatus === "scheduled" ||
            rawStatus === "completed" ||
            rawStatus === "cancelled" ||
            rawStatus === "no_show"
          ) {
            return rawStatus as "scheduled" | "completed" | "cancelled" | "no_show";
          }
          return parseStatus(row.notes_internal);
        })(),
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
        reminderAt: row.reminder_at ?? row.start_at,
      };

      return item;
    });

  let waitlistQuery = admin
    .from("waitlist_entries")
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
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  if (effectiveReminderTenantId) {
    waitlistQuery = waitlistQuery.eq("tenant_id", effectiveReminderTenantId);
  }

  const { data: waitlistRowsRaw } = await waitlistQuery;
  const waitlistRows = (waitlistRowsRaw ?? []) as WaitlistRow[];

  const profileIds = Array.from(new Set(waitlistRows.map((row) => row.customer_profile_id).filter(Boolean) as string[]));
  const personIds = Array.from(new Set(waitlistRows.map((row) => row.person_id).filter(Boolean) as string[]));
  const tenantIds = Array.from(new Set(waitlistRows.map((row) => row.tenant_id).filter(Boolean)));

  const [{ data: waitlistProfiles }, { data: persons }, { data: tenants }] = await Promise.all([
    profileIds.length
      ? admin
          .from("customer_profiles")
          .select(`
            id,
            tenant_id,
            person_id,
            person:persons ( full_name, phone )
          `)
          .in("id", profileIds)
      : Promise.resolve({ data: [] as any[] }),
    personIds.length
      ? admin.from("persons").select("id, full_name, phone").in("id", personIds)
      : Promise.resolve({ data: [] as any[] }),
    tenantIds.length
      ? admin.from("tenants").select("id, display_name").in("id", tenantIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const waitlistProfileMap = new Map(
    (waitlistProfiles ?? []).map((profile: any) => {
      const person = firstJoin(profile.person);
      return [
        String(profile.id),
        {
          personId: String(profile.person_id ?? "") || null,
          customerName: person?.full_name ?? "Kunde",
          phone: person?.phone ?? null,
        },
      ];
    })
  );

  const personMap = new Map(
    (persons ?? []).map((person: any) => [
      String(person.id),
      {
        customerName: person.full_name ?? "Kunde",
        phone: person.phone ?? null,
      },
    ])
  );

  const customerProfileByTenantAndPerson = new Map(
    (waitlistProfiles ?? [])
      .filter((profile: any) => profile.tenant_id && profile.person_id)
      .map((profile: any) => [`${profile.tenant_id}::${profile.person_id}`, String(profile.id)])
  );

  const waitlistTenantNameById = new Map(
    (tenants ?? []).map((tenant: any) => [String(tenant.id), tenant.display_name ?? "Behandler"])
  );

  const activeWaitlistRows = waitlistRows.filter((row) => row.status === "open");

  const waitlistItems: WaitlistItem[] = activeWaitlistRows
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
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.88]">
        <div className="absolute left-[-8%] top-[-6%] h-[32rem] w-[32rem] rounded-full bg-[rgba(214,186,145,0.14)] blur-3xl" />
        <div className="absolute right-[-10%] top-[8%] h-[30rem] w-[30rem] rounded-full bg-[rgba(194,164,132,0.12)] blur-3xl" />
        <div className="absolute bottom-[-10%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-[rgba(104,76,55,0.16)] blur-3xl" />
      </div>
      <div className="clientique-app-frame">
        <TopNav
          userLabel={resolvedUserLabel ?? undefined}
          userEmail={resolvedUserEmail}
          avatarUrl={avatarUrl}
          avatarRingColor={avatarRingColor}
          rightSlot={rightSlot}
          tenantId={tenantId}
          currentUserId={currentUserId}
          reminderCount={reminderItems.length}
          waitlistCount={waitlistItems.length}
          googleSetupAlertCount={googleSetupAlertCount}
        />

        {isDemoMode ? (
          <div className="clientique-demo-banner-safe fixed left-1/2 z-[90] -translate-x-1/2 rounded-full border border-[#dcc7a1]/40 bg-[#2a1f12]/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#f3ddb4] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            Demo-Modus · keine echten externen Aktionen
          </div>
        ) : null}

        <main className="clientique-content-layer clientique-main-safe pl-0 lg:pl-[76px]">
          <Container className="max-w-[1400px] px-0 sm:px-0">
            {children}
          </Container>
        </main>

        <ChatSlideover
          tenantId={tenantId}
          currentUserId={currentUserId}
          currentUserName={resolvedUserLabel ?? ""}
        />

        <ReminderSlideover items={reminderItems} currentUserEmail={resolvedUserEmail} />
        <WaitlistSlideover items={waitlistItems} />
        <GoogleCalendarSetupSlideover
          calendars={googleCalendars}
          savedDefault={googleSavedDefault}
          loadError={googleLoadError}
        />
        <StudioAssistantSlideover
          userLabel={resolvedUserLabel ?? undefined}
          tenantId={tenantId}
        />
      </div>
    </div>
  );
}
