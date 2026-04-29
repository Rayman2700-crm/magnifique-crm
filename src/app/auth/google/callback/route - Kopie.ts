
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

type OAuthMeta = {
  redirectTo: string;
  connectionLabel: string | null;
  connectionType: "calendar" | "gmail" | "calendar_gmail";
  emailHint: string | null;
  isPrimary: boolean;
  isReadOnly: boolean;
  legacySync: boolean;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
};

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

function safeBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

function parseOAuthMeta(raw: string | null | undefined): OAuthMeta | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OAuthMeta>;
    return {
      redirectTo:
        typeof parsed.redirectTo === "string" && parsed.redirectTo.startsWith("http")
          ? parsed.redirectTo
          : `${safeBaseUrl()}/calendar/google`,
      connectionLabel: String(parsed.connectionLabel ?? "").trim() || null,
      connectionType:
        parsed.connectionType === "calendar" ||
        parsed.connectionType === "gmail" ||
        parsed.connectionType === "calendar_gmail"
          ? parsed.connectionType
          : "calendar_gmail",
      emailHint: String(parsed.emailHint ?? "").trim() || null,
      isPrimary: Boolean(parsed.isPrimary),
      isReadOnly: Boolean(parsed.isReadOnly),
      legacySync: Boolean(parsed.legacySync),
    };
  } catch {
    return null;
  }
}

function isAdminUser(profileRole: unknown, userEmail: unknown) {
  return (
    String(profileRole ?? "").trim().toUpperCase() === "ADMIN" ||
    String(userEmail ?? "").trim().toLowerCase() === "radu.craus@gmail.com"
  );
}

function normalizeConnectionMeta(meta: OAuthMeta | null | undefined) {
  const label = String(meta?.connectionLabel ?? "").trim().toLowerCase();
  const emailHint = String(meta?.emailHint ?? "").trim().toLowerCase();

  const isStudioRadu =
    label === "radu studio" ||
    label === "studio radu" ||
    emailHint === "radu.craus@gmail.com";

  const isStudioRaluca =
    label === "raluca studio" ||
    label === "studio raluca" ||
    label === "studio magnifique beauty institut" ||
    emailHint === "raluca.magnifique@gmail.com";

  return { isStudioRadu, isStudioRaluca };
}

async function fetchGoogleUserInfo(accessToken: string | null | undefined): Promise<GoogleUserInfo | null> {
  const token = String(accessToken ?? "").trim();
  if (!token) return null;

  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as GoogleUserInfo;
  } catch {
    return null;
  }
}

async function fetchWritableGoogleCalendars(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json: any = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Kalenderliste konnte nicht geladen werden.");
  }

  const items = Array.isArray(json?.items) ? (json.items as CalendarListItem[]) : [];
  return items.filter((item) => {
    const role = String(item.accessRole ?? "").toLowerCase();
    return role === "owner" || role === "writer";
  });
}

function chooseDefaultCalendarId(input: {
  calendars: CalendarListItem[];
  preferredId?: string | null;
  existingDefault?: string | null;
}) {
  const preferred = String(input.preferredId ?? "").trim().toLowerCase();
  const existingDefault = String(input.existingDefault ?? "").trim().toLowerCase();
  const calendars = input.calendars;

  const byPreferred = calendars.find((item) => String(item.id ?? "").trim().toLowerCase() === preferred);
  if (byPreferred?.id) return byPreferred.id;

  const byExisting = calendars.find((item) => String(item.id ?? "").trim().toLowerCase() === existingDefault);
  if (byExisting?.id) return byExisting.id;

  const primary = calendars.find((item) => item.primary);
  if (primary?.id) return primary.id;

  return String(calendars[0]?.id ?? "").trim() || null;
}

function sanitizeCalendarIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const baseUrl = safeBaseUrl();
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gcal_oauth_state")?.value;
  const meta = parseOAuthMeta(cookieStore.get("gcal_oauth_meta")?.value ?? null);
  const redirectTo = meta?.redirectTo || `${baseUrl}/calendar/google`;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/calendar/google?error=${encodeURIComponent("OAuth state mismatch")}`, baseUrl)
    );
  }

  cookieStore.set("gcal_oauth_state", "", { path: "/", maxAge: 0 });
  cookieStore.set("gcal_oauth_meta", "", { path: "/", maxAge: 0 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL(`/calendar/google?error=${encodeURIComponent("Google OAuth ENV fehlt.")}`, baseUrl)
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const tokenJson: any = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent(
          "Google Token Fehler: " + (tokenJson?.error_description ?? tokenJson?.error ?? "unknown")
        )}`,
        baseUrl
      )
    );
  }

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", baseUrl));
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = isAdminUser((profile as any)?.role, user.email);
  const normalizedMeta = normalizeConnectionMeta(meta);

  if (normalizedMeta.isStudioRadu && !isAdmin) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent("Studio Radu darf nur vom Admin verbunden werden.")}`,
        baseUrl
      )
    );
  }

  const accessToken = String(tokenJson?.access_token ?? "").trim() || null;
  const refreshTokenFromGoogle = String(tokenJson?.refresh_token ?? "").trim() || null;
  const tokenType = String(tokenJson?.token_type ?? "").trim() || null;
  const scope = String(tokenJson?.scope ?? "").trim() || null;
  const expiresIn = typeof tokenJson?.expires_in === "number" ? tokenJson.expires_in : null;
  const refreshTokenExpiresIn = typeof tokenJson?.refresh_token_expires_in === "number" ? tokenJson.refresh_token_expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  if (!accessToken) {
    return NextResponse.redirect(
      new URL(`/calendar/google?error=${encodeURIComponent("Google hat keinen access_token geliefert.")}`, baseUrl)
    );
  }

  const { data: existingLegacy } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, default_calendar_id, enabled_calendar_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  const finalRefreshToken = refreshTokenFromGoogle || String(existingLegacy?.refresh_token ?? "").trim() || null;

  if (!finalRefreshToken) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent(
          "Kein refresh_token erhalten. Bitte die Verbindung einmal komplett trennen und mit Offline-Zugriff neu verbinden."
        )}`,
        baseUrl
      )
    );
  }

  const googleUserInfo = await fetchGoogleUserInfo(accessToken);
  const googleAccountEmail = String(googleUserInfo?.email ?? "").trim() || String(meta?.emailHint ?? "").trim() || null;
  const googleAccountName = String(googleUserInfo?.name ?? "").trim() || null;

  const effectiveIsReadOnly =
    Boolean(meta?.isReadOnly) || (!normalizedMeta.isStudioRadu && !normalizedMeta.isStudioRaluca);
  const effectiveIsPrimary =
    Boolean(meta?.isPrimary) && (normalizedMeta.isStudioRadu || normalizedMeta.isStudioRaluca);
  const effectiveLegacySync =
    Boolean(meta?.legacySync) && (normalizedMeta.isStudioRadu || normalizedMeta.isStudioRaluca);

  const connectionLabel = normalizedMeta.isStudioRadu
    ? "Radu Studio"
    : normalizedMeta.isStudioRaluca
      ? "Raluca Studio"
      : String(meta?.connectionLabel ?? "").trim() || "Privater Kalender";

  let savedConnectionId: string | null = null;

  const findByEmail = googleAccountEmail
    ? await supabase
        .from("google_oauth_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("google_account_email", googleAccountEmail)
        .maybeSingle()
    : { data: null as any };

  const findByLabel = await supabase
    .from("google_oauth_connections")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("connection_label", connectionLabel)
    .maybeSingle();

  const existingConnection = findByEmail.data ?? findByLabel.data ?? null;

  const connectionPayload = {
    owner_user_id: user.id,
    provider: "google",
    connection_type: meta?.connectionType ?? "calendar_gmail",
    connection_label: connectionLabel,
    google_account_email: googleAccountEmail,
    google_account_name: googleAccountName,
    access_token: accessToken,
    refresh_token: finalRefreshToken,
    expires_at: expiresAt,
    scope,
    token_type: tokenType,
    refresh_token_expires_in: refreshTokenExpiresIn,
    is_active: true,
    is_primary: effectiveIsPrimary,
    is_read_only: effectiveIsReadOnly,
    updated_at: new Date().toISOString(),
  };

  if (effectiveIsPrimary) {
    await supabase
      .from("google_oauth_connections")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("owner_user_id", user.id)
      .neq("id", String(existingConnection?.id ?? "00000000-0000-0000-0000-000000000000"));
  }

  if (existingConnection?.id) {
    const { error } = await supabase
      .from("google_oauth_connections")
      .update(connectionPayload)
      .eq("id", existingConnection.id);

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent(
            "Google Verbindung konnte nicht aktualisiert werden: " + error.message
          )}`,
          baseUrl
        )
      );
    }

    savedConnectionId = String(existingConnection.id);
  } else {
    const { data: inserted, error } = await supabase
      .from("google_oauth_connections")
      .insert(connectionPayload)
      .select("id")
      .single();

    if (error || !inserted?.id) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent(
            "Google Verbindung konnte nicht erstellt werden: " + (error?.message ?? "unknown")
          )}`,
          baseUrl
        )
      );
    }

    savedConnectionId = String(inserted.id);
  }

  let defaultCalendarId = String(existingLegacy?.default_calendar_id ?? "").trim() || null;
  let enabledCalendarIds = sanitizeCalendarIds((existingLegacy?.enabled_calendar_ids as string[] | null | undefined) ?? []);

  if ((normalizedMeta.isStudioRadu || normalizedMeta.isStudioRaluca) && !effectiveIsReadOnly) {
    const preferredStudioCalendarId = normalizedMeta.isStudioRadu ? "radu.craus@gmail.com" : "raluca.magnifique@gmail.com";

    try {
      const calendars = await fetchWritableGoogleCalendars(accessToken);
      const chosenCalendarId = chooseDefaultCalendarId({
        calendars,
        preferredId: preferredStudioCalendarId,
        existingDefault: defaultCalendarId,
      });

      if (chosenCalendarId) {
        defaultCalendarId = chosenCalendarId;
        enabledCalendarIds = sanitizeCalendarIds([chosenCalendarId, ...enabledCalendarIds]);
      }
    } catch {
      if (preferredStudioCalendarId) {
        defaultCalendarId = preferredStudioCalendarId;
        enabledCalendarIds = sanitizeCalendarIds([preferredStudioCalendarId, ...enabledCalendarIds]);
      }
    }
  }

  const legacyPayload = {
    user_id: user.id,
    access_token: accessToken,
    refresh_token: finalRefreshToken,
    expires_at: expiresAt,
    scope,
    token_type: tokenType,
    refresh_token_expires_in: refreshTokenExpiresIn,
    default_calendar_id: defaultCalendarId,
    enabled_calendar_ids: enabledCalendarIds,
    updated_at: new Date().toISOString(),
  };

  const { error: legacyError } = await supabase
    .from("google_oauth_tokens")
    .upsert(legacyPayload, { onConflict: "user_id" });

  if (legacyError) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent(
          "Google Token-Daten konnten nicht gespeichert werden: " + legacyError.message
        )}`,
        baseUrl
      )
    );
  }

  const successUrl = new URL(redirectTo, baseUrl);
  successUrl.searchParams.set("success", encodeURIComponent("Google erfolgreich verbunden."));
  if (savedConnectionId) successUrl.searchParams.set("googleConnectionId", savedConnectionId);
  if (effectiveLegacySync) successUrl.searchParams.set("link", "1");

  return NextResponse.redirect(successUrl);
}
