import { Buffer } from "node:buffer";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

export type SendGoogleMailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
  senderEmail?: string;
};

export type SendGoogleMailResult = {
  ok: true;
  provider: "GMAIL_OAUTH";
  messageId?: string | null;
};

function hasGmailSendScope(scope: string | null | undefined) {
  const scopes = String(scope ?? "").split(/\s+/).filter(Boolean);
  return scopes.includes("https://www.googleapis.com/auth/gmail.send")
    || scopes.includes("https://mail.google.com/");
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendGoogleMail(input: SendGoogleMailInput): Promise<SendGoogleMailResult> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Nicht eingeloggt.");
  }

  const expectedSenderEmail = String(input.senderEmail ?? "").trim().toLowerCase();
  const currentUserEmail = String(user.email ?? "").trim().toLowerCase();

  if (!expectedSenderEmail) {
    throw new Error("Keine Gmail-Absenderadresse hinterlegt.");
  }

  if (!currentUserEmail || currentUserEmail !== expectedSenderEmail) {
    throw new Error("Dieses Gmail-Konto ist für den aktuell eingeloggten Benutzer nicht verbunden.");
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from("google_oauth_tokens")
    .select("scope")
    .eq("user_id", user.id)
    .maybeSingle();

  if (tokenError) {
    throw new Error("Google OAuth Status konnte nicht geprüft werden.");
  }

  if (!hasGmailSendScope((tokenRow as { scope?: string | null } | null)?.scope ?? null)) {
    throw new Error("Google ist noch ohne Gmail-Senden verbunden. Bitte Google erneut verbinden.");
  }

  const accessToken = await getValidGoogleAccessToken();

  const to = escapeHeader(String(input.to ?? "").trim());
  const subject = escapeHeader(String(input.subject ?? "").trim());
  const text = String(input.text ?? "").replace(/\r\n/g, "\n");
  const senderName = escapeHeader(String(input.senderName ?? "").trim());
  const senderEmail = escapeHeader(String(input.senderEmail ?? "").trim());
  const replyTo = escapeHeader(String(input.replyTo ?? "").trim());

  if (!to) throw new Error("Empfängeradresse fehlt.");
  if (!subject) throw new Error("Betreff fehlt.");
  if (!text.trim()) throw new Error("Nachrichtentext fehlt.");

  const fromHeader = senderName ? `${senderName} <${senderEmail}>` : senderEmail;

  const mimeLines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "",
    text,
  ];

  const raw = base64UrlEncode(mimeLines.join("\r\n"));

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gmail-Versand fehlgeschlagen (${response.status}).`);
  }

  return {
    ok: true,
    provider: "GMAIL_OAUTH",
    messageId: payload?.id ?? null,
  };
}
