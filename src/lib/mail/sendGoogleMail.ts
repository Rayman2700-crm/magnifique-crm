import { Buffer } from "node:buffer";
import { supabaseServer } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/google/getValidGoogleAccessToken";

export type SendGoogleMailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

export type SendGoogleMailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: SendGoogleMailAttachment[];
};

export type SendGoogleMailResult = {
  ok: true;
  provider: "GMAIL_OAUTH";
  messageId?: string | null;
};

function hasGmailSendScope(scope: string | null | undefined) {
  const scopes = String(scope ?? "").split(/\s+/).filter(Boolean);
  return (
    scopes.includes("https://www.googleapis.com/auth/gmail.send") ||
    scopes.includes("https://mail.google.com/")
  );
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeMimeWordUtf8(value: string) {
  const safe = escapeHeader(value);
  if (!safe) return "";
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function formatAddressHeader(name: string, email: string) {
  const cleanEmail = escapeHeader(email);
  const cleanName = escapeHeader(name);
  if (!cleanName) return cleanEmail;
  return `${encodeMimeWordUtf8(cleanName)} <${cleanEmail}>`;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeAttachmentContent(content: Buffer | Uint8Array | string) {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return Buffer.from(content, "utf8");
  return Buffer.from(content);
}

function buildMimeMessage(input: {
  fromHeader: string;
  to: string;
  subjectHeader: string;
  text: string;
  replyTo?: string;
  attachments?: SendGoogleMailAttachment[];
}) {
  const attachments = (input.attachments ?? []).filter((item) => {
    const filename = String(item?.filename ?? "").trim();
    return Boolean(filename);
  });

  if (attachments.length === 0) {
    return [
      `From: ${input.fromHeader}`,
      `To: ${input.to}`,
      `Subject: ${input.subjectHeader}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      ...(input.replyTo ? [`Reply-To: ${escapeHeader(input.replyTo)}`] : []),
      "",
      input.text,
    ].join("\r\n");
  }

  const boundary = `mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const lines: string[] = [
    `From: ${input.fromHeader}`,
    `To: ${input.to}`,
    `Subject: ${input.subjectHeader}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ...(input.replyTo ? [`Reply-To: ${escapeHeader(input.replyTo)}`] : []),
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
  ];

  for (const attachment of attachments) {
    const filename = escapeHeader(String(attachment.filename ?? "Anhang").trim());
    const contentType = escapeHeader(String(attachment.contentType ?? "application/octet-stream").trim());
    const contentBuffer = normalizeAttachmentContent(attachment.content);
    const base64 = contentBuffer.toString("base64").replace(/(.{76})/g, "$1\r\n");

    lines.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64,
    );
  }

  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export async function sendGoogleMail(
  input: SendGoogleMailInput,
): Promise<SendGoogleMailResult> {
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
  const senderName = String(input.senderName ?? "").trim();
  const senderEmail = escapeHeader(String(input.senderEmail ?? "").trim());
  const replyTo = escapeHeader(String(input.replyTo ?? "").trim());

  if (!to) throw new Error("Empfängeradresse fehlt.");
  if (!subject) throw new Error("Betreff fehlt.");
  if (!text.trim()) throw new Error("Nachrichtentext fehlt.");

  const fromHeader = formatAddressHeader(senderName, senderEmail);
  const subjectHeader = encodeMimeWordUtf8(subject);
  const mime = buildMimeMessage({
    fromHeader,
    to,
    subjectHeader,
    text,
    replyTo: replyTo || undefined,
    attachments: input.attachments,
  });

  const raw = base64UrlEncode(mime);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gmail-Versand fehlgeschlagen (${response.status}).`);
  }

  return {
    ok: true,
    provider: "GMAIL_OAUTH",
    messageId: payload?.id ?? null,
  };
}
