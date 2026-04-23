"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
};

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/calendar": "Kalender",
  "/customers": "Kunden",
  "/services": "Dienstleistungen",
  "/rechnungen": "Rechnungen",
  "/einstellungen": "Einstellungen",
  "/dashboard/chat": "Team Chat",
};

function getPageLabel(pathname: string | null) {
  if (!pathname) return "App";
  const exact = PAGE_LABELS[pathname];
  if (exact) return exact;
  const match = Object.entries(PAGE_LABELS).find(([key]) => pathname.startsWith(`${key}/`));
  return match?.[1] ?? "App";
}

function getSuggestions(pathname: string | null) {
  if (!pathname) {
    return [
      "Was kann ich hier aktuell mit der App machen?",
      "Hilf mir bei einer freundlichen Kunden-Nachricht.",
      "Erkläre mir den besten Ablauf im Studio.",
    ];
  }

  if (pathname.startsWith("/dashboard")) {
    return [
      "Was sollte ich heute im Dashboard prüfen?",
      "Formuliere eine kurze Tagesübersicht für das Studio.",
      "Wie nutze ich Dashboard, Reminder und Warteliste am besten zusammen?",
    ];
  }

  if (pathname.startsWith("/calendar")) {
    return [
      "Erkläre mir den schnellsten Termin-Workflow.",
      "Wie gehe ich mit einem verschobenen Termin am saubersten um?",
      "Formuliere eine kurze Terminbestätigung für einen Kunden.",
    ];
  }

  if (pathname.startsWith("/customers")) {
    return [
      "Welche Infos sollte ich im Kundenprofil immer sauber pflegen?",
      "Schreibe eine freundliche Nachricht für einen Erstkunden.",
      "Wie dokumentiere ich Fotos und Notizen sinnvoll?",
    ];
  }

  if (pathname.startsWith("/rechnungen")) {
    return [
      "Erkläre mir den Ablauf von Rechnung bis Versand.",
      "Schreibe einen höflichen Begleittext für den Rechnungsversand.",
      "Wann sollte ich statt ändern lieber stornieren?",
    ];
  }

  return [
    "Hilf mir bei der Nutzung dieser Seite.",
    "Schreibe mir einen kurzen Kundentext.",
    "Was ist hier der sinnvollste nächste Schritt?",
  ];
}

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function StudioAssistantSlideover({
  userLabel,
  tenantId,
}: {
  userLabel?: string | null;
  tenantId?: string | null;
}) {
  const pathname = usePathname();
  const pageLabel = getPageLabel(pathname);
  const suggestions = useMemo(() => getSuggestions(pathname), [pathname]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => setShown(true), 10);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShown(false);
        window.setTimeout(() => setOpen(false), 180);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const greeting = `Hallo ${userLabel?.trim() || ""}`.trim();
    const intro = `${greeting} — ich bin dein Studio-Assistent für ${pageLabel}. Ich helfe dir bei Bedienung, Formulierungen und sinnvollen nächsten Schritten. In Version 1 erkläre ich, schlage vor und formuliere mit dir — ich führe noch nichts selbst aus.`;
    setMessages([
      {
        id: uid("assistant"),
        role: "assistant",
        text: intro,
      },
    ]);
  }, [pageLabel, userLabel, open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function close() {
    setShown(false);
    window.setTimeout(() => setOpen(false), 180);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const nextUserMessage: AssistantMessage = {
      id: uid("user"),
      role: "user",
      text: trimmed,
    };

    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/studio-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })) satisfies ApiMessage[],
          context: {
            pagePath: pathname,
            pageLabel,
            userLabel: userLabel ?? null,
            tenantId: tenantId ?? null,
          },
        }),
      });

      const data = await response.json();
      const reply = String(data?.answer ?? "").trim();
      const fallback = data?.error
        ? `Ich konnte gerade keine KI-Antwort erzeugen. ${String(data.error)}`
        : "Ich konnte gerade keine Antwort erzeugen. Bitte versuche es gleich nochmal.";

      setMessages((current) => [
        ...current,
        {
          id: uid("assistant"),
          role: "assistant",
          text: reply || fallback,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: uid("assistant"),
          role: "assistant",
          text: "Ich konnte den Studio-Assistenten gerade nicht erreichen. Bitte prüfe später die Verbindung oder die Server-Konfiguration.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="studio-assistant-launcher clientique-touchable clientique-touchable--soft"
        aria-label="Studio-Assistent öffnen"
      >
        <span className="studio-assistant-launcher__icon" aria-hidden="true">
          ✦
        </span>
        <span className="studio-assistant-launcher__text">Assistent</span>
      </button>

      {open &&
        createPortal(
          <div className="studio-assistant-overlay" role="dialog" aria-modal="true" aria-label="Studio-Assistent">
            <button type="button" className="studio-assistant-overlay__backdrop" onClick={close} aria-label="Schließen" />

            <section className={`studio-assistant-panel ${shown ? "studio-assistant-panel--shown" : ""}`}>
              <header className="studio-assistant-panel__header">
                <div>
                  <div className="studio-assistant-panel__eyebrow">Studio-Assistent · Version 1</div>
                  <h2 className="studio-assistant-panel__title">Hilfe direkt in deinem CRM</h2>
                  <p className="studio-assistant-panel__subtitle">
                    Kontext: <strong>{pageLabel}</strong>
                    {userLabel ? ` · ${userLabel}` : ""}
                  </p>
                </div>
                <button type="button" onClick={close} className="studio-assistant-panel__close" aria-label="Schließen">
                  ✕
                </button>
              </header>

              <div className="studio-assistant-panel__hint">
                Ich erkläre Abläufe, schreibe Texte vor und helfe dir mit der aktuellen Seite. Noch keine automatischen Änderungen.
              </div>

              <div className="studio-assistant-panel__chips">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="studio-assistant-chip clientique-touchable clientique-touchable--soft"
                    onClick={() => void sendMessage(suggestion)}
                    disabled={busy}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div ref={scrollRef} className="studio-assistant-panel__messages clientique-scrollbar">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`studio-assistant-message ${message.role === "user" ? "studio-assistant-message--user" : "studio-assistant-message--assistant"}`}
                  >
                    <div className="studio-assistant-message__role">
                      {message.role === "user" ? "Du" : "Assistent"}
                    </div>
                    <div className="studio-assistant-message__body">{message.text}</div>
                  </article>
                ))}

                {busy ? (
                  <article className="studio-assistant-message studio-assistant-message--assistant">
                    <div className="studio-assistant-message__role">Assistent</div>
                    <div className="studio-assistant-message__body">Ich denke gerade über deine Anfrage nach …</div>
                  </article>
                ) : null}
              </div>

              <form
                className="studio-assistant-panel__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(input);
                }}
              >
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="studio-assistant-panel__textarea"
                  placeholder={`Frag mich etwas zu ${pageLabel.toLowerCase()} oder bitte mich um einen Textvorschlag …`}
                  rows={4}
                />
                <div className="studio-assistant-panel__composerFooter">
                  <span className="studio-assistant-panel__composerHint">Version 1: Hilfe, Erklärungen, Textvorschläge</span>
                  <button type="submit" className="studio-assistant-panel__send" disabled={busy || !input.trim()}>
                    {busy ? "Denkt …" : "Senden"}
                  </button>
                </div>
              </form>
            </section>
          </div>,
          document.body
        )}
    </>
  );
}
