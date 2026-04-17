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

function normalizeConnectionType(value: string | null): OAuthMeta["connectionType"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "calendar") return "calendar";
  if (normalized === "gmail") return "gmail";
  return "calendar_gmail";
}

function parseBooleanFlag(value: string | null | undefined, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", process.env.NEXT_PUBLIC_BASE_URL));
  }

  const requestUrl = new URL(req.url);
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  const connectionLabelRaw = requestUrl.searchParams.get("connection_label");
  const redirectToRaw = requestUrl.searchParams.get("redirect_to");
  const emailHintRaw = requestUrl.searchParams.get("email_hint");
  const connectionType = normalizeConnectionType(requestUrl.searchParams.get("connection_type"));
  const isPrimary = parseBooleanFlag(requestUrl.searchParams.get("is_primary"), false);
  const isReadOnly = parseBooleanFlag(requestUrl.searchParams.get("is_read_only"), false);
  const legacySync = parseBooleanFlag(
    requestUrl.searchParams.get("legacy_sync"),
    !String(connectionLabelRaw ?? "").trim()
  );

  const redirectTo =
    redirectToRaw && redirectToRaw.startsWith("/")
      ? `${baseUrl}${redirectToRaw}`
      : `${baseUrl}/calendar/google?success=${encodeURIComponent("Google verbunden ✅")}`;

  const meta: OAuthMeta = {
    redirectTo,
    connectionLabel: String(connectionLabelRaw ?? "").trim() || null,
    connectionType,
    emailHint: String(emailHintRaw ?? "").trim() || null,
    isPrimary,
    isReadOnly,
    legacySync,
  };

  const state = crypto.randomUUID();
  const cookieStore = await cookies();

  cookieStore.set("gcal_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  cookieStore.set("gcal_oauth_meta", JSON.stringify(meta), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  const scopes: string[] = [];
  if (connectionType === "calendar" || connectionType === "calendar_gmail") {
    scopes.push(
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events"
    );
  }
  if (connectionType === "gmail" || connectionType === "calendar_gmail") {
    scopes.push("https://www.googleapis.com/auth/gmail.send");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  if (meta.emailHint) {
    url.searchParams.set("login_hint", meta.emailHint);
  }

  return NextResponse.redirect(url);
}
