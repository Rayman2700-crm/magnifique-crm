import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { createTestEvent, setDefaultCalendar } from "../actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

export default async function GoogleCalendarSettingsPage({
  searchParams,
}: {
  searchParams?:
    | { error?: string; success?: string; link?: string }
    | Promise<{ error?: string; success?: string; link?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;

  let calendars: CalendarListItem[] = [];
  let loadError: string | null = null;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  let savedDefault: string | null = null;
  if (user) {
    const { data: tok } = await supabase
      .from("google_oauth_tokens")
      .select("default_calendar_id")
      .eq("user_id", user.id)
      .maybeSingle();
    savedDefault = (tok as any)?.default_calendar_id ?? null;
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

  const sorted = calendars.sort(
    (a, b) => Number(!!b.primary) - Number(!!a.primary)
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Google Kalender Setup"
        description="Standard-Kalender auswählen und Verbindung testen."
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
              {sp?.link ? (
                <>
                  {" "}
                  <a
                    className="underline underline-offset-4"
                    href={decodeURIComponent(sp.link)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    (in Google Kalender öffnen)
                  </a>
                </>
              ) : null}
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="space-y-4">
              <div className="text-sm text-white/60">
                Gespeicherter Standard-Kalender:{" "}
                <span className="text-white font-medium">
                  {savedDefault ? savedDefault : "— noch keiner —"}
                </span>
              </div>

              <form action={setDefaultCalendar} className="space-y-3">
                <div className="text-sm font-medium text-white">
                  Standard-Kalender auswählen
                </div>

                <select
                  name="calendarId"
                  defaultValue={savedDefault ?? ""}
                  className="w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                >
                  <option value="">— Bitte wählen —</option>
                  {sorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.primary ? "⭐ " : "") + (c.summary ?? c.id)}{" "}
                      {c.accessRole ? `(${c.accessRole})` : ""}
                    </option>
                  ))}
                </select>

                <Button type="submit">Speichern</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="space-y-4">
              <div className="text-sm font-medium text-white">Testevent</div>

              <form action={createTestEvent} className="space-y-3">
                <select
                  name="calendarId"
                  defaultValue={savedDefault ?? ""}
                  className="w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                >
                  <option value="">— Bitte wählen —</option>
                  {sorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.primary ? "⭐ " : "") + (c.summary ?? c.id)}
                    </option>
                  ))}
                </select>

                <Button variant="secondary" type="submit">
                  Testevent erstellen
                </Button>
              </form>

              <div className="text-sm text-white/50">
                Tipp: Wenn oben ein Link erscheint, ist die Verbindung korrekt.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}