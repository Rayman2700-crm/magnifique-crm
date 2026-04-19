import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { setDefaultCalendar } from "../actions";
import GoogleCalendarUiSettingsClient from "./GoogleCalendarUiSettingsClient";

const STUDIO_TARGETS = [
  {
    key: "studio_radu",
    label: "Studio Radu",
    calendarId: "radu.craus@gmail.com",
    connectionLabel: "Radu Studio",
    emailHint: "radu.craus@gmail.com",
  },
  {
    key: "studio_raluca",
    label: "Studio Magnifique Beauty Institut",
    calendarId: "raluca.magnifique@gmail.com",
    connectionLabel: "Raluca Studio",
    emailHint: "raluca.magnifique@gmail.com",
  },
] as const;

const STUDIO_TARGET_IDS: Set<string> = new Set(STUDIO_TARGETS.map((t) => t.calendarId));

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

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
};



function isStudioConnection(row: Pick<GoogleConnectionRow, "google_account_email" | "connection_label"> | null | undefined) {
  const email = String(row?.google_account_email ?? "").trim().toLowerCase();
  const label = String(row?.connection_label ?? "").trim().toLowerCase();
  return STUDIO_TARGETS.some(
    (target) => email === target.calendarId.toLowerCase() || label === target.connectionLabel.toLowerCase()
  );
}

function sanitizeCalendarIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function buildGoogleConnectHref(input: {
  redirectTo: string;
  connectionLabel: string;
  emailHint?: string | null;
  isPrimary?: boolean;
  isReadOnly?: boolean;
  legacySync?: boolean;
}) {
  const params = new URLSearchParams();
  params.set("redirect_to", input.redirectTo);
  params.set("connection_label", input.connectionLabel);
  params.set("connection_type", "calendar_gmail");
  if (input.emailHint) params.set("email_hint", input.emailHint);
  if (input.isPrimary) params.set("is_primary", "1");
  if (input.isReadOnly) params.set("is_read_only", "1");
  if (typeof input.legacySync === "boolean") {
    params.set("legacy_sync", input.legacySync ? "1" : "0");
  }
  return `/auth/google/start?${params.toString()}`;
}

function formatConnectionDate(value: string | null | undefined) {
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

function uiButtonClass(kind: "primary" | "secondary" = "secondary") {
  if (kind === "primary") {
    return "inline-flex h-11 items-center justify-center rounded-xl border border-[#dcc7a1]/40 bg-[#dcc7a1] px-4 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(220,199,161,0.18)] transition hover:brightness-105";
  }
  return "inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-white/10";
}

function pageCardClass() {
  return "h-full rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm";
}

function infoBoxClass() {
  return "rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
}

function statusChipClass(active: boolean) {
  return active
    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
    : "rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70";
}

function isAdminUser(profileRole: unknown, userEmail: unknown) {
  return (
    String(profileRole ?? "").trim().toUpperCase() === "ADMIN" ||
    String(userEmail ?? "").trim().toLowerCase() === "radu.craus@gmail.com"
  );
}

function getAvailableStudioTargets(isAdmin: boolean) {
  return isAdmin ? [...STUDIO_TARGETS] : STUDIO_TARGETS.filter((target) => target.key === "studio_raluca");
}


export default async function GoogleCalendarSettingsPage({
  searchParams,
}: {
  searchParams?:
    | { error?: string; success?: string; link?: string; googleConnectionId?: string }
    | Promise<{ error?: string; success?: string; link?: string; googleConnectionId?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login");
  }

  async function disconnectConnection(formData: FormData) {
    "use server";

    const connectionId = String(formData.get("connectionId") ?? "").trim();
    const redirectTo = String(formData.get("redirectTo") ?? "/calendar/google").trim() || "/calendar/google";
    if (!connectionId) return;

    const server = await supabaseServer();
    const { data: auth } = await server.auth.getUser();
    const currentUser = auth.user;
    if (!currentUser) redirect("/login");

    const { data: existingConnection } = await server
      .from("google_oauth_connections")
      .select("id, google_account_email, google_account_name, connection_label, is_read_only")
      .eq("id", connectionId)
      .eq("owner_user_id", currentUser.id)
      .maybeSingle();

    const { error } = await server
      .from("google_oauth_connections")
      .update({ is_active: false, is_primary: false, updated_at: new Date().toISOString() })
      .eq("id", connectionId)
      .eq("owner_user_id", currentUser.id);

    if (!error) {
      const [{ data: tokenRow }, { data: remainingRows }] = await Promise.all([
        server
          .from("google_oauth_tokens")
          .select("default_calendar_id, enabled_calendar_ids")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        server
          .from("google_oauth_connections")
          .select("google_account_email, google_account_name, connection_label, is_read_only, is_active")
          .eq("owner_user_id", currentUser.id),
      ]);

      const allBlockedIds = sanitizeCalendarIds([
        existingConnection?.google_account_email,
        existingConnection?.google_account_name,
        existingConnection?.connection_label,
      ]);

      const remainingActiveRows = Array.isArray(remainingRows)
        ? remainingRows.filter((row: any) => row?.is_active !== false)
        : [];

      const activeStudioIds = new Set(
        STUDIO_TARGETS.filter((target) =>
          remainingActiveRows.some(
            (row: any) =>
              String(row?.google_account_email ?? "").trim().toLowerCase() === target.calendarId.toLowerCase() ||
              String(row?.connection_label ?? "").trim().toLowerCase() === target.connectionLabel.toLowerCase()
          )
        ).map((target) => target.calendarId)
      );

      const activeReadOnlyExtraIds = new Set(
        remainingActiveRows
          .filter((row: any) => row?.is_read_only === true)
          .flatMap((row: any) =>
            sanitizeCalendarIds([
              row?.google_account_email,
              row?.google_account_name,
              row?.connection_label,
            ])
          )
      );

      const currentDefaultId = String((tokenRow as any)?.default_calendar_id ?? "").trim();
      const currentEnabledIds = sanitizeCalendarIds((tokenRow as any)?.enabled_calendar_ids ?? []);
      const allowedIds = new Set<string>([...activeStudioIds, ...activeReadOnlyExtraIds]);

      let nextDefaultId = currentDefaultId;
      if (!allowedIds.has(nextDefaultId)) {
        nextDefaultId = activeStudioIds.has(STUDIO_TARGETS[0].calendarId)
          ? STUDIO_TARGETS[0].calendarId
          : activeStudioIds.has(STUDIO_TARGETS[1].calendarId)
            ? STUDIO_TARGETS[1].calendarId
            : "";
      }

      const nextEnabledIds = sanitizeCalendarIds(
        currentEnabledIds.filter((id) => allowedIds.has(String(id ?? "").trim()) && !allBlockedIds.includes(String(id ?? "").trim()))
      );
      const finalEnabledIds = sanitizeCalendarIds(nextDefaultId ? [nextDefaultId, ...nextEnabledIds] : nextEnabledIds);

      if (remainingActiveRows.length === 0) {
        await server
          .from("google_oauth_tokens")
          .upsert(
            {
              user_id: currentUser.id,
              default_calendar_id: null,
              enabled_calendar_ids: [],
              access_token: null,
              refresh_token: null,
              expires_at: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      } else {
        await server
          .from("google_oauth_tokens")
          .upsert(
            {
              user_id: currentUser.id,
              default_calendar_id: nextDefaultId || null,
              enabled_calendar_ids: finalEnabledIds,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
    }

    const params = new URLSearchParams();
    if (error) {
      params.set("error", encodeURIComponent(`Google Verbindung konnte nicht getrennt werden: ${error.message}`));
    } else {
      params.set("success", encodeURIComponent("Google Verbindung wurde getrennt."));
    }

    revalidatePath("/calendar/google");
    revalidatePath("/einstellungen");
    revalidatePath("/dashboard");
    redirect(`${redirectTo}?${params.toString()}`);
  }

  let calendars: CalendarListItem[] = [];
  let loadError: string | null = null;
  let savedDefault: string | null = null;
  let savedEnabled: string[] = [];
  let isAdmin = false;
  let googleConnections: GoogleConnectionRow[] = [];

  const [{ data: tok }, { data: profile }, { data: connectionRows }] = await Promise.all([
    supabase
      .from("google_oauth_tokens")
      .select("default_calendar_id, enabled_calendar_ids, updated_at, refresh_token")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("user_profiles").select("full_name, avatar_path, avatar_ring_color, role").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("google_oauth_connections")
      .select(
        "id, connection_label, google_account_email, google_account_name, connection_type, is_primary, is_read_only, is_active, created_at, updated_at"
      )
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  savedDefault = (tok as any)?.default_calendar_id ?? null;
  savedEnabled = sanitizeCalendarIds((tok as any)?.enabled_calendar_ids ?? []);
  isAdmin = isAdminUser((profile as any)?.role, user.email);
  const availableStudioTargets = getAvailableStudioTargets(isAdmin);
  const AVAILABLE_STUDIO_TARGET_IDS = new Set<string>(availableStudioTargets.map((target) => target.calendarId));
  googleConnections = (connectionRows ?? []) as GoogleConnectionRow[];

  const activeConnections = googleConnections.filter((row) => row.is_active === true);
  const hasStoredGoogleRefreshToken = Boolean(String((tok as any)?.refresh_token ?? "").trim());

  if (activeConnections.length > 0 && hasStoredGoogleRefreshToken) {
    try {
      const token = await getValidGoogleAccessToken();

      const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json: any = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Kalenderliste konnte nicht geladen werden");
      }

      calendars = (json?.items ?? []) as CalendarListItem[];
    } catch (e: any) {
      loadError = e?.message ?? String(e);
    }
  }

  const sorted = [...calendars].sort(
    (a, b) => Number(!!b.primary) - Number(!!a.primary) || String(a.summary ?? a.id).localeCompare(String(b.summary ?? b.id), "de")
  );
  const primaryWritableConnection =
    activeConnections.find((row) => row.is_primary && row.is_read_only !== true) ??
    activeConnections.find((row) => row.is_read_only !== true && !isStudioConnection(row)) ??
    activeConnections.find((row) => row.is_read_only !== true) ??
    null;
  const privateReadOnlyConnections = activeConnections.filter(
    (row) => row.is_read_only === true && !isStudioConnection(row)
  );
  const privateReadOnlyConnection = privateReadOnlyConnections[0] ?? null;

  const studioConnectionsById = new Map<string, GoogleConnectionRow | null>();
  availableStudioTargets.forEach((target) => {
    const found =
      activeConnections.find(
        (row) =>
          String(row.google_account_email ?? "").trim().toLowerCase() === target.calendarId.toLowerCase() ||
          String(row.connection_label ?? "").trim().toLowerCase() === target.connectionLabel.toLowerCase()
      ) ?? null;
    studioConnectionsById.set(target.calendarId, found);
  });

  const savedStudioCalendarId = AVAILABLE_STUDIO_TARGET_IDS.has(String(savedDefault ?? ""))
    ? String(savedDefault)
    : "";
  const effectiveStudioCalendarId = savedStudioCalendarId;

  const inactivePrivateCalendarIds = new Set(
    googleConnections
      .filter((row) => row.is_read_only === true && row.is_active === false && !isStudioConnection(row))
      .flatMap((row) =>
        sanitizeCalendarIds([
          row.google_account_email,
          row.google_account_name,
          row.connection_label,
        ])
      )
  );

  const activePrivateCalendarIds = new Set(
    privateReadOnlyConnections.flatMap((row) =>
      sanitizeCalendarIds([
        row.google_account_email,
        row.google_account_name,
        row.connection_label,
      ])
    )
  );

  const extraCalendars = sorted.filter((calendar) => {
    const calendarId = String(calendar.id).trim();
    if (!calendarId || STUDIO_TARGET_IDS.has(calendarId)) return false;
    if (inactivePrivateCalendarIds.has(calendarId) && !activePrivateCalendarIds.has(calendarId)) return false;
    return true;
  });

  const allowedExtraCalendarIds = new Set(extraCalendars.map((calendar) => String(calendar.id).trim()));

  const enabledExtraIds = sanitizeCalendarIds(
    savedEnabled.filter((id) => !STUDIO_TARGET_IDS.has(id) && allowedExtraCalendarIds.has(String(id).trim()))
  );

  const connectedStudioIds = new Set(Array.from(studioConnectionsById.entries()).filter(([, row]) => Boolean(row)).map(([id]) => id));
  const activeStudioCalendarId = connectedStudioIds.has(effectiveStudioCalendarId) ? effectiveStudioCalendarId : "";
  const selectedStudioTarget = availableStudioTargets.find((target) => target.calendarId === effectiveStudioCalendarId) ?? null;
  const activeCalendarIds = activeConnections.length > 0
    ? sanitizeCalendarIds([activeStudioCalendarId, ...enabledExtraIds])
    : [];
  const hasConnectedStudioTargets = connectedStudioIds.size > 0;

  const primaryMail =
    String(primaryWritableConnection?.google_account_email ?? "").trim() ||
    String(primaryWritableConnection?.google_account_name ?? "").trim() ||
    "";

  const hasAnyGoogleSetup = activeConnections.length > 0;
  const connectedGoogleMail = primaryMail || (hasAnyGoogleSetup ? "Über Google verbunden" : "Nicht verbunden");
  const privateConnectionLabel =
    String(privateReadOnlyConnection?.google_account_email ?? "").trim() ||
    String(privateReadOnlyConnection?.google_account_name ?? "").trim() ||
    String(privateReadOnlyConnection?.connection_label ?? "").trim() ||
    "Nicht verbunden";

  const fullName = String((profile as any)?.full_name ?? user.email ?? "Benutzer").trim();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const avatarPath = String((profile as any)?.avatar_path ?? "").trim();
  const avatarUrl = avatarPath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${avatarPath}?v=${encodeURIComponent(
        String((tok as any)?.updated_at ?? "")
      )}`
    : null;
  const ringColor = String((profile as any)?.avatar_ring_color ?? "#4F7CFF").trim() || "#4F7CFF";
  const lastSync = formatConnectionDate((tok as any)?.updated_at ?? primaryWritableConnection?.updated_at ?? null);

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
                  <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d7c097]">Magnifique Beauty Institut Google Kalender</p>
                <h1 className="mt-1 truncate text-3xl font-semibold text-white sm:text-4xl">Google Kalender</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  Hauptverbindung, Studio-Schreibziele und read-only Zusatzkalender pro Benutzer verwalten.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/einstellungen" className={uiButtonClass("secondary")}>
                Zu Einstellungen
              </Link>
              <Link href="/calendar" className={uiButtonClass("secondary")}>
                Zum Kalender
              </Link>
            </div>
          </div>
        </section>

        {sp?.error ? (
          <section className="rounded-[24px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {decodeURIComponent(sp.error)}
          </section>
        ) : null}

        {sp?.success ? (
          <section className="rounded-[24px] border border-green-500/30 bg-green-500/10 px-5 py-4 text-sm text-green-200 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {decodeURIComponent(sp.success)}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)] items-stretch">
          <div className={pageCardClass()}>
            <div className="flex flex-col gap-4 rounded-[22px] border border-white/10 bg-black/20 p-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Verbindungsstatus</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Google Verbindung</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                  Sichtbar sind Verbindungsstatus, Schreibkalender, aktive Kalender und der letzte bekannte Sync.
                </p>
              </div>
              <div className={statusChipClass(hasAnyGoogleSetup)}>{hasAnyGoogleSetup ? "Verbunden" : "Nicht verbunden"}</div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className={infoBoxClass()}>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Verbindung</div>
                <div className="mt-3 text-base font-semibold text-white break-all">{connectedGoogleMail}</div>
              </div>
              <div className={infoBoxClass()}>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Letzter Sync</div>
                <div className="mt-3 text-base font-semibold text-white">{lastSync}</div>
              </div>
              <div className={infoBoxClass()}>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Schreibkalender</div>
                <div className="mt-3 text-base font-semibold text-white break-words">{selectedStudioTarget?.label ?? "Kein verbundener Schreibkalender"}{effectiveStudioCalendarId ? ` · ${effectiveStudioCalendarId}` : ""}</div>
              </div>
              <div className={infoBoxClass()}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Aktive Kalender</div>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/80">
                    {activeCalendarIds.length}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeCalendarIds.length > 0 ? (
                    activeCalendarIds.map((calendarId) => {
                      const studioTarget = STUDIO_TARGETS.find((target) => target.calendarId === calendarId);
                      const matchedCalendar = sorted.find((calendar) => String(calendar.id).trim() === calendarId);
                      const label = studioTarget?.label ?? matchedCalendar?.summary ?? calendarId;
                      return (
                        <span key={calendarId} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                          {label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-white/50">Noch keine aktiven Kalender gespeichert.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <GoogleCalendarUiSettingsClient
                saveAction={setDefaultCalendar}
                studioTargets={availableStudioTargets}
                selectedStudioCalendarId={activeStudioCalendarId}
                extraCalendars={extraCalendars}
                enabledExtraIds={enabledExtraIds}
              />
            </div>

          </div>

          <div className={pageCardClass()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Verbunden</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Studio-Schreibziele</h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Diese beiden Kalender bleiben die auswählbaren Ziele für neue Studiotermine.
                </p>
              </div>
              <div className={statusChipClass(hasConnectedStudioTargets)}>{hasConnectedStudioTargets ? "Aktiv" : "Offen"}</div>
            </div>

            <div className="mt-5 space-y-4">
              {availableStudioTargets.map((target) => {
                const connection = studioConnectionsById.get(target.calendarId);
                return (
                  <div key={target.key} className={infoBoxClass()}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-white">{target.label}</div>
                        <div className="mt-1 text-sm text-white/55 break-all">{target.calendarId}</div>
                      </div>
                      <div className={statusChipClass(Boolean(connection))}>{connection ? "Verbunden" : "Offen"}</div>
                    </div>

                    <div className="mt-3 text-sm text-white/60">Letzte Aktualisierung: {formatConnectionDate(connection?.updated_at ?? null)}</div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={buildGoogleConnectHref({
                          redirectTo: "/calendar/google",
                          connectionLabel: target.connectionLabel,
                          emailHint: target.emailHint,
                          isPrimary: target.calendarId === effectiveStudioCalendarId,
                          isReadOnly: false,
                          legacySync: target.key === "studio_radu",
                        })}
                        className={uiButtonClass("primary")}
                      >
                        {connection ? "Neu verbinden" : "Verbinden"}
                      </Link>

                      {connection ? (
                        <form action={disconnectConnection}>
                          <input type="hidden" name="connectionId" value={connection.id} />
                          <input type="hidden" name="redirectTo" value="/calendar/google" />
                          <button type="submit" className={uiButtonClass("secondary")}>
                            Trennen
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}

            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Read-only</div>
                  <div className="mt-2 text-lg font-semibold text-white">Privater Kalender</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    Eigener Google Kalender nur zur Anzeige im CRM. Es wird nichts aus dem CRM dorthin geschrieben.
                  </div>
                </div>
                <div className={statusChipClass(Boolean(privateReadOnlyConnection))}>
                  {privateReadOnlyConnection ? "Verbunden" : "Nicht verbunden"}
                </div>
              </div>

              <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-[#d7c097]">Aktuelle Verbindung</div>
                <div className="mt-2 text-sm font-semibold text-white break-all">{privateConnectionLabel}</div>
                <div className="mt-2 text-xs text-white/50">
                  {privateReadOnlyConnection
                    ? `Letzte Aktualisierung: ${formatConnectionDate(privateReadOnlyConnection.updated_at ?? null)}`
                    : "Noch kein privater read-only Kalender verbunden."}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={buildGoogleConnectHref({
                    redirectTo: "/calendar/google",
                    connectionLabel: "Privater Kalender",
                    isPrimary: false,
                    isReadOnly: true,
                    legacySync: true,
                  })}
                  className={uiButtonClass("primary")}
                >
                  {privateReadOnlyConnection ? "Privat neu verbinden" : "Privaten Kalender verbinden"}
                </Link>

                {privateReadOnlyConnection ? (
                  <form action={disconnectConnection}>
                    <input type="hidden" name="connectionId" value={privateReadOnlyConnection.id} />
                    <input type="hidden" name="redirectTo" value="/calendar/google" />
                    <button type="submit" className={uiButtonClass("secondary")}>
                      Privaten Kalender trennen
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {loadError && hasStoredGoogleRefreshToken ? (
          <section className="rounded-[24px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200 shadow-[0_24px_80px_rgba(0,0,0,0.35)] break-words">
            <div className="font-semibold text-white">Fehler beim Laden der Kalenderliste</div>
            <div className="mt-2">{loadError}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
