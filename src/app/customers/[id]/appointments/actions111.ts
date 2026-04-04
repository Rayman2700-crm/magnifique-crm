"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function rethrowIfNextRedirect(e: any) {
  if (
    e &&
    typeof e === "object" &&
    typeof e.digest === "string" &&
    e.digest.startsWith("NEXT_REDIRECT")
  ) {
    throw e;
  }
}

function buildReminderAt(start: Date) {
  return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}

function normalizeStatus(value: string): AppointmentStatus {
  if (value === "completed") return "completed";
  if (value === "cancelled") return "cancelled";
  if (value === "no_show") return "no_show";
  return "scheduled";
}

function buildNotesInternal(input: {
  title: string;
  notes: string;
  bufferMin: number;
  status: AppointmentStatus;
}) {
  const parts: string[] = [];

  parts.push(`Titel: ${input.title}`);
  if (input.notes) parts.push(`Notiz: ${input.notes}`);
  if (Number.isFinite(input.bufferMin) && input.bufferMin > 0) {
    parts.push(`Buffer: ${input.bufferMin} min`);
  }
  parts.push(`Status: ${input.status}`);

  return parts.join("\n").trim();
}

export async function deleteAppointment(
  customerProfileId: string,
  appointmentId: string
) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp?.person_id) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "customer_profile person_id nicht gefunden."
      )}`
    );
  }

  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select("id, person_id, google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Termin nicht gefunden: " + (apptErr?.message ?? "")
      )}`
    );
  }

  if ((appt as any).person_id !== (cp as any).person_id) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Termin gehört nicht zu diesem Kunden."
      )}`
    );
  }

  const googleCalendarId = (appt as any).google_calendar_id as string | null;
  const googleEventId = (appt as any).google_event_id as string | null;

  if (googleCalendarId && googleEventId) {
    try {
      const token = await getValidGoogleAccessToken();

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          googleCalendarId
        )}/events/${encodeURIComponent(googleEventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const txt = await res.text().catch(() => "");
        redirect(
          `/customers/${customerProfileId}?error=${encodeURIComponent(
            `Google Delete fehlgeschlagen (${res.status}): ${txt || "no body"}`
          )}`
        );
      }
    } catch (e: any) {
      rethrowIfNextRedirect(e);
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          "Google Delete Exception: " + (e?.message ?? "unknown")
        )}`
      );
    }
  }

  const { error: delErr } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId);

  if (delErr) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "DB Delete failed: " + delErr.message
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin gelöscht ✅"
    )}`
  );
}

export async function updateAppointment(
  customerProfileId: string,
  appointmentId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const durationMin = Number(formData.get("duration") ?? 0);
  const bufferMin = Number(formData.get("buffer") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));

  if (!title || !startLocal || !Number.isFinite(durationMin) || durationMin <= 0) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Bitte Titel, Start und Dauer ausfüllen."
      )}`
    );
  }

  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp?.person_id) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "customer_profile person_id nicht gefunden."
      )}`
    );
  }

  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select("id, person_id, google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Termin nicht gefunden: " + (apptErr?.message ?? "")
      )}`
    );
  }

  if ((appt as any).person_id !== (cp as any).person_id) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Termin gehört nicht zu diesem Kunden."
      )}`
    );
  }

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Ungültiges Start-Datum."
      )}`
    );
  }

  const end = new Date(start.getTime() + durationMin * 60_000);

  const googleCalendarId = (appt as any).google_calendar_id as string | null;
  const googleEventId = (appt as any).google_event_id as string | null;

  if (googleCalendarId && googleEventId) {
    try {
      const token = await getValidGoogleAccessToken();

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
            summary: title,
            description: notes || undefined,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
          cache: "no-store",
        }
      );

      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json?.error?.message ?? `Google Update fehlgeschlagen (${res.status})`;
        redirect(
          `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
            msg
          )}`
        );
      }
    } catch (e: any) {
      rethrowIfNextRedirect(e);
      redirect(
        `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
          "Google Update Exception: " + (e?.message ?? "unknown")
        )}`
      );
    }
  }

  const notesInternal = buildNotesInternal({
    title,
    notes,
    bufferMin,
    status,
  });

  const { error: updErr } = await supabase
    .from("appointments")
    .update({
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      reminder_at: buildReminderAt(start).toISOString(),
      reminder_sent_at: null,
      notes_internal: notesInternal,
    })
    .eq("id", appointmentId);

  if (updErr) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "DB Update failed: " + updErr.message
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin geändert ✅"
    )}`
  );
}