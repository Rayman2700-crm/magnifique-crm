"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

type GoogleOauthConnectionRow = {
  id: string;
  owner_user_id: string | null;
  connection_label: string | null;
  google_account_email: string | null;
  google_account_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  is_primary: boolean | null;
  is_read_only: boolean | null;
  default_calendar_id?: string | null;
  enabled_calendar_ids?: string[] | null;
};

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

function isExpiringSoon(expiresAtIso: string | null | undefined) {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - Date.now() < 2 * 60 * 1000;
}

function normalizeCalendarId(value: string | null | undefined) {
  return String(value ?? "").trim();
}

async function refreshGoogleAccessTokenByRefreshToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  if (!clientId || !clientSecret) throw new Error("Google OAuth env fehlt.");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const json: any = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(json?.error_description ?? json?.error ?? "Google Token Refresh fehlgeschlagen.");
  }

  return {
    accessToken: String(json?.access_token ?? "").trim(),
    expiresAt:
      typeof json?.expires_in === "number"
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : null,
  };
}

async function getAccessTokenForGoogleConnection(admin: any, connection: GoogleOauthConnectionRow) {
  const existingAccessToken = String(connection.access_token ?? "").trim();
  if (existingAccessToken && !isExpiringSoon(connection.expires_at ?? null)) {
    return existingAccessToken;
  }

  const refreshToken = String(connection.refresh_token ?? "").trim();
  if (!refreshToken) {
    throw new Error(`Für ${connection.connection_label || "die Google Verbindung"} fehlt ein refresh_token.`);
  }

  const refreshed = await refreshGoogleAccessTokenByRefreshToken(refreshToken);
  if (!refreshed.accessToken) {
    throw new Error(`Für ${connection.connection_label || "die Google Verbindung"} konnte kein access_token geladen werden.`);
  }

  await admin
    .from("google_oauth_connections")
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return refreshed.accessToken;
}

async function googleFetchWithToken(token: string, path: string, init?: RequestInit) {
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
    const msg = json?.error?.message ?? res.statusText ?? "Google API error";
    throw new Error(msg);
  }
  return json;
}

async function findWritableConnectionForTenant(admin: any, tenantId: string) {
  const { data: profiles, error: profileError } = await admin
    .from("user_profiles")
    .select("user_id, full_name, tenant_id, calendar_tenant_id")
    .or(`tenant_id.eq.${tenantId},calendar_tenant_id.eq.${tenantId}`)
    .limit(5);

  if (profileError) {
    throw new Error("Behandler-Profil konnte nicht geladen werden: " + profileError.message);
  }

  const profile = Array.isArray(profiles) ? profiles[0] : null;
  const ownerUserId = String((profile as any)?.user_id ?? "").trim();
  const ownerLabel = String((profile as any)?.full_name ?? "Behandler").trim() || "Behandler";

  if (!ownerUserId) {
    throw new Error("Für diesen Behandler wurde kein Benutzerprofil gefunden.");
  }

  const { data: connections, error: connectionsError } = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only, default_calendar_id, enabled_calendar_ids")
    .eq("owner_user_id", ownerUserId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10);

  if (connectionsError) {
    throw new Error("Google-Verbindungen konnten nicht geladen werden: " + connectionsError.message);
  }

  const rows = (Array.isArray(connections) ? connections : []) as GoogleOauthConnectionRow[];
  const connection = rows.find((row) => row.is_read_only !== true) ?? null;

  if (!connection?.id) {
    throw new Error(`${ownerLabel} hat noch keinen beschreibbaren Google-Kalender verbunden.`);
  }

  return { connection, ownerUserId, ownerLabel };
}

function resolveCalendarId(connection: GoogleOauthConnectionRow) {
  const defaultCalendarId = normalizeCalendarId(connection.default_calendar_id ?? null);
  if (defaultCalendarId) return defaultCalendarId;

  const enabled = Array.isArray(connection.enabled_calendar_ids)
    ? connection.enabled_calendar_ids.map(normalizeCalendarId).filter(Boolean)
    : [];
  if (enabled.length > 0) return enabled[0];

  const email = normalizeCalendarId(connection.google_account_email ?? null);
  if (email) return email;

  return "primary";
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

  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;
  let googleConnectionId: string | null = null;
  let googleWarning = "";

  try {
    const { connection, ownerLabel } = await findWritableConnectionForTenant(admin, tenantId);
    const token = await getAccessTokenForGoogleConnection(admin, connection);
    const calendarId = resolveCalendarId(connection);

    const event = await googleFetchWithToken(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          description: notes || undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          extendedProperties: {
            private: {
              crmTenantId: tenantId,
              crmTenantName: ownerLabel,
            },
          },
        }),
      }
    );

    googleEventId = String(event?.id ?? "").trim() || null;
    googleCalendarId = calendarId;
    googleConnectionId = String(connection.id);
  } catch (e: any) {
    // Fallback: Termin trotzdem lokal speichern, aber Warnung sichtbar halten.
    // Zusätzlich versuchen wir einmal den aktuellen User-Token/primary, damit ältere Setups nicht komplett brechen.
    try {
      const token = await getValidGoogleAccessToken();
      const event = await googleFetchWithToken(
        token,
        `/calendars/primary/events`,
        {
          method: "POST",
          body: JSON.stringify({
            summary: title,
            description: notes || undefined,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
            extendedProperties: {
              private: {
                crmTenantId: tenantId,
              },
            },
          }),
        }
      );
      googleEventId = String(event?.id ?? "").trim() || null;
      googleCalendarId = "primary";
      googleWarning = "Google wurde über primary des aktuellen Users geschrieben. Bitte Schreibkalender-Einstellung prüfen.";
    } catch (fallbackError: any) {
      const message = String(e?.message ?? fallbackError?.message ?? "Google-Termin konnte nicht erstellt werden.").trim();
      googleWarning = `${message} Termin wurde lokal gespeichert.`;
    }
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
      google_write_calendar_id: googleCalendarId,
      google_event_id: googleEventId,
      google_connection_id: googleConnectionId,
      calendar_connection_id: googleConnectionId,
      calendar_mode: googleEventId ? "STUDIO" : null,
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
          ? "Termin erstellt und freier Slot gebucht ✅ Hinweis: " + googleWarning
          : "Termin erstellt und freier Slot gebucht ✅"
      )}`
    );
  }

  redirect(
    `/customers/${customerProfileId}?success=${encodeURIComponent(
      googleWarning
        ? "Termin erstellt ✅ Hinweis: " + googleWarning
        : "Termin erstellt ✅"
    )}`
  );
}
