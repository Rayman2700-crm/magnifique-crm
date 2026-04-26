
"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  googleWarning?: string;
}) {
  const parts: string[] = [];

  parts.push(`Titel: ${input.title}`);
  if (input.notes) parts.push(`Notiz: ${input.notes}`);
  if (Number.isFinite(input.bufferMin) && input.bufferMin > 0) {
    parts.push(`Buffer: ${input.bufferMin} min`);
  }
  parts.push(`Status: ${input.status}`);
  if (input.googleWarning) parts.push(`Google: ${input.googleWarning}`);

  return parts.join("\n").trim();
}

function buildErrorUrl(customerProfileId: string, message: string) {
  return `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(message)}`;
}

export async function createAppointment(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const durationMin = Number(formData.get("duration") ?? 0);
  const bufferMin = Number(formData.get("buffer") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));
  const openSlotId = String(formData.get("openSlotId") ?? "").trim();
  const waitlistId = String(formData.get("waitlistId") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const fromOpenSlot = source === "open-slot" || Boolean(openSlotId || waitlistId);

  if (!title || !startLocal || !durationMin) {
    redirect(buildErrorUrl(customerProfileId, "Bitte Titel, Start und Dauer ausfüllen."));
  }

  const { data: cp, error: cpErr } = await admin
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .eq("id", customerProfileId)
    .maybeSingle();

  if (cpErr || !cp?.tenant_id) {
    redirect(buildErrorUrl(customerProfileId, "customer_profile tenant_id nicht gefunden."));
  }

  if (!cp?.person_id) {
    redirect(buildErrorUrl(customerProfileId, "customer_profile person_id nicht gefunden."));
  }

  const tenantId = cp.tenant_id as string;
  const personId = cp.person_id as string;

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(buildErrorUrl(customerProfileId, "Ungültiges Start-Datum."));
  }

  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  let calendarId: string | null = null;
  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;
  let googleWarning = "";

  const { data: tok } = await supabase
    .from("google_oauth_tokens")
    .select("default_calendar_id")
    .eq("user_id", user.id)
    .maybeSingle();

  calendarId = (tok as any)?.default_calendar_id ?? null;

  const candidateCalendarIds = Array.from(
    new Set([calendarId, "primary"].filter((x): x is string => Boolean(x && String(x).trim())))
  );

  if (candidateCalendarIds.length > 0) {
    try {
      const token = await getValidGoogleAccessToken();
      const googleErrors: string[] = [];

      for (const candidateCalendarId of candidateCalendarIds) {
        const eventRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(candidateCalendarId)}/events`,
          {
            method: "POST",
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

        const eventJson: any = await eventRes.json().catch(() => ({}));

        if (eventRes.ok) {
          googleEventId = eventJson?.id ?? null;
          googleCalendarId = candidateCalendarId;
          googleWarning = "";
          break;
        }

        const msg = eventJson?.error?.message || eventRes.statusText || `HTTP ${eventRes.status}`;
        googleErrors.push(`${candidateCalendarId}: ${msg}`);
      }

      if (!googleEventId) {
        googleWarning = googleErrors.length
          ? `Google-Termin konnte nicht erstellt werden (${googleErrors.join(" | ")}). Termin wurde lokal gespeichert.`
          : "Google-Termin konnte nicht erstellt werden. Termin wurde lokal gespeichert.";
      }
    } catch (e: any) {
      googleWarning = e?.message
        ? `Google-Termin konnte nicht erstellt werden (${e.message}). Termin wurde lokal gespeichert.`
        : "Google-Termin konnte nicht erstellt werden. Termin wurde lokal gespeichert.";
    }
  } else {
    googleWarning = "Kein Standard-Kalender gefunden. Termin wurde lokal gespeichert.";
  }

  const { data: createdAppointment, error: insErr } = await admin
    .from("appointments")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      service_id: null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      reminder_at: buildReminderAt(start).toISOString(),
      reminder_sent_at: null,
      status,
      notes_internal: buildNotesInternal({
        title,
        notes,
        bufferMin,
        status,
        googleWarning,
      }),
      google_calendar_id: googleCalendarId,
      google_event_id: googleEventId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insErr || !createdAppointment?.id) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "DB Insert failed: " + (insErr?.message ?? "Termin konnte nicht gespeichert werden.")
      )}`
    );
  }

  if (fromOpenSlot) {
    const nowIso = new Date().toISOString();

    if (openSlotId) {
      const { error: slotErr } = await admin
        .from("appointment_open_slots")
        .update({
          status: "booked",
          updated_at: nowIso,
        })
        .eq("id", openSlotId)
        .eq("tenant_id", tenantId);

      if (slotErr) {
        redirect(
          `/dashboard?openSlots=1&error=${encodeURIComponent(
            "Termin wurde erstellt, aber der freie Slot konnte nicht als gebucht markiert werden: " + slotErr.message
          )}`
        );
      }
    }

    if (waitlistId) {
      const { error: waitlistErr } = await admin
        .from("appointment_waitlist")
        .update({
          status: "booked",
        })
        .eq("id", waitlistId)
        .eq("tenant_id", tenantId);

      if (waitlistErr) {
        redirect(
          `/dashboard?openSlots=1&error=${encodeURIComponent(
            "Termin wurde erstellt, aber die Warteliste konnte nicht als gebucht markiert werden: " + waitlistErr.message
          )}`
        );
      }
    }

    redirect(
      `/dashboard?openSlots=1&success=${encodeURIComponent(
        googleWarning
          ? "Termin lokal erstellt und freier Slot gebucht ✅ Hinweis: " + googleWarning
          : "Termin erstellt und freier Slot gebucht ✅"
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      googleWarning
        ? "Termin lokal erstellt ✅ Hinweis: " + googleWarning
        : "Termin erstellt ✅"
    )}`
  );
}
