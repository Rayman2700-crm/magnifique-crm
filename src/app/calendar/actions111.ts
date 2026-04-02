"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

async function googleFetch(path: string, init?: RequestInit) {
  const token = await getValidGoogleAccessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? "Google API error";
    throw new Error(msg);
  }
  return json;
}

function normalizePhone(v: string) {
  return v.replace(/\s+/g, "").trim();
}

function rethrowIfNextRedirect(e: any) {
  if (e && typeof e === "object" && typeof e.digest === "string" && e.digest.startsWith("NEXT_REDIRECT")) {
    throw e;
  }
}

function buildRedirectUrl(basePathWithQuery: string, key: "success" | "error", msg: string) {
  const u = new URL(basePathWithQuery || "/calendar", "http://local");
  u.searchParams.delete("openCreate");
  u.searchParams.delete("success");
  u.searchParams.delete("error");
  u.searchParams.set(key, msg);
  return u.pathname + (u.search ? u.search : "");
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

function parseMetadataLines(existing: string | null) {
  const lines = String(existing ?? "")
    .split("\n")
    .map((x) => x.trimEnd())
    .filter(Boolean);

  return lines;
}

function readLineValue(existing: string | null, prefix: string) {
  const lines = parseMetadataLines(existing);
  const line = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function buildNotesInternal(input: {
  existing?: string | null;
  title: string;
  notes: string;
  status: AppointmentStatus;
  bufferMin?: number;
  walkInName?: string;
  walkInPhone?: string;
  serviceName?: string;
  servicePriceCents?: number | null;
  serviceDurationMinutes?: number | null;
  preserveRest?: boolean;
}) {
  const existingLines = input.preserveRest ? parseMetadataLines(input.existing ?? null) : [];

  const rest = existingLines.filter((line) => {
    const t = line.trimStart().toLowerCase();
    return !(
      t.startsWith("titel:") ||
      t.startsWith("notiz:") ||
      t.startsWith("status:") ||
      t.startsWith("buffer:") ||
      t.startsWith("walk-in name:") ||
      t.startsWith("walk-in telefon:") ||
      t.startsWith("dienstleistung:") ||
      t.startsWith("preis:") ||
      t.startsWith("dauer:")
    );
  });

  const head: string[] = [];
  if (input.title) head.push(`Titel: ${input.title}`);
  if (input.serviceName) head.push(`Dienstleistung: ${input.serviceName}`);
  if (Number.isFinite(input.serviceDurationMinutes) && (input.serviceDurationMinutes ?? 0) > 0) {
    head.push(`Dauer: ${input.serviceDurationMinutes} min`);
  }
  if (Number.isFinite(input.servicePriceCents) && (input.servicePriceCents ?? 0) >= 0) {
    head.push(`Preis: ${(input.servicePriceCents ?? 0) / 100} €`);
  }
  if (input.notes) head.push(`Notiz: ${input.notes}`);
  head.push(`Status: ${input.status}`);

  if (Number.isFinite(input.bufferMin) && (input.bufferMin ?? 0) > 0) {
    head.push(`Buffer: ${input.bufferMin} min`);
  }
  if (input.walkInName) head.push(`Walk-in Name: ${input.walkInName}`);
  if (input.walkInPhone) head.push(`Walk-in Telefon: ${input.walkInPhone}`);

  return [...head, ...rest].filter(Boolean).join("\n").trim();
}

async function insertAppointmentBestEffort(
  supabase: any,
  payload: Record<string, any>,
  status: AppointmentStatus
) {
  const withStatus = { ...payload, status };
  let { error } = await supabase.from("appointments").insert(withStatus);

  if (error && String(error.message ?? "").toLowerCase().includes("status")) {
    const { status: _ignored, ...withoutStatus } = withStatus;
    const retry = await supabase.from("appointments").insert(withoutStatus);
    error = retry.error;
  }

  return error;
}

async function updateAppointmentBestEffort(
  supabase: any,
  appointmentId: string,
  payload: Record<string, any>,
  status: AppointmentStatus
) {
  const withStatus = { ...payload, status };
  let { error } = await supabase.from("appointments").update(withStatus).eq("id", appointmentId);

  if (error && String(error.message ?? "").toLowerCase().includes("status")) {
    const { status: _ignored, ...withoutStatus } = withStatus;
    const retry = await supabase.from("appointments").update(withoutStatus).eq("id", appointmentId);
    error = retry.error;
  }

  return error;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function safeReturnTo(raw: string) {
  return raw.startsWith("/") ? raw : "/dashboard";
}

async function deleteGoogleEventBestEffort(calendarId: string | null, googleEventId: string | null) {
  if (!calendarId || !googleEventId) return;

  try {
    await googleFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE" }
    );
  } catch {
    // best effort rollback only
  }
}

async function ensureCustomerProfileForAppointment(appointmentId: string) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const admin = supabaseAdmin();

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .select(
      `
      id,
      tenant_id,
      person_id,
      start_at,
      end_at,
      notes_internal,
      person:persons (
        id,
        full_name,
        phone,
        email
      )
    `
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptErr || !appt) {
    throw new Error("Termin konnte nicht geladen werden.");
  }

  const tenantId = String((appt as any).tenant_id ?? "").trim();
  const personId = String((appt as any).person_id ?? "").trim();

  if (!tenantId) {
    throw new Error("Termin hat keinen Behandler/Tenant.");
  }

  if (!personId) {
    throw new Error("Diesem Termin ist noch keine Person zugeordnet.");
  }

  const { data: existingCp, error: cpErr } = await admin
    .from("customer_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("person_id", personId)
    .maybeSingle();

  if (cpErr) {
    throw new Error("Kundenprofil konnte nicht gesucht werden.");
  }

  let customerProfileId = existingCp?.id ? String(existingCp.id) : "";

  if (!customerProfileId) {
    const personJoin = Array.isArray((appt as any).person) ? (appt as any).person[0] : (appt as any).person;
    const fallbackName =
      String(personJoin?.full_name ?? "").trim() ||
      readLineValue((appt as any).notes_internal ?? null, "Walk-in Name:") ||
      null;

    const { data: insertedCp, error: insErr } = await admin
      .from("customer_profiles")
      .insert({
        tenant_id: tenantId,
        person_id: personId,
      })
      .select("id")
      .single();

    if (!insErr && insertedCp?.id && fallbackName) {
      await admin
        .from("persons")
        .update({ full_name: fallbackName })
        .eq("id", personId);
    }

    if (insErr || !insertedCp?.id) {
      throw new Error("Kundenprofil konnte nicht automatisch erstellt werden.");
    }

    customerProfileId = String(insertedCp.id);
  }

  return {
    customerProfileId,
    appointment: appt as {
      id: string;
      tenant_id: string;
      person_id: string;
      start_at: string;
      end_at: string;
      notes_internal: string | null;
    },
  };
}

export async function openCustomerProfileFromAppointment(appointmentId: string, formData: FormData) {
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/dashboard"));

  try {
    const { customerProfileId } = await ensureCustomerProfileForAppointment(appointmentId);
    redirect(`/customers/${customerProfileId}?tab=appointments#appointments`);
  } catch (e: any) {
    rethrowIfNextRedirect(e);
    redirect(buildRedirectUrl(returnTo, "error", e?.message ?? "Kundenprofil konnte nicht geöffnet werden."));
  }
}

export async function openFollowUpFromAppointment(appointmentId: string, formData: FormData) {
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/dashboard"));

  try {
    const { customerProfileId, appointment } = await ensureCustomerProfileForAppointment(appointmentId);

    const currentStart = new Date(appointment.start_at);
    const currentEnd = new Date(appointment.end_at);
    const nextStart = new Date(currentStart.getTime() + 28 * 24 * 60 * 60 * 1000);
    const durationMin = Math.max(5, Math.round((currentEnd.getTime() - currentStart.getTime()) / 60000) || 60);

    const title = readLineValue(appointment.notes_internal, "Titel:") || "Termin";
    const notes = readLineValue(appointment.notes_internal, "Notiz:");

    const params = new URLSearchParams({
      title,
      notes,
      start: toDatetimeLocalValue(nextStart),
      duration: String(durationMin),
      buffer: "0",
      status: "scheduled",
    });

    redirect(`/customers/${customerProfileId}/appointments/new?${params.toString()}`);
  } catch (e: any) {
    rethrowIfNextRedirect(e);
    redirect(buildRedirectUrl(returnTo, "error", e?.message ?? "Folgetermin konnte nicht geöffnet werden."));
  }
}

export async function openWaitlistFromAppointment(appointmentId: string, formData: FormData) {
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/dashboard"));

  try {
    const { customerProfileId } = await ensureCustomerProfileForAppointment(appointmentId);
    redirect(`/customers/${customerProfileId}?tab=waitlist#waitlist`);
  } catch (e: any) {
    rethrowIfNextRedirect(e);
    redirect(buildRedirectUrl(returnTo, "error", e?.message ?? "Warteliste konnte nicht geöffnet werden."));
  }
}

export async function openCheckoutFromAppointment(appointmentId: string, formData: FormData) {
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/dashboard"));

  try {
    await ensureCustomerProfileForAppointment(appointmentId);
    redirect(`/rechnungen?appointmentId=${encodeURIComponent(appointmentId)}`);
  } catch (e: any) {
    rethrowIfNextRedirect(e);
    redirect(buildRedirectUrl(returnTo, "error", e?.message ?? "Checkout konnte nicht geöffnet werden."));
  }
}

export async function connectGoogleCalendar() {
  redirect("/calendar/google");
}

export async function setDefaultCalendar(formData: FormData) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/calendar/google"));
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  if (!calendarId) {
    redirect(buildRedirectUrl(returnTo, "error", "Bitte einen Kalender auswählen."));
  }

  const { error } = await supabase
    .from("google_oauth_tokens")
    .update({ default_calendar_id: calendarId })
    .eq("user_id", user.id);

  if (error) {
    redirect(buildRedirectUrl(returnTo, "error", "Konnte Standard-Kalender nicht speichern: " + error.message));
  }

  redirect(buildRedirectUrl(returnTo, "success", "Standard-Kalender gespeichert ✅"));
}

export async function createTestEvent(formData?: FormData) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const returnTo = safeReturnTo(String(formData?.get("returnTo") ?? "/calendar/google"));

  const { data: tok, error: tokErr } = await supabase
    .from("google_oauth_tokens")
    .select("default_calendar_id")
    .eq("user_id", user.id)
    .single();

  if (tokErr) {
    redirect(buildRedirectUrl(returnTo, "error", "Token DB Fehler: " + tokErr.message));
  }

  const calendarId = (tok as any)?.default_calendar_id as string | null;
  if (!calendarId) {
    redirect(buildRedirectUrl(returnTo, "error", "Bitte zuerst einen Standard-Kalender speichern."));
  }

  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  let createdLink: string | null = null;

  try {
    const event = await googleFetch(`/calendars/${encodeURIComponent(calendarId!)}/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: "Test-Termin (Magnifique CRM)",
        description: "Automatisch erstellt zur Prüfung der Google-Kalender Verbindung.",
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });

    createdLink = String(event?.htmlLink ?? "").trim() || null;
  } catch (e: any) {
    redirect(buildRedirectUrl(returnTo, "error", e?.message ?? "Test-Event konnte nicht erstellt werden"));
  }

  const successUrl = new URL(buildRedirectUrl(returnTo, "success", "Test-Event erstellt ✅"), "http://local");
  if (createdLink) {
    successUrl.searchParams.set("link", createdLink);
  }

  redirect(successUrl.pathname + (successUrl.search ? successUrl.search : ""));
}

export async function createAppointmentQuick(formData: FormData) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const customerProfileId = String(formData.get("customerProfileId") ?? "").trim();
  const walkInName = String(formData.get("walkInName") ?? "").trim();
  const walkInPhoneRaw = String(formData.get("walkInPhone") ?? "").trim();
  const walkInPhone = walkInPhoneRaw ? normalizePhone(walkInPhoneRaw) : "";
  const assignedTenantId = String(formData.get("tenantId") ?? "").trim();
  const rawTitle = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const rawDurationMin = Number(formData.get("duration") ?? 0);
  const rawBufferMin = Number(formData.get("buffer") ?? 0);
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));
  const week = String(formData.get("week") ?? "").trim();
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();

  const effectiveTenantFilter = assignedTenantId;
  const defaultReturnUrl =
    "/calendar" +
    (week ? `?week=${encodeURIComponent(week)}` : "") +
    (effectiveTenantFilter ? `${week ? "&" : "?"}tenant=${encodeURIComponent(effectiveTenantFilter)}` : "");

  const baseReturnUrl = returnToRaw || defaultReturnUrl;

  if (!assignedTenantId || !startLocal) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Bitte Behandler und Start ausfüllen."));
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Benutzerprofil konnte nicht geladen werden: " + profileError.message));
  }

  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
    calendar_tenant_id: profile?.calendar_tenant_id ?? null,
  });

  const isAdmin =
    String(profile?.role ?? "").toUpperCase() === "ADMIN" ||
    String(user.email ?? "").toLowerCase().includes("radu");

  if (effectiveTenantId && assignedTenantId !== effectiveTenantId && !isAdmin) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Keine Berechtigung für diesen Behandler."));
  }

  let serviceRow: {
    id: string;
    name: string;
    default_price_cents: number | null;
    duration_minutes: number | null;
    buffer_minutes: number | null;
    is_active: boolean | null;
  } | null = null;

  if (serviceId) {
    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("id, tenant_id, name, default_price_cents, duration_minutes, buffer_minutes, is_active")
      .eq("id", serviceId)
      .eq("tenant_id", assignedTenantId)
      .maybeSingle();

    if (serviceError) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Dienstleistung konnte nicht geladen werden: " + serviceError.message));
    }

    if (!service?.id) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Gewählte Dienstleistung wurde nicht gefunden."));
    }

    if (service.is_active === false) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Diese Dienstleistung ist inaktiv."));
    }

    serviceRow = {
      id: String(service.id),
      name: String(service.name ?? "Termin").trim() || "Termin",
      default_price_cents:
        service.default_price_cents === null || service.default_price_cents === undefined
          ? null
          : Number(service.default_price_cents),
      duration_minutes:
        service.duration_minutes === null || service.duration_minutes === undefined
          ? null
          : Number(service.duration_minutes),
      buffer_minutes:
        service.buffer_minutes === null || service.buffer_minutes === undefined
          ? null
          : Number(service.buffer_minutes),
      is_active: service.is_active ?? true,
    };
  }

  const title = serviceRow?.name || rawTitle;
  const durationMin = serviceRow?.duration_minutes ?? rawDurationMin;
  const bufferMin = serviceRow?.buffer_minutes ?? rawBufferMin;

  if (!title || !durationMin) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Bitte Dienstleistung oder Titel und Dauer ausfüllen."));
  }

  let personId: string | null = null;

  if (customerProfileId) {
    const { data: cp, error: cpErr } = await admin
      .from("customer_profiles")
      .select("id, person_id, tenant_id")
      .eq("id", customerProfileId)
      .maybeSingle();

    if (cpErr || !cp?.person_id) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "customer_profile person_id nicht gefunden."));
    }

    if (String(cp.tenant_id ?? "").trim() !== assignedTenantId && !isAdmin) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Kundenprofil gehört nicht zu diesem Behandler."));
    }

    personId = String(cp.person_id);
  } else if (walkInName || walkInPhone) {
    let foundPersonId: string | null = null;

    if (walkInPhone) {
      const { data: existingByPhone } = await admin
        .from("persons")
        .select("id, full_name")
        .eq("phone", walkInPhone)
        .maybeSingle();

      if (existingByPhone?.id) {
        foundPersonId = String(existingByPhone.id);
        const existingName = String(existingByPhone.full_name ?? "").trim();
        if (walkInName && (!existingName || existingName.toLowerCase() === "unbekannt")) {
          await admin.from("persons").update({ full_name: walkInName }).eq("id", foundPersonId);
        }
      }
    }

    if (!foundPersonId) {
      const { data: inserted, error: insErr } = await admin
        .from("persons")
        .insert({
          full_name: walkInName || "Unbekannt",
          phone: walkInPhone || null,
          email: null,
          birthday: null,
        })
        .select("id")
        .single();

      if (insErr || !inserted?.id) {
        redirect(buildRedirectUrl(baseReturnUrl, "error", "Person konnte nicht erstellt werden: " + (insErr?.message ?? "unknown")));
      }
      foundPersonId = String(inserted.id);
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("customer_profiles")
      .select("id")
      .eq("tenant_id", assignedTenantId)
      .eq("person_id", foundPersonId)
      .maybeSingle();

    if (existingProfileError) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Kundenprofil konnte nicht geladen werden: " + existingProfileError.message));
    }

    if (!existingProfile?.id) {
      const { error: cpInsErr } = await admin.from("customer_profiles").insert({
        tenant_id: assignedTenantId,
        person_id: foundPersonId,
      });

      if (cpInsErr) {
        redirect(buildRedirectUrl(baseReturnUrl, "error", "CustomerProfile konnte nicht erstellt werden: " + cpInsErr.message));
      }
    }

    personId = foundPersonId;
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("user_profiles")
    .select("user_id, full_name, tenant_id, calendar_tenant_id")
    .or(`calendar_tenant_id.eq.${assignedTenantId},tenant_id.eq.${assignedTenantId}`)
    .order("user_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (targetProfileError) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Behandler-Profil konnte nicht geladen werden: " + targetProfileError.message));
  }

  if (!targetProfile?.user_id) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Kein Benutzer für den gewählten Behandler gefunden."));
  }

  const targetGoogleUserId = String(targetProfile.user_id);

  const { data: tok, error: tokErr } = await admin
    .from("google_oauth_tokens")
    .select("default_calendar_id")
    .eq("user_id", targetGoogleUserId)
    .maybeSingle();

  if (tokErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Google-Kalender des gewählten Behandlers konnte nicht geladen werden: " + tokErr.message));
  }

  const calendarId = (tok as any)?.default_calendar_id as string | null;
  if (!calendarId) {
    const label = String(targetProfile.full_name ?? "Behandler").trim() || "Behandler";
    redirect(buildRedirectUrl(baseReturnUrl, "error", `${label} hat noch keinen Standard-Kalender gespeichert.`));
  }

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Ungültiges Start-Datum."));
  }

  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  let googleEventId: string | null = null;
  try {
    const event = await googleFetch(`/calendars/${encodeURIComponent(calendarId!)}/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: title,
        description: notes || undefined,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
    googleEventId = String(event?.id ?? "");
  } catch (e: any) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", e?.message ?? "Google Event konnte nicht erstellt werden"));
  }

  const notesInternal = buildNotesInternal({
    existing: null,
    title,
    notes,
    status,
    bufferMin,
    walkInName,
    walkInPhone,
    serviceName: serviceRow?.name,
    servicePriceCents: serviceRow?.default_price_cents ?? null,
    serviceDurationMinutes: serviceRow?.duration_minutes ?? null,
  });

  const payload = {
    tenant_id: assignedTenantId,
    person_id: personId,
    service_id: serviceRow?.id ?? null,
    service_name_snapshot: serviceRow?.name ?? null,
    service_price_cents_snapshot: serviceRow?.default_price_cents ?? null,
    service_duration_minutes_snapshot: serviceRow?.duration_minutes ?? null,
    service_buffer_minutes_snapshot: serviceRow?.buffer_minutes ?? null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reminder_at: buildReminderAt(start).toISOString(),
    reminder_sent_at: null,
    notes_internal: notesInternal || null,
    google_calendar_id: calendarId,
    google_event_id: googleEventId || null,
    created_by_user_id: user.id,
  };

  const insErr = await insertAppointmentBestEffort(admin, payload, status);
  if (insErr) {
    await deleteGoogleEventBestEffort(calendarId, googleEventId);
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin konnte nicht gespeichert werden: " + insErr.message));
  }

  const { data: verifyRow, error: verifyErr } = await admin
    .from("appointments")
    .select("id, tenant_id, start_at, end_at")
    .eq("tenant_id", assignedTenantId)
    .eq("google_event_id", googleEventId || "")
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verifyErr || !verifyRow?.id) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin wurde nicht sauber in appointments gespeichert."));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", "Termin erstellt ✅"));
}

export async function deleteAppointmentFromCalendar(appointmentId: string, formData: FormData) {
  const supabase = await supabaseServer();
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const baseReturnUrl = returnToRaw || "/calendar";

  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select("google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin nicht gefunden."));
  }

  try {
    if (appt.google_calendar_id && appt.google_event_id) {
      await googleFetch(
        `/calendars/${encodeURIComponent(appt.google_calendar_id)}/events/${encodeURIComponent(appt.google_event_id)}`,
        { method: "DELETE" }
      );
    }
  } catch (e: any) {
    // ignore google delete errors if event already gone
  }

  await supabase.from("appointment_open_slots").delete().eq("appointment_id", appointmentId);

  const { error: delErr } = await supabase.from("appointments").delete().eq("id", appointmentId);

  if (delErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin konnte nicht gelöscht werden: " + delErr.message));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", "Termin gelöscht ✅"));
}

export async function updateAppointmentFromCalendar(appointmentId: string, formData: FormData) {
  const supabase = await supabaseServer();
  const title = String(formData.get("title") ?? "").trim();
  const startLocal = String(formData.get("start") ?? "").trim();
  const durationMin = Number(formData.get("duration") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();
  const status = normalizeStatus(String(formData.get("status") ?? "scheduled"));
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();

  const baseReturnUrl = returnToRaw || "/calendar";

  if (!title || !startLocal || !durationMin) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Bitte Titel, Start und Dauer ausfüllen."));
  }

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Ungültiges Start-Datum."));
  }

  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const { data: existing, error: findErr } = await supabase
    .from("appointments")
    .select("notes_internal, google_calendar_id, google_event_id")
    .eq("id", appointmentId)
    .single();

  if (findErr || !existing) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin nicht gefunden."));
  }

  const bufferRaw = readLineValue(existing.notes_internal, "Buffer:");
  const bufferMin = Number(String(bufferRaw).replace(/[^\d]/g, "") || 0);
  const walkInName = readLineValue(existing.notes_internal, "Walk-in Name:");
  const walkInPhone = readLineValue(existing.notes_internal, "Walk-in Telefon:");

  const notesInternal = buildNotesInternal({
    existing: existing.notes_internal,
    title,
    notes,
    status,
    bufferMin,
    walkInName,
    walkInPhone,
    preserveRest: true,
  });

  try {
    if (existing.google_calendar_id && existing.google_event_id) {
      await googleFetch(
        `/calendars/${encodeURIComponent(existing.google_calendar_id)}/events/${encodeURIComponent(existing.google_event_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            summary: title,
            description: notes || undefined,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
        }
      );
    }
  } catch (e: any) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", e?.message ?? "Google Event konnte nicht aktualisiert werden"));
  }

  const updErr = await updateAppointmentBestEffort(
    supabase,
    appointmentId,
    {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      reminder_at: buildReminderAt(start).toISOString(),
      reminder_sent_at: null,
      notes_internal: notesInternal || null,
    },
    status
  );

  if (updErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin konnte nicht aktualisiert werden: " + updErr.message));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", "Termin gespeichert ✅"));
}

async function syncOpenSlotForCancelledAppointment(input: {
  appointmentId: string;
  tenantId: string | null;
  startAt: string | null;
  endAt: string | null;
  status: AppointmentStatus;
}) {
  const admin = supabaseAdmin();

  const appointmentId = String(input.appointmentId ?? "").trim();
  const tenantId = String(input.tenantId ?? "").trim();
  const startAt = String(input.startAt ?? "").trim();
  const endAt = String(input.endAt ?? "").trim();
  const status = input.status;

  if (!appointmentId) return;
  if (!tenantId || !startAt || !endAt) return;

  if (status === "cancelled") {
    await admin
      .from("appointment_open_slots")
      .upsert(
        {
          appointment_id: appointmentId,
          tenant_id: tenantId,
          start_at: startAt,
          end_at: endAt,
          status: "open",
        },
        { onConflict: "appointment_id" }
      );

    return;
  }

  await admin
    .from("appointment_open_slots")
    .update({
      status: "expired",
    })
    .eq("appointment_id", appointmentId)
    .eq("status", "open");
}

export async function updateAppointmentStatusQuick(input: {
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const supabase = await supabaseServer();

  try {
    const appointmentId = String(input.appointmentId ?? "").trim();
    const status = normalizeStatus(String(input.status ?? "scheduled"));

    if (!appointmentId) {
      return { ok: false, error: "appointmentId fehlt." };
    }

    const { data: existing, error: findErr } = await supabase
      .from("appointments")
      .select("notes_internal, start_at, end_at, tenant_id")
      .eq("id", appointmentId)
      .single();

    if (findErr || !existing) {
      return { ok: false, error: "Termin nicht gefunden." };
    }

    const title = readLineValue(existing.notes_internal, "Titel:") || "Termin";
    const notes = readLineValue(existing.notes_internal, "Notiz:");
    const bufferRaw = readLineValue(existing.notes_internal, "Buffer:");
    const bufferMin = Number(String(bufferRaw).replace(/[^\d]/g, "") || 0);
    const walkInName = readLineValue(existing.notes_internal, "Walk-in Name:");
    const walkInPhone = readLineValue(existing.notes_internal, "Walk-in Telefon:");

    const notesInternal = buildNotesInternal({
      existing: existing.notes_internal,
      title,
      notes,
      status,
      bufferMin,
      walkInName,
      walkInPhone,
      preserveRest: true,
    });

    const updErr = await updateAppointmentBestEffort(
      supabase,
      appointmentId,
      {
        notes_internal: notesInternal || null,
      },
      status
    );

    if (updErr) {
      return { ok: false, error: updErr.message };
    }

    await syncOpenSlotForCancelledAppointment({
      appointmentId,
      tenantId: String((existing as any).tenant_id ?? "").trim() || null,
      startAt: String((existing as any).start_at ?? "").trim() || null,
      endAt: String((existing as any).end_at ?? "").trim() || null,
      status,
    });

    return {
      ok: true,
      openSlotStatus: status === "cancelled" ? "open" : "expired",
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Status konnte nicht gespeichert werden." };
  }
}

export async function markReminderSent(input: { appointmentId: string; force?: boolean }) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  try {
    const appointmentId = String(input.appointmentId ?? "").trim();
    const force = !!input.force;

    if (!appointmentId) {
      return { ok: false, error: "appointmentId fehlt." };
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const effectiveTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    const isAdmin =
      String(profile?.role ?? "").toUpperCase() === "ADMIN" ||
      String(user.email ?? "").toLowerCase().includes("radu");

    const admin = supabaseAdmin();

    const { data: appointment, error: findErr } = await admin
      .from("appointments")
      .select("id, tenant_id, reminder_sent_at")
      .eq("id", appointmentId)
      .maybeSingle();

    if (findErr || !appointment) {
      return { ok: false, error: "Termin nicht gefunden." };
    }

    const appointmentTenantId = String((appointment as any).tenant_id ?? "").trim();
    const reminderSentAt = (appointment as any).reminder_sent_at as string | null;

    if (!isAdmin && effectiveTenantId && appointmentTenantId !== effectiveTenantId) {
      return { ok: false, error: "Keine Berechtigung für diesen Reminder." };
    }

    if (reminderSentAt && !force) {
      return {
        ok: true,
        alreadySent: true,
        reminderSentAt,
      };
    }

    if (reminderSentAt && force && !isAdmin) {
      return { ok: false, error: "Erneut senden ist nur für Admin erlaubt." };
    }

    const now = new Date().toISOString();

    let query = admin
      .from("appointments")
      .update({
        reminder_sent_at: now,
      })
      .eq("id", appointmentId);

    if (!force) {
      query = query.is("reminder_sent_at", null);
    }

    const { error: updErr } = await query;

    if (updErr) {
      return { ok: false, error: "Reminder konnte nicht markiert werden: " + updErr.message };
    }

    return {
      ok: true,
      alreadySent: false,
      reminderSentAt: now,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Reminder konnte nicht markiert werden." };
  }
}


type WaitlistQuickStatus = "active" | "contacted" | "booked" | "removed";

export async function updateWaitlistStatusQuick(input: {
  waitlistId: string;
  status: WaitlistQuickStatus;
  tenantId?: string | null;
  bookedAppointmentId?: string | null;
}) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  try {
    const waitlistId = String(input.waitlistId ?? "").trim();
    const nextStatus = String(input.status ?? "active").trim().toLowerCase() as WaitlistQuickStatus;
    const providedTenantId = String(input.tenantId ?? "").trim();
    const bookedAppointmentId = String(input.bookedAppointmentId ?? "").trim();

    if (!waitlistId) {
      return { ok: false, error: "waitlistId fehlt." };
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const effectiveTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    const isAdmin =
      String(profile?.role ?? "").toUpperCase() === "ADMIN" ||
      String(user.email ?? "").toLowerCase().includes("radu");

    const admin = supabaseAdmin();

    const { data: existing, error: findErr } = await admin
      .from("appointment_waitlist")
      .select("id, tenant_id, status")
      .eq("id", waitlistId)
      .maybeSingle();

    if (findErr || !existing) {
      return { ok: false, error: "Wartelisten-Eintrag nicht gefunden." };
    }

    const rowTenantId = String((existing as any).tenant_id ?? "").trim();

    if (providedTenantId && rowTenantId && providedTenantId !== rowTenantId && !isAdmin) {
      return { ok: false, error: "Keine Berechtigung für diesen Wartelisten-Eintrag." };
    }

    if (effectiveTenantId && rowTenantId && effectiveTenantId !== rowTenantId && !isAdmin) {
      return { ok: false, error: "Keine Berechtigung für diesen Wartelisten-Eintrag." };
    }

    const updatePayload: Record<string, string | null> = {
      status: nextStatus,
      booked_appointment_id: nextStatus === "booked" ? (bookedAppointmentId || null) : null,
    };

    const { error: updateError } = await admin
      .from("appointment_waitlist")
      .update(updatePayload)
      .eq("id", waitlistId);

    if (updateError) {
      return { ok: false, error: "Wartelisten-Status konnte nicht gespeichert werden: " + updateError.message };
    }

    return {
      ok: true,
      status: nextStatus,
      bookedAppointmentId: updatePayload.booked_appointment_id,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Wartelisten-Status konnte nicht gespeichert werden." };
  }
}


type AddWaitlistQuickInput = {
  tenantId?: string | null;
  customerProfileId?: string | null;
  fullName?: string | null;
  phone?: string | null;
  serviceTitle?: string | null;
  priority?: string | null;
  shortNoticeOk?: boolean;
  reachableToday?: boolean;
  requestedRecently?: "today" | "yesterday" | "none" | string | null;
};

function toRequestedRecentlyAt(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized || normalized === "none") return null;

  const now = new Date();
  const base = new Date(now);
  base.setSeconds(0, 0);

  if (normalized === "yesterday") {
    base.setDate(base.getDate() - 1);
  }

  return base.toISOString();
}

function isPlaceholderName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "unbekannt" || normalized === "kunde";
}

export async function addWaitlistEntryQuick(input: AddWaitlistQuickInput) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  try {
    const fullName = String(input.fullName ?? "").trim();
    const normalizedPhone = String(input.phone ?? "").trim()
      ? normalizePhone(String(input.phone ?? ""))
      : "";
    const serviceTitle = String(input.serviceTitle ?? "").trim();
    const requestedRecentlyAt = toRequestedRecentlyAt(input.requestedRecently);
    const rawPriority = String(input.priority ?? "normal").trim().toLowerCase();
    const priority =
      rawPriority === "low" || rawPriority === "high" || rawPriority === "urgent"
        ? rawPriority
        : "normal";

    if (!fullName && !normalizedPhone && !String(input.customerProfileId ?? "").trim()) {
      return { ok: false, error: "Bitte zumindest Name, Telefon oder ein bestehendes Kundenprofil angeben." };
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const effectiveTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    const tenantId =
      String(input.tenantId ?? "").trim() ||
      String(effectiveTenantId ?? "").trim() ||
      String(profile?.calendar_tenant_id ?? "").trim() ||
      String(profile?.tenant_id ?? "").trim();

    if (!tenantId) {
      return { ok: false, error: "Kein Behandler/Tenant gefunden." };
    }

    const admin = supabaseAdmin();

    let customerProfileId = String(input.customerProfileId ?? "").trim() || null;
    let personId: string | null = null;

    if (customerProfileId) {
      const { data: existingProfile, error: profileError } = await admin
        .from("customer_profiles")
        .select("id, person_id, tenant_id")
        .eq("id", customerProfileId)
        .maybeSingle();

      if (profileError || !existingProfile?.id) {
        return { ok: false, error: "Kundenprofil konnte nicht geladen werden." };
      }

      personId = String((existingProfile as any).person_id ?? "").trim() || null;
      customerProfileId = String(existingProfile.id);
    }

    if (!personId && normalizedPhone) {
      const { data: existingPerson } = await admin
        .from("persons")
        .select("id, full_name")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (existingPerson?.id) {
        personId = String(existingPerson.id);

        if (fullName && isPlaceholderName((existingPerson as any).full_name)) {
          await admin.from("persons").update({ full_name: fullName }).eq("id", personId);
        }
      }
    }

    if (!personId) {
      const { data: insertedPerson, error: insertPersonError } = await admin
        .from("persons")
        .insert({
          full_name: fullName || "Unbekannt",
          phone: normalizedPhone || null,
          email: null,
          birthday: null,
        })
        .select("id")
        .single();

      if (insertPersonError || !insertedPerson?.id) {
        return {
          ok: false,
          error: "Person konnte nicht erstellt werden: " + (insertPersonError?.message ?? "unknown"),
        };
      }

      personId = String(insertedPerson.id);
    }

    if (!customerProfileId && personId) {
      const { data: existingCustomerProfile } = await admin
        .from("customer_profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("person_id", personId)
        .maybeSingle();

      if (existingCustomerProfile?.id) {
        customerProfileId = String(existingCustomerProfile.id);
      } else {
        const { data: insertedCustomerProfile, error: insertCustomerProfileError } = await admin
          .from("customer_profiles")
          .insert({
            tenant_id: tenantId,
            person_id: personId,
          })
          .select("id")
          .single();

        if (insertCustomerProfileError || !insertedCustomerProfile?.id) {
          return {
            ok: false,
            error:
              "Kundenprofil konnte nicht erstellt werden: " +
              (insertCustomerProfileError?.message ?? "unknown"),
          };
        }

        customerProfileId = String(insertedCustomerProfile.id);
      }
    }

    const { data: existingWaitlistEntry } = await admin
      .from("appointment_waitlist")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();

    if (existingWaitlistEntry?.id) {
      const { error: updateError } = await admin
        .from("appointment_waitlist")
        .update({
          customer_profile_id: customerProfileId,
          service_title: serviceTitle || null,
          priority,
          short_notice_ok: !!input.shortNoticeOk,
          reachable_today: !!input.reachableToday,
          requested_recently_at: requestedRecentlyAt,
        })
        .eq("id", existingWaitlistEntry.id);

      if (updateError) {
        return {
          ok: false,
          error: "Bestehender Wartelisten-Eintrag konnte nicht aktualisiert werden: " + updateError.message,
        };
      }

      return {
        ok: true,
        waitlistId: String(existingWaitlistEntry.id),
        customerProfileId,
        updatedExisting: true,
      };
    }

    const { data: insertedWaitlistEntry, error: insertWaitlistError } = await admin
      .from("appointment_waitlist")
      .insert({
        tenant_id: tenantId,
        customer_profile_id: customerProfileId,
        person_id: personId,
        service_title: serviceTitle || null,
        priority,
        short_notice_ok: !!input.shortNoticeOk,
        reachable_today: !!input.reachableToday,
        requested_recently_at: requestedRecentlyAt,
        status: "active",
      })
      .select("id")
      .single();

    if (insertWaitlistError || !insertedWaitlistEntry?.id) {
      return {
        ok: false,
        error: "Wartelisten-Eintrag konnte nicht erstellt werden: " + (insertWaitlistError?.message ?? "unknown"),
      };
    }

    return {
      ok: true,
      waitlistId: String(insertedWaitlistEntry.id),
      customerProfileId,
      updatedExisting: false,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? "Wartelisten-Eintrag konnte nicht erstellt werden.",
    };
  }
}
