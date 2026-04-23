import { NextResponse } from "next/server";

const DEFAULT_MODEL = process.env.OPENAI_STUDIO_ASSISTANT_MODEL || "gpt-5-mini";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

function cleanMessages(input: unknown): IncomingMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const role = entry && typeof entry === "object" ? (entry as any).role : null;
      const content = entry && typeof entry === "object" ? (entry as any).content : null;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed) return null;
      return { role, content: trimmed } satisfies IncomingMessage;
    })
    .filter(Boolean) as IncomingMessage[];
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY fehlt auf dem Server. Hinterlege den Key in deiner .env.local.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const messages = cleanMessages(body?.messages);
    const pageLabel = String(body?.context?.pageLabel ?? "App").trim() || "App";
    const pagePath = String(body?.context?.pagePath ?? "").trim();
    const userLabel = String(body?.context?.userLabel ?? "").trim();
    const tenantId = String(body?.context?.tenantId ?? "").trim();

    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht übergeben." }, { status: 400 });
    }

    const systemPrompt = [
      "Du bist der interne Studio-Assistent für ein Beauty-CRM namens Magnifique CRM.",
      "Antworte immer auf Deutsch.",
      "Deine Aufgabe in Version 1: Bedienung erklären, Abläufe strukturieren, kurze Textvorschläge schreiben, auf Risiken oder fehlende Informationen hinweisen.",
      "Du darfst keine Aktionen behaupten, die du nicht ausgeführt hast.",
      "Du hast in Version 1 keinen direkten Schreibzugriff auf Datenbank, Rechnungen oder Termine.",
      "Wenn der Nutzer nach einer Aktion fragt, erkläre den sinnvollsten manuellen nächsten Schritt innerhalb der App.",
      "Antworte konkret, ruhig, hilfreich und studio-tauglich. Keine übertriebene Werbesprache.",
      `Aktueller Seitenkontext: ${pageLabel}${pagePath ? ` (${pagePath})` : ""}.`,
      userLabel ? `Eingeloggter Benutzer: ${userLabel}.` : "",
      tenantId ? `Aktuelle tenant_id: ${tenantId}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `OpenAI-Antwort fehlgeschlagen (${response.status}). ${errorText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const answer = String(data?.output_text ?? "").trim();

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unbekannter Fehler im Studio-Assistenten.",
      },
      { status: 500 }
    );
  }
}
