export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  senderName?: string;
  senderEmail?: string;
};

export type SendMailResult = {
  ok: true;
  provider: string;
  messageId?: string | null;
};

function getMailMode() {
  const mode = String(process.env.MAIL_DELIVERY_MODE ?? process.env.EMAIL_DELIVERY_MODE ?? "simulate")
    .trim()
    .toLowerCase();

  if (mode === "resend") return "resend" as const;
  return "simulate" as const;
}

function buildFromAddress(input: { senderName?: string; senderEmail?: string }) {
  const configuredFrom = String(
    process.env.MAIL_FROM_DEFAULT ?? process.env.MAIL_FROM ?? process.env.RESEND_FROM ?? ""
  ).trim();

  if (!configuredFrom) {
    throw new Error(
      "MAIL_FROM_DEFAULT oder RESEND_FROM fehlt. Setze zuerst eine verifizierte Absenderadresse in den Environment-Variablen."
    );
  }

  const senderName = String(input.senderName ?? "").trim();
  if (!senderName) return configuredFrom;

  return `${senderName} <${configuredFrom}>`;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const to = String(input.to ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const text = String(input.text ?? "").trim();

  if (!to) throw new Error("Empfängeradresse fehlt.");
  if (!subject) throw new Error("Betreff fehlt.");
  if (!text) throw new Error("Nachrichtentext fehlt.");

  const mode = getMailMode();

  if (mode === "simulate") {
    return {
      ok: true,
      provider: "SIMULATED",
      messageId: `sim_${Date.now()}`,
    };
  }

  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY fehlt. Entweder MAIL_DELIVERY_MODE=simulate lassen oder Resend sauber konfigurieren.");
  }

  const from = buildFromAddress({
    senderName: input.senderName,
    senderEmail: input.senderEmail,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: input.html,
      reply_to: input.replyTo || input.senderEmail || undefined,
    }),
  });

  const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Mailversand fehlgeschlagen (${response.status}).`);
  }

  return {
    ok: true,
    provider: "RESEND",
    messageId: payload?.id ?? null,
  };
}
