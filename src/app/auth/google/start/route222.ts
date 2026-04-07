import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", process.env.NEXT_PUBLIC_BASE_URL));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  // state schützt gegen CSRF + erlaubt redirect zurück
  const state = crypto.randomUUID();
  (await cookies()).set("gcal_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");        // refresh_token!
  url.searchParams.set("prompt", "consent");             // refresh_token erzwingen
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  // optional: wohin danach zurück
  url.searchParams.set("redirect_to", `${baseUrl}/dashboard`);

  return NextResponse.redirect(url);
}