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
  const returnToCustomer = String(formData.get("return_to_customer") ?? "") === "1";
  const serviceId = String(formData.get("service_id") ?? "").trim() || null;
  const serviceNameSnapshot = String(formData.get("service_name_snapshot") ?? "").trim() || null;
  const serviceDurationSnapshot = Number(formData.get("service_duration_minutes_snapshot") ?? 0) || null;
  const serviceBufferSnapshot = Number(formData.get("service_buffer_minutes_snapshot") ?? 0) || 0;
  const servicePriceSnapshot = Number(formData.get("service_price_cents_snapshot") ?? 0) || 0;
  const effectiveTitle = title || serviceNameSnapshot || "";

  if (!effectiveTitle || !startLocal || !durationMin) {
    redirect(
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent("Bitte Service, Start und Dauer ausfüllen.")}`
        : `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent("Bitte Titel, Start und Dauer ausfüllen.")}`
    );
  }

  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp?.tenant_id) {
    redirect(
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent("customer_profile tenant_id nicht gefunden.")}`
        : `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent("customer_profile tenant_id nicht gefunden.")}`
    );
  }

  if (!cp?.person_id) {
    redirect(
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent("customer_profile person_id nicht gefunden.")}`
        : `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent("customer_profile person_id nicht gefunden.")}`
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
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent("Ungültiges Start-Datum.")}`
        : `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent("Ungültiges Start-Datum.")}`
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
        summary: effectiveTitle,
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
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent(msg)}`
        : `/customers/${customerProfileId}/appointments/new?error=${encodeURIComponent(msg)}`
    );
  }

  const googleEventId = eventJson?.id as string | undefined;

  const { error: insErr } = await supabase.from("appointments").insert({
    tenant_id: tenantId,
    person_id: personId,
    service_id: serviceId,
    service_name_snapshot: serviceNameSnapshot,
    service_price_cents_snapshot: servicePriceSnapshot,
    service_duration_minutes_snapshot: serviceDurationSnapshot,
    service_buffer_minutes_snapshot: serviceBufferSnapshot,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reminder_at: buildReminderAt(start).toISOString(),
    reminder_sent_at: null,
    notes_internal: buildNotesInternal({
      title: effectiveTitle,
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
      returnToCustomer
        ? `/customers/${customerProfileId}?appointment=create&error=${encodeURIComponent("DB Insert failed: " + insErr.message)}`
        : `/customers/${customerProfileId}?error=${encodeURIComponent("DB Insert failed: " + insErr.message)}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      "Termin erstellt ✅"
    )}`
  );
}