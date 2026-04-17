import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectTo = url.searchParams.get("redirect_to") || `${baseUrl}/calendar/google`;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gcal_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/calendar/google?error=${encodeURIComponent("OAuth state mismatch")}`, baseUrl)
    );
  }

  cookieStore.set("gcal_oauth_state", "", { path: "/", maxAge: 0 });

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

  const { data: existing } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const finalRefreshToken = refreshToken ?? existing?.refresh_token ?? null;

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

  const { error: upErr } = await supabase.from("google_oauth_tokens").upsert({
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

  if (upErr) {
    return NextResponse.redirect(
      new URL(
        `/calendar/google?error=${encodeURIComponent("DB Save Fehler: " + upErr.message)}`,
        baseUrl
      )
    );
  }

  return NextResponse.redirect(redirectTo);
}
