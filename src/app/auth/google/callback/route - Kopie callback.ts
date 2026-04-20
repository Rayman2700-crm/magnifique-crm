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
  const label = String(meta?.connectionLabel ?? "").trim();
  const emailHint = String(meta?.emailHint ?? "").trim().toLowerCase();

  const isStudioRadu =
    label.toLowerCase() === "radu studio" ||
    label.toLowerCase() === "studio radu" ||
    emailHint === "radu.craus@gmail.com";

  const isStudioRaluca =
    label.toLowerCase() === "raluca studio" ||
    label.toLowerCase() === "studio raluca" ||
    label.toLowerCase() === "studio magnifique beauty institut" ||
    emailHint === "raluca.magnifique@gmail.com";

  return {
    isStudioRadu,
    isStudioRaluca,
  };
}

async function fetchGoogleUserInfo(accessToken: string | null | undefined): Promise<GoogleUserInfo | null> {
  const token = String(accessToken ?? "").trim();
  if (!token) return null;

  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    const json = (await response.json()) as GoogleUserInfo;
    return json ?? null;
  } catch {
    return null;
  }
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

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

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

  const tokenJson: any = await tokenRes.json();

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent(
          "Google Token Fehler: " +
            (tokenJson.error_description ?? tokenJson.error ?? "unknown")
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
      new URL(`/calendar/google?error=${encodeURIComponent("Studio Radu darf nur vom Admin verbunden werden.")}`, baseUrl)
    );
  }

  const accessToken: string | undefined = tokenJson.access_token;
  const refreshToken: string | undefined = tokenJson.refresh_token;
  const tokenType: string | undefined = tokenJson.token_type;
  const expiresIn: number | undefined = tokenJson.expires_in;
  const scope: string | undefined = tokenJson.scope;
  const refreshTokenExpiresIn: number | undefined = tokenJson.refresh_token_expires_in;

  const expiresAt =
    typeof expiresIn === "number"
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

  const { data: existingLegacy } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, default_calendar_id, enabled_calendar_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  const finalRefreshToken = refreshToken ?? existingLegacy?.refresh_token ?? null;

  if (!finalRefreshToken) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent(
          "Kein refresh_token erhalten. Bitte Google Verbindung entfernen und neu verbinden."
        )}`,
        baseUrl
      )
    );
  }

  const googleUserInfo = await fetchGoogleUserInfo(accessToken ?? null);
  const googleAccountEmail = String(googleUserInfo?.email ?? "").trim() || null;
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
      : "Privater Kalender";

  let savedConnectionId: string | null = null;

  const findByEmail = googleAccountEmail
    ? await supabase
        .from("google_oauth_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("google_account_email", googleAccountEmail)
        .maybeSingle()
    : { data: null as any };

  const existingConnection =
    findByEmail.data ??
    (
      await supabase
        .from("google_oauth_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("connection_label", connectionLabel)
        .maybeSingle()
    ).data ??
    null;

  const connectionPayload = {
    owner_user_id: user.id,
    provider: "google",
    connection_type: meta?.connectionType ?? "calendar_gmail",
    connection_label: connectionLabel,
    google_account_email: googleAccountEmail,
    google_account_name: googleAccountName,
    access_token: accessToken ?? null,
    refresh_token: finalRefreshToken,
    expires_at: expiresAt,
    scope: scope ?? null,
    token_type: tokenType ?? null,
    refresh_token_expires_in: refreshTokenExpiresIn ?? null,
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
    const { error: updateConnectionError } = await supabase
      .from("google_oauth_connections")
      .update(connectionPayload)
      .eq("id", existingConnection.id);

    if (updateConnectionError) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent(
            "Mehrfach-Verbindung konnte nicht gespeichert werden: " + updateConnectionError.message
          )}`,
          baseUrl
        )
      );
    }

    savedConnectionId = String(existingConnection.id);
  } else {
    const { data: insertedConnection, error: insertConnectionError } = await supabase
      .from("google_oauth_connections")
      .insert(connectionPayload)
      .select("id")
      .single();

    if (insertConnectionError || !insertedConnection?.id) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent(
            "Mehrfach-Verbindung konnte nicht erstellt werden: " +
              (insertConnectionError?.message ?? "unknown")
          )}`,
          baseUrl
        )
      );
    }

    savedConnectionId = String(insertedConnection.id);
  }


  if ((normalizedMeta.isStudioRadu || normalizedMeta.isStudioRaluca) && !effectiveIsReadOnly) {
    const targetCalendarId = normalizedMeta.isStudioRadu
      ? "radu.craus@gmail.com"
      : "raluca.magnifique@gmail.com";

    const existingEnabledIds = Array.isArray((existingLegacy as any)?.enabled_calendar_ids)
      ? ((existingLegacy as any).enabled_calendar_ids as Array<string | null | undefined>)
      : [];

    const nextEnabledIds = Array.from(
      new Set(
        [...existingEnabledIds, targetCalendarId]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );

    const { error: tokenSelectionError } = await supabase.from("google_oauth_tokens").upsert({
      user_id: user.id,
      provider: "google",
      access_token: accessToken ?? null,
      refresh_token: finalRefreshToken,
      expires_at: expiresAt,
      scope: scope ?? null,
      token_type: tokenType ?? null,
      refresh_token_expires_in: refreshTokenExpiresIn ?? null,
      default_calendar_id: targetCalendarId,
      enabled_calendar_ids: nextEnabledIds,
      updated_at: new Date().toISOString(),
    });

    if (tokenSelectionError) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent("Kalender-Auswahl konnte nicht gespeichert werden: " + tokenSelectionError.message)}`,
          baseUrl
        )
      );
    }
  }

  if (effectiveLegacySync) {
    const { error: legacyError } = await supabase.from("google_oauth_tokens").upsert({
      user_id: user.id,
      provider: "google",
      access_token: accessToken ?? null,
      refresh_token: finalRefreshToken,
      expires_at: expiresAt,
      scope: scope ?? null,
      token_type: tokenType ?? null,
      refresh_token_expires_in: refreshTokenExpiresIn ?? null,
      updated_at: new Date().toISOString(),
    });

    if (legacyError) {
      return NextResponse.redirect(
        new URL(
          `/calendar/google?error=${encodeURIComponent("DB Save Fehler: " + legacyError.message)}`,
          baseUrl
        )
      );
    }
  }

  const successUrl = new URL(redirectTo);
  successUrl.searchParams.set(
    "success",
    effectiveLegacySync
      ? "Google verbunden ✅"
      : `Google Verbindung gespeichert ✅${connectionLabel ? ` (${connectionLabel})` : ""}`
  );

  if (savedConnectionId) {
    successUrl.searchParams.set("googleConnectionId", savedConnectionId);
  }

  return NextResponse.redirect(successUrl);
}
