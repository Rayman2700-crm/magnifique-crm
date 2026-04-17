import { supabaseServer } from "@/lib/supabase/server";

type TokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

type GoogleConnectionRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

type GetValidGoogleAccessTokenInput = {
  googleConnectionId?: string | null;
  userId?: string | null;
};

function isExpiringSoon(expiresAtIso: string | null) {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - Date.now() < 2 * 60 * 1000; // < 2 min
}

async function refreshGoogleAccessToken(refreshToken: string) {
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
    throw new Error(json?.error_description ?? json?.error ?? "Refresh failed");
  }

  const accessToken = String(json?.access_token ?? "").trim();
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : 0;
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  if (!accessToken) {
    throw new Error("Google access_token fehlt nach Refresh.");
  }

  return { accessToken, expiresAt };
}

export async function getValidGoogleAccessToken(
  input?: GetValidGoogleAccessTokenInput | null
): Promise<string> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Nicht eingeloggt.");

  const googleConnectionId = String(input?.googleConnectionId ?? "").trim();
  const explicitUserId = String(input?.userId ?? "").trim();

  if (googleConnectionId) {
    const { data: row, error } = await supabase
      .from("google_oauth_connections")
      .select("id, access_token, refresh_token, expires_at")
      .eq("id", googleConnectionId)
      .eq("owner_user_id", user.id)
      .eq("is_active", true)
      .single<GoogleConnectionRow>();

    if (error || !row) throw new Error("Google Studio-Verbindung nicht gefunden.");

    if (row.access_token && !isExpiringSoon(row.expires_at)) {
      return row.access_token;
    }

    if (!row.refresh_token) throw new Error("Kein refresh_token gespeichert.");

    const refreshed = await refreshGoogleAccessToken(row.refresh_token);

    await supabase
      .from("google_oauth_connections")
      .update({
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return refreshed.accessToken;
  }

  const targetUserId = explicitUserId || user.id;

  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", targetUserId)
    .single<TokenRow>();

  if (error || !row) throw new Error("Google nicht verbunden.");

  if (row.access_token && !isExpiringSoon(row.expires_at)) {
    return row.access_token;
  }

  if (!row.refresh_token) throw new Error("Kein refresh_token gespeichert.");

  const refreshed = await refreshGoogleAccessToken(row.refresh_token);

  await supabase
    .from("google_oauth_tokens")
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId);

  return refreshed.accessToken;
}
