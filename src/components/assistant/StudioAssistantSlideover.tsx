"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AssistantWriteAction = {
  type: "create_customer" | "create_appointment";
  payload: {
    customerName?: string;
    dateInput?: string;
    isoDate?: string;
    time?: string;
    serviceName?: string;
    serviceId?: string;
  };
};

type AssistantAction = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
  requiresConfirm?: boolean;
  confirmLabel?: string;
  assistantAction?: AssistantWriteAction;
};

type AssistantLookup = {
  kind?: "none" | "customers" | "appointments" | "invoice" | "smart_action";
  title?: string;
  summary?: string;
  data?: any;
  actionIntent?: string;
  queryName?: string;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
  lookup?: AssistantLookup | null;
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


function compactHeaderButtonClass(danger = false) {
  return danger
    ? "inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-white transition-colors hover:bg-red-600/90 hover:text-white"
    : "inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.04] text-white/85 transition-colors hover:bg-white/[0.10] hover:text-white";
}

function actionClass(tone?: "primary" | "secondary") {
  return tone === "primary"
    ? "inline-flex items-center justify-center rounded-xl border border-[#d8c1a0]/45 bg-[#d8c1a0]/18 px-3 py-2 text-xs font-semibold text-[#f6f0e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#d8c1a0]/26"
    : "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.09]";
}

function assistantActionKey(action: AssistantAction) {
  return `${action.assistantAction?.type ?? "link"}:${JSON.stringify(action.assistantAction?.payload ?? {})}:${action.href}:${action.label}`;
}

function isPositiveConfirmation(text: string) {
  const q = text.trim().toLowerCase();
  return ["ja", "ok", "okay", "bestätigen", "bestaetigen", "anlegen", "mach", "mach es", "bitte anlegen"].includes(q);
}

function isNegativeConfirmation(text: string) {
  const q = text.trim().toLowerCase();
  return ["nein", "abbrechen", "stopp", "stop", "nicht", "doch nicht"].includes(q);
}


function menuIconButtonClass(active = false, danger = false) {
  if (danger) {
    return "inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-600/90 hover:text-white";
  }

  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.10]`;
}

function composerIconButtonClass(disabled = false) {
  return `absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04] text-white transition-colors ${
    disabled ? "cursor-not-allowed opacity-45 pointer-events-none" : "hover:bg-white/[0.10]"
  }`;
}

function firstJoinValue(value: any) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeText(value: any, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatCardDate(value: any) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCardMoney(value: any, currency = "EUR") {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency }).format(numeric);
}

function receiptPayloadValue(row: any, paths: string[][]) {
  let payload = row?.receipt_payload_canonical;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || typeof payload !== "object") return "";
  for (const path of paths) {
    let current = payload;
    for (const key of path) {
      current = current?.[key];
      if (current == null) break;
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number" && Number.isFinite(current)) return String(current);
  }
  return "";
}

function matchingActions(actions: AssistantAction[] | undefined, matcher: (action: AssistantAction) => boolean) {
  return (actions ?? []).filter(matcher).slice(0, 3);
}

function renderCardActions(
  actions: AssistantAction[],
  pendingActionKey: string | null,
  onAssistantAction: (action: AssistantAction) => void
) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action, index) => {
        const key = `${assistantActionKey(action)}-${index}`;
        if (action.assistantAction) {
          const pending = pendingActionKey === assistantActionKey(action);
          return (
            <button key={key} type="button" onClick={() => onAssistantAction(action)} className={actionClass(action.tone)}>
              {pending ? action.confirmLabel || "Zum Bestätigen nochmal klicken" : action.label}
            </button>
          );
        }
        return (
          <a key={key} href={action.href} className={actionClass(action.tone)}>
            {action.label}
          </a>
        );
      })}
    </div>
  );
}

function renderLookupCards(lookup: AssistantLookup | null | undefined, actions: AssistantAction[] | undefined, pendingActionKey: string | null, onAssistantAction: (action: AssistantAction) => void) {
  if (!lookup || !lookup.kind || lookup.kind === "none") return null;


  if (lookup.kind === "smart_action") {
    const data = lookup.data ?? {};
    const customers = Array.isArray(data?.customers) ? data.customers : [];
    const selected = data?.selectedCustomer ?? customers[0] ?? null;
    const person = firstJoinValue(selected?.person);
    const tenant = firstJoinValue(selected?.tenant);
    const customerName = safeText(person?.full_name || data?.customerName, "Kunde noch nicht angelegt");
    const tenantName = selected ? safeText(tenant?.display_name, "Profil gefunden") : "Noch kein Kundenprofil gefunden";
    const serviceName = safeText(data?.service?.name || data?.serviceName, "Leistung noch nicht eindeutig gefunden");
    const dateText = [safeText(data?.dateInput, "Datum fehlt"), safeText(data?.time, "Uhrzeit fehlt")].join(" · ");
    const userText = safeText(data?.currentUserLabel, "Eingeloggter Benutzer");

    return (
      <div className="mt-3 rounded-3xl border border-[#d8c1a0]/18 bg-[#d8c1a0]/[0.055] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d8c1a0]/70">Smart Action · Vorschau</div>
        <div className="mt-2 text-sm font-semibold text-white">GIGI hat diesen Arbeitsauftrag vorbereitet.</div>
        <div className="mt-3 grid gap-2 text-xs text-white/65">
          <div><span className="text-white/40">Kunde:</span> {customerName}</div>
          <div><span className="text-white/40">Profil:</span> {tenantName}</div>
          <div><span className="text-white/40">Termin:</span> {dateText}</div>
          <div><span className="text-white/40">Leistung:</span> {serviceName}</div>
          <div><span className="text-white/40">Behandler:</span> {userText}</div>
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/58">
          Es wurde noch nichts gespeichert. Nutze die Buttons, um den bestehenden Flow mit den vorbereiteten Angaben zu öffnen.
        </div>
        {renderCardActions(
          data?.followUp
            ? (actions ?? []).filter((action) => action.label.toLowerCase().includes("termin-flow"))
            : (actions ?? []),
          pendingActionKey,
          onAssistantAction
        )}
      </div>
    );
  }

  if (lookup.kind === "customers") {
    const rows = Array.isArray(lookup.data) ? lookup.data : Array.isArray(lookup.data?.customers) ? lookup.data.customers : [];
    if (rows.length === 0) return null;

    return (
      <div className="mt-3 grid gap-3">
        {rows.slice(0, 4).map((row: any, index: number) => {
          const person = firstJoinValue(row?.person);
          const tenant = firstJoinValue(row?.tenant);
          const profileId = safeText(row?.id, "");
          const name = safeText(person?.full_name, "Unbekannter Kunde");
          const tenantName = safeText(tenant?.display_name, "ohne Behandler");
          const cardActions = matchingActions(actions, (action) => Boolean(profileId) && action.href.includes(profileId));

          return (
            <div key={`${profileId || name}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">Kunde</div>
              <div className="mt-1 text-sm font-semibold text-white">{name}</div>
              <div className="mt-0.5 text-xs text-white/55">{tenantName}</div>
              <div className="mt-2 grid gap-1 text-xs text-white/55">
                <div>Telefon: {safeText(person?.phone)}</div>
                <div>E-Mail: {safeText(person?.email)}</div>
              </div>
              {renderCardActions(cardActions, pendingActionKey, onAssistantAction)}
            </div>
          );
        })}
      </div>
    );
  }

  if (lookup.kind === "invoice") {
    const data = lookup.data ?? {};
    const receipts = Array.isArray(data?.receipts) ? data.receipts : [];
    const customers = Array.isArray(data?.customers) ? data.customers : [];
    if (receipts.length === 0 && customers.length === 0) return null;

    return (
      <div className="mt-3 grid gap-3">
        {receipts.slice(0, 4).map((receipt: any, index: number) => {
          const receiptId = safeText(receipt?.id, "");
          const number = safeText(receipt?.receipt_number, "Beleg");
          const amount = typeof receipt?.turnover_value_cents === "number" ? receipt.turnover_value_cents / 100 : Number(receipt?.turnover_value_cents ?? 0) / 100;
          const customerName = receiptPayloadValue(receipt, [["customer_name"], ["person_name"], ["customer", "full_name"], ["customer", "name"], ["buyer", "name"]]);
          const providerName = receiptPayloadValue(receipt, [["provider_name"], ["tenant_display_name"], ["tenant_name"], ["tenant", "display_name"]]);
          const cardActions = matchingActions(actions, (action) => Boolean(receiptId) && action.href.includes(receiptId));

          return (
            <div key={`${receiptId || number}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">Rechnung / Beleg</div>
              <div className="mt-1 text-sm font-semibold text-white">{number}</div>
              <div className="mt-0.5 text-xs text-white/55">{safeText(customerName || providerName, "gespeicherter Beleg")}</div>
              <div className="mt-2 grid gap-1 text-xs text-white/55">
                <div>Status: {safeText(receipt?.receipt_type)} · {safeText(receipt?.status)}</div>
                <div>Datum: {formatCardDate(receipt?.issued_at ?? receipt?.created_at)}</div>
                <div>Betrag: {formatCardMoney(amount, receipt?.currency_code ?? "EUR")}</div>
              </div>
              {renderCardActions(cardActions, pendingActionKey, onAssistantAction)}
            </div>
          );
        })}

        {receipts.length === 0 && customers.slice(0, 3).map((row: any, index: number) => {
          const person = firstJoinValue(row?.person);
          const tenant = firstJoinValue(row?.tenant);
          const profileId = safeText(row?.id, "");
          const cardActions = matchingActions(actions, (action) => Boolean(profileId) && action.href.includes(profileId));
          return (
            <div key={`${profileId}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">Kundenprofil ohne Beleg</div>
              <div className="mt-1 text-sm font-semibold text-white">{safeText(person?.full_name, "Unbekannter Kunde")}</div>
              <div className="mt-0.5 text-xs text-white/55">{safeText(tenant?.display_name, "ohne Behandler")}</div>
              {renderCardActions(cardActions, pendingActionKey, onAssistantAction)}
            </div>
          );
        })}
      </div>
    );
  }

  if (lookup.kind === "appointments") {
    const rows = Array.isArray(lookup.data) ? lookup.data : [];
    if (rows.length === 0) return null;

    return (
      <div className="mt-3 grid gap-3">
        {rows.slice(0, 6).map((row: any, index: number) => {
          const person = firstJoinValue(row?.person);
          const tenant = firstJoinValue(row?.tenant);
          const appointmentId = safeText(row?.id, "");
          const profileId = safeText(row?.customer_profile_id, "");
          const cardActions = matchingActions(
            actions,
            (action) =>
              (Boolean(appointmentId) && action.href.includes(appointmentId)) ||
              (Boolean(profileId) && action.href.includes(profileId))
          );

          return (
            <div key={`${row?.id || index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">Termin</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatCardDate(row?.start_at)}</div>
              <div className="mt-0.5 text-xs text-white/55">{safeText(person?.full_name, "Unbekannter Kunde")}</div>
              <div className="mt-2 grid gap-1 text-xs text-white/55">
                <div>Behandler: {safeText(tenant?.display_name)}</div>
                <div>Leistung: {safeText(row?.service_name_snapshot, "ohne Dienstleistung")}</div>
              </div>
              {renderCardActions(cardActions, pendingActionKey, onAssistantAction)}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
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
  const storageKey = useMemo(() => `gigi-assistant:v1:${userLabel?.trim() || "anonymous"}`, [userLabel]);
  const introText = useMemo(() => {
    const greeting = `Hallo ${userLabel?.trim() || ""}`.trim();
    return `${greeting} — ich bin GIGI. Ich helfe dir in ${pageLabel}, finde Kunden, Belege und Termine, formuliere Texte und bringe dich direkt zum richtigen nächsten Schritt.`;
  }, [pageLabel, userLabel]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [pendingAssistantAction, setPendingAssistantAction] = useState<AssistantAction | null>(null);
  const [confirmDialogAction, setConfirmDialogAction] = useState<AssistantAction | null>(null);
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

  function resetChat() {
    setPendingActionKey(null);
    setPendingAssistantAction(null);
    setConfirmDialogAction(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // optional
    }
    setMessages([{ id: uid("assistant"), role: "assistant", text: introText }]);
    window.setTimeout(() => scrollToBottom("auto"), 40);
  }

  function close() {
    setConfirmDialogAction(null);
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

  async function executeAssistantAction(action: AssistantAction) {
    if (!action.assistantAction || busy) return;

    const key = assistantActionKey(action);
    if (action.requiresConfirm && pendingActionKey !== key) {
      setPendingActionKey(key);
      setPendingAssistantAction(action);
      setConfirmDialogAction(action);
      return;
    }

    setPendingActionKey(null);
    setPendingAssistantAction(null);
    setConfirmDialogAction(null);
    setBusy(true);

    try {
      const response = await fetch("/api/studio-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantAction: action.assistantAction,
          messages: messages.map((message) => ({ role: message.role, content: message.text })) satisfies ApiMessage[],
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
      const lookup = data?.lookup && typeof data.lookup === "object" ? (data.lookup as AssistantLookup) : null;
      const actions = Array.isArray(data?.actions)
        ? data.actions
            .filter((entry: any) => entry && typeof entry.label === "string" && (typeof entry.href === "string" || entry.assistantAction))
            .slice(0, 8)
            .map((entry: any) => ({
              label: entry.label,
              href: typeof entry.href === "string" ? entry.href : "#",
              tone: entry.tone === "primary" ? "primary" : "secondary",
              requiresConfirm: Boolean(entry.requiresConfirm),
              confirmLabel: typeof entry.confirmLabel === "string" ? entry.confirmLabel : undefined,
              assistantAction: entry.assistantAction && typeof entry.assistantAction === "object" ? entry.assistantAction : undefined,
            }))
        : [];

      setMessages((current) => [
        ...current,
        { id: uid("assistant"), role: "assistant", text: reply || "Die Aktion wurde verarbeitet.", lookup, actions },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: uid("assistant"), role: "assistant", text: "Ich konnte die bestätigte Aktion gerade nicht ausführen. Bitte versuche es erneut." },
      ]);
    } finally {
      setBusy(false);
      window.setTimeout(() => scrollToBottom("smooth"), 40);
    }
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

    if (pendingAssistantAction && isNegativeConfirmation(trimmed)) {
      setPendingActionKey(null);
      setPendingAssistantAction(null);
      setConfirmDialogAction(null);
      setMessages((current) => [
        ...current,
        { id: uid("assistant"), role: "assistant", text: "Alles klar, ich habe die vorbereitete Aktion abgebrochen. Es wurde nichts gespeichert." },
      ]);
      window.setTimeout(() => scrollToBottom("smooth"), 40);
      return;
    }

    if (pendingAssistantAction && isPositiveConfirmation(trimmed)) {
      const actionToRun = pendingAssistantAction;
      setPendingActionKey(null);
      setPendingAssistantAction(null);
      setConfirmDialogAction(null);
      setBusy(true);

      try {
        const response = await fetch("/api/studio-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assistantAction: actionToRun.assistantAction,
            messages: nextMessages.map((message) => ({ role: message.role, content: message.text })) satisfies ApiMessage[],
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
        const lookup = data?.lookup && typeof data.lookup === "object" ? (data.lookup as AssistantLookup) : null;
        const actions = Array.isArray(data?.actions)
          ? data.actions
              .filter((entry: any) => entry && typeof entry.label === "string" && (typeof entry.href === "string" || entry.assistantAction))
              .slice(0, 8)
              .map((entry: any) => ({
                label: entry.label,
                href: typeof entry.href === "string" ? entry.href : "#",
                tone: entry.tone === "primary" ? "primary" : "secondary",
                requiresConfirm: Boolean(entry.requiresConfirm),
                confirmLabel: typeof entry.confirmLabel === "string" ? entry.confirmLabel : undefined,
                assistantAction: entry.assistantAction && typeof entry.assistantAction === "object" ? entry.assistantAction : undefined,
              }))
          : [];

        setMessages((current) => [
          ...current,
          { id: uid("assistant"), role: "assistant", text: reply || "Die Aktion wurde verarbeitet.", lookup, actions },
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          { id: uid("assistant"), role: "assistant", text: "Ich konnte die bestätigte Aktion gerade nicht ausführen. Bitte versuche es erneut." },
        ]);
      } finally {
        setBusy(false);
        window.setTimeout(() => scrollToBottom("smooth"), 40);
      }
      return;
    }

    setPendingActionKey(null);
    setPendingAssistantAction(null);
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
      const lookup = data?.lookup && typeof data.lookup === "object" ? (data.lookup as AssistantLookup) : null;
      const actions = Array.isArray(data?.actions)
        ? data.actions
            .filter((action: any) => action && typeof action.label === "string" && (typeof action.href === "string" || action.assistantAction))
            .slice(0, 8)
            .map((action: any) => ({
              label: action.label,
              href: typeof action.href === "string" ? action.href : "#",
              tone: action.tone === "primary" ? "primary" : "secondary",
              requiresConfirm: Boolean(action.requiresConfirm),
              confirmLabel: typeof action.confirmLabel === "string" ? action.confirmLabel : undefined,
              assistantAction: action.assistantAction && typeof action.assistantAction === "object" ? action.assistantAction : undefined,
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
          lookup,
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
          <div
            className="studio-assistant-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="GIGI Studio-Assistent"
            style={{ position: "fixed", inset: 0, zIndex: 1350, isolation: "isolate" }}
          >
            <button
              type="button"
              className="studio-assistant-overlay__backdrop"
              onClick={close}
              aria-label="Schließen"
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.42)",
                backdropFilter: "blur(6px)",
                opacity: shown ? 1 : 0,
                transition: "opacity 200ms ease",
                pointerEvents: shown ? "auto" : "none",
              }}
            />

            <section
              className={`studio-assistant-panel relative ${shown ? "studio-assistant-panel--shown" : ""}`}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                bottom: 18,
                width: 470,
                maxWidth: "calc(100vw - 36px)",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
                transform: shown ? "translateX(0)" : "translateX(18px)",
                opacity: shown ? 1 : 0,
                transition: "all 220ms ease",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                color: "white",
              }}
            >
              <header className="studio-assistant-panel__header" style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div className="studio-assistant-panel__eyebrow">GIGI · deine Studio-KI</div>
                  <h2 className="studio-assistant-panel__title" style={{ fontSize: 23, lineHeight: 1.08 }}>GIGI erkennt Leistungen smarter ✨</h2>
                  <p className="studio-assistant-panel__subtitle">
                    Arbeitsbereich: <strong>Gesamtes CRM</strong>
                    {userLabel ? ` · ${userLabel}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={resetChat} className={compactHeaderButtonClass(false)} aria-label="Chat neu starten" title="Chat neu starten">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M6 6l1 15h10l1-15" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                  <button type="button" onClick={close} className={compactHeaderButtonClass(true)} aria-label="Schließen" title="Schließen">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </header>

              <details className="studio-assistant-panel__hint group">
                <summary className="cursor-pointer select-none font-semibold text-white/85">Was kann ich GIGI fragen?</summary>
                <div className="mt-3 grid gap-3 text-white/65 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/42">Kunden</div>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>„Finde Kunde Berbec“</li>
                      <li>„Für Alexandra einen Termin vorbereiten“</li>
                      <li>„Nimm den zweiten“</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/42">Termine</div>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>„Welche Termine hat Alexandra morgen?“</li>
                      <li>„Termin für Berbec“</li>
                      <li>„Was steht heute im Kalender?“</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/42">Rechnungen</div>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>„Zeige mir Rechnungen von Bauer“</li>
                      <li>„Zeige mir die letzte Rechnung von Muster“</li>
                      <li>„Wann sollte ich statt ändern lieber stornieren?“</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/42">Texte & Abläufe</div>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>„Erkläre mir den Ablauf von Rechnung bis Versand.“</li>
                      <li>„Was sollte ich heute im Dashboard prüfen?“</li>
                      <li>„Formuliere eine freundliche Nachricht an den Kunden Berbec“</li>
                    </ul>
                  </div>
                  <p className="sm:col-span-2">GIGI erkennt jetzt Leistungen wie PMU Brows, Beratung oder Auffüllen besser und nutzt passende Dauer/Service-Daten aus deinem CRM, wenn sie gefunden werden.</p>
                </div>
              </details>


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
                      {message.lookup ? renderLookupCards(message.lookup, message.actions, pendingActionKey, executeAssistantAction) : null}
                      {message.actions && message.actions.length > 0 && (!message.lookup || !message.lookup.kind || message.lookup.kind === "none") ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.actions.map((action, index) => {
                            const key = `${assistantActionKey(action)}-${index}`;
                            if (action.assistantAction) {
                              const pending = pendingActionKey === assistantActionKey(action);
                              return (
                                <button key={key} type="button" onClick={() => executeAssistantAction(action)} className={actionClass(action.tone)}>
                                  {pending ? action.confirmLabel || "Zum Bestätigen nochmal klicken" : action.label}
                                </button>
                              );
                            }
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

              {confirmDialogAction ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 px-5 backdrop-blur-[6px]">
                  <div className="w-full max-w-[390px] rounded-[28px] border border-white/12 bg-[#1b1511]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d8c1a0]/70">Bestätigung</div>
                    <div className="mt-2 text-lg font-semibold text-white">{confirmDialogAction.assistantAction?.type === "create_appointment" ? "Termin wirklich erstellen?" : "Kunden wirklich anlegen?"}</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/62">
                      {confirmDialogAction.confirmLabel || confirmDialogAction.label}
                    </p>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/58">
                      GIGI führt die Aktion erst aus, wenn du hier bestätigst. Bei „Nein“ passiert nichts.
                    </div>
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-[16px] border border-[#d8c1a0]/45 bg-[#d8c1a0]/18 px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d8c1a0]/28"
                        onClick={() => {
                          const action = confirmDialogAction;
                          setConfirmDialogAction(null);
                          void executeAssistantAction(action);
                        }}
                      >
                        {confirmDialogAction.assistantAction?.type === "create_appointment" ? "Ja, Termin erstellen" : "Ja, anlegen"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.10]"
                        onClick={() => {
                          setPendingActionKey(null);
                          setPendingAssistantAction(null);
                          setConfirmDialogAction(null);
                        }}
                      >
                        Nein
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

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
                    className={composerIconButtonClass(busy || !input.trim())}
                    disabled={busy || !input.trim()}
                    aria-label="Nachricht senden"
                    title="Senden"
                  >
                    {busy ? (
                      <span className="text-sm font-bold">…</span>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 19V5" />
                        <path d="M5 12l7-7 7 7" />
                      </svg>
                    )}
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
