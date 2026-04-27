import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type TokenRow = {
  user_id?: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

type GoogleConnectionRow = {
  id: string;
  owner_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  is_active?: boolean | null;
};

type UserProfileRow = {
  role: string | null;
};

type GetValidGoogleAccessTokenInput = {
  googleConnectionId?: string | null;
  userId?: string | null;
};

function isExpiringSoon(expiresAtIso: string | null) {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - Date.now() < 2 * 60 * 1000;
}

function isInvalidGrantMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid_grant") || normalized.includes("token has been expired") || normalized.includes("revoked");
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth env fehlt.");
  }

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
    throw new Error(json?.error_description ?? json?.error ?? "Refresh failed");
  }

  const accessToken = String(json?.access_token ?? "").trim();
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : 0;
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const rotatedRefreshToken = String(json?.refresh_token ?? "").trim() || null;

  if (!accessToken) {
    throw new Error("Google access_token fehlt nach Refresh.");
  }

  return { accessToken, expiresAt, refreshToken: rotatedRefreshToken };
}

async function getCurrentUserRole(userId: string) {
  const server = await supabaseServer();
  const { data: profile } = await server
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle<UserProfileRow>();

  return String(profile?.role ?? "").trim().toUpperCase();
}

async function persistLegacyTokenRow(targetUserId: string, payload: { access_token: string; expires_at: string | null; refresh_token?: string | null; }) {
  const admin = supabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    access_token: payload.access_token,
    expires_at: payload.expires_at,
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.refresh_token !== "undefined") {
    updatePayload.refresh_token = payload.refresh_token;
  }

  const { error } = await admin
    .from("google_oauth_tokens")
    .update(updatePayload)
    .eq("user_id", targetUserId);

  if (error) {
    throw new Error("google_oauth_tokens konnte nach Refresh nicht gespeichert werden: " + error.message);
  }
}

async function persistConnectionRow(connectionId: string, payload: { access_token: string; expires_at: string | null; refresh_token?: string | null; }) {
  const admin = supabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    access_token: payload.access_token,
    expires_at: payload.expires_at,
    updated_at: new Date().toISOString(),
    is_active: true,
  };

  if (typeof payload.refresh_token !== "undefined") {
    updatePayload.refresh_token = payload.refresh_token;
  }

  const { error } = await admin
    .from("google_oauth_connections")
    .update(updatePayload)
    .eq("id", connectionId);

  if (error) {
    throw new Error("google_oauth_connections konnte nach Refresh nicht gespeichert werden: " + error.message);
  }
}

async function markGoogleConnectionBroken(targetUserId: string, connectionId?: string | null) {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  await admin
    .from("google_oauth_tokens")
    .update({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      default_calendar_id: null,
      enabled_calendar_ids: [],
      updated_at: now,
    })
    .eq("user_id", targetUserId);

  let query = admin
    .from("google_oauth_connections")
    .update({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      is_active: false,
      is_primary: false,
      updated_at: now,
    });

  if (connectionId) {
    query = query.eq("id", connectionId);
  } else {
    query = query.eq("owner_user_id", targetUserId);
  }

  await query;
}

export async function getValidGoogleAccessToken(
  input?: GetValidGoogleAccessTokenInput | null
): Promise<string> {
  const server = await supabaseServer();
  const { data } = await server.auth.getUser();
  const user = data.user;

  if (!user) {
    throw new Error("Nicht eingeloggt.");
  }

  const googleConnectionId = String(input?.googleConnectionId ?? "").trim();
  const explicitUserId = String(input?.userId ?? "").trim();
  const currentUserRole = await getCurrentUserRole(user.id);
  const isAdmin = currentUserRole === "ADMIN" || String(user.email ?? "").trim().toLowerCase() === "radu.craus@gmail.com";
  const targetUserId = explicitUserId || user.id;

  if (explicitUserId && explicitUserId !== user.id && !isAdmin) {
    throw new Error("Keine Berechtigung für fremde Google-Tokens.");
  }

  const admin = supabaseAdmin();

  if (googleConnectionId) {
    const { data: row, error } = await admin
      .from("google_oauth_connections")
      .select("id, owner_user_id, access_token, refresh_token, expires_at, is_active")
      .eq("id", googleConnectionId)
      .single<GoogleConnectionRow>();

    if (error || !row) {
      throw new Error("Google Verbindung nicht gefunden.");
    }

    const ownerUserId = String(row.owner_user_id ?? "").trim();
    if (ownerUserId && ownerUserId !== user.id && !isAdmin) {
      throw new Error("Keine Berechtigung für diese Google Verbindung.");
    }

    if (row.access_token && !isExpiringSoon(row.expires_at)) {
      return row.access_token;
    }

    if (!row.refresh_token) {
      throw new Error("Kein refresh_token gespeichert.");
    }

    try {
      const refreshed = await refreshGoogleAccessToken(row.refresh_token);
      await persistConnectionRow(row.id, {
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        refresh_token: refreshed.refreshToken ?? undefined,
      });

      if (ownerUserId) {
        try {
          await persistLegacyTokenRow(ownerUserId, {
            access_token: refreshed.accessToken,
            expires_at: refreshed.expiresAt,
            refresh_token: refreshed.refreshToken ?? undefined,
          });
        } catch {
          // Legacy table sync should never block a valid access token.
        }
      }

      return refreshed.accessToken;
    } catch (error: any) {
      const message = String(error?.message ?? error ?? "Google Refresh fehlgeschlagen.");
      if (isInvalidGrantMessage(message)) {
        await markGoogleConnectionBroken(ownerUserId || targetUserId, row.id);
      }
      throw new Error("Google Refresh fehlgeschlagen: " + message);
    }
  }

  const { data: row, error } = await admin
    .from("google_oauth_tokens")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", targetUserId)
    .single<TokenRow>();

  if (error || !row) {
    throw new Error("Google nicht verbunden.");
  }

  if (row.access_token && !isExpiringSoon(row.expires_at)) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    throw new Error("Kein refresh_token gespeichert.");
  }

  try {
    const refreshed = await refreshGoogleAccessToken(row.refresh_token);

    await persistLegacyTokenRow(targetUserId, {
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      refresh_token: refreshed.refreshToken ?? undefined,
    });

    const { data: primaryConnection } = await admin
      .from("google_oauth_connections")
      .select("id")
      .eq("owner_user_id", targetUserId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (primaryConnection?.id) {
      try {
        await persistConnectionRow(primaryConnection.id, {
          access_token: refreshed.accessToken,
          expires_at: refreshed.expiresAt,
          refresh_token: refreshed.refreshToken ?? undefined,
        });
      } catch {
        // Legacy refresh should still succeed even if connection sync fails.
      }
    }

    return refreshed.accessToken;
  } catch (error: any) {
    const message = String(error?.message ?? error ?? "Google Refresh fehlgeschlagen.");
    if (isInvalidGrantMessage(message)) {
      await markGoogleConnectionBroken(targetUserId);
    }
    throw new Error("Google Refresh fehlgeschlagen: " + message);
  }
}
