import { supabaseServer } from "@/lib/supabase/server";

type TokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

function isExpiringSoon(expiresAtIso: string | null) {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - Date.now() < 2 * 60 * 1000; // < 2 min
}

export async function getValidGoogleAccessToken(): Promise<string> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Nicht eingeloggt.");

  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single<TokenRow>();

  if (error || !row) throw new Error("Google nicht verbunden.");

  if (row.access_token && !isExpiringSoon(row.expires_at)) {
    return row.access_token;
  }

  if (!row.refresh_token) throw new Error("Kein refresh_token gespeichert.");

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  if (!clientId || !clientSecret) throw new Error("Google OAuth env fehlt.");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const json: any = await resp.json();
  if (!resp.ok) throw new Error(json?.error_description ?? json?.error ?? "Refresh failed");

  const accessToken = json.access_token as string;
  const expiresIn = json.expires_in as number;

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await supabase
    .from("google_oauth_tokens")
    .update({
      access_token: accessToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  return accessToken;
}