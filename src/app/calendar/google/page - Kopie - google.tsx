import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { setDefaultCalendar } from "../actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STUDIO_DEFAULT_CALENDAR_ID = "radu.craus@gmail.com";

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
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
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

  let calendars: CalendarListItem[] = [];
  let loadError: string | null = null;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  let savedDefault: string | null = null;
  let savedEnabled: string[] = [];
  let isAdmin = false;
  let googleConnections: GoogleConnectionRow[] = [];

  if (user) {
    const [{ data: tok }, { data: profile }, { data: connectionRows }] = await Promise.all([
      supabase
        .from("google_oauth_tokens")
        .select("default_calendar_id, enabled_calendar_ids")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("google_oauth_connections")
        .select(
          "id, connection_label, google_account_email, google_account_name, connection_type, is_primary, is_read_only, is_active, created_at, updated_at"
        )
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    savedDefault = (tok as any)?.default_calendar_id ?? null;
    savedEnabled = sanitizeCalendarIds((tok as any)?.enabled_calendar_ids ?? []);
    isAdmin = String((profile as any)?.role ?? "").toUpperCase() === "ADMIN";
    googleConnections = (connectionRows ?? []) as GoogleConnectionRow[];
  }

  try {
    const token = await getValidGoogleAccessToken();

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );

    const json: any = await res.json();
    if (!res.ok) {
      throw new Error(
        json?.error?.message ?? "Kalenderliste konnte nicht geladen werden"
      );
    }

    calendars = (json?.items ?? []) as CalendarListItem[];
  } catch (e: any) {
    loadError = e?.message ?? String(e);
  }

  const sorted = [...calendars].sort(
    (a, b) =>
      Number(!!b.primary) - Number(!!a.primary) ||
      String(a.summary ?? a.id).localeCompare(String(b.summary ?? b.id), "de")
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

  const enabledExtras = isAdmin
    ? sanitizeCalendarIds(savedEnabled.filter((id) => id !== studioCalendar.id))
    : [];

  const raduConnection = googleConnections.find(
    (row) =>
      String(row.google_account_email ?? "").trim().toLowerCase() === "radu.craus@gmail.com" ||
      String(row.connection_label ?? "").trim().toLowerCase() === "radu studio"
  ) ?? null;

  const ralucaConnection = googleConnections.find(
    (row) =>
      String(row.google_account_email ?? "").trim().toLowerCase() === "raluca.magnifique@gmail.com" ||
      String(row.connection_label ?? "").trim().toLowerCase() === "raluca studio"
  ) ?? null;

  const allConnections = googleConnections;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Google Kalender Setup"
        description="Studio-Standardkalender bleibt für alle gleich. Zusatzkalender sind nur für Admin sichtbar."
        actions={
          <div className="flex gap-2">
            <Link href="/calendar">
              <Button variant="secondary">Zurück</Button>
            </Link>
          </div>
        }
      />

      {sp?.error ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent>
            <div className="text-sm text-red-200">
              {decodeURIComponent(sp.error)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sp?.success ? (
        <Card className="border-green-500/30 bg-green-500/10">
          <CardContent>
            <div className="text-sm text-green-200">
              {decodeURIComponent(sp.success)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent>
            <div className="font-semibold text-white">Fehler</div>
            <div className="mt-2 text-sm text-red-200 break-words">
              {loadError}
            </div>
            <div className="mt-4">
              <Link href="/auth/google/start">
                <Button>Google verbinden</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="space-y-4">
              <div className="text-sm text-white/60">
                Gespeicherter Standard-Kalender:{" "}
                <span className="text-white font-medium">
                  {STUDIO_DEFAULT_CALENDAR_ID}
                </span>
              </div>

              <form action={setDefaultCalendar} className="space-y-4">
                <div className="text-sm font-medium text-white">
                  Standard-Kalender
                </div>

                <input type="hidden" name="calendarId" value={studioCalendar.id} />
                <input type="hidden" name="enabledCalendarIds" value={studioCalendar.id} />

                {isAdmin
                  ? enabledExtras.map((calendarId) => (
                      <input
                        key={calendarId}
                        type="hidden"
                        name="enabledCalendarIds"
                        value={calendarId}
                      />
                    ))
                  : null}

                <select
                  name="calendarId_display_only"
                  value={studioCalendar.id}
                  disabled
                  className="w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white/80 outline-none"
                >
                  <option value={studioCalendar.id}>
                    {(studioCalendar.primary ? "⭐ " : "") +
                      (studioCalendar.summary ?? studioCalendar.id)}{" "}
                    {studioCalendar.accessRole ? `(${studioCalendar.accessRole})` : ""}
                  </option>
                </select>

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                  Alle Studio-Termine werden weiter in den gemeinsamen Standard-Kalender{" "}
                  <span className="font-medium text-white">{STUDIO_DEFAULT_CALENDAR_ID}</span>{" "}
                  geschrieben.
                </div>

                {isAdmin ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-white">
                      Zusatzkalender nur für Admin
                    </div>

                    <div className="space-y-2">
                      {extraCalendars.length > 0 ? (
                        extraCalendars.map((calendar) => {
                          const checked = enabledExtras.includes(calendar.id);
                          return (
                            <label
                              key={calendar.id}
                              className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"
                            >
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

                <Button type="submit">Speichern</Button>
              </form>
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-white">Studio-Google-Verbindungen</div>
                  <div className="mt-1 text-sm text-white/55">
                    Hier verbindest du zusätzliche Google-Konten für spätere schreibbare Studio-Kalender.
                    In diesem Schritt wird nur die Verbindung angelegt, noch keine Terminlogik umgestellt.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-white">Radu Studio</div>
                    <div className="mt-1 text-xs text-white/45">radu.craus@gmail.com</div>
                    <div className="mt-3 text-xs text-white/60">
                      Status:{" "}
                      <span className="font-medium text-white">
                        {raduConnection ? "Verbunden" : "Noch nicht als Mehrfach-Verbindung angelegt"}
                      </span>
                    </div>
                    {raduConnection ? (
                      <div className="mt-1 text-xs text-white/45">
                        Letzte Aktualisierung: {formatConnectionDate(raduConnection.updated_at)}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <Link
                        href={buildGoogleConnectHref({
                          redirectTo: "/calendar/google",
                          connectionLabel: "Radu Studio",
                          emailHint: "radu.craus@gmail.com",
                          isPrimary: true,
                          isReadOnly: false,
                          legacySync: true,
                        })}
                      >
                        <Button>{raduConnection ? "Neu verbinden" : "Verbinden"}</Button>
                      </Link>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-white">Raluca Studio</div>
                    <div className="mt-1 text-xs text-white/45">raluca.magnifique@gmail.com</div>
                    <div className="mt-3 text-xs text-white/60">
                      Status:{" "}
                      <span className="font-medium text-white">
                        {ralucaConnection ? "Verbunden" : "Noch nicht verbunden"}
                      </span>
                    </div>
                    {ralucaConnection ? (
                      <div className="mt-1 text-xs text-white/45">
                        Letzte Aktualisierung: {formatConnectionDate(ralucaConnection.updated_at)}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <Link
                        href={buildGoogleConnectHref({
                          redirectTo: "/calendar/google",
                          connectionLabel: "Raluca Studio",
                          emailHint: "raluca.magnifique@gmail.com",
                          isPrimary: false,
                          isReadOnly: false,
                          legacySync: false,
                        })}
                      >
                        <Button>{ralucaConnection ? "Neu verbinden" : "Verbinden"}</Button>
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">Bereits gespeicherte Verbindungen</div>

                  <div className="mt-3 space-y-2">
                    {allConnections.length > 0 ? (
                      allConnections.map((connection) => (
                        <div
                          key={connection.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-white">
                              {connection.connection_label ?? "Google Verbindung"}
                            </div>
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
                            Erstellt: {formatConnectionDate(connection.created_at)} · Aktualisiert:{" "}
                            {formatConnectionDate(connection.updated_at)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        Noch keine Mehrfach-Verbindungen gespeichert.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
