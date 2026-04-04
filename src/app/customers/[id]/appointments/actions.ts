"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

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

export async function createAppointment(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const durationMin = Number(formData.get("duration") ?? 0);
  const bufferMin = Number(formData.get("buffer") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));

  if (!title || !startLocal || !durationMin) {
    redirect(
      `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(
        "Bitte Titel, Start und Dauer ausfüllen."
      )}`
    );
  }

  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp?.tenant_id) {
    redirect(
      `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(
        "customer_profile tenant_id nicht gefunden."
      )}`
    );
  }

  if (!cp?.person_id) {
    redirect(
      `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(
        "customer_profile person_id nicht gefunden."
      )}`
    );
  }

  const tenantId = cp.tenant_id as string;
  const personId = cp.person_id as string;

  const { data: tok, error: tokErr } = await supabase
    .from("google_oauth_tokens")
    .select("default_calendar_id")
    .eq("user_id", user.id)
    .single();

  if (tokErr) {
    redirect(
      `/calendar?error=${encodeURIComponent(
        "Token DB Fehler: " + tokErr.message
      )}`
    );
  }

  const calendarId = (tok as any)?.default_calendar_id as string | null;
  if (!calendarId) {
    redirect(
      `/calendar?error=${encodeURIComponent(
        "Bitte zuerst Standard-Kalender speichern."
      )}`
    );
  }

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(
      `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(
        "Ungültiges Start-Datum."
      )}`
    );
  }

  const effectiveStart = start;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const token = await getValidGoogleAccessToken();

  const eventRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        description: notes || undefined,
        start: { dateTime: effectiveStart.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
      cache: "no-store",
    }
  );

  const eventJson: any = await eventRes.json();
  if (!eventRes.ok) {
    const msg =
      eventJson?.error?.message ?? "Google Event konnte nicht erstellt werden";
    redirect(
      `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(
        msg
      )}`
    );
  }

  const googleEventId = eventJson?.id as string | undefined;

  const { error: insErr } = await supabase.from("appointments").insert({
    tenant_id: tenantId,
    person_id: personId,
    service_id: null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reminder_at: buildReminderAt(start).toISOString(),
    reminder_sent_at: null,
    notes_internal: buildNotesInternal({
      title,
      notes,
      bufferMin,
      status,
    }),
    google_calendar_id: calendarId,
    google_event_id: googleEventId ?? null,
    created_by: user.id,
  });

  if (insErr) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "DB Insert failed: " + insErr.message
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin erstellt ✅"
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
  const user = userData.user;
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const durationMin = Number(formData.get("duration") ?? 0);
  const bufferMin = Number(formData.get("buffer") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));

  if (!title || !startLocal || !durationMin) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Bitte Titel, Start und Dauer ausfüllen."
      )}`
    );
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (appointmentError || !appointment) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Termin konnte nicht geladen werden."
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

  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const googleCalendarId = (appointment as any)?.google_calendar_id as string | null;
  const googleEventId = (appointment as any)?.google_event_id as string | null;

  if (googleCalendarId && googleEventId) {
    try {
      const token = await getValidGoogleAccessToken();
      const updateRes = await fetch(
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

      if (!updateRes.ok) {
        const eventJson: any = await updateRes.json().catch(() => null);
        const msg =
          eventJson?.error?.message ?? "Google Event konnte nicht aktualisiert werden";
        redirect(
          `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
            msg
          )}`
        );
      }
    } catch (error: any) {
      redirect(
        `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
          error?.message ?? "Google Event konnte nicht aktualisiert werden"
        )}`
      );
    }
  }

  const { error: updateError } = await supabase
    .from("appointments")
    .update({
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      reminder_at: buildReminderAt(start).toISOString(),
      notes_internal: buildNotesInternal({
        title,
        notes,
        bufferMin,
        status,
      }),
      created_by: user.id,
    })
    .eq("id", appointmentId);

  if (updateError) {
    redirect(
      `/customers/${customerProfileId}/appointments/${appointmentId}/edit?error=${encodeURIComponent(
        "Termin konnte nicht gespeichert werden: " + updateError.message
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin gespeichert ✅"
    )}`
  );
}


export async function deleteAppointment(
  customerProfileId: string,
  appointmentId: string
) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (appointmentError || !appointment) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Termin konnte nicht geladen werden."
      )}`
    );
  }

  const googleCalendarId = (appointment as any)?.google_calendar_id as string | null;
  const googleEventId = (appointment as any)?.google_event_id as string | null;

  if (googleCalendarId && googleEventId) {
    try {
      const token = await getValidGoogleAccessToken();
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          googleCalendarId
        )}/events/${encodeURIComponent(googleEventId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );
    } catch {
      // Google-Fehler ignorieren, DB-Eintrag trotzdem löschen
    }
  }

  const { error: deleteError } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId);

  if (deleteError) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Termin konnte nicht gelöscht werden: " + deleteError.message
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin gelöscht ✅"
    )}`
  );
}
