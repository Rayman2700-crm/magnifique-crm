import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const appointmentId = String(body?.appointmentId ?? "").trim();
    const startAt = String(body?.startAt ?? "").trim();
    const endAt = String(body?.endAt ?? "").trim();

    if (!appointmentId || !startAt || !endAt) {
      return NextResponse.json({ error: "appointmentId, startAt und endAt sind erforderlich." }, { status: 400 });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "Ungültige Zeiten." }, { status: 400 });
    }

    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select("id, google_calendar_id, google_event_id, google_connection_id")
      .eq("id", appointmentId)
      .single();

    if (apptErr || !appt) {
      return NextResponse.json(
        { error: "Termin nicht gefunden: " + (apptErr?.message ?? "") },
        { status: 404 }
      );
    }

    const googleCalendarId = (appt as any).google_calendar_id as string | null;
    const googleEventId = (appt as any).google_event_id as string | null;
    const googleConnectionId = (appt as any).google_connection_id as string | null;

    if (googleCalendarId && googleEventId) {
      const token = await getValidGoogleAccessToken(
        googleConnectionId ? { googleConnectionId } : undefined
      );

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          googleCalendarId
        )}/events/${encodeURIComponent(googleEventId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Google Update fehlgeschlagen (${res.status}): ${txt || "no body"}` },
          { status: 500 }
        );
      }
    }

    const { error: updErr } = await supabase
      .from("appointments")
      .update({
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      })
      .eq("id", appointmentId);

    if (updErr) {
      return NextResponse.json({ error: "DB Update failed: " + updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unbekannter Fehler" }, { status: 500 });
  }
}
