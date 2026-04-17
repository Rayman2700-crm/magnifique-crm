import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { setDefaultCalendar } from "../actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STUDIO_DEFAULT_CALENDAR_ID = "radu.craus@gmail.com";

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
    label: "Studio Raluca",
    calendarId: "raluca.magnifique@gmail.com",
    connectionLabel: "Raluca Studio",
    emailHint: "raluca.magnifique@gmail.com",
  },
] as const;

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

    const { error } = await server
      .from("google_oauth_connections")
      .update({ is_active: false, is_primary: false, updated_at: new Date().toISOString() })
      .eq("id", connectionId)
      .eq("owner_user_id", currentUser.id);

    const params = new URLSearchParams();
    if (error) {
      params.set("error", encodeURIComponent(`Google Verbindung konnte nicht getrennt werden: ${error.message}`));
    } else {
      params.set("success", encodeURIComponent("Google Verbindung wurde getrennt."));
    }

    revalidatePath("/calendar/google");
    revalidatePath("/einstellungen");
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
      .select("default_calendar_id, enabled_calendar_ids, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle(),
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
  isAdmin = String((profile as any)?.role ?? "").toUpperCase() === "ADMIN";
  googleConnections = (connectionRows ?? []) as GoogleConnectionRow[];

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

  const sorted = [...calendars].sort(
    (a, b) => Number(!!b.primary) - Number(!!a.primary) || String(a.summary ?? a.id).localeCompare(String(b.summary ?? b.id), "de")
  );

  const studioCalendar =
    sorted.find((calendar) => String(calendar.id).trim() === STUDIO_DEFAULT_CALENDAR_ID) ??
    sorted.find((calendar) => String(calendar.summary ?? "").trim() === STUDIO_DEFAULT_CALENDAR_ID) ?? {
      id: STUDIO_DEFAULT_CALENDAR_ID,
      summary: STUDIO_DEFAULT_CALENDAR_ID,
      accessRole: "owner",
    };

  const extraCalendars = isAdmin
    ? sorted.filter((calendar) => String(calendar.id).trim() !== String(studioCalendar.id).trim())
    : [];

  const enabledExtras = isAdmin ? sanitizeCalendarIds(savedEnabled.filter((id) => id !== studioCalendar.id)) : [];

  const activeConnections = googleConnections.filter((row) => row.is_active !== false);
  const raduConnection =
    activeConnections.find(
      (row) =>
        String(row.google_account_email ?? "").trim().toLowerCase() === "radu.craus@gmail.com" ||
        String(row.connection_label ?? "").trim().toLowerCase() === "radu studio"
    ) ?? null;

  const ralucaConnection =
    activeConnections.find(
      (row) =>
        String(row.google_account_email ?? "").trim().toLowerCase() === "raluca.magnifique@gmail.com" ||
        String(row.connection_label ?? "").trim().toLowerCase() === "raluca studio"
    ) ?? null;

  const primaryWritableConnection =
    activeConnections.find((row) => row.is_primary && row.is_read_only !== true) ??
    activeConnections.find((row) => row.is_read_only !== true) ??
    null;

  const readOnlyConnections = activeConnections.filter((row) => row.is_read_only === true);
  const allConnections = googleConnections;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Google Kalender"
        description="Hauptverbindung, Studio-Schreibziele und read-only Zusatzkalender pro Benutzer verwalten."
        actions={
          <div className="flex gap-2">
            <Link href="/einstellungen">
              <Button variant="secondary">Zu Einstellungen</Button>
            </Link>
            <Link href="/calendar">
              <Button variant="secondary">Zum Kalender</Button>
            </Link>
          </div>
        }
      />

      {sp?.error ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent>
            <div className="text-sm text-red-200">{decodeURIComponent(sp.error)}</div>
          </CardContent>
        </Card>
      ) : null}

      {sp?.success ? (
        <Card className="border-green-500/30 bg-green-500/10">
          <CardContent>
            <div className="text-sm text-green-200">{decodeURIComponent(sp.success)}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">Verbindungsstatus</div>
                <div className="mt-1 text-sm text-white/55">
                  Sichtbar ist die Hauptverbindung, der Studio-Hauptkalender, aktive Kalender und der letzte bekannte Sync.
                </div>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${primaryWritableConnection ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/70"}`}>
                {primaryWritableConnection ? "Verbunden" : "Nicht verbunden"}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Google-Mail</div>
                <div className="mt-2 text-sm font-medium text-white break-all">
                  {primaryWritableConnection?.google_account_email || primaryWritableConnection?.google_account_name || "Nicht verbunden"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Letzter Sync</div>
                <div className="mt-2 text-sm font-medium text-white">{formatConnectionDate((tok as any)?.updated_at ?? primaryWritableConnection?.updated_at ?? null)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Hauptkalender</div>
                <div className="mt-2 text-sm font-medium text-white break-all">{savedDefault || STUDIO_DEFAULT_CALENDAR_ID}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Aktive Kalender</div>
                <div className="mt-2 text-sm font-medium text-white">{savedEnabled.length > 0 ? `${savedEnabled.length} aktiv` : "Noch keine gespeichert"}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
              Practitioner schreiben Studiotermine weiter in die zwei Studio-Kalender. Ein privater eigener Kalender wird später zusätzlich nur read-only angebunden.
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={buildGoogleConnectHref({
                  redirectTo: "/calendar/google",
                  connectionLabel: "Meine Google Verbindung",
                  isPrimary: true,
                  isReadOnly: false,
                })}
              >
                <Button>{primaryWritableConnection ? "Neu verbinden" : "Google verbinden"}</Button>
              </Link>

              {primaryWritableConnection ? (
                <form action={disconnectConnection}>
                  <input type="hidden" name="connectionId" value={primaryWritableConnection.id} />
                  <input type="hidden" name="redirectTo" value="/calendar/google" />
                  <Button type="submit" variant="secondary">Trennen</Button>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Studio-Schreibziele</div>
              <div className="mt-1 text-sm text-white/55">
                Diese beiden Kalender bleiben die auswählbaren Ziele für neue Studiotermine.
              </div>
            </div>

            <div className="space-y-3">
              {STUDIO_TARGETS.map((target) => {
                const connection = target.key === "studio_radu" ? raduConnection : ralucaConnection;
                return (
                  <div key={target.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{target.label}</div>
                        <div className="mt-1 text-xs text-white/45 break-all">{target.calendarId}</div>
                      </div>
                      <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${connection ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/70"}`}>
                        {connection ? "Verbunden" : "Offen"}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-white/55">Letzte Aktualisierung: {formatConnectionDate(connection?.updated_at ?? null)}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={buildGoogleConnectHref({
                          redirectTo: "/calendar/google",
                          connectionLabel: target.connectionLabel,
                          emailHint: target.emailHint,
                          isPrimary: target.key === "studio_radu",
                          isReadOnly: false,
                          legacySync: target.key === "studio_radu",
                        })}
                      >
                        <Button>{connection ? "Neu verbinden" : "Verbinden"}</Button>
                      </Link>

                      {connection ? (
                        <form action={disconnectConnection}>
                          <input type="hidden" name="connectionId" value={connection.id} />
                          <input type="hidden" name="redirectTo" value="/calendar/google" />
                          <Button type="submit" variant="secondary">Trennen</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {loadError ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent>
            <div className="font-semibold text-white">Fehler beim Laden der Kalenderliste</div>
            <div className="mt-2 text-sm text-red-200 break-words">{loadError}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Kalender in der UI</div>
              <div className="mt-1 text-sm text-white/55">
                Hauptkalender bleibt der Studio-Kalender. Zusatzkalender sind nur für Admin sichtbar und nur read-only.
              </div>
            </div>

            <form action={setDefaultCalendar} className="space-y-4">
              <input type="hidden" name="calendarId" value={studioCalendar.id} />
              <input type="hidden" name="enabledCalendarIds" value={studioCalendar.id} />

              {isAdmin
                ? enabledExtras.map((calendarId) => (
                    <input key={calendarId} type="hidden" name="enabledCalendarIds" value={calendarId} />
                  ))
                : null}

              <div>
                <div className="text-sm font-medium text-white">Hauptkalender</div>
                <select
                  name="calendarId_display_only"
                  value={studioCalendar.id}
                  disabled
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white/80 outline-none"
                >
                  <option value={studioCalendar.id}>
                    {(studioCalendar.primary ? "⭐ " : "") + (studioCalendar.summary ?? studioCalendar.id)} {studioCalendar.accessRole ? `(${studioCalendar.accessRole})` : ""}
                  </option>
                </select>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                Alle Studio-Termine werden weiter in den gemeinsamen Standard-Kalender <span className="font-medium text-white">{STUDIO_DEFAULT_CALENDAR_ID}</span> geschrieben.
              </div>

              {isAdmin ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-white">Zusatzkalender nur für Admin</div>
                  <div className="space-y-2">
                    {extraCalendars.length > 0 ? (
                      extraCalendars.map((calendar) => {
                        const checked = enabledExtras.includes(calendar.id);
                        return (
                          <label key={calendar.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white break-words">
                                {(calendar.primary ? "⭐ " : "") + (calendar.summary ?? calendar.id)}
                              </div>
                              <div className="mt-1 text-xs text-white/45 break-all">
                                {calendar.id}
                                {calendar.accessRole ? ` · ${calendar.accessRole}` : ""}
                              </div>
                            </div>

                            <input
                              type="checkbox"
                              name="enabledCalendarIds"
                              value={calendar.id}
                              defaultChecked={checked}
                              className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                            />
                          </label>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        Keine weiteren Kalender gefunden.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Zusatzkalender sind nur zur Anzeige gedacht und schreiben nichts ins CRM.
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                  Weitere Kalender sind nur für Admin sichtbar.
                </div>
              )}

              <Button type="submit">Kalenderauswahl speichern</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Gespeicherte Verbindungen</div>
              <div className="mt-1 text-sm text-white/55">
                Hier siehst du Hauptverbindungen, Studiokalender und spätere read-only Privatkalender.
              </div>
            </div>

            <div className="space-y-2">
              {allConnections.length > 0 ? (
                allConnections.map((connection) => (
                  <div key={connection.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{connection.connection_label ?? "Google Verbindung"}</div>
                      {connection.is_primary ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          Primär
                        </span>
                      ) : null}
                      {connection.is_read_only ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                          Read-only
                        </span>
                      ) : null}
                      {connection.is_active === false ? (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                          Inaktiv
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs text-white/55 break-all">
                      {connection.google_account_email || "keine Google-E-Mail gespeichert"}
                      {connection.google_account_name ? ` · ${connection.google_account_name}` : ""}
                      {connection.connection_type ? ` · ${connection.connection_type}` : ""}
                    </div>

                    <div className="mt-1 text-xs text-white/40">
                      Erstellt: {formatConnectionDate(connection.created_at)} · Aktualisiert: {formatConnectionDate(connection.updated_at)}
                    </div>

                    {connection.is_active !== false ? (
                      <div className="mt-3">
                        <form action={disconnectConnection}>
                          <input type="hidden" name="connectionId" value={connection.id} />
                          <input type="hidden" name="redirectTo" value="/calendar/google" />
                          <Button type="submit" variant="secondary">Trennen</Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                  Noch keine Verbindungen gespeichert.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
