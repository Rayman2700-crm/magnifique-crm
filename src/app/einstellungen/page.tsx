import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { CLIENTIQUE_DEMO_CALENDAR_ID, CLIENTIQUE_DEMO_CALENDAR_LABEL, getIsDemoTenant } from "@/lib/demoMode";

function resolveStorageAvatarUrl(raw: string | null | undefined, admin: ReturnType<typeof supabaseAdmin>) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, "").replace(/^avatars\//i, "");
  const { data } = admin.storage.from("avatars").getPublicUrl(normalized);
  return data?.publicUrl ?? null;
}

function initialsFromName(name: string | null | undefined) {
  const raw = String(name ?? "").trim();
  if (!raw) return "U";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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

function settingsCardClass() {
  return "flex h-full flex-col rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm";
}

export default async function EinstellungenPage() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: tokenRow }, { data: connectionRows }] = await Promise.all([
    admin
      .from("user_profiles")
      .select("full_name, avatar_path, role, tenant_id, avatar_ring_color")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("google_oauth_tokens")
      .select("default_calendar_id, enabled_calendar_ids, updated_at, refresh_token")
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

  const avatarUrl = resolveStorageAvatarUrl(profile?.avatar_path ?? null, admin);
  const initials = initialsFromName(profile?.full_name ?? user.email ?? null);
  const ringColor = String(profile?.avatar_ring_color ?? "").trim() || "#6366F1";
  const isAdmin = String(profile?.role ?? "").toUpperCase() === "ADMIN";

  const tenantId = profile?.tenant_id ?? null;
  const { data: tenantProfile } = tenantId
    ? await admin.from("tenants").select("legal_name, email, phone, is_demo, slug").eq("id", tenantId).maybeSingle()
    : { data: null as any };

  const isDemoMode = await getIsDemoTenant(admin, tenantId);

  const connections = isDemoMode ? [] : ((Array.isArray(connectionRows) ? connectionRows : []) as GoogleConnectionRow[]);
  const storedActiveConnections = connections.filter((row) => row.is_active === true);
  const hasStoredGoogleRefreshToken = Boolean(String((tokenRow as any)?.refresh_token ?? "").trim());
  let googleConnectionHealthy = false;

  if (!isDemoMode && storedActiveConnections.length > 0 && hasStoredGoogleRefreshToken) {
    try {
      const token = await getValidGoogleAccessToken();
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const json: any = await response.json().catch(() => null);
        if ([400, 401, 403].includes(response.status)) {
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
              .eq("user_id", user.id),
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
              .eq("owner_user_id", user.id),
          ]);
        }
        throw new Error(json?.error?.message ?? "Google Kalenderliste konnte nicht geladen werden");
      }
      googleConnectionHealthy = true;
    } catch {
      googleConnectionHealthy = false;
    }
  }

  const activeConnections = googleConnectionHealthy ? storedActiveConnections : [];
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

  const activeCalendarIds = isDemoMode
    ? [CLIENTIQUE_DEMO_CALENDAR_ID]
    : activeConnections.length > 0
      ? uniqueCalendarIds(Array.from(connectedStudioIds), enabledCalendarIds)
      : [];
  const enabledExtraIds = activeCalendarIds.filter((id) => !STUDIO_TARGET_IDS.has(id));
  const studioConnectionCount = connectedStudioIds.size;

  const primaryMail =
    String(primaryWritableConnection?.google_account_email ?? "").trim() ||
    String(primaryWritableConnection?.google_account_name ?? "").trim() ||
    "";

  const hasAnyGoogleSetup = isDemoMode ? true : activeConnections.length > 0;
  const googleStatusLabel = isDemoMode ? "Demo aktiv" : hasAnyGoogleSetup ? "Verbunden" : "Offen";
  const googleStatusChipClass = hasAnyGoogleSetup
    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
    : "rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70";

  const googleSetupAlertCount = hasAnyGoogleSetup ? 0 : 1;

  const selectedStudioTarget = STUDIO_TARGETS.find((target) => target.calendarId === defaultCalendarId) ?? null;
  const selectedStudioLabel = isDemoMode
    ? CLIENTIQUE_DEMO_CALENDAR_LABEL
    : selectedStudioTarget?.label ?? "Kein verbundener Schreibkalender";
  const lastSync = formatDateTime((tokenRow as any)?.updated_at ?? primaryWritableConnection?.updated_at ?? null);

  const cards = [
    {
      title: "Profil & Firma",
      text: "Name, Passwort, Avatar, Ringfarbe, Rechnungsadresse, Bankdaten und Steuernummer verwalten.",
      href: "/profile",
      cta: "Zum Profil",
      status: "Aktiv",
      chipClass: "rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70",
    },
    {
      title: "Google Kalender",
      text: "Verbindungen, Schreibkalender, Zusatzkalender und Sync-Status pro Benutzer verwalten.",
      href: "/calendar/google",
      cta: "Google öffnen",
      status: googleStatusLabel,
      chipClass: googleStatusChipClass,
    },
    {
      title: "E-Mail / Versand",
      text: "Eigene Mailadresse für Rechnungsversand und Vorlagen pro Benutzer anschließen.",
      href: null,
      cta: "Demnächst",
      status: "Geplant",
      chipClass: "rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70",
    },
    {
      title: "Benachrichtigungen",
      text: "Reminder, Standardoptionen und weitere persönliche App-Einstellungen folgen hier später.",
      href: null,
      cta: "Demnächst",
      status: "Geplant",
      chipClass: "rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6">
        <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white/5 text-lg font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                style={{ borderColor: ringColor, boxShadow: `0 0 0 1px ${ringColor}22, 0 10px 24px rgba(0,0,0,0.35)` }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={profile?.full_name ?? "Avatar"} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d7c097]">
                  Magnifique Beauty Institut Einstellungen
                </p>
                <h1 className="mt-1 truncate text-3xl font-semibold text-white sm:text-4xl">Einstellungen</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  Benutzerbezogene Einstellungen, Google-Kalender-Status und die nächsten Anschlusspunkte für Versand und App-Optionen.
                </p>
                {isDemoMode ? (
                  <div className="mt-4 inline-flex rounded-full border border-[#dcc7a1]/40 bg-[#dcc7a1]/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#f3ddb4]">
                    Demo-Modus · externe Dienste werden nur simuliert
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="font-semibold text-white">{profile?.full_name ?? user.email ?? "Benutzer"}</div>
              <div className="mt-1 text-white/60">{tenantProfile?.legal_name ?? "Eigene Firma"}</div>
              <div className="mt-1 text-white/60">{profile?.role ?? "USER"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-stretch">
          <div className="h-full">
            <div className={settingsCardClass()}>
              <h2 className="text-xl font-semibold text-white">Dein Bereich</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Von hier kommst du direkt zu deinen persönlichen Daten und siehst, welche Einstellungen als Nächstes im CRM dazukommen.
              </p>

              <div className="mt-6 space-y-4 rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Benutzer</div>
                  <div className="mt-2 text-lg font-semibold text-white">{profile?.full_name ?? "–"}</div>
                  <div className="text-sm text-white/60">{user.email}</div>
                </div>

                <div className="h-px bg-white/10" />

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Firma</div>
                  <div className="mt-2 text-base font-medium text-white">{tenantProfile?.legal_name ?? "–"}</div>
                  <div className="text-sm text-white/60">{tenantProfile?.email ?? "Keine Firmen-E-Mail hinterlegt"}</div>
                  <div className="text-sm text-white/60">{tenantProfile?.phone ?? "Keine Firmen-Telefonnummer hinterlegt"}</div>
                </div>
              </div>

              <div className="mt-auto pt-6">
                <Link
                  href="/profile"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dcc7a1]/40 bg-[#dcc7a1] px-4 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(220,199,161,0.18)] transition hover:brightness-105"
                >
                  Profil öffnen
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-stretch auto-rows-fr">
            {cards.map((card) => (
              <div key={card.title} className={settingsCardClass()}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">{card.status}</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
                  </div>
                  <div className={`${card.chipClass} mr-1 shrink-0 self-start`}>{card.status}</div>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/70">{card.text}</p>

                {card.title === "Google Kalender" ? (
                  <div className="mt-5 space-y-3 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Status</span>
                      <span className="text-right font-medium text-white">{googleStatusLabel}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Schreibkalender</span>
                      <span className="text-right font-medium text-white">{selectedStudioLabel}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Aktive Kalender</span>
                      <span className="text-right font-medium text-white">{activeCalendarIds.length}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Zusatzkalender</span>
                      <span className="text-right font-medium text-white">{enabledExtraIds.length}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Zuletzt aktualisiert</span>
                      <span className="text-right font-medium text-white">{lastSync}</span>
                    </div>
                  </div>
                ) : null}

                <div className="mt-auto pt-6">
                  {card.href ? (
                    <Link
                      href={isDemoMode && card.title === "Google Kalender" ? "/calendar/google?success=Demo-Kalender ist simuliert. Es wird keine echte Google-Verbindung hergestellt." : card.href}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-white/10"
                    >
                      <span>{card.cta}</span>
                      {card.title === "Google Kalender" && googleSetupAlertCount > 0 ? (
                        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#2563eb] px-0 text-[10px] font-bold leading-none text-white shadow-[0_8px_18px_rgba(37,99,235,0.35)] ring-2 ring-[#111216]">
                          {googleSetupAlertCount > 99 ? "99+" : String(googleSetupAlertCount)}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <span className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white/50">
                      {card.cta}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
