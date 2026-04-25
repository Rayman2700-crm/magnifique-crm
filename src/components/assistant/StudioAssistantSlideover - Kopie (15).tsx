"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AssistantAction = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
  requiresConfirm?: boolean;
  confirmLabel?: string;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
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
      "Welche Termine hat Alexandra morgen?",
      "Zeige mir die letzte Rechnung von Muster",
    ];
  }

  if (pathname.startsWith("/calendar")) {
    return [
      "Welche Termine hat Alexandra morgen?",
      "Welche Termine stehen heute an?",
      "Erkläre mir den schnellsten Termin-Workflow.",
    ];
  }

  if (pathname.startsWith("/customers")) {
    return [
      "Finde Kunde Muster",
      "Zeige mir die letzte Rechnung von Muster",
      "Welche Termine hat dieser Kunde demnächst?",
    ];
  }

  if (pathname.startsWith("/rechnungen")) {
    return [
      "Zeige mir die letzte Rechnung von Muster",
      "Erkläre mir den Ablauf von Rechnung bis Versand.",
      "Wann sollte ich statt ändern lieber stornieren?",
    ];
  }

  return [
    "Hilf mir bei der Nutzung dieser Seite.",
    "Schreibe mir einen kurzen Kundentext.",
    "Was ist hier der sinnvollste nächste Schritt?",
  ];
}


function collectPageSnapshot() {
  if (typeof document === "undefined") return "";

  const main = document.querySelector("main") || document.querySelector("[data-assistant-context]") || document.body;
  const rawText = (main?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  const compact = rawText
    .replace(/Assistent/gi, "")
    .replace(/Studio-Assistent/gi, "")
    .trim();

  return compact.slice(0, 3500);
}

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}


function actionClass(tone?: "primary" | "secondary") {
  return tone === "primary"
    ? "inline-flex items-center justify-center rounded-xl border border-[#d8c1a0]/45 bg-[#d8c1a0]/18 px-3 py-2 text-xs font-semibold text-[#f6f0e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#d8c1a0]/26"
    : "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.09]";
}

function renderAssistantText(text: string) {
  const parts: Array<{ type: "text" | "link"; text: string; href?: string }> = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "link", text: match[1], href: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  if (parts.length === 0) return text;

  return parts.map((part, index) => {
    if (part.type === "link" && part.href) {
      return (
        <a key={`${part.href}-${index}`} href={part.href} className={actionClass("secondary")}>
          {part.text}
        </a>
      );
    }
    return <span key={`text-${index}`}>{part.text}</span>;
  });
}

export default function StudioAssistantSlideover({
  userLabel,
  tenantId,
}: {
  userLabel?: string | null;
  tenantId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageLabel = getPageLabel(pathname);
  const suggestions = useMemo(() => getSuggestions(pathname), [pathname]);
  const storageKey = useMemo(() => `gigi-assistant:v1:${userLabel?.trim() || "anonymous"}`, [userLabel]);
  const introText = useMemo(() => {
    const greeting = `Hallo ${userLabel?.trim() || ""}`.trim();
    return `${greeting} — ich bin GIGI. Ich helfe dir in ${pageLabel}, finde Kunden, Belege und Termine, merke mir passende Treffer und bringe dich direkt zum richtigen nächsten Schritt.`;
  }, [pageLabel, userLabel]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const run = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    };

    window.requestAnimationFrame(() => {
      run();
      window.setTimeout(run, 40);
      window.setTimeout(run, 140);
    });
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || initializedRef.current) return;
    initializedRef.current = true;

    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : 0;
      const savedMessages = Array.isArray(parsed?.messages) ? parsed.messages : Array.isArray(parsed) ? parsed : [];
      const isFresh = savedAt ? Date.now() - savedAt < 1000 * 60 * 60 * 24 : true;
      if (isFresh && savedMessages.length > 0) {
        const restored = savedMessages
          .filter((message: any) =>
            message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.text === "string" &&
            typeof message.id === "string"
          )
          .slice(-30);
        if (restored.length > 0) {
          setMessages(restored);
          return;
        }
      }
    } catch {
      // chat restore is optional
    }

    setMessages([{ id: uid("assistant"), role: "assistant", text: introText }]);
  }, [introText, mounted, storageKey]);

  useEffect(() => {
    if (!mounted || messages.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), messages: messages.slice(-30) }));
    } catch {
      // chat persistence is optional
    }
  }, [messages, mounted, storageKey]);

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
    if (!open || messages.length > 0) return;
    setMessages([{ id: uid("assistant"), role: "assistant", text: introText }]);
  }, [introText, messages.length, open]);

  useEffect(() => {
    if (!open) return;
    scrollToBottom("auto");
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open || !shown) return;
    scrollToBottom("auto");
  }, [open, shown]);

  function close() {
    setShown(false);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openAssistant");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    window.setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      window.setTimeout(() => {
        setShown(true);
        scrollToBottom("auto");
      }, 10);
    };

    window.addEventListener("studio-assistant:open", handleOpen as EventListener);
    return () => window.removeEventListener("studio-assistant:open", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    if (searchParams?.get("openAssistant") !== "1") return;
    setOpen(true);
    const timeout = window.setTimeout(() => {
      setShown(true);
      scrollToBottom("auto");
    }, 10);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

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
            pageSnapshot: collectPageSnapshot(),
          },
        }),
      });

      const data = await response.json();
      const reply = String(data?.answer ?? "").trim();
      const actions = Array.isArray(data?.actions)
        ? data.actions
            .filter((action: any) => action && typeof action.label === "string" && typeof action.href === "string")
            .slice(0, 8)
            .map((action: any) => ({
              label: action.label,
              href: action.href,
              tone: action.tone === "primary" ? "primary" : "secondary",
              requiresConfirm: Boolean(action.requiresConfirm),
              confirmLabel: typeof action.confirmLabel === "string" ? action.confirmLabel : undefined,
            }))
        : [];
      const fallback = data?.error
        ? `Ich konnte gerade keine KI-Antwort erzeugen. ${String(data.error)}`
        : "Ich konnte gerade keine Antwort erzeugen. Bitte versuche es gleich nochmal.";

      setMessages((current) => [
        ...current,
        {
          id: uid("assistant"),
          role: "assistant",
          text: reply || fallback,
          actions,
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
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => scrollToBottom("auto"), 40);
        }}
        className="studio-assistant-launcher clientique-touchable clientique-touchable--soft"
        aria-label="GIGI öffnen"
      >
        <span className="studio-assistant-launcher__icon" aria-hidden="true">
          ✦
        </span>
        <span className="studio-assistant-launcher__text">GIGI</span>
      </button>

      {open &&
        createPortal(
          <div className="studio-assistant-overlay" role="dialog" aria-modal="true" aria-label="GIGI Studio-Assistent">
            <button type="button" className="studio-assistant-overlay__backdrop" onClick={close} aria-label="Schließen" />

            <section className={`studio-assistant-panel ${shown ? "studio-assistant-panel--shown" : ""}`}>
              <header className="studio-assistant-panel__header">
                <div>
                  <div className="studio-assistant-panel__eyebrow">GIGI · deine Studio-KI</div>
                  <h2 className="studio-assistant-panel__title" style={{ fontSize: 23, lineHeight: 1.08 }}>GIGI sortiert den Studio-Trubel ✨</h2>
                  <p className="studio-assistant-panel__subtitle">
                    Arbeitsbereich: <strong>Gesamtes CRM</strong>
                    {userLabel ? ` · ${userLabel}` : ""}
                  </p>
                </div>
                <button type="button" onClick={close} className="studio-assistant-panel__close" aria-label="Schließen">
                  ✕
                </button>
              </header>

              <details className="studio-assistant-panel__hint group">
                <summary className="cursor-pointer select-none font-semibold text-white/85">Was kann ich GIGI fragen?</summary>
                <div className="mt-3 space-y-2 text-white/65">
                  <p>GIGI kann Kunden, Belege und Termine suchen, Treffer merken und dir passende Links oder nächste Schritte zeigen.</p>
                  <p className="font-semibold text-white/78">Beispiele:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>„Finde Kunde Berbec“</li>
                    <li>„Für Alexandra einen Termin vorbereiten“</li>
                    <li>„Zeige mir Rechnungen von Bauer“</li>
                    <li>„Zeige mir die letzte Rechnung von Muster“</li>
                    <li>„Welche Termine hat Alexandra morgen?“</li>
                    <li>„Erkläre mir den Ablauf von Rechnung bis Versand.“</li>
                    <li>„Wann sollte ich statt ändern lieber stornieren?“</li>
                    <li>„Formuliere eine freundliche Nachricht an den Kunden“</li>
                  </ul>
                  <p>Wichtig: GIGI öffnet und vorbereitet — sie ändert keine sensiblen CRM-Daten ungefragt.</p>
                </div>
              </details>

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
                      {message.role === "user" ? "Du" : "GIGI"}
                    </div>
                    <div className="studio-assistant-message__body">
                      {renderAssistantText(message.text)}
                      {message.actions && message.actions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.actions.map((action, index) => {
                            const key = `${action.href}-${index}`;
                            return (
                              <a key={key} href={action.href} className={actionClass(action.tone)}>
                                {action.label}
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}

                {busy ? (
                  <article className="studio-assistant-message studio-assistant-message--assistant">
                    <div className="studio-assistant-message__role">GIGI</div>
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
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    className="studio-assistant-panel__textarea pr-14"
                    placeholder="Frag GIGI etwas im CRM …"
                    rows={4}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage(input);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.055] text-base font-bold text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-white/[0.095] hover:border-white/18 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy || !input.trim()}
                    aria-label="Nachricht senden"
                    title="Senden"
                  >
                    {busy ? "…" : "↑"}
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
