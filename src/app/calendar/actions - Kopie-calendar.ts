"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { CLIENTIQUE_DEMO_CALENDAR_ID, getIsDemoTenant } from "@/lib/demoMode";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

const EXTRA_GOOGLE_CALENDAR_PERSON_NAME = "Google Zusatzkalender";
const EXTRA_GOOGLE_CALENDAR_NOTE_PREFIX = "Google Zusatzkalender:";
const STUDIO_GOOGLE_EXTERNAL_NOTE_PREFIX = "Google Studio extern:";
const MAX_SYNC_RANGE_DAYS = 45;
const MAX_GOOGLE_EVENTS_PER_CALENDAR = 500;

type GoogleTokenSelectionRow = {
  user_id: string | null;
  default_calendar_id: string | null;
  enabled_calendar_ids?: string[] | null;
};

type StudioWriteTarget = "auto" | "studio_radu" | "studio_raluca";

type GoogleOauthConnectionRow = {
  id: string;
  owner_user_id: string;
  provider: string | null;
  connection_type: string | null;
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

const STUDIO_WRITE_TARGETS: Record<Exclude<StudioWriteTarget, "auto">, {
  label: string;
  calendarId: string;
  connectionLabel: string;
  emailHint: string;
}> = {
  studio_radu: {
    label: "Studio Radu",
    calendarId: "radu.craus@gmail.com",
    connectionLabel: "Radu Studio",
    emailHint: "radu.craus@gmail.com",
  },
  studio_raluca: {
    label: "Studio Magnifique Beauty Institut",
    calendarId: "raluca.magnifique@gmail.com",
    connectionLabel: "Raluca Studio",
    emailHint: "raluca.magnifique@gmail.com",
  },
};

function isAdminUser(profileRole: unknown, userEmail: unknown) {
  return (
    String(profileRole ?? "").trim().toUpperCase() === "ADMIN" ||
    String(userEmail ?? "").trim().toLowerCase() === "radu.craus@gmail.com"
  );
}

function canUseStudioWriteTarget(target: Exclude<StudioWriteTarget, "auto">, isAdmin: boolean) {
  return target === "studio_radu" ? isAdmin : true;
}

function isTargetConnectionMatch(
  row: Pick<GoogleOauthConnectionRow, "google_account_email" | "connection_label"> | null | undefined,
  target: Exclude<StudioWriteTarget, "auto">
) {
  const definition = STUDIO_WRITE_TARGETS[target];
  const email = String(row?.google_account_email ?? "").trim().toLowerCase();
  const label = String(row?.connection_label ?? "").trim().toLowerCase();
  const labelAliases =
    target === "studio_raluca"
      ? [definition.connectionLabel.toLowerCase(), "studio magnifique beauty institut", "magnifique beauty institut"]
      : [definition.connectionLabel.toLowerCase()];

  return email === definition.emailHint.toLowerCase() || labelAliases.includes(label);
}

function getStudioWriteTargetForConnection(
  row: Pick<GoogleOauthConnectionRow, "google_account_email" | "connection_label" | "is_read_only"> | null | undefined
): Exclude<StudioWriteTarget, "auto"> | null {
  if (!row || row.is_read_only === true) return null;
  if (isTargetConnectionMatch(row, "studio_radu")) return "studio_radu";
  if (isTargetConnectionMatch(row, "studio_raluca")) return "studio_raluca";
  return null;
}

function isStudioWriteCalendarId(calendarId: string | null | undefined) {
  const normalized = normalizeGoogleCalendarId(calendarId);
  return (
    normalized === STUDIO_WRITE_TARGETS.studio_radu.calendarId ||
    normalized === STUDIO_WRITE_TARGETS.studio_raluca.calendarId
  );
}

function normalizeStudioWriteTarget(value: FormDataEntryValue | null): StudioWriteTarget {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "studio_radu") return "studio_radu";
  if (normalized === "studio_raluca") return "studio_raluca";
  return "auto";
}

function isExpiringSoon(expiresAtIso: string | null | undefined) {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - Date.now() < 2 * 60 * 1000;
}

function isGoogleAuthFailure(error: any) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  const status = Number(error?.status ?? error?.googleStatus ?? 0);

  return (
    status === 401 ||
    status === 403 ||
    message.includes("invalid_grant") ||
    message.includes("token has been expired") ||
    message.includes("expired or revoked") ||
    message.includes("revoked") ||
    message.includes("invalid authentication credentials") ||
    message.includes("invalid credentials") ||
    message.includes("unauthorized")
  );
}

async function markGoogleConnectionDisconnected(
  admin: any,
  connection: Pick<GoogleOauthConnectionRow, "id" | "owner_user_id" | "connection_label" | "google_account_email"> | null | undefined,
  reason?: unknown
) {
  const connectionId = String(connection?.id ?? "").trim();
  const ownerUserId = String(connection?.owner_user_id ?? "").trim();
  const now = new Date().toISOString();

  const reasonMessage = String((reason as any)?.message ?? reason ?? "Google Verbindung ungültig").trim();
  const label = String(connection?.connection_label ?? connection?.google_account_email ?? connectionId ?? "Google").trim();

  console.warn(`[Google] Verbindung wird getrennt: ${label} – ${reasonMessage}`);

  if (connectionId) {
    await admin
      .from("google_oauth_connections")
      .update({
        is_active: false,
        access_token: null,
        expires_at: null,
        updated_at: now,
      })
      .eq("id", connectionId);
  }

  if (ownerUserId) {
    await admin
      .from("google_oauth_tokens")
      .update({
        access_token: null,
        expires_at: null,
        updated_at: now,
      })
      .eq("user_id", ownerUserId);
  }
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

  let refreshed: Awaited<ReturnType<typeof refreshGoogleAccessTokenByRefreshToken>>;

  try {
    refreshed = await refreshGoogleAccessTokenByRefreshToken(refreshToken);
  } catch (error: any) {
    if (isGoogleAuthFailure(error)) {
      await markGoogleConnectionDisconnected(admin, connection, error);
    }

    throw error;
  }

  if (!refreshed.accessToken) {
    throw new Error(`Für ${connection.connection_label || "die Google Verbindung"} konnte kein access_token geladen werden.`);
  }

  await admin
    .from("google_oauth_connections")
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
      is_active: true,
    })
    .eq("id", connection.id);

  if (connection.owner_user_id) {
    await admin
      .from("google_oauth_tokens")
      .update({
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", connection.owner_user_id);
  }

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
    const msg = json?.error?.message ?? json?.error_description ?? json?.error ?? "Google API error";
    const error: any = new Error(msg);
    error.status = res.status;
    error.googleStatus = res.status;
    error.googleError = json?.error ?? null;
    throw error;
  }
  return json;
}

async function findStudioGoogleConnectionForOwner(
  admin: any,
  ownerUserId: string,
  target: Exclude<StudioWriteTarget, "auto">
) {
  const definition = STUDIO_WRITE_TARGETS[target];

  const byLabel = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only, default_calendar_id, enabled_calendar_ids")
    .eq("connection_label", definition.connectionLabel)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (byLabel.error) {
    throw new Error("Studio-Google-Verbindungen konnten nicht geladen werden: " + byLabel.error.message);
  }

  const byLabelRows = Array.isArray(byLabel.data) ? (byLabel.data as GoogleOauthConnectionRow[]) : [];
  const matchingByLabelRows = byLabelRows.filter((row) => isTargetConnectionMatch(row, target));
  const preferredByLabel =
    matchingByLabelRows.find((row) => String(row.owner_user_id ?? "").trim() === String(ownerUserId ?? "").trim()) ??
    matchingByLabelRows[0] ??
    null;

  if (preferredByLabel?.id) return preferredByLabel;

  const byEmail = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only")
    .eq("google_account_email", definition.emailHint)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (byEmail.error) {
    throw new Error("Studio-Google-Verbindungen konnten nicht geladen werden: " + byEmail.error.message);
  }

  const byEmailRows = Array.isArray(byEmail.data) ? (byEmail.data as GoogleOauthConnectionRow[]) : [];
  const matchingByEmailRows = byEmailRows.filter((row) => isTargetConnectionMatch(row, target));
  const preferredByEmail =
    matchingByEmailRows.find((row) => String(row.owner_user_id ?? "").trim() === String(ownerUserId ?? "").trim()) ??
    matchingByEmailRows[0] ??
    null;

  return preferredByEmail;
}

async function findAutomaticGoogleConnectionForOwner(admin: any, ownerUserId: string) {
  const { data: rows, error } = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only")
    .eq("owner_user_id", ownerUserId)
    .eq("is_active", true)
    .eq("is_read_only", false)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error("Google-Verbindungen konnten nicht geladen werden: " + error.message);
  }

  const rowsList = Array.isArray(rows) ? (rows as GoogleOauthConnectionRow[]) : [];

  // Automatisch darf niemals einen privaten Kalender als Schreibkalender nehmen.
  // Zulässig sind nur die beiden Studio-Schreibkalender.
  const studioRows = rowsList.filter((row) => getStudioWriteTargetForConnection(row) !== null);
  if (studioRows.length === 0) return null;

  const raduStudio = studioRows.find((row) => getStudioWriteTargetForConnection(row) === "studio_radu");
  if (raduStudio) return raduStudio;

  const ralucaStudio = studioRows.find((row) => getStudioWriteTargetForConnection(row) === "studio_raluca");
  return ralucaStudio ?? studioRows[0] ?? null;
}
async function resolveAutomaticCalendarIdForConnection(
  admin: any,
  connection: GoogleOauthConnectionRow
) {
  const directCalendarId = String(
    connection.google_account_email ??
    connection.google_account_name ??
    ""
  ).trim();

  if (directCalendarId) {
    return directCalendarId;
  }

  const token = await getAccessTokenForGoogleConnection(admin, connection);

  const calendarList = await googleFetchWithToken(
    token,
    "/users/me/calendarList?maxResults=250"
  );

  const items = Array.isArray(calendarList?.items) ? calendarList.items : [];

  const primaryCalendar =
    items.find((item: any) => item?.primary === true) ??
    items.find((item: any) => String(item?.accessRole ?? "").trim().toLowerCase() === "owner") ??
    null;

  const resolvedCalendarId = String(primaryCalendar?.id ?? "").trim();

  if (!resolvedCalendarId) {
    throw new Error("Für die Google-Verbindung konnte kein eigener Kalender gefunden werden.");
  }

  const updatePayload: Record<string, any> = {
    default_calendar_id: resolvedCalendarId,
    updated_at: new Date().toISOString(),
  };

  const primarySummary = String(primaryCalendar?.summary ?? "").trim();
  if (primarySummary && !String(connection.google_account_name ?? "").trim()) {
    updatePayload.google_account_name = primarySummary;
  }
  if (!String(connection.google_account_email ?? "").trim()) {
    updatePayload.google_account_email = resolvedCalendarId;
  }

  await admin
    .from("google_oauth_connections")
    .update(updatePayload)
    .eq("id", connection.id);

  return resolvedCalendarId;
}

async function getGoogleAccessTokenForAppointmentTarget(googleConnectionId: string | null | undefined) {
  const normalizedConnectionId = String(googleConnectionId ?? "").trim();
  if (!normalizedConnectionId) {
    return await getValidGoogleAccessToken();
  }

  const admin = supabaseAdmin();
  const { data: connection, error } = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only")
    .eq("id", normalizedConnectionId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error("Google-Verbindung konnte nicht geladen werden: " + error.message);
  }

  if (!connection?.id) {
    throw new Error("Google-Verbindung für diesen Termin wurde nicht gefunden.");
  }

  return await getAccessTokenForGoogleConnection(admin, connection as GoogleOauthConnectionRow);
}

function sanitizeCalendarIdList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function resolveEnabledCalendarIds(tokenRow: GoogleTokenSelectionRow | null | undefined) {
  const defaultCalendarId = String(tokenRow?.default_calendar_id ?? "").trim();
  const rawEnabled = Array.isArray(tokenRow?.enabled_calendar_ids) ? tokenRow!.enabled_calendar_ids! : [];
  const enabledIds = sanitizeCalendarIdList([...rawEnabled, defaultCalendarId]);

  return {
    defaultCalendarId: defaultCalendarId || null,
    enabledIds,
  };
}

function getCalendarIdsFromConnection(row: Partial<GoogleOauthConnectionRow> | null | undefined) {
  if (!row) return [];

  const enabledIds = Array.isArray(row.enabled_calendar_ids)
    ? row.enabled_calendar_ids.map((value) => normalizeGoogleCalendarId(value))
    : [];

  return sanitizeCalendarIdList([
    normalizeGoogleCalendarId(row.default_calendar_id ?? null),
    ...enabledIds,
    normalizeGoogleCalendarId(row.google_account_email ?? null),
    normalizeGoogleCalendarId(row.google_account_name ?? null),
    normalizeGoogleCalendarId(row.connection_label ?? null),
  ]).filter(Boolean);
}

function isReadOnlyExtraCalendarId(calendarId: string | null | undefined) {
  const normalized = normalizeGoogleCalendarId(calendarId);
  return Boolean(normalized && !isStudioWriteCalendarId(normalized));
}

async function ensureExtraCalendarMirrorPersonId(_admin: any, _tenantId: string) {
  // Sicherheitsbremse:
  // Zusatzkalender/private Kalender sind read-only und dürfen niemals CRM-Personen
  // oder Kundenprofile erzeugen. Diese Funktion bleibt nur noch als Schutz gegen
  // alte Codepfade bestehen.
  throw new Error("Zusatzkalender sind read-only und dürfen keine CRM-Daten schreiben.");
}

async function isReadOnlyExtraCalendarAppointment(
  admin: any,
  googleCalendarId: string | null | undefined,
  notesInternal: string | null | undefined
) {
  if (hasExtraGoogleCalendarMarker(notesInternal)) return true;

  const normalizedCalendarId = String(googleCalendarId ?? "").trim();
  if (!normalizedCalendarId) return false;

  const { data: tokenRows, error } = await admin
    .from("google_oauth_tokens")
    .select("default_calendar_id, enabled_calendar_ids")
    .limit(500);

  if (error) {
    return false;
  }

  for (const tokenRow of (tokenRows ?? []) as GoogleTokenSelectionRow[]) {
    const selection = resolveEnabledCalendarIds(tokenRow);
    if (!selection.enabledIds.includes(normalizedCalendarId)) continue;
    return selection.defaultCalendarId !== normalizedCalendarId;
  }

  return false;
}


async function googleFetch(path: string, init?: RequestInit) {
  const token = await getValidGoogleAccessToken();
  return googleFetchWithToken(token, path, init);
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

const REMINDER_DELETED_NOTE_PREFIX = "Reminder gelöscht:";

function hasReminderDeletedMarker(existing: string | null | undefined) {
  return String(existing ?? "").toLowerCase().includes(REMINDER_DELETED_NOTE_PREFIX.toLowerCase());
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
  extraGoogleCalendar?: boolean;
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
      t.startsWith("dauer:") ||
      t.startsWith(EXTRA_GOOGLE_CALENDAR_NOTE_PREFIX.toLowerCase()) ||
      t.startsWith(STUDIO_GOOGLE_EXTERNAL_NOTE_PREFIX.toLowerCase())
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
  if (input.extraGoogleCalendar) head.push(`${EXTRA_GOOGLE_CALENDAR_NOTE_PREFIX} Ja`);

  return [...head, ...rest].filter(Boolean).join("\n").trim();
}

function addStudioGoogleExternalMarker(existing: string | null | undefined) {
  const lines = parseMetadataLines(existing ?? null).filter((line) => {
    return !line.trimStart().toLowerCase().startsWith(STUDIO_GOOGLE_EXTERNAL_NOTE_PREFIX.toLowerCase());
  });
  lines.push(`${STUDIO_GOOGLE_EXTERNAL_NOTE_PREFIX} Ja`);
  return lines.filter(Boolean).join("\n").trim();
}

function hasStudioGoogleExternalMarker(existing: string | null | undefined) {
  const value = readLineValue(existing ?? null, STUDIO_GOOGLE_EXTERNAL_NOTE_PREFIX);
  return String(value).trim().toLowerCase() === "ja";
}

function normalizeGoogleCalendarId(rawValue: string | null | undefined) {
  const raw = String(rawValue ?? "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "";

  if (lower.includes(STUDIO_WRITE_TARGETS.studio_radu.calendarId) || lower.includes("studio radu") || lower.includes("radu studio")) {
    return STUDIO_WRITE_TARGETS.studio_radu.calendarId;
  }

  if (
    lower.includes(STUDIO_WRITE_TARGETS.studio_raluca.calendarId) ||
    lower.includes("studio raluca") ||
    lower.includes("raluca studio") ||
    lower.includes("studio magnifique") ||
    lower.includes("magnifique beauty institut")
  ) {
    return STUDIO_WRITE_TARGETS.studio_raluca.calendarId;
  }

  return raw;
}

function hasExtraGoogleCalendarMarker(existing: string | null | undefined) {
  const value = readLineValue(existing ?? null, EXTRA_GOOGLE_CALENDAR_NOTE_PREFIX);
  return String(value).trim().toLowerCase() === "ja";
}

function clampSyncRange(input: { startISO: string; endISO: string }) {
  const start = new Date(input.startISO);
  const end = new Date(input.endISO);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  const maxEnd = new Date(start);
  maxEnd.setDate(maxEnd.getDate() + MAX_SYNC_RANGE_DAYS);

  return {
    startISO: start.toISOString(),
    endISO: (end > maxEnd ? maxEnd : end).toISOString(),
  };
}


async function loadSharedDefaultCalendarIdSet(admin: any) {
  const sharedIds = new Set<string>();

  const { data: tokenRows, error } = await admin
    .from("google_oauth_tokens")
    .select("default_calendar_id")
    .limit(1000);

  if (error) {
    return sharedIds;
  }

  const counts = new Map<string, number>();

  for (const row of Array.isArray(tokenRows) ? tokenRows : []) {
    const calendarId = String((row as any)?.default_calendar_id ?? "").trim();
    if (!calendarId) continue;
    counts.set(calendarId, (counts.get(calendarId) ?? 0) + 1);
  }

  for (const [calendarId, count] of counts.entries()) {
    if (count > 1) sharedIds.add(calendarId);
  }

  return sharedIds;
}

function readGoogleEventCrmTenantId(event: any) {
  return String(event?.extendedProperties?.private?.crmTenantId ?? "").trim();
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
      google_calendar_id,
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

  const isReadOnlyExtraCalendar = await isReadOnlyExtraCalendarAppointment(
    admin,
    String((appt as any).google_calendar_id ?? "").trim() || null,
    (appt as any).notes_internal ?? null
  );

  if (isReadOnlyExtraCalendar) {
    throw new Error("Zusatzkalender-Termine sind nur zur Anzeige und können nicht ins CRM übernommen werden.");
  }

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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = isAdminUser((profile as any)?.role, user.email);

  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/calendar/google"));

  const effectiveTenantId = await getEffectiveTenantId({
    role: (profile as any)?.role ?? "PRACTITIONER",
    tenant_id: (profile as any)?.tenant_id ?? null,
    calendar_tenant_id: (profile as any)?.calendar_tenant_id ?? null,
  });
  const isDemoMode = await getIsDemoTenant(supabaseAdmin(), effectiveTenantId);

  if (isDemoMode) {
    await supabase
      .from("google_oauth_tokens")
      .upsert(
        {
          user_id: user.id,
          default_calendar_id: CLIENTIQUE_DEMO_CALENDAR_ID,
          enabled_calendar_ids: [CLIENTIQUE_DEMO_CALENDAR_ID],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    redirect(buildRedirectUrl(returnTo, "success", "Demo-Kalender gespeichert ✅ Keine echte Google-Verbindung wurde verwendet."));
  }
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  const enabledCalendarIds = sanitizeCalendarIdList(
    formData.getAll("enabledCalendarIds").map((value) => String(value ?? "").trim())
  );

  if (!calendarId) {
    redirect(buildRedirectUrl(returnTo, "error", "Bitte einen Standard-Kalender auswählen."));
  }

  if (!isAdmin && calendarId === STUDIO_WRITE_TARGETS.studio_radu.calendarId) {
    redirect(buildRedirectUrl(returnTo, "error", "Studio Radu darf nur vom Admin als Schreibkalender verwendet werden."));
  }

  const { data: activeStudioConnections, error: activeStudioConnectionsError } = await supabase
    .from("google_oauth_connections")
    .select("google_account_email, connection_label")
    .eq("owner_user_id", user.id)
    .eq("is_active", true)
    .eq("is_read_only", false);

  if (activeStudioConnectionsError) {
    redirect(buildRedirectUrl(returnTo, "error", "Konnte aktive Studio-Kalender nicht laden: " + activeStudioConnectionsError.message));
  }

  const activeStudioCalendarIds = sanitizeCalendarIdList(
    (Array.isArray(activeStudioConnections) ? activeStudioConnections : []).flatMap((row: any) => {
      const email = String(row?.google_account_email ?? "").trim().toLowerCase();
      const label = String(row?.connection_label ?? "").trim().toLowerCase();

      return Object.values(STUDIO_WRITE_TARGETS)
        .filter((definition) => {
          const matchesEmail = email === definition.emailHint.toLowerCase();
          const matchesLabel = label === definition.connectionLabel.toLowerCase();
          return matchesEmail || matchesLabel;
        })
        .map((definition) => definition.calendarId);
    })
  );

  const nextEnabledCalendarIds = sanitizeCalendarIdList([
    ...activeStudioCalendarIds,
    calendarId,
    ...enabledCalendarIds,
  ]);

  const { error } = await supabase
    .from("google_oauth_tokens")
    .upsert(
      {
        user_id: user.id,
        default_calendar_id: calendarId,
        enabled_calendar_ids: nextEnabledCalendarIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    redirect(buildRedirectUrl(returnTo, "error", "Konnte Kalender-Auswahl nicht speichern: " + error.message));
  }

  redirect(
    buildRedirectUrl(
      returnTo,
      "success",
      `Kalender gespeichert ✅ (${nextEnabledCalendarIds.length} aktiv)`
    )
  );
}

export async function createTestEvent(formData?: FormData) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const returnTo = safeReturnTo(String(formData?.get("returnTo") ?? "/calendar/google"));

  const { data: profileForDemo } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const effectiveTenantId = await getEffectiveTenantId({
    role: (profileForDemo as any)?.role ?? "PRACTITIONER",
    tenant_id: (profileForDemo as any)?.tenant_id ?? null,
    calendar_tenant_id: (profileForDemo as any)?.calendar_tenant_id ?? null,
  });

  if (await getIsDemoTenant(supabaseAdmin(), effectiveTenantId)) {
    redirect(buildRedirectUrl(returnTo, "success", "Demo-Testevent simuliert ✅ Es wurde kein echter Google-Termin erstellt."));
  }

  const { data: tok, error: tokErr } = await supabase
    .from("google_oauth_tokens")
    .select("default_calendar_id, enabled_calendar_ids")
    .eq("user_id", user.id)
    .single();

  if (tokErr) {
    redirect(buildRedirectUrl(returnTo, "error", "Token DB Fehler: " + tokErr.message));
  }

  const requestedCalendarId = String(formData?.get("calendarId") ?? "").trim();
  const tokenSelection = resolveEnabledCalendarIds((tok ?? null) as GoogleTokenSelectionRow | null);
  const calendarId = requestedCalendarId || tokenSelection.defaultCalendarId;
  if (!calendarId) {
    redirect(buildRedirectUrl(returnTo, "error", "Bitte zuerst einen Standard-Kalender speichern."));
  }

  if (tokenSelection.enabledIds.length > 0 && !tokenSelection.enabledIds.includes(calendarId)) {
    redirect(buildRedirectUrl(returnTo, "error", "Dieser Kalender ist aktuell nicht aktiviert."));
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


function parseGoogleEventDate(raw: { dateTime?: string | null; date?: string | null } | null | undefined, fallbackHour = 9) {
  const dateTime = String(raw?.dateTime ?? "").trim();
  if (dateTime) {
    const parsed = new Date(dateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const dateOnly = String(raw?.date ?? "").trim();
  if (dateOnly) {
    const parsed = new Date(`${dateOnly}T${pad2(fallbackHour)}:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

async function ensurePersonIdForGoogleMirror(admin: any, tenantId: string, summary: string) {
  const cleanSummary = String(summary ?? "").trim() || "Google Termin";

  const { data: existingProfiles } = await admin
    .from("customer_profiles")
    .select(`id, person_id, person:persons ( id, full_name )`)
    .eq("tenant_id", tenantId)
    .limit(500);

  const existingProfile = (Array.isArray(existingProfiles) ? existingProfiles : []).find((row: any) => {
    const personJoin = Array.isArray(row?.person) ? row.person[0] : row?.person;
    return String(personJoin?.full_name ?? "").trim().toLowerCase() === cleanSummary.toLowerCase();
  });

  if (existingProfile?.person_id) {
    return String(existingProfile.person_id);
  }

  // WICHTIG:
  // Externe Google-Termine dürfen nicht mehr als echte Kundenprofile im CRM auftauchen.
  // Deshalb suchen/erzeugen wir hier nur noch eine person für die Anzeige im Kalender,
  // aber KEIN customer_profile mehr.
  const { data: existingPersons } = await admin
    .from("persons")
    .select("id, full_name")
    .limit(1000);

  const existingPerson = (Array.isArray(existingPersons) ? existingPersons : []).find((row: any) => {
    return String(row?.full_name ?? "").trim().toLowerCase() === cleanSummary.toLowerCase();
  });

  if (existingPerson?.id) {
    return String(existingPerson.id);
  }

  const { data: insertedPerson, error: personError } = await admin
    .from("persons")
    .insert({ full_name: cleanSummary })
    .select("id")
    .single();

  if (personError || !insertedPerson?.id) {
    throw new Error("Google-Termin konnte keiner Person zugeordnet werden.");
  }

  return String(insertedPerson.id);
}

async function updateGoogleMirrorPersonNameIfSafe(admin: any, tenantId: string, personId: string | null | undefined, nextName: string) {
  const cleanPersonId = String(personId ?? "").trim();
  const cleanTenantId = String(tenantId ?? "").trim();
  const cleanName = String(nextName ?? "").trim();

  if (!cleanPersonId || !cleanTenantId || !cleanName) return;

  // Nur reine Google-Spiegelpersonen aktualisieren.
  // Echte CRM-Kunden haben ein customer_profile und dürfen durch Google-Titeländerungen
  // niemals umbenannt werden.
  const { data: profileRows, error: profileError } = await admin
    .from("customer_profiles")
    .select("id")
    .eq("tenant_id", cleanTenantId)
    .eq("person_id", cleanPersonId)
    .limit(1);

  if (profileError) {
    console.error("Google Mirror Person Check fehlgeschlagen", profileError.message);
    return;
  }

  if (Array.isArray(profileRows) && profileRows.length > 0) return;

  const { error: updateError } = await admin
    .from("persons")
    .update({ full_name: cleanName })
    .eq("id", cleanPersonId);

  if (updateError) {
    console.error("Google Mirror Person Update fehlgeschlagen", updateError.message);
  }
}



export async function getReadOnlyExtraGoogleCalendarEventsForRange(input: { startISO: string; endISO: string }) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return { ok: false, items: [], reason: "not_authenticated" as const };
  }

  const startISO = String(input?.startISO ?? "").trim();
  const endISO = String(input?.endISO ?? "").trim();
  const clampedRange = clampSyncRange({ startISO, endISO });

  if (!clampedRange) {
    return { ok: false, items: [], reason: "invalid_range" as const };
  }

  const { data: profileForDemo } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const effectiveTenantId = await getEffectiveTenantId({
    role: (profileForDemo as any)?.role ?? "PRACTITIONER",
    tenant_id: (profileForDemo as any)?.tenant_id ?? null,
    calendar_tenant_id: (profileForDemo as any)?.calendar_tenant_id ?? null,
  });

  if (await getIsDemoTenant(admin, effectiveTenantId)) {
    return { ok: true, items: [], reason: "demo_mode" as const };
  }

  const [{ data: tokenRow, error: tokenError }, { data: connectionRows, error: connectionsError }] = await Promise.all([
    supabase
      .from("google_oauth_tokens")
      .select("default_calendar_id, enabled_calendar_ids")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("google_oauth_connections")
      .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only, default_calendar_id, enabled_calendar_ids")
      .eq("owner_user_id", user.id)
      .eq("is_active", true),
  ]);

  if (tokenError) {
    throw new Error("Google-Kalender konnten nicht geladen werden: " + tokenError.message);
  }
  if (connectionsError) {
    throw new Error("Google-Verbindungen konnten nicht geladen werden: " + connectionsError.message);
  }

  const activeRows = Array.isArray(connectionRows) ? connectionRows as GoogleOauthConnectionRow[] : [];
  if (!activeRows.length) {
    return { ok: true, items: [] };
  }
  const tokenSelection = resolveEnabledCalendarIds((tokenRow ?? null) as GoogleTokenSelectionRow | null);
  const defaultCalendarId = normalizeGoogleCalendarId(tokenSelection.defaultCalendarId ?? null);
  const tokenEnabledIds = sanitizeCalendarIdList(tokenSelection.enabledIds.map((value) => normalizeGoogleCalendarId(value)));

  const readOnlyConnections = activeRows.filter((row) => row.is_read_only === true);

  // Wichtig: Eine read-only Verbindung kann mehrere Kalender anzeigen.
  // Beispiel: Connection "Privater Kalender" läuft über radu.craus@gmail.com,
  // aber der tatsächlich gewählte Kalender ist fenster.lenhardt@gmail.com.
  // Deshalb dürfen wir NICHT nur google_account_email/connection_label als Kalender-ID verwenden.
  const readOnlyEnabledIds = sanitizeCalendarIdList(
    readOnlyConnections.flatMap((row) => getCalendarIdsFromConnection(row))
  );

  const candidateExtraCalendarIds = readOnlyEnabledIds.length > 0 ? readOnlyEnabledIds : tokenEnabledIds;

  const extraCalendarIds = sanitizeCalendarIdList(
    candidateExtraCalendarIds.filter((calendarId) =>
      calendarId &&
      calendarId !== defaultCalendarId &&
      !isStudioWriteCalendarId(calendarId)
    )
  );

  if (extraCalendarIds.length === 0) {
    return { ok: true, items: [] };
  }

  const connectionByCalendarId = new Map<string, GoogleOauthConnectionRow>();
  for (const row of readOnlyConnections) {
    const candidates = getCalendarIdsFromConnection(row);

    for (const normalized of candidates) {
      if (!normalized || !extraCalendarIds.includes(normalized) || connectionByCalendarId.has(normalized)) continue;
      connectionByCalendarId.set(normalized, row);
    }
  }

  const items: Array<{
    id: string;
    googleEventId: string;
    googleCalendarId: string;
    googleCalendarLabel: string;
    googleCalendarShortLabel: string;
    googleCalendarColor: string | null;
    start_at: string;
    end_at: string;
    title: string;
    note: string;
    status: AppointmentStatus;
    isExtraGoogleCalendar: true;
  }> = [];

  for (const calendarId of extraCalendarIds) {
    const connection = connectionByCalendarId.get(calendarId) ?? (readOnlyConnections.length === 1 ? readOnlyConnections[0] : undefined);
    if (!connection) continue;

    let accessToken = "";
    try {
      accessToken = await getAccessTokenForGoogleConnection(admin, connection);
    } catch (error: any) {
      console.error(`Google Zusatzkalender ${calendarId} Token konnte nicht geladen werden`, error?.message ?? error);
      continue;
    }

    let calendarMeta: { summary: string; backgroundColor: string | null } = {
      summary: calendarId,
      backgroundColor: null,
    };

    try {
      const metaResponse = await googleFetchWithToken(accessToken, `/users/me/calendarList/${encodeURIComponent(calendarId)}`);
      calendarMeta = {
        summary: String(metaResponse?.summary ?? calendarId).trim() || calendarId,
        backgroundColor: String(metaResponse?.backgroundColor ?? "").trim() || null,
      };
    } catch {
      calendarMeta = { summary: calendarId, backgroundColor: null };
    }

    let googleEvents: any[] = [];
    try {
      const response = await googleFetchWithToken(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&showDeleted=false&timeMin=${encodeURIComponent(clampedRange.startISO)}&timeMax=${encodeURIComponent(clampedRange.endISO)}&maxResults=${MAX_GOOGLE_EVENTS_PER_CALENDAR}`
      );
      googleEvents = Array.isArray(response?.items) ? response.items : [];
    } catch (error: any) {
      console.error(`Google Zusatzkalender ${calendarId} konnte nicht geladen werden`, error?.message ?? error);
      continue;
    }

    const googleCalendarLabel = calendarMeta.summary;
    const googleCalendarColor = calendarMeta.backgroundColor;
    const googleCalendarShortLabel = googleCalendarLabel.split(/\s+/)[0] || googleCalendarLabel;

    for (const event of googleEvents) {
      const googleEventId = String(event?.id ?? "").trim();
      if (!googleEventId) continue;
      const eventStatus = String(event?.status ?? "confirmed").trim().toLowerCase();
      if (eventStatus === "cancelled") continue;
      const start = parseGoogleEventDate(event?.start, 9);
      const end = parseGoogleEventDate(event?.end, 10);
      if (!start || !end) continue;
      const title = String(event?.summary ?? "").trim() || googleCalendarLabel || "Privater Termin";
      const note = String(event?.description ?? "").trim();
      items.push({
        id: `extra:${calendarId}:${googleEventId}`,
        googleEventId,
        googleCalendarId: calendarId,
        googleCalendarLabel,
        googleCalendarShortLabel,
        googleCalendarColor,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        title,
        note,
        status: "scheduled",
        isExtraGoogleCalendar: true,
      });
    }
  }

  items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return { ok: true, items };
}


export async function syncGoogleCalendarRangeToAppointments(input: { startISO: string; endISO: string }) {

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return { ok: false, synced: 0, deleted: 0, reason: "not_authenticated" };
  }

  const startISO = String(input?.startISO ?? "").trim();
  const endISO = String(input?.endISO ?? "").trim();

  if (!startISO || !endISO) {
    return { ok: false, synced: 0, deleted: 0, reason: "missing_range" };
  }

  const clampedRange = clampSyncRange({ startISO, endISO });
  if (!clampedRange) {
    return { ok: false, synced: 0, deleted: 0, reason: "invalid_range" };
  }

  const { data: ownerProfile, error: ownerProfileError } = await admin
    .from("user_profiles")
    .select("user_id, full_name, tenant_id, calendar_tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownerProfileError) {
    throw new Error("Behandler-Profil konnte nicht geladen werden: " + ownerProfileError.message);
  }

  const ownerUserId = String(ownerProfile?.user_id ?? "").trim();
  const ownerTenantId = String(ownerProfile?.tenant_id ?? "").trim();

  if (!ownerUserId || !ownerTenantId) {
    return { ok: true, synced: 0, deleted: 0 };
  }

  const ownerEffectiveTenantId = await getEffectiveTenantId({
    role: (ownerProfile as any)?.role ?? "PRACTITIONER",
    tenant_id: (ownerProfile as any)?.tenant_id ?? null,
    calendar_tenant_id: (ownerProfile as any)?.calendar_tenant_id ?? null,
  });

  if (await getIsDemoTenant(admin, ownerEffectiveTenantId)) {
    return { ok: true, synced: 0, deleted: 0, reason: "demo_mode" };
  }

  const { data: practitionerProfiles } = await admin
    .from("user_profiles")
    .select("full_name, tenant_id")
    .limit(200);

  const studioTenantIdByCalendarId = new Map<string, string>();
  for (const profileRow of Array.isArray(practitionerProfiles) ? practitionerProfiles : []) {
    const fullName = String((profileRow as any)?.full_name ?? "").trim().toLowerCase();
    const tenantId = String((profileRow as any)?.tenant_id ?? "").trim();
    if (!fullName || !tenantId) continue;
    if (fullName.includes("radu")) {
      studioTenantIdByCalendarId.set(STUDIO_WRITE_TARGETS.studio_radu.calendarId, tenantId);
    }
    if (fullName.includes("raluca")) {
      studioTenantIdByCalendarId.set(STUDIO_WRITE_TARGETS.studio_raluca.calendarId, tenantId);
    }
  }

  const resolveStudioTenantId = (calendarId: string) => {
    const normalized = normalizeGoogleCalendarId(calendarId);
    return studioTenantIdByCalendarId.get(normalized) ?? ownerTenantId;
  };

  const { data: tokenRow, error: tokenError } = await admin
    .from("google_oauth_tokens")
    .select("user_id, default_calendar_id, enabled_calendar_ids")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (tokenError) {
    throw new Error("Google-Kalender konnten nicht geladen werden: " + tokenError.message);
  }

  const { data: connectionRows, error: connectionRowsError } = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, is_active, is_read_only, default_calendar_id, enabled_calendar_ids")
    .eq("owner_user_id", ownerUserId);

  if (connectionRowsError) {
    throw new Error("Google-Verbindungen konnten nicht geladen werden: " + connectionRowsError.message);
  }

  const activeConnectionRows = Array.isArray(connectionRows)
    ? (connectionRows as GoogleOauthConnectionRow[]).filter((row: any) => row?.is_active === true)
    : [];

  const tokenSelection = resolveEnabledCalendarIds((tokenRow ?? null) as GoogleTokenSelectionRow | null);
  const defaultCalendarId = normalizeGoogleCalendarId(tokenSelection.defaultCalendarId ?? null);

  // Private/Zusatzkalender sind ausschließlich read-only.
  // Sie werden in getReadOnlyExtraGoogleCalendarEventsForRange(...) direkt von Google geladen
  // und dürfen hier niemals als syncTargets in public.appointments landen.
  const readOnlyConnectionRows = activeConnectionRows.filter((row) => row.is_read_only === true);
  const readOnlyCalendarIds = sanitizeCalendarIdList(
    readOnlyConnectionRows.flatMap((row) => getCalendarIdsFromConnection(row)).filter(isReadOnlyExtraCalendarId)
  );
  const tokenExtraCalendarIds = sanitizeCalendarIdList(
    tokenSelection.enabledIds
      .map((calendarId) => normalizeGoogleCalendarId(calendarId))
      .filter((calendarId) => calendarId !== defaultCalendarId && isReadOnlyExtraCalendarId(calendarId))
  );
  const extraCalendarIds = sanitizeCalendarIdList([...readOnlyCalendarIds, ...tokenExtraCalendarIds]);
  const sharedDefaultCalendarIds = await loadSharedDefaultCalendarIdSet(admin);

  const syncTargets: Array<{
    calendarId: string;
    tenantId: string;
    ownerLabel: string;
    accessToken: string;
    connectionId: string | null;
  }> = [];

  const { data: studioConnections, error: studioConnectionsError } = await admin
    .from("google_oauth_connections")
    .select("id, owner_user_id, provider, connection_type, connection_label, google_account_email, google_account_name, access_token, refresh_token, expires_at, is_active, is_primary, is_read_only")
    .eq("owner_user_id", ownerUserId)
    .eq("is_active", true)
    .eq("is_read_only", false)
    .limit(20);

  if (studioConnectionsError) {
    throw new Error("Studio-Google-Verbindungen konnten nicht geladen werden: " + studioConnectionsError.message);
  }

  const studioConnectionList = Array.isArray(studioConnections) ? studioConnections as GoogleOauthConnectionRow[] : [];

  if (defaultCalendarId && isStudioWriteCalendarId(defaultCalendarId)) {
    const matchedDefaultConnection = studioConnectionList.find((connection) => {
      if (getStudioWriteTargetForConnection(connection) === null) return false;
      return [connection.google_account_email, connection.connection_label, connection.google_account_name]
        .map((value) => normalizeGoogleCalendarId(value))
        .includes(normalizeGoogleCalendarId(defaultCalendarId));
    });

    if (matchedDefaultConnection?.id) {
      try {
        const defaultToken = await getAccessTokenForGoogleConnection(admin, matchedDefaultConnection);

        syncTargets.push({
          calendarId: normalizeGoogleCalendarId(defaultCalendarId),
          tenantId: resolveStudioTenantId(defaultCalendarId),
          ownerLabel: String(matchedDefaultConnection.connection_label ?? matchedDefaultConnection.google_account_name ?? matchedDefaultConnection.google_account_email ?? ownerProfile?.full_name ?? "Google Kalender").trim() || "Google Kalender",
          accessToken: defaultToken,
          connectionId: String(matchedDefaultConnection.id),
        });
      } catch (error: any) {
        if (isGoogleAuthFailure(error)) {
          await markGoogleConnectionDisconnected(admin, matchedDefaultConnection, error);
        }
        console.warn("Google Standardkalender-Sync übersprungen:", error?.message ?? error);
      }
    }
  }

  for (const connection of studioConnectionList) {
    const target = getStudioWriteTargetForConnection(connection);
    if (!target) continue;

    const matchedCalendarId = STUDIO_WRITE_TARGETS[target].calendarId;
    if (syncTargets.some((entry) => entry.calendarId === matchedCalendarId)) continue;

    let connectionToken = "";

    try {
      connectionToken = await getAccessTokenForGoogleConnection(admin, connection);
    } catch (error: any) {
      if (isGoogleAuthFailure(error)) {
        await markGoogleConnectionDisconnected(admin, connection, error);
      }
      console.warn("Google Verbindung für Sync übersprungen:", error?.message ?? error);
      continue;
    }

    const mappedTenantId = resolveStudioTenantId(matchedCalendarId);

    syncTargets.push({
      calendarId: matchedCalendarId,
      tenantId: mappedTenantId,
      ownerLabel: String(connection.connection_label ?? connection.google_account_name ?? connection.google_account_email ?? ownerProfile?.full_name ?? "Google Kalender").trim() || "Google Kalender",
      accessToken: connectionToken,
      connectionId: String(connection.id),
    });
  }

  let deleted = 0;
  let synced = 0;

  // Harte Sicherheitsbremse:
  // Zusatzkalender dürfen NICHT in appointments gespiegelt bleiben.
  // Alte Altlasten im sichtbaren Bereich werden hier bei jedem Sync entfernt.
  if (extraCalendarIds.length > 0) {
    const { data: extraAppointments, error: extraAppointmentsError } = await admin
      .from("appointments")
      .select("id, notes_internal")
      .in("google_calendar_id", extraCalendarIds)
      .gte("start_at", clampedRange.startISO)
      .lt("start_at", clampedRange.endISO);

    if (extraAppointmentsError) {
      throw new Error("Zusatzkalender-Termine konnten nicht geladen werden: " + extraAppointmentsError.message);
    }

    for (const row of Array.isArray(extraAppointments) ? extraAppointments : []) {
      const appointmentId = String((row as any).id ?? "").trim();
      const notesInternal = (row as any).notes_internal ?? null;
      if (!appointmentId) continue;

      // Nur echte read-only Zusatzkalender-Altlasten entfernen.
      // Echte CRM-Termine auf dem Standardkalender eines Teammitglieds dürfen NIE
      // gelöscht werden, auch wenn dieser Kalender zufällig als Zusatzkalender
      // beim aktuellen User aktiviert wurde.
      if (!hasExtraGoogleCalendarMarker(notesInternal)) continue;

      await admin.from("appointment_open_slots").delete().eq("appointment_id", appointmentId);
      await admin.from("appointments").delete().eq("id", appointmentId);
      deleted += 1;
    }
  }

  // Ohne erreichbaren Studio-Kalender nur Cleanup der Altlasten durchführen
  if (syncTargets.length === 0) {
    return { ok: true, synced: 0, deleted };
  }

  const ownerByCalendarId = new Map<string, { tenantId: string; ownerLabel: string; defaultCalendarId: string | null }>();
  for (const target of syncTargets) {
    ownerByCalendarId.set(target.calendarId, {
      tenantId: target.tenantId,
      ownerLabel: target.ownerLabel,
      defaultCalendarId,
    });
  }

  const calendarIds = syncTargets.map((target) => target.calendarId);

  const { data: existingAppointments, error: existingError } = await admin
    .from("appointments")
    .select("id, tenant_id, person_id, start_at, end_at, status, notes_internal, google_calendar_id, google_event_id")
    .in("google_calendar_id", calendarIds)
    .gte("start_at", clampedRange.startISO)
    .lt("start_at", clampedRange.endISO);

  if (existingError) {
    throw new Error("Lokale Termine konnten nicht geladen werden: " + existingError.message);
  }

  const duplicateRowsByGoogleKey = new Map<string, any[]>();

  for (const row of Array.isArray(existingAppointments) ? existingAppointments : []) {
    const calendarId = String((row as any).google_calendar_id ?? "").trim();
    const eventId = String((row as any).google_event_id ?? "").trim();
    if (!calendarId || !eventId) continue;
    const key = `${calendarId}:${eventId}`;
    const bucket = duplicateRowsByGoogleKey.get(key) ?? [];
    bucket.push(row);
    duplicateRowsByGoogleKey.set(key, bucket);
  }

  const existingByGoogleKey = new Map<string, any>();

  for (const [googleKey, rows] of duplicateRowsByGoogleKey.entries()) {
    const sortedRows = [...rows].sort((a: any, b: any) =>
      String((a as any).id ?? "").localeCompare(String((b as any).id ?? ""))
    );
    const keeper = sortedRows[0] ?? null;
    if (!keeper) continue;

    existingByGoogleKey.set(googleKey, keeper);

    const duplicates = sortedRows.slice(1);
    for (const duplicate of duplicates) {
      const duplicateId = String((duplicate as any).id ?? "").trim();
      if (!duplicateId) continue;
      await admin.from("appointment_open_slots").delete().eq("appointment_id", duplicateId);
      await admin.from("appointments").delete().eq("id", duplicateId);
      deleted += 1;
    }
  }

  const seenGoogleKeys = new Set<string>();

  for (const syncTarget of syncTargets) {
    const calendarId = normalizeGoogleCalendarId(syncTarget.calendarId);

    // Absolute Zukunftssperre:
    // Nur die zwei definierten Studio-Schreibkalender dürfen CRM-appointments schreiben.
    // Alles andere (private Kalender, zusätzliche Google-Kalender, reconnectete Tokens)
    // wird hier übersprungen und bleibt read-only UI-only.
    if (!isStudioWriteCalendarId(calendarId)) continue;

    const ownerInfo = ownerByCalendarId.get(calendarId);
    if (!ownerInfo?.tenantId) continue;

    let googleEvents: any[] = [];

    try {
      const response = await googleFetchWithToken(
        syncTarget.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&showDeleted=true&timeMin=${encodeURIComponent(clampedRange.startISO)}&timeMax=${encodeURIComponent(clampedRange.endISO)}&maxResults=${MAX_GOOGLE_EVENTS_PER_CALENDAR}`
      );
      googleEvents = Array.isArray(response?.items) ? response.items : [];
    } catch (error: any) {
      if (isGoogleAuthFailure(error) && syncTarget.connectionId) {
        const failingConnection = studioConnectionList.find((connection) => String(connection.id) === String(syncTarget.connectionId)) ?? null;
        await markGoogleConnectionDisconnected(admin, failingConnection, error);
      }
      console.warn(`Google Sync für Kalender ${calendarId} übersprungen`, error?.message ?? error);
      continue;
    }

    for (const event of googleEvents) {
      const googleEventId = String(event?.id ?? "").trim();
      if (!googleEventId) continue;

      const googleKey = `${calendarId}:${googleEventId}`;
      const existing = existingByGoogleKey.get(googleKey) ?? null;
      const eventStatus = String(event?.status ?? "confirmed").trim().toLowerCase();

      if (eventStatus === "cancelled") {
        seenGoogleKeys.add(googleKey);
        if (existing?.id) {
          await admin.from("appointment_open_slots").delete().eq("appointment_id", existing.id);
          await admin.from("appointments").delete().eq("id", existing.id);
          deleted += 1;
        }
        continue;
      }

      const start = parseGoogleEventDate(event?.start, 9);
      const end = parseGoogleEventDate(event?.end, 10);
      if (!start || !end) continue;

      const title = String(event?.summary ?? "").trim() || `Google Termin · ${ownerInfo.ownerLabel}`;
      const notes = String(event?.description ?? "").trim();
      const metadataTenantId = readGoogleEventCrmTenantId(event);
      const calendarIsSharedDefault = sharedDefaultCalendarIds.has(calendarId);

      seenGoogleKeys.add(googleKey);

      const stableTenantId = metadataTenantId || ownerInfo.tenantId;
      if (!stableTenantId) {
        continue;
      }

      const isExternalStudioMirror = !metadataTenantId;
      const mirrorPersonName = isExternalStudioMirror ? `${title} · ${ownerInfo.ownerLabel}` : title;
      const personId = existing?.person_id
        ? String(existing.person_id)
        : await ensurePersonIdForGoogleMirror(admin, stableTenantId, mirrorPersonName);

      if (isExternalStudioMirror && existing?.person_id) {
        await updateGoogleMirrorPersonNameIfSafe(admin, stableTenantId, personId, mirrorPersonName);
      }

      const preservedStatus: AppointmentStatus = existing?.id
        ? normalizeStatus(String((existing as any).status ?? readLineValue(existing?.notes_internal ?? null, "Status:") ?? "scheduled"))
        : "scheduled";

      let notesInternal = buildNotesInternal({
        existing: existing?.notes_internal ?? null,
        title,
        notes,
        status: preservedStatus,
        preserveRest: true,
      });
      if (isExternalStudioMirror) {
        notesInternal = addStudioGoogleExternalMarker(notesInternal);
      }

      const reminderWasDeleted = hasReminderDeletedMarker(notesInternal);

      if (existing?.id) {
        const updErr = await updateAppointmentBestEffort(
          admin,
          String(existing.id),
          {
            tenant_id: stableTenantId,
            person_id: personId,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            reminder_at: reminderWasDeleted ? null : buildReminderAt(start).toISOString(),
            reminder_sent_at: reminderWasDeleted ? ((existing as any).reminder_sent_at ?? null) : null,
            notes_internal: notesInternal || null,
            google_calendar_id: calendarId,
            google_event_id: googleEventId,
            google_connection_id: syncTarget.connectionId,
            calendar_connection_id: syncTarget.connectionId,
            calendar_mode: "STUDIO",
          },
          preservedStatus
        );

        if (!updErr) synced += 1;
        continue;
      }

      const insErr = await insertAppointmentBestEffort(
        admin,
        {
          tenant_id: stableTenantId,
          person_id: personId,
          service_id: null,
          service_name_snapshot: null,
          service_price_cents_snapshot: null,
          service_duration_minutes_snapshot: null,
          service_buffer_minutes_snapshot: null,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          reminder_at: buildReminderAt(start).toISOString(),
          reminder_sent_at: null,
          notes_internal: notesInternal || null,
          google_calendar_id: calendarId,
          google_event_id: googleEventId,
          google_connection_id: syncTarget.connectionId,
          calendar_connection_id: syncTarget.connectionId,
          calendar_mode: "STUDIO",
        },
        "scheduled"
      );

      if (!insErr) synced += 1;
    }
  }

  for (const row of Array.isArray(existingAppointments) ? existingAppointments : []) {
    const calendarId = String((row as any).google_calendar_id ?? "").trim();
    const eventId = String((row as any).google_event_id ?? "").trim();
    const appointmentId = String((row as any).id ?? "").trim();
    if (!calendarId || !eventId || !appointmentId) continue;

    const key = `${calendarId}:${eventId}`;
    if (seenGoogleKeys.has(key)) continue;

    await admin.from("appointment_open_slots").delete().eq("appointment_id", appointmentId);
    await admin.from("appointments").delete().eq("id", appointmentId);
    deleted += 1;
  }

  return { ok: true, synced, deleted };
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
  const studioWriteTarget = normalizeStudioWriteTarget(formData.get("studioWriteTarget"));

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

  const isAdmin = isAdminUser(profile?.role, user.email);

  if (studioWriteTarget !== "auto" && !canUseStudioWriteTarget(studioWriteTarget, isAdmin)) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Studio Radu darf nur vom Admin als Schreibkalender verwendet werden."));
  }

  const effectiveStudioWriteTarget: StudioWriteTarget =
    !isAdmin && studioWriteTarget === "auto" ? "studio_raluca" : studioWriteTarget;

  // Team-Kalender-Regel:
  // Alle eingeloggten Benutzer dürfen Termine für alle Behandler anlegen.
  // Verwalten (ändern/löschen) bleibt später tenant-/rollenbasiert.

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

  const isDemoMode = await getIsDemoTenant(admin, assignedTenantId);

  if (isDemoMode) {
    const start = new Date(startLocal);
    if (Number.isNaN(start.getTime())) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Ungültiges Start-Datum."));
    }

    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    const demoGoogleEventId = `demo_event_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
      notes_internal: `${notesInternal || ""}${notesInternal ? "\n" : ""}Demo-Modus: Google-Termin wurde simuliert.`,
      google_connection_id: null,
      calendar_connection_id: null,
      calendar_mode: "STUDIO",
      google_write_calendar_id: CLIENTIQUE_DEMO_CALENDAR_ID,
      google_calendar_id: CLIENTIQUE_DEMO_CALENDAR_ID,
      google_event_id: demoGoogleEventId,
    };

    const insErr = await insertAppointmentBestEffort(admin, payload, status);
    if (insErr) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Demo-Termin konnte nicht gespeichert werden: " + insErr.message));
    }

    redirect(buildRedirectUrl(baseReturnUrl, "success", "Demo-Termin erstellt ✅ Keine echte Google-Aktion wurde ausgelöst."));
  }

    // Wichtig:
  // Standardverhalten bleibt sicher: Automatisch = Kalender des ausgewählten Behandlers.
  // Zusätzlich kann jetzt explizit in einen der zwei Studio-Schreibkalender geschrieben werden.
  let targetCalendarUserId: string | null = null;
  let targetCalendarOwnerLabel = "Behandler";
  let googleConnectionId: string | null = null;
  let googleWriteCalendarId: string | null = null;
  let googleAccessToken: string | null = null;

  const { data: targetByTenant, error: targetByTenantError } = await admin
    .from("user_profiles")
    .select("user_id, full_name, tenant_id, calendar_tenant_id, role")
    .eq("tenant_id", assignedTenantId)
    .limit(1);

  if (targetByTenantError) {
    redirect(
      buildRedirectUrl(
        baseReturnUrl,
        "error",
        "Behandler-Profil konnte nicht geladen werden: " + targetByTenantError.message
      )
    );
  }

  let targetCalendarProfile = (targetByTenant ?? [])[0] ?? null;

  if (!targetCalendarProfile) {
    const { data: targetByCalendarTenant, error: targetByCalendarTenantError } = await admin
      .from("user_profiles")
      .select("user_id, full_name, tenant_id, calendar_tenant_id, role")
      .eq("calendar_tenant_id", assignedTenantId)
      .limit(1);

    if (targetByCalendarTenantError) {
      redirect(
        buildRedirectUrl(
          baseReturnUrl,
          "error",
          "Behandler-Profil konnte nicht geladen werden: " + targetByCalendarTenantError.message
        )
      );
    }

    targetCalendarProfile = (targetByCalendarTenant ?? [])[0] ?? null;
  }

  if (targetCalendarProfile?.user_id) {
    targetCalendarUserId = String(targetCalendarProfile.user_id);
    targetCalendarOwnerLabel =
      String((targetCalendarProfile as any).full_name ?? "").trim() || "Behandler";
  }

  if (!targetCalendarUserId) {
    redirect(
      buildRedirectUrl(
        baseReturnUrl,
        "error",
        "Für den ausgewählten Behandler wurde kein Benutzerprofil gefunden."
      )
    );
  }

  let calendarId: string | null = null;

  if (effectiveStudioWriteTarget === "auto") {
    const automaticConnection = await findAutomaticGoogleConnectionForOwner(admin, targetCalendarUserId);

    if (automaticConnection?.id) {
      googleConnectionId = String(automaticConnection.id);
      googleAccessToken = await getAccessTokenForGoogleConnection(admin, automaticConnection);
      calendarId = await resolveAutomaticCalendarIdForConnection(admin, automaticConnection);
    }

    if (!calendarId) {
      const { data: tok, error: tokErr } = await admin
        .from("google_oauth_tokens")
        .select("default_calendar_id")
        .eq("user_id", targetCalendarUserId)
        .maybeSingle();

      if (tokErr) {
        redirect(buildRedirectUrl(baseReturnUrl, "error", "Token DB Fehler: " + tokErr.message));
      }

      calendarId = (tok as any)?.default_calendar_id as string | null;
    }

    if (!calendarId) {
      redirect(
        buildRedirectUrl(
          baseReturnUrl,
          "error",
          `${targetCalendarOwnerLabel} hat noch keinen eigenen Google-Kalender verbunden.`
        )
      );
    }
  } else {
    const definition = STUDIO_WRITE_TARGETS[effectiveStudioWriteTarget as Exclude<StudioWriteTarget, "auto">];
    calendarId = definition.calendarId;
    googleWriteCalendarId = definition.calendarId;

    const selectedStudioConnection = await findStudioGoogleConnectionForOwner(
      admin,
      user.id,
      effectiveStudioWriteTarget as Exclude<StudioWriteTarget, "auto">
    );
    if (!selectedStudioConnection?.id) {
      redirect(
        buildRedirectUrl(
          baseReturnUrl,
          "error",
          `${definition.label} ist noch nicht als Studio-Google-Verbindung hinterlegt.`
        )
      );
    }

    if (selectedStudioConnection.is_read_only) {
      redirect(
        buildRedirectUrl(
          baseReturnUrl,
          "error",
          `${definition.label} ist aktuell als read-only markiert und kann nicht für Studio-Termine verwendet werden.`
        )
      );
    }

    googleConnectionId = String(selectedStudioConnection.id);
    googleAccessToken = await getAccessTokenForGoogleConnection(admin, selectedStudioConnection);
    targetCalendarOwnerLabel = definition.label;
  }

  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Ungültiges Start-Datum."));
  }

  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  let googleEventId: string | null = null;
  try {
    const event = googleAccessToken
      ? await googleFetchWithToken(
          googleAccessToken,
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
                  crmTenantId: assignedTenantId,
                  crmTenantName: targetCalendarOwnerLabel,
                },
              },
            }),
          }
        )
      : await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: "POST",
          body: JSON.stringify({
            summary: title,
            description: notes || undefined,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
            extendedProperties: {
              private: {
                crmTenantId: assignedTenantId,
                crmTenantName: targetCalendarOwnerLabel,
              },
            },
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
    google_connection_id: googleConnectionId,
    calendar_connection_id: googleConnectionId,
    calendar_mode: "STUDIO",
    google_write_calendar_id: googleWriteCalendarId || calendarId,
    google_calendar_id: calendarId,
    google_event_id: googleEventId || null,
  };

  const insErr = await insertAppointmentBestEffort(admin, payload, status);
  if (insErr) {
    await deleteGoogleEventBestEffort(calendarId, googleEventId);
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin konnte nicht gespeichert werden: " + insErr.message));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", "Termin erstellt ✅"));
}

async function ensureWritableGoogleCalendarAppointment(
  admin: any,
  input: {
    googleCalendarId?: string | null;
    notesInternal?: string | null;
    calendarMode?: string | null;
    calendarConnectionId?: string | null;
  }
) {
  const mode = String(input.calendarMode ?? "").trim().toUpperCase();
  if (mode === "PRIVATE") {
    throw new Error("Zusatzkalender-Termine sind schreibgeschützt. Änderungen bitte direkt im ursprünglichen Google-Kalender machen.");
  }

  const connectionId = String(input.calendarConnectionId ?? "").trim();
  if (connectionId) {
    const { data: connection } = await admin
      .from("google_oauth_connections")
      .select("is_read_only")
      .eq("id", connectionId)
      .maybeSingle();

    if ((connection as any)?.is_read_only === true) {
      throw new Error("Zusatzkalender-Termine sind schreibgeschützt. Änderungen bitte direkt im ursprünglichen Google-Kalender machen.");
    }
  }

  const normalizedCalendarId = String(input.googleCalendarId ?? "").trim();
  if (!normalizedCalendarId) return;

  const isReadOnlyExtra = await isReadOnlyExtraCalendarAppointment(
    admin,
    normalizedCalendarId,
    input.notesInternal ?? null
  );

  if (isReadOnlyExtra) {
    throw new Error("Zusatzkalender-Termine sind schreibgeschützt. Änderungen bitte direkt im ursprünglichen Google-Kalender machen.");
  }
}

export async function deleteAppointmentFromCalendar(appointmentId: string, formData: FormData) {
  const supabase = await supabaseServer();
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const baseReturnUrl = returnToRaw || "/calendar";

  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select("tenant_id, google_calendar_id, google_event_id, google_connection_id, calendar_connection_id, calendar_mode, notes_internal")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin nicht gefunden."));
  }

  if (await getIsDemoTenant(supabaseAdmin(), (appt as any).tenant_id ?? null)) {
    await supabase.from("appointment_open_slots").delete().eq("appointment_id", appointmentId);
    const { error: delErr } = await supabase.from("appointments").delete().eq("id", appointmentId);
    if (delErr) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", "Demo-Termin konnte nicht gelöscht werden: " + delErr.message));
    }
    redirect(buildRedirectUrl(baseReturnUrl, "success", "Demo-Termin gelöscht ✅ Keine echte Google-Aktion wurde ausgelöst."));
  }

  let googleDeleteConfirmed = false;

  try {
    await ensureWritableGoogleCalendarAppointment(supabaseAdmin(), {
      googleCalendarId: appt.google_calendar_id,
      notesInternal: (appt as any).notes_internal ?? null,
      calendarMode: (appt as any).calendar_mode ?? null,
      calendarConnectionId: (appt as any).calendar_connection_id ?? (appt as any).google_connection_id ?? null,
    });

    if (appt.google_calendar_id && appt.google_event_id) {
      const token = await getGoogleAccessTokenForAppointmentTarget((appt as any).google_connection_id ?? null);
      await googleFetchWithToken(
        token,
        `/calendars/${encodeURIComponent(appt.google_calendar_id)}/events/${encodeURIComponent(appt.google_event_id)}`,
        { method: "DELETE" }
      );
      googleDeleteConfirmed = true;
    } else {
      googleDeleteConfirmed = true;
    }
  } catch (e: any) {
    const message = String(e?.message ?? "").trim();
    const normalized = message.toLowerCase();

    if (normalized.includes("schreibgeschützt") || normalized.includes("zusatzkalender")) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", message || "Termin ist schreibgeschützt."));
    }

    const googleAlreadyGone =
      normalized.includes("not found") ||
      normalized.includes("notfound") ||
      normalized.includes("404");

    if (googleAlreadyGone) {
      googleDeleteConfirmed = true;
    } else {
      redirect(
        buildRedirectUrl(
          baseReturnUrl,
          "error",
          message || "Google-Termin konnte nicht gelöscht werden."
        )
      );
    }
  }

  if (!googleDeleteConfirmed) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Google-Termin konnte nicht sicher gelöscht werden."));
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
  const bufferFromForm = Number(formData.get("buffer") ?? 0);
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

  const admin = supabaseAdmin();

  const { data: existing, error: findErr } = await admin
      .from("appointments")
    .select("tenant_id, notes_internal, google_calendar_id, google_event_id, google_connection_id, calendar_connection_id, calendar_mode, reminder_sent_at")
    .eq("id", appointmentId)
    .single();

  if (findErr || !existing) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin nicht gefunden."));
  }

  const isDemoMode = await getIsDemoTenant(admin, (existing as any).tenant_id ?? null);

  if (!isDemoMode) {
    try {
      await ensureWritableGoogleCalendarAppointment(supabaseAdmin(), {
        googleCalendarId: existing.google_calendar_id,
        notesInternal: existing.notes_internal ?? null,
        calendarMode: (existing as any).calendar_mode ?? null,
        calendarConnectionId: (existing as any).calendar_connection_id ?? (existing as any).google_connection_id ?? null,
      });
    } catch (e: any) {
      redirect(buildRedirectUrl(baseReturnUrl, "error", e?.message ?? "Termin ist schreibgeschützt."));
    }
  }

  const bufferRaw = readLineValue(existing.notes_internal, "Buffer:");
  const parsedExistingBuffer = Number(String(bufferRaw).replace(/[^\d]/g, "") || 0);
  const bufferMin = Number.isFinite(bufferFromForm) && bufferFromForm >= 0 ? bufferFromForm : parsedExistingBuffer;
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
  const reminderWasDeleted = hasReminderDeletedMarker(notesInternal);

  try {
    if (!isDemoMode && existing.google_calendar_id && existing.google_event_id) {
      const token = await getGoogleAccessTokenForAppointmentTarget((existing as any).google_connection_id ?? null);
      await googleFetchWithToken(
        token,
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
      reminder_at: reminderWasDeleted ? null : buildReminderAt(start).toISOString(),
      reminder_sent_at: reminderWasDeleted ? ((existing as any).reminder_sent_at ?? null) : null,
      notes_internal: notesInternal || null,
    },
    status
  );

  if (updErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Termin konnte nicht aktualisiert werden: " + updErr.message));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", isDemoMode ? "Demo-Termin gespeichert ✅ Keine echte Google-Aktion wurde ausgelöst." : "Termin gespeichert ✅"));
}

async function syncOpenSlotForUnavailableAppointment(input: {
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

  if (!appointmentId) return { ok: true, skipped: true };
  if (!tenantId || !startAt || !endAt) return { ok: true, skipped: true };

  if (status === "cancelled" || status === "no_show") {
    const { data: existingRows, error: findErr } = await admin
      .from("appointment_open_slots")
      .select("id, status")
      .eq("appointment_id", appointmentId)
      .limit(1);

    if (findErr) return { ok: false, error: findErr.message };

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    if (existing?.id) {
      const { error: updateErr } = await admin
        .from("appointment_open_slots")
        .update({
          tenant_id: tenantId,
          start_at: startAt,
          end_at: endAt,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) return { ok: false, error: updateErr.message };
      return { ok: true, slotId: existing.id, mode: "updated" };
    }

    const { data: inserted, error: insertErr } = await admin
      .from("appointment_open_slots")
      .insert({
        appointment_id: appointmentId,
        tenant_id: tenantId,
        start_at: startAt,
        end_at: endAt,
        status: "open",
      })
      .select("id")
      .maybeSingle();

    if (insertErr) return { ok: false, error: insertErr.message };
    return { ok: true, slotId: inserted?.id ?? null, mode: "inserted" };
  }

  const { error: expireErr } = await admin
    .from("appointment_open_slots")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("appointment_id", appointmentId)
    .eq("status", "open");

  if (expireErr) return { ok: false, error: expireErr.message };
  return { ok: true, mode: "expired" };
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

    const admin = supabaseAdmin();

    const { data: existing, error: findErr } = await admin
      .from("appointments")
      .select("notes_internal, start_at, end_at, tenant_id, google_calendar_id, google_event_id, google_connection_id, calendar_connection_id, calendar_mode")
      .eq("id", appointmentId)
      .single();

    if (findErr || !existing) {
      return { ok: false, error: "Termin nicht gefunden." };
    }

    const isReadOnlyExtraCalendar = await isReadOnlyExtraCalendarAppointment(
      admin,
      String((existing as any).google_calendar_id ?? "").trim() || null,
      (existing as any).notes_internal ?? null
    );

    if (isReadOnlyExtraCalendar) {
      return { ok: false, error: "Zusatzkalender-Termine sind schreibgeschützt." };
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

const statusPayload: Record<string, any> = {
  notes_internal: notesInternal || null,
};

if (status === "cancelled") {
  statusPayload.cancelled_at = new Date().toISOString();
  statusPayload.no_show_at = null;
} else if (status === "no_show") {
  statusPayload.no_show_at = new Date().toISOString();
  statusPayload.cancelled_at = null;
} else if (status === "scheduled") {
  statusPayload.cancelled_at = null;
  statusPayload.no_show_at = null;
  statusPayload.cancellation_reason = null;
}

const updErr = await updateAppointmentBestEffort(
  admin,
  appointmentId,
  {
    ...statusPayload,
    updated_at: new Date().toISOString(),
  },
  status
);

    if (updErr) {
      return { ok: false, error: updErr.message };
    }

    const slotResult = await syncOpenSlotForUnavailableAppointment({
      appointmentId,
      tenantId: String((existing as any).tenant_id ?? "").trim() || null,
      startAt: String((existing as any).start_at ?? "").trim() || null,
      endAt: String((existing as any).end_at ?? "").trim() || null,
      status,
    });

    if (slotResult && !(slotResult as any).ok) {
      return {
        ok: false,
        error:
          "Terminstatus wurde gespeichert, aber der freie Slot konnte nicht aktualisiert werden: " +
          String((slotResult as any).error ?? "Unbekannter Fehler"),
      };
    }

    let googleSyncWarning: string | null = null;

    if ((status === "cancelled" || status === "no_show") && (existing as any).google_calendar_id && (existing as any).google_event_id) {
      try {
        await ensureWritableGoogleCalendarAppointment(admin, {
          googleCalendarId: (existing as any).google_calendar_id,
          notesInternal: (existing as any).notes_internal ?? null,
          calendarMode: (existing as any).calendar_mode ?? null,
          calendarConnectionId: (existing as any).calendar_connection_id ?? (existing as any).google_connection_id ?? null,
        });

        const token = await getGoogleAccessTokenForAppointmentTarget(
          (existing as any).calendar_connection_id ?? (existing as any).google_connection_id ?? null
        );

        await googleFetchWithToken(
          token,
          `/calendars/${encodeURIComponent((existing as any).google_calendar_id)}/events/${encodeURIComponent((existing as any).google_event_id)}`,
          { method: "DELETE" }
        );

        await admin
          .from("appointments")
          .update({
            google_event_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointmentId);
      } catch (e: any) {
        const msg = String(e?.message ?? "").trim();
        const normalized = msg.toLowerCase();
        const alreadyGone = normalized.includes("not found") || normalized.includes("404") || normalized.includes("gone");

        if (alreadyGone) {
          await admin
            .from("appointments")
            .update({
              google_event_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", appointmentId);
        } else {
          googleSyncWarning = msg || "Google-Termin konnte nicht entfernt werden.";
        }
      }
    }

    return {
      ok: true,
      openSlotStatus: status === "cancelled" || status === "no_show" ? "open" : "expired",
      openSlot: slotResult ?? null,
      googleSyncWarning,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Status konnte nicht gespeichert werden." };
  }
}

export async function updateOpenSlotStatusQuick(input: {
  slotId?: string | null;
  appointmentId?: string | null;
  status: "open" | "booked" | "closed" | "expired";
}) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  try {
    const slotId = String(input.slotId ?? "").trim();
    const appointmentId = String(input.appointmentId ?? "").trim();
    const nextStatus = String(input.status ?? "open").trim().toLowerCase();

    if (!slotId && !appointmentId) {
      return { ok: false, error: "slotId oder appointmentId fehlt." };
    }

    if (!["open", "booked", "closed", "expired"].includes(nextStatus)) {
      return { ok: false, error: "Ungueltiger Slot-Status." };
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

    let findQuery = admin
      .from("appointment_open_slots")
      .select("id, appointment_id, tenant_id, status")
      .limit(1);

    if (slotId) {
      findQuery = findQuery.eq("id", slotId);
    } else {
      findQuery = findQuery.eq("appointment_id", appointmentId);
    }

    const { data: rows, error: findErr } = await findQuery;
    const existing = Array.isArray(rows) ? rows[0] : null;

    if (findErr || !existing) {
      return { ok: false, error: "Freier Slot nicht gefunden." };
    }

    const rowTenantId = String((existing as any).tenant_id ?? "").trim();

    if (effectiveTenantId && rowTenantId && effectiveTenantId !== rowTenantId && !isAdmin) {
      return { ok: false, error: "Keine Berechtigung fuer diesen freien Slot." };
    }

    const { error: updateError } = await admin
      .from("appointment_open_slots")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", String((existing as any).id));

    if (updateError) {
      return { ok: false, error: "Slot-Status konnte nicht gespeichert werden: " + updateError.message };
    }

    return {
      ok: true,
      slotId: String((existing as any).id),
      status: nextStatus,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Slot-Status konnte nicht gespeichert werden." };
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
      .select("id, tenant_id, reminder_sent_at, google_calendar_id, notes_internal")
      .eq("id", appointmentId)
      .maybeSingle();

    if (findErr || !appointment) {
      return { ok: false, error: "Termin nicht gefunden." };
    }

    const isReadOnlyExtraCalendar = await isReadOnlyExtraCalendarAppointment(
      admin,
      String((appointment as any).google_calendar_id ?? "").trim() || null,
      (appointment as any).notes_internal ?? null
    );

    if (isReadOnlyExtraCalendar) {
      return { ok: false, error: "Für Zusatzkalender-Termine werden keine CRM-Reminder gesetzt." };
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
