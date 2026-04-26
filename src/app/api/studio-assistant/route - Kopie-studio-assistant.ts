import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const DEFAULT_MODEL = process.env.OPENAI_STUDIO_ASSISTANT_MODEL || "gpt-5-mini";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantContext = {
  pageLabel: string;
  pagePath: string;
  userLabel: string;
  tenantId: string;
  pageSnapshot: string;
};

type AssistantWriteAction = {
  type: "create_customer" | "create_appointment";
  payload: {
    customerName?: string;
    dateInput?: string;
    isoDate?: string;
    time?: string;
    serviceName?: string;
    serviceId?: string;
    customerProfileId?: string;
    forceNewPerson?: boolean;
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

type DbLookupResult = {
  kind: "none" | "customers" | "appointments" | "invoice" | "smart_action";
  title: string;
  summary: string;
  data: unknown;
  actionIntent?: "customer_search" | "appointment_create" | "invoice_create" | "invoice_lookup" | "smart_appointment_create";
  queryName?: string;
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

function cleanText(value: unknown, maxLength = 4500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getLastUserQuestion(messages: IncomingMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function extractAssistantText(data: any) {
  const direct = cleanText(data?.output_text, 8000);
  if (direct) return direct;

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      const text = cleanText(block?.text ?? block?.content ?? block?.value, 4000);
      if (text) parts.push(text);
    }
  }

  return parts.join("\n\n").trim();
}

function mapProviderError(status: number, text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("insufficient_quota") || normalized.includes("quota") || normalized.includes("billing")) {
    return "Der Studio-Assistent kann gerade nicht über die OpenAI-API antworten, weil für den API-Key kein verfügbares Guthaben oder Kontingent vorhanden ist. Prüfe OpenAI Billing, Projektbudget und API-Key.";
  }
  if (status === 429) return "Der Studio-Assistent ist gerade vorübergehend ausgelastet. Bitte versuche es in wenigen Sekunden erneut.";
  if (status >= 500) return "Der KI-Dienst ist gerade vorübergehend nicht erreichbar. Bitte versuche es gleich noch einmal.";
  return "Der Studio-Assistent konnte gerade keine KI-Antwort erzeugen. Bitte prüfe Server-Konfiguration und API-Zugang.";
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: unknown, currency = "EUR") {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency }).format(number);
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function extractQuotedName(question: string) {
  const quoted = question.match(/[„"']([^„"']{2,80})[“"']/)?.[1];
  if (quoted) return quoted.trim();
  return "";
}

function normalizeSearchTerm(question: string, mode: "customer" | "invoice" = "customer") {
  const quoted = extractQuotedName(question);
  if (quoted) return quoted;

  const common = mode === "invoice"
    ? /\b(zeige|zeig|mir|bitte|die|der|das|den|dem|eine|einen|einer|von|für|zu|mit|hat|haben|suche|such|finde|finden|kunde|kunden|rechnung|rechnungen|beleg|belege|letzte|letzten|letzter|fiscal|receipt|erstellen|anlegen|machen|vorbereiten|neu|neue|neuen)\b/gi
    : /\b(zeige|zeig|mir|bitte|die|der|das|den|dem|eine|einen|einer|von|für|zu|mit|hat|haben|suche|such|finde|finden|kunde|kunden|kundenliste|liste|telefon|email|e-mail|in)\b/gi;

  return question
    .replace(/[?!.:,;]/g, " ")
    .replace(common, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeCommonWords(value: string) {
  return value
    .replace(/[?!.:,;]/g, " ")
    .replace(/\b(zeige|zeig|mir|bitte|die|der|das|den|dem|eine|einen|einer|von|für|zu|mit|hat|haben|suche|such|finde|finden|kunde|kunden|rechnung|rechnungen|letzte|letzten|termin|termine|morgen|heute|gestern|uebermorgen|übermorgen|wann|welche|welcher|alexandra|raluca|radu|barbara|erstellen|anlegen|machen|vorbereiten|neu|neue|neuen)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeekMonday(date: Date) {
  const start = startOfLocalDay(date);
  const weekday = start.getDay();
  const diffToMonday = (weekday + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  return start;
}

function detectDateRange(question: string) {
  const q = question.toLowerCase();
  const now = new Date();

  if (q.includes("nächste woche") || q.includes("naechste woche") || q.includes("nächsten woche") || q.includes("naechsten woche")) {
    const start = startOfWeekMonday(now);
    start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, label: "nächste Woche" };
  }

  if (q.includes("diese woche") || q.includes("aktueller woche") || q.includes("woche")) {
    const start = startOfWeekMonday(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, label: "diese Woche" };
  }

  const start = startOfLocalDay(now);
  if (q.includes("morgen")) start.setDate(start.getDate() + 1);
  if (q.includes("gestern")) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, label: q.includes("morgen") ? "morgen" : q.includes("gestern") ? "gestern" : "heute" };
}

function detectPractitionerName(question: string) {
  const q = question.toLowerCase();
  for (const name of ["alexandra", "raluca", "radu", "barbara", "boba"]) {
    if (q.includes(name)) return name === "boba" ? "barbara" : name;
  }
  return "";
}

function wantsCustomerSearch(question: string) {
  const q = question.toLowerCase();
  return q.includes("kunde") || q.includes("kunden") || q.includes("suche") || q.includes("finde") || q.includes("finden") || q.includes("telefon") || q.includes("email") || q.includes("e-mail");
}

function wantsAppointments(question: string) {
  const q = question.toLowerCase();
  return q.includes("termin") || q.includes("termine") || q.includes("kalender") || q.includes("morgen") || q.includes("heute") || q.includes("woche");
}

function wantsInvoice(question: string) {
  const q = question.toLowerCase();
  return q.includes("rechnung") || q.includes("rechnungen") || q.includes("beleg") || q.includes("receipt") || q.includes("fiscal");
}

function wantsPreparedAction(question: string) {
  const q = question.toLowerCase();
  return /\b(erstellen|anlegen|machen|vorbereiten|neu|neue|neuen)\b/i.test(q);
}


function wantsSmartAppointmentCreate(question: string) {
  const q = question.toLowerCase();
  const hasAppointmentIntent = q.includes("termin") || q.includes("eintragen") || q.includes("anlegen") || q.includes("erstellen") || q.includes("buchen");
  const hasAbsoluteDate = /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/.test(q);
  const hasRelativeDate = /\b(heute|morgen|uebermorgen|übermorgen)\b/i.test(q);
  const hasTime = /\b\d{1,2}[:.]\d{2}\b/.test(q);
  return hasAppointmentIntent && (hasAbsoluteDate || hasRelativeDate || hasTime);
}

function formatDateParts(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { input: `${day}.${month}.${year}`, isoDate: `${year}-${month}-${day}` };
}

function parseSmartDate(question: string) {
  const q = question.toLowerCase();
  const relative = startOfLocalDay(new Date());

  if (/\b(uebermorgen|übermorgen)\b/i.test(q)) {
    relative.setDate(relative.getDate() + 2);
    return formatDateParts(relative);
  }
  if (/\bmorgen\b/i.test(q)) {
    relative.setDate(relative.getDate() + 1);
    return formatDateParts(relative);
  }
  if (/\bheute\b/i.test(q)) {
    return formatDateParts(relative);
  }

  const withYear = question.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (withYear) {
    const day = withYear[1].padStart(2, "0");
    const month = withYear[2].padStart(2, "0");
    const rawYear = withYear[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return { input: `${day}.${month}.${year}`, isoDate: `${year}-${month}-${day}` };
  }

  const withoutYear = question.match(/\b(?:am\s*)?(\d{1,2})[.\/-](\d{1,2})(?![.\/-]\d)\b/i);
  if (!withoutYear) return { input: "", isoDate: "" };

  const now = new Date();
  const day = withoutYear[1].padStart(2, "0");
  const month = withoutYear[2].padStart(2, "0");
  let year = now.getFullYear();
  const candidate = new Date(year, Number(month) - 1, Number(day), 23, 59, 59, 999);
  if (candidate.getTime() < now.getTime()) year += 1;

  return { input: `${day}.${month}.${year}`, isoDate: `${year}-${month}-${day}` };
}

function parseSmartTime(question: string) {
  const q = question.replace(/\s+/g, " ").trim();

  // Datum wie 27.04.26 darf nicht als Uhrzeit 27:04 erkannt werden.
  // Deshalb bevorzugen wir die explizite Form "um 16:30".
  const explicit = q.match(/\bum\s*(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/i);
  if (explicit) {
    const hour = Number(explicit[1]);
    const minute = Number(explicit[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  // Fallback: erst Datumsangaben entfernen, dann freie Uhrzeit suchen.
  const withoutDates = q.replace(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g, " ");
  const match = withoutDates.match(/\b(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/i);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cleanSmartNameCandidate(value: string) {
  return value
    .replace(/\b(wenn|falls)\b.*$/i, " ")
    .replace(/\bals\s+kunden?\b.*$/i, " ")
    .replace(/\b(neuen?|neue)\s+termin\b.*$/i, " ")
    .replace(/\btermin\b.*$/i, " ")
    .replace(/\b(heute|morgen|uebermorgen|übermorgen)\b.*$/i, " ")
    .replace(/\bam\s+\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b.*$/i, " ")
    .replace(/\bum\s+\d{1,2}[:.]\d{2}\b.*$/i, " ")
    .replace(/\b(für|fuer)\s+(pmu|brows?|brow|microblading|powder|service|behandlung)\b.*$/i, " ")
    .replace(/\b(anlegen|erstellen|eintragen|vorbereiten|machen|buchen)\b.*$/i, " ")
    .replace(/[?!.:,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSmartCustomerName(question: string) {
  const quoted = extractQuotedName(question);
  if (quoted) return quoted;

  const q = question.replace(/\s+/g, " ").trim();

  // Beispiele:
  // "termin für max muster morgen um 15:00 pmu brows"
  // "ich will für max muster einen neuen termin am 27.04 um 16:45 erstellen"
  // "kunde max muster, wenn noch nicht vorhanden ..."
  const patterns = [
    /kunden?\s+(.+?)(?:,|\s+wenn\b|\s+falls\b|\s+als\s+kunden?\b|\s+anlegen\b|\s+erstellen\b|\s+und\b|\s+heute\b|\s+morgen\b|\s+(?:uebermorgen|übermorgen)\b|\s+am\b|\s+um\b|$)/i,
    /(?:für|fuer)\s+(.+?)(?:\s+(?:einen?|eine|neuen?|neue)?\s*termin\b|\s+heute\b|\s+morgen\b|\s+(?:uebermorgen|übermorgen)\b|\s+am\b|\s+um\b|,|$)/i,
    /termin\s+(?:für|fuer)\s+(.+?)(?:\s+heute\b|\s+morgen\b|\s+(?:uebermorgen|übermorgen)\b|\s+am\b|\s+um\b|\s+(?:für|fuer)\b|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern)?.[1]?.trim();
    const cleaned = match ? cleanSmartNameCandidate(match) : "";
    if (cleaned && cleaned.length >= 2 && !/^ich\b/i.test(cleaned)) return cleaned;
  }

  const fallback = removeCommonWords(q)
    .replace(/\b(ich|will|möchte|moechte|nur|diesen?|dieser|diese|vorhanden|noch|nicht|heute|morgen|uebermorgen|übermorgen)\b/gi, " ")
    .replace(/\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\b(pmu|brows?|brow|microblading|powder|service|behandlung)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanSmartNameCandidate(fallback);
}

function normalizeServiceText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSmartServiceCandidate(value: string) {
  const cleaned = value
    .replace(/\bam\s+\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/gi, " ")
    .replace(/\bum\s+\d{1,2}[:.]\d{2}\s*(?:uhr)?\b/gi, " ")
    .replace(/\b(eintragen|anlegen|erstellen|vorbereiten|machen|buchen)\b.*$/i, " ")
    .replace(/\b(neuen?|neue)\s+termin\b/gi, " ")
    .replace(/\btermin\b/gi, " ")
    .replace(/[?!.:,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();
  if (lower.includes("kunde") || lower.includes("termin") || lower.startsWith("ich ")) return "";
  return cleaned;
}

function extractSmartServiceName(question: string) {
  const q = question.replace(/\s+/g, " ").trim();

  const explicit = q.match(/(?:leistung|service|behandlung)\s+(.+?)(?:,|$)/i)?.[1]?.trim();
  const explicitCleaned = explicit ? cleanSmartServiceCandidate(explicit) : "";
  if (explicitCleaned) return explicitCleaned;

  // Starke Beauty-/Studio-Signale direkt aus dem Satz ziehen.
  const servicePatterns = [
    /\b(pmu\s*(?:brows?|brow|augenbrauen|lips?|lippen|eyeliner|wimpernkranz)?(?:\s+angebot)?)\b/i,
    /\b((?:powder|ombre|ombr[eé]|microblading|brows?|brow)\s*(?:brows?|augenbrauen|angebot)?)\b/i,
    /\b(lash(?:es)?|wimpern(?:lifting)?|browlifting|lashlifting)\b/i,
    /\b(nageldesign|nägel|naegel|maniküre|manikuere|pediküre|pedikuere|fußpflege|fusspflege)\b/i,
    /\b(kosmetik|gesichtsbehandlung|beratung|kontrolle|auffüllen|auffuellen)\b/i,
  ];
  for (const pattern of servicePatterns) {
    const match = q.match(pattern)?.[1]?.trim();
    const cleaned = match ? cleanSmartServiceCandidate(match) : "";
    if (cleaned) return cleaned;
  }

  // Bei mehreren "für"-Treffern den letzten sinnvollen Kandidaten nehmen.
  const matches = Array.from(q.matchAll(/\b(?:für|fuer)\s+(.+?)(?:\s+eintragen\b|\s+anlegen\b|\s+erstellen\b|,|$)/gi));
  for (const match of matches.reverse()) {
    const candidate = cleanSmartServiceCandidate(match[1] || "");
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (/\b(pmu|brows?|brow|microblading|powder|lash|lashes|nägel|naegel|fußpflege|fusspflege|kosmetik|beratung|auffüllen|auffuellen)\b/i.test(lower)) {
      return candidate;
    }
  }

  return "";
}

function serviceScore(serviceName: string, query: string, fullQuestion: string) {
  const service = normalizeServiceText(serviceName);
  const q = normalizeServiceText(query);
  const full = normalizeServiceText(fullQuestion);
  if (!service) return 0;

  let score = 0;
  if (q && service === q) score += 100;
  if (q && service.includes(q)) score += 70;
  if (q && q.includes(service)) score += 60;

  const serviceTokens = service.split(" ").filter((t) => t.length >= 3);
  const queryTokens = q.split(" ").filter((t) => t.length >= 3);
  const fullTokens = new Set(full.split(" ").filter((t) => t.length >= 3));

  for (const token of serviceTokens) {
    if (queryTokens.includes(token)) score += 18;
    if (fullTokens.has(token)) score += 10;
  }

  // PMU/Brows ist bei euch ein wichtiger Shortcut: "PMU brows" soll passende PMU-Brow-Dienstleistungen finden.
  if (/\bpmu\b/.test(full) && /\bpmu\b/.test(service)) score += 35;
  if (/\b(brow|brows|augenbrauen)\b/.test(full) && /\b(brow|brows|augenbrauen)\b/.test(service)) score += 35;
  if (/\bangebot\b/.test(service) && /\bangebot\b/.test(full)) score += 10;

  return score;
}

async function lookupServiceByName(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  serviceName: string,
  tenantId: string,
  fullQuestion = ""
) {
  const query = serviceName.trim();
  const normalizedQuery = normalizeServiceText(query || fullQuestion);
  if (!normalizedQuery || normalizedQuery.length < 2) return null;

  let builder = supabase
    .from("services")
    .select("id, name, default_price_cents, duration_minutes, buffer_minutes, tenant_id")
    .eq("is_active", true)
    .limit(200);

  if (tenantId) builder = builder.eq("tenant_id", tenantId);

  const { data } = await builder;
  const rows = data ?? [];
  if (!rows.length) return null;

  const ranked = rows
    .map((row: any) => ({ row, score: serviceScore(row?.name ?? "", query, fullQuestion || query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 25 ? ranked[0].row : null;
}

async function lookupSmartAppointmentPreview(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  question: string,
  context: AssistantContext
): Promise<DbLookupResult> {
  const customerName = extractSmartCustomerName(question);
  const serviceName = extractSmartServiceName(question);
  const date = parseSmartDate(question);
  const time = parseSmartTime(question);
  const startsAt = date.isoDate && time ? `${date.isoDate}T${time}:00` : "";

  const customerLookup = customerName ? await lookupCustomers(supabase, `Kunde ${customerName}`) : null;
  const customerRows = Array.isArray(customerLookup?.data) ? (customerLookup?.data as any[]).filter((row) => row?.id) : [];
  const service = await lookupServiceByName(supabase, serviceName, context.tenantId, question);
  const selectedCustomer = customerRows[0] ?? null;
  const person = firstJoin(selectedCustomer?.person) as any;
  const tenant = firstJoin(selectedCustomer?.tenant) as any;

  const summary = [
    "Ich habe eine Smart-Action vorbereitet — noch nichts wurde gespeichert.",
    "",
    `Kunde: ${selectedCustomer ? `${person?.full_name ?? customerName} · ${tenant?.display_name ?? "Profil gefunden"}` : `${customerName || "nicht erkannt"} · noch nicht als Kundenprofil gefunden`}`,
    `Termin: ${date.input || "Datum fehlt"}${time ? ` um ${time}` : " · Uhrzeit fehlt"}`,
    `Leistung: ${service ? service.name : serviceName || "nicht erkannt"}`,
    `Behandler: ${context.userLabel || "eingeloggter Benutzer"}`,
    "",
    selectedCustomer
      ? "Der Kunde ist bereits vorhanden. Du kannst den Termin-Flow öffnen oder bewusst einen neuen Kundendatensatz mit gleichem Namen anlegen."
      : "Lege zuerst den Kunden an. Danach kannst du den Termin mit denselben Angaben vorbereiten.",
  ].join("\n");

  return {
    kind: "smart_action",
    title: "Smart Action vorbereiten",
    summary,
    actionIntent: "smart_appointment_create",
    queryName: customerName,
    data: {
      type: "appointment_create_preview",
      customerName,
      serviceName,
      dateInput: date.input,
      isoDate: date.isoDate,
      time,
      startsAt,
      service,
      customers: customerRows.slice(0, 4),
      selectedCustomer,
      currentUserLabel: context.userLabel,
      tenantId: context.tenantId,
    },
  };
}

function wantsSmartAppointmentFollowUp(question: string) {
  const q = question.toLowerCase();
  const mentionsAppointment = q.includes("termin") || q.includes("eintragen") || q.includes("kalender");
  const referencesPrevious =
    q.includes("für den kunden") ||
    q.includes("fuer den kunden") ||
    q.includes("diesen kunden") ||
    q.includes("dem kunden") ||
    q.includes("dafür") ||
    q.includes("dafuer") ||
    q.includes("damit") ||
    q.includes("nur einen") ||
    q.includes("nur ein") ||
    q.includes("bestehenden") ||
    q.includes("vorhandenen");
  return mentionsAppointment && referencesPrevious;
}

function dateInputToIso(dateInput: string) {
  const match = dateInput.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

function parsePreviousSmartContext(messages: IncomingMessage[]) {
  const assistantText = previousAssistantTexts(messages).slice(0, 6).join("\n");
  if (!assistantText.trim()) return null;

  const customerFromSmart = assistantText.match(/Kunde:\s*([^\n·\-]+(?:\s+[^\n·\-]+)?)(?:\s*[·\-]|\n|$)/i)?.[1]?.trim();
  const customerFromCreated = assistantText.match(/Kunde angelegt:\s*([^\n]+)/i)?.[1]?.trim();
  const customerName = (customerFromCreated || customerFromSmart || "").replace(/\s+/g, " ").trim();

  const appointmentLine = assistantText.match(/Termin:\s*([^\n]+)/i)?.[1]?.trim() || assistantText.match(/Nächster Schritt:\s*Termin\s+([^\n]+)/i)?.[1]?.trim() || "";
  const dateInput = appointmentLine.match(/\b(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})\b/)?.[1]?.trim() || "";
  const time = appointmentLine.match(/\b(?:um\s*)?(\d{1,2}:\d{2})\b/)?.[1]?.trim() || "";
  const isoDate = dateInputToIso(dateInput);

  let serviceName = assistantText.match(/Leistung:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const serviceFromNextStep = assistantText.match(/für\s+([^\n.]+?)\s+vorbereiten/i)?.[1]?.trim() || "";
  if (!serviceName && serviceFromNextStep) serviceName = serviceFromNextStep;
  serviceName = serviceName.replace(/nicht erkannt/gi, "").trim();

  if (!customerName && !dateInput && !time && !serviceName) return null;
  return { customerName, dateInput, isoDate, time, serviceName };
}

async function lookupSmartAppointmentFollowUp(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  question: string,
  messages: IncomingMessage[],
  context: AssistantContext
): Promise<DbLookupResult | null> {
  if (!wantsSmartAppointmentFollowUp(question)) return null;
  const previous = parsePreviousSmartContext(messages);
  if (!previous?.customerName) return null;

  const customerLookup = await lookupCustomers(supabase, `Kunde ${previous.customerName}`);
  const customerRows = Array.isArray(customerLookup?.data) ? (customerLookup.data as any[]).filter((row) => row?.id) : [];
  const selectedCustomer = customerRows[0] ?? null;
  const person = firstJoin(selectedCustomer?.person) as any;
  const tenant = firstJoin(selectedCustomer?.tenant) as any;
  const service = await lookupServiceByName(supabase, previous.serviceName, context.tenantId);
  const serviceName = service?.name || previous.serviceName;
  const startsAt = previous.isoDate && previous.time ? `${previous.isoDate}T${previous.time}:00` : "";

  const summary = [
    "Alles klar — ich nutze den letzten vorbereiteten Auftrag weiter.",
    "",
    `Kunde: ${selectedCustomer ? `${person?.full_name ?? previous.customerName} · ${tenant?.display_name ?? "Profil gefunden"}` : `${previous.customerName} · noch nicht als Kundenprofil gefunden`}`,
    `Termin: ${previous.dateInput || "Datum fehlt"}${previous.time ? ` um ${previous.time}` : " · Uhrzeit fehlt"}`,
    `Leistung: ${serviceName || "nicht erkannt"}`,
    `Behandler: ${context.userLabel || "eingeloggter Benutzer"}`,
    "",
    selectedCustomer
      ? "Du kannst jetzt direkt den Termin-Flow für diesen vorhandenen Kunden öffnen."
      : "Ich finde zu diesem Namen noch kein Kundenprofil. Lege zuerst den Kunden an, danach kannst du den Termin vorbereiten.",
  ].join("\n");

  return {
    kind: "smart_action",
    title: "Folgeaktion vorbereiten",
    summary,
    actionIntent: "smart_appointment_create",
    queryName: previous.customerName,
    data: {
      type: "appointment_create_preview",
      customerName: previous.customerName,
      serviceName,
      dateInput: previous.dateInput,
      isoDate: previous.isoDate,
      time: previous.time,
      startsAt,
      service,
      customers: customerRows.slice(0, 4),
      selectedCustomer,
      currentUserLabel: context.userLabel,
      tenantId: context.tenantId,
      followUp: true,
    },
  };
}


function wantsTextDraft(question: string) {
  const q = question.toLowerCase();
  return /\b(formuliere|formulieren|schreibe|schreib|verfasse|text|nachricht|whatsapp|sms|e-mail|email|mail|antwort|remindertext|erinnerungstext)\b/i.test(q);
}

function wantsProcessAdvice(question: string) {
  const q = question.toLowerCase();
  return /\b(ablauf|erkläre|erklaere|wie funktioniert|stornieren|storno|ändern|aendern|versand|verschicken|drucken|bezahlt|rechnung bis versand)\b/i.test(q);
}

function extractRecipientHint(question: string) {
  const quoted = extractQuotedName(question);
  if (quoted) return quoted;

  const match = question.match(/(?:kunde[n]?|an|für|fuer)\s+([a-zA-ZÀ-ž0-9 .'-]{2,80})(?:,|\.|;|\?| dass| der| die| das| wegen| über| ueber| erinnert| erinnern| termin| rechnung|$)/i);
  if (match?.[1]) {
    return match[1]
      .replace(/\b(dass|sein|seine|seinen|nächster|naechster|termin|ansteht|erinnert|wird|soll)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const cleaned = removeCommonWords(question);
  return cleaned;
}

function extractMessagePurpose(question: string) {
  const q = question.toLowerCase();
  if (q.includes("termin") && (q.includes("erinner") || q.includes("ansteht") || q.includes("bald"))) return "termin_reminder";
  if (q.includes("rechnung") && (q.includes("offen") || q.includes("zahlen") || q.includes("zahlung"))) return "invoice_reminder";
  if (q.includes("absage") || q.includes("verschieben")) return "appointment_change";
  if (q.includes("danke") || q.includes("besuch")) return "thank_you";
  return "general";
}

async function enrichRecipientName(question: string) {
  const hint = extractRecipientHint(question);
  if (!hint || hint.length < 2) return "";

  try {
    const supabase = await supabaseServer();
    const lookup = await lookupCustomers(supabase, `Kunde ${hint}`);
    const rows = Array.isArray(lookup.data) ? lookup.data as any[] : [];
    const first = rows.find((row: any) => row?.id) || rows[0];
    const person = firstJoin(first?.person) as any;
    return String(person?.full_name || hint).trim();
  } catch {
    return hint;
  }
}

function localTextDraft(question: string, recipientName = "") {
  const purpose = extractMessagePurpose(question);
  const name = recipientName || extractRecipientHint(question) || "";
  const greetingName = name ? ` ${name}` : "";

  if (purpose === "termin_reminder") {
    return [
      "Klar — hier ist ein freundlicher Vorschlag:",
      "",
      `Hallo${greetingName},`,
      "ich wollte dich kurz freundlich daran erinnern, dass dein nächster Termin bei uns ansteht.",
      "Falls sich bei dir etwas geändert hat oder du den Termin verschieben möchtest, gib uns bitte rechtzeitig Bescheid.",
      "Wir freuen uns auf dich!",
      "",
      "Liebe Grüße",
      "Magnifique Beauty Institut",
      "",
      "Kürzer für WhatsApp:",
      `Hallo${greetingName}, kurze Erinnerung an deinen nächsten Termin bei uns. Falls du etwas ändern möchtest, melde dich bitte rechtzeitig. Wir freuen uns auf dich!`,
    ].join("\n");
  }

  if (purpose === "invoice_reminder") {
    return [
      "Natürlich — hier ist ein höflicher Zahlungserinnerungs-Text:",
      "",
      `Hallo${greetingName},`,
      "ich wollte dich kurz darauf hinweisen, dass zu deinem letzten Besuch noch eine Rechnung offen ist.",
      "Bitte begleiche den Betrag bei Gelegenheit. Falls du Fragen dazu hast, melde dich jederzeit gerne.",
      "",
      "Liebe Grüße",
      "Magnifique Beauty Institut",
    ].join("\n");
  }

  if (purpose === "appointment_change") {
    return [
      "Gerne — hier ist ein freundlicher Text:",
      "",
      `Hallo${greetingName},`,
      "kein Problem, wir können deinen Termin gerne verschieben.",
      "Schick uns bitte kurz ein paar passende Zeitfenster, dann suchen wir dir einen neuen Termin heraus.",
      "",
      "Liebe Grüße",
      "Magnifique Beauty Institut",
    ].join("\n");
  }

  if (purpose === "thank_you") {
    return [
      "Gerne — hier ist ein netter Nachfass-Text:",
      "",
      `Hallo${greetingName},`,
      "vielen Dank für deinen Besuch bei uns. Wir hoffen, du bist mit dem Ergebnis zufrieden.",
      "Wenn du Fragen zur Pflege oder zum weiteren Ablauf hast, melde dich jederzeit gerne.",
      "",
      "Liebe Grüße",
      "Magnifique Beauty Institut",
    ].join("\n");
  }

  return [
    "Gerne — hier ist ein freundlicher Vorschlag:",
    "",
    `Hallo${greetingName},`,
    "ich melde mich kurz bei dir wegen deines Anliegens bei Magnifique Beauty Institut.",
    "Falls du Fragen hast oder etwas ändern möchtest, gib uns bitte einfach kurz Bescheid.",
    "",
    "Liebe Grüße",
    "Magnifique Beauty Institut",
  ].join("\n");
}

function localProcessAdvice(question: string, context: AssistantContext) {
  const q = question.toLowerCase();

  if (q.includes("rechnung") && q.includes("versand")) {
    return [
      "Der saubere Ablauf von Rechnung bis Versand ist:",
      "",
      "1. Kunde oder Termin auswählen.",
      "2. Rechnung bzw. Checkout öffnen und die Leistungen prüfen.",
      "3. Zahlungsart wählen: Bar oder Karte.",
      "4. Zahlung abschließen.",
      "5. Beleg/Fiscal Receipt erzeugen.",
      "6. Belegdetails öffnen und Versand/Druck prüfen.",
      "7. Per E-Mail, WhatsApp-Vorlage oder Drucker weitergeben.",
      "",
      "Wichtig: Nach dem Beleg/Fiscal Receipt nicht mehr einfach ändern. Wenn fachlich etwas falsch ist, sauber stornieren und neu erstellen.",
    ].join("\n");
  }

  if (q.includes("storn") || q.includes("ändern") || q.includes("aendern")) {
    return [
      "Als Faustregel:",
      "",
      "Ändern ist okay, solange der Vorgang noch ein Entwurf ist oder noch kein finaler Beleg erzeugt wurde.",
      "",
      "Stornieren ist besser, wenn:",
      "• bereits ein Beleg/Fiscal Receipt erzeugt wurde,",
      "• der Betrag falsch ist,",
      "• die falsche Leistung verrechnet wurde,",
      "• der falsche Kunde verwendet wurde,",
      "• der Vorgang bereits bezahlt oder versendet wurde.",
      "",
      "Kurz gesagt: Vor dem finalen Beleg korrigieren. Nach dem finalen Beleg sauber stornieren und neu machen.",
    ].join("\n");
  }

  return localUsefulFallback(question, context);
}

async function lookupPractitionerTenant(supabase: Awaited<ReturnType<typeof supabaseServer>>, practitionerName: string) {
  if (!practitionerName) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("tenant_id, calendar_tenant_id, full_name")
    .ilike("full_name", `%${practitionerName}%`)
    .limit(1);
  const row = data?.[0] as any;
  return row?.tenant_id || row?.calendar_tenant_id || null;
}

async function lookupCustomers(supabase: Awaited<ReturnType<typeof supabaseServer>>, question: string): Promise<DbLookupResult> {
  const search = normalizeSearchTerm(question, "customer");

  if (!search || search.length < 2) {
    return { kind: "customers", title: "Kundensuche", summary: "Bitte gib für die Kundensuche einen Namen, eine Telefonnummer oder eine E-Mail-Adresse an.", data: [] };
  }

  const terms = search.split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2).slice(0, 4);
  const primaryTerm = terms[0] || search;
  const safePrimary = escapeLike(primaryTerm);

  const { data: personsByFirstTerm, error: personError } = await supabase
    .from("persons")
    .select("id, full_name, phone, email, birthday")
    .or(`full_name.ilike.%${safePrimary}%,phone.ilike.%${safePrimary}%,email.ilike.%${safePrimary}%`)
    .limit(80);

  let persons = (personsByFirstTerm ?? []) as any[];

  if (personError || persons.length === 0) {
    const { data: fallbackPersons } = await supabase
      .from("persons")
      .select("id, full_name, phone, email, birthday")
      .order("created_at", { ascending: false })
      .limit(600);
    persons = (fallbackPersons ?? []) as any[];
  }

  const needle = search.toLowerCase();
  const filteredPersons = persons
    .filter((person: any) => {
      const haystack = [person?.full_name, person?.phone, person?.email].join(" ").toLowerCase();
      if (haystack.includes(needle)) return true;
      return terms.every((term) => haystack.includes(term.toLowerCase()));
    })
    .slice(0, 12);

  const personIds = filteredPersons.map((person: any) => String(person.id ?? "").trim()).filter(Boolean);

  if (personIds.length === 0) {
    return {
      kind: "customers",
      title: "Kundensuche",
      summary: `Ich habe keinen Kunden zu „${search}“ gefunden. Prüfe Schreibweise, Telefonnummer oder E-Mail.`,
      data: [],
    };
  }

  const { data: profileRows } = await supabase
    .from("customer_profiles")
    .select(`
      id,
      created_at,
      tenant_id,
      person_id,
      tenant:tenants ( id, display_name )
    `)
    .in("person_id", personIds)
    .order("created_at", { ascending: false })
    .limit(30);

  const personById = new Map(filteredPersons.map((person: any) => [String(person.id), person]));
  const rows = ((profileRows ?? []) as any[]).map((profile: any) => ({
    ...profile,
    person: personById.get(String(profile.person_id)) ?? null,
  }));

  if (rows.length === 0) {
    const personLines = filteredPersons.slice(0, 8).map((person: any, index: number) => {
      return `${index + 1}. ${person?.full_name ?? "Unbekannt"}${person?.phone ? ` · ${person.phone}` : ""}${person?.email ? ` · ${person.email}` : ""} · noch kein Kundenprofil gefunden`;
    });

    return {
      kind: "customers",
      title: "Kundensuche",
      summary: [`Ich habe ${filteredPersons.length} Person(en) gefunden, aber kein zugeordnetes Kundenprofil:`, "", ...personLines].join("\n"),
      data: filteredPersons.map((person: any) => ({ id: null, person_id: person.id, person })),
    };
  }

  const lines = rows.slice(0, 10).map((row: any, index: number) => {
    const person = row.person as any;
    const tenant = firstJoin(row.tenant) as any;
    const label = `${person?.full_name ?? "Unbekannt"}${tenant?.display_name ? ` · ${tenant.display_name}` : ""}${person?.phone ? ` · ${person.phone}` : ""}${person?.email ? ` · ${person.email}` : ""}`;
    return `${index + 1}. [${label}](/customers/${row.id})`;
  });

  return {
    kind: "customers",
    title: "Kundensuche",
    summary: [`Ich habe ${rows.length} passende Kundenprofile gefunden:`, "", ...lines].join("\n"),
    data: rows,
  };
}

async function lookupAppointments(supabase: Awaited<ReturnType<typeof supabaseServer>>, question: string): Promise<DbLookupResult> {
  const { start, end, label } = detectDateRange(question);
  const practitionerName = detectPractitionerName(question);
  const tenantId = await lookupPractitionerTenant(supabase, practitionerName);

  let query = supabase
    .from("appointments")
    .select(`
      id,
      start_at,
      end_at,
      notes_internal,
      tenant_id,
      person_id,
      service_id,
      service_name_snapshot,
      service_duration_minutes_snapshot,
      tenant:tenants ( display_name ),
      person:persons ( full_name, phone, email )
    `)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at", { ascending: true })
    .limit(30);

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  const rowsRaw = data ?? [];

  if (error) {
    return { kind: "appointments", title: "Terminsuche", summary: `Ich konnte die Termine gerade nicht lesen: ${error.message}`, data: [] };
  }

  const who = practitionerName ? ` für ${practitionerName[0].toUpperCase()}${practitionerName.slice(1)}` : "";
  if (rowsRaw.length === 0) {
    return { kind: "appointments", title: "Terminsuche", summary: `Ich habe ${label}${who} keine Termine gefunden.`, data: [] };
  }

  const tenantIds = Array.from(new Set(rowsRaw.map((row: any) => String(row?.tenant_id ?? "").trim()).filter(Boolean)));
  const personIds = Array.from(new Set(rowsRaw.map((row: any) => String(row?.person_id ?? "").trim()).filter(Boolean)));
  const customerProfileByPair = new Map<string, string>();

  if (tenantIds.length > 0 && personIds.length > 0) {
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("id, tenant_id, person_id")
      .in("tenant_id", tenantIds)
      .in("person_id", personIds);

    for (const profile of profiles ?? []) {
      const key = `${profile.tenant_id}:${profile.person_id}`;
      if (!customerProfileByPair.has(key)) customerProfileByPair.set(key, profile.id);
    }
  }

  const rows = rowsRaw.map((row: any) => ({
    ...row,
    customer_profile_id: customerProfileByPair.get(`${row.tenant_id}:${row.person_id}`) ?? null,
  }));

  const lines = rows.map((row: any, index: number) => {
    const person = firstJoin(row.person) as any;
    const tenant = firstJoin(row.tenant) as any;
    const service = row.service_name_snapshot || "ohne Dienstleistung";
    return `${index + 1}. ${formatDateTime(row.start_at)} · ${person?.full_name ?? "Unbekannter Kunde"} · ${service}${tenant?.display_name ? ` · ${tenant.display_name}` : ""}`;
  });

  return {
    kind: "appointments",
    title: "Terminsuche",
    summary: [`Ich habe ${rows.length} Termine ${label}${who} gefunden:`, "", ...lines].join("\n"),
    data: rows,
  };
}


function safeParseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readNestedString(source: any, paths: string[][]) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }
      current = current[key];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number" && Number.isFinite(current)) return String(current);
  }
  return "";
}

function receiptCustomerName(row: any) {
  const payload = safeParseJson(row?.receipt_payload_canonical);
  return readNestedString(payload, [
    ["customer_name"],
    ["person_name"],
    ["customer", "full_name"],
    ["customer", "name"],
    ["buyer", "name"],
  ]);
}

function receiptProviderName(row: any) {
  const payload = safeParseJson(row?.receipt_payload_canonical);
  return readNestedString(payload, [
    ["provider_name"],
    ["tenant_display_name"],
    ["tenant_name"],
    ["tenant", "display_name"],
  ]);
}

function matchesSearchText(value: string, search: string) {
  const haystack = value.toLowerCase();
  const terms = search.toLowerCase().split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2);
  if (haystack.includes(search.toLowerCase())) return true;
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

async function lookupReceiptByPayloadText(supabase: Awaited<ReturnType<typeof supabaseServer>>, search: string): Promise<DbLookupResult | null> {
  const normalizedSearch = search.trim();
  if (normalizedSearch.length < 2) return null;

  const { data, error } = await supabase
    .from("fiscal_receipts")
    .select(`
      id,
      tenant_id,
      sales_order_id,
      payment_id,
      receipt_number,
      receipt_type,
      status,
      issued_at,
      currency_code,
      turnover_value_cents,
      receipt_payload_canonical,
      created_at
    `)
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return null;

  const matching = ((data ?? []) as any[]).filter((row) => {
    const customerName = receiptCustomerName(row);
    const canonical = typeof row?.receipt_payload_canonical === "string" ? row.receipt_payload_canonical : JSON.stringify(row?.receipt_payload_canonical ?? "");
    return matchesSearchText(customerName, normalizedSearch) || matchesSearchText(canonical, normalizedSearch);
  });

  if (matching.length === 0) return null;

  const latestReceipt = matching[0];
  const customerName = receiptCustomerName(latestReceipt) || normalizedSearch;
  const providerName = receiptProviderName(latestReceipt);
  const amount = typeof latestReceipt.turnover_value_cents === "number" ? latestReceipt.turnover_value_cents / 100 : Number(latestReceipt.turnover_value_cents ?? 0) / 100;

  return {
    kind: "invoice",
    title: "Letzte Rechnung",
    summary: [
      `Ich habe ${matching.length} Beleg(e) zu „${normalizedSearch}“ gefunden. Der letzte Beleg ist:`,
      "",
      `Kunde: ${customerName}`,
      providerName ? `Behandler/Firma: ${providerName}` : "",
      `Belegnummer: ${latestReceipt.receipt_number ?? "—"}`,
      `Typ/Status: ${latestReceipt.receipt_type ?? "—"} · ${latestReceipt.status ?? "—"}`,
      `Datum: ${formatDateTime(latestReceipt.issued_at ?? latestReceipt.created_at)}`,
      `Betrag: ${formatMoney(amount, latestReceipt.currency_code ?? "EUR")}`,
      latestReceipt.id ? `Beleg öffnen: [${latestReceipt.receipt_number ?? "Details"}](/rechnungen?receipt=${latestReceipt.id})` : "",
    ].filter(Boolean).join("\n"),
    data: { receipts: matching },
  };
}

async function lookupLastInvoice(supabase: Awaited<ReturnType<typeof supabaseServer>>, question: string): Promise<DbLookupResult> {
  const search = normalizeSearchTerm(question, "invoice");

  if (!search || search.length < 2) {
    return { kind: "invoice", title: "Letzte Rechnung", summary: "Bitte gib an, für welchen Kunden ich die letzte Rechnung suchen soll.", data: null };
  }

  const customerLookup = await lookupCustomers(supabase, `Kunde ${search}`);
  const customers = Array.isArray(customerLookup.data) ? customerLookup.data as any[] : [];
  const profileIds = customers.map((row) => String(row?.id ?? "").trim()).filter(Boolean);
  const personIds = customers.map((row) => String(row?.person_id ?? row?.person?.id ?? "").trim()).filter(Boolean);
  const customerIdsToTry = Array.from(new Set([...profileIds, ...personIds]));

  const personName = (() => {
    const first = customers[0];
    const person = firstJoin(first?.person) as any;
    return person?.full_name || search;
  })();

  if (customerIdsToTry.length === 0) {
    const receiptByPayload = await lookupReceiptByPayloadText(supabase, search);
    if (receiptByPayload) return receiptByPayload;

    return {
      kind: "invoice",
      title: "Letzte Rechnung",
      summary: `Ich habe keinen Kunden zu „${search}“ gefunden und auch keinen Beleg gefunden, dessen gespeicherter Kundenname dazu passt.`,
      data: null
    };
  }

  const { data: salesOrders, error: salesOrderError } = await supabase
    .from("sales_orders")
    .select("id, tenant_id, customer_id, appointment_id, status, currency_code, subtotal_gross, tax_total, grand_total, created_at")
    .in("customer_id", customerIdsToTry)
    .order("created_at", { ascending: false })
    .limit(20);

  if (salesOrderError) {
    return { kind: "invoice", title: "Letzte Rechnung", summary: `Ich konnte die Rechnungen gerade nicht lesen: ${salesOrderError.message}`, data: { customers } };
  }

  const salesOrderRows = (salesOrders ?? []) as any[];
  const salesOrderIds = salesOrderRows.map((row: any) => row.id).filter(Boolean);

  if (salesOrderIds.length === 0) {
    const receiptByPayload = await lookupReceiptByPayloadText(supabase, search);
    if (receiptByPayload) return receiptByPayload;

    return {
      kind: "invoice",
      title: "Letzte Rechnung",
      summary: [
        `Ich habe ${customers.length} Kundenprofil(e) zu „${search}“ gefunden, aber keine Sales Order/Rechnung dazu.`,
        "",
        "Gefundene Kunden:",
        ...customers.slice(0, 6).map((row: any, index: number) => {
          const person = firstJoin(row?.person) as any;
          const tenant = firstJoin(row?.tenant) as any;
          return `${index + 1}. ${person?.full_name ?? "Unbekannt"}${tenant?.display_name ? ` · ${tenant.display_name}` : ""}${row?.id ? ` · [Profil öffnen](/customers/${row.id})` : ""}`;
        }),
      ].join("\n"),
      data: { customers, triedCustomerIds: customerIdsToTry },
    };
  }

  const { data: receipts } = await supabase
    .from("fiscal_receipts")
    .select("id, tenant_id, sales_order_id, payment_id, receipt_number, receipt_type, status, issued_at, currency_code, turnover_value_cents, created_at")
    .in("sales_order_id", salesOrderIds)
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  const latestReceipt = (receipts ?? [])[0] as any;
  const latestSalesOrder = salesOrderRows[0] as any;

  if (!latestReceipt) {
    return {
      kind: "invoice",
      title: "Letzte Rechnung",
      summary: [
        `Ich habe für ${personName} eine Verkaufserfassung gefunden, aber noch keinen Fiscal Receipt dazu.`,
        `Sales Order: ${latestSalesOrder?.id}`,
        `Status: ${latestSalesOrder?.status ?? "—"}`,
        `Betrag: ${formatMoney(latestSalesOrder?.grand_total ?? 0, latestSalesOrder?.currency_code ?? "EUR")}`,
      ].join("\n"),
      data: { customers, salesOrders: salesOrderRows, receipts: [] },
    };
  }

  const receiptSalesOrder = salesOrderRows.find((row: any) => String(row.id) === String(latestReceipt.sales_order_id)) ?? latestSalesOrder;
  const amount = typeof latestReceipt.turnover_value_cents === "number" ? latestReceipt.turnover_value_cents / 100 : Number(latestReceipt.turnover_value_cents ?? 0) / 100;

  return {
    kind: "invoice",
    title: "Letzte Rechnung",
    summary: [
      `Die letzte Rechnung/der letzte Beleg für ${personName}:`,
      "",
      `Belegnummer: ${latestReceipt.receipt_number ?? "—"}`,
      `Typ/Status: ${latestReceipt.receipt_type ?? "—"} · ${latestReceipt.status ?? "—"}`,
      `Datum: ${formatDateTime(latestReceipt.issued_at ?? latestReceipt.created_at)}`,
      `Betrag: ${formatMoney(amount, latestReceipt.currency_code ?? receiptSalesOrder?.currency_code ?? "EUR")}`,
      `Sales Order: ${latestReceipt.sales_order_id ?? "—"}`,
      latestReceipt.id ? `Beleg öffnen: [${latestReceipt.receipt_number ?? "Details"}](/rechnungen?receipt=${latestReceipt.id})` : "",
    ].filter(Boolean).join("\n"),
    data: { customers, salesOrders: salesOrderRows, receipts },
  };
}



type ParsedCustomerLink = {
  id: string;
  label: string;
  name: string;
  tenantLabel: string;
};

type ParsedReceiptLink = {
  id: string;
  label: string;
  receiptNumber: string;
};

function previousAssistantTexts(messages: IncomingMessage[]) {
  return [...messages]
    .slice(0, -1)
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .reverse();
}

function previousUserTexts(messages: IncomingMessage[]) {
  return [...messages]
    .slice(0, -1)
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .reverse();
}

function parseCustomerLinksFromText(text: string): ParsedCustomerLink[] {
  const results: ParsedCustomerLink[] = [];
  const regex = /\[([^\]]+)\]\(\/customers\/([a-zA-Z0-9_-]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawLabel = match[1].replace(/^Profil öffnen:\s*/i, "").replace(/^Kundenprofil öffnen:\s*/i, "").trim();
    const id = match[2].trim();
    if (!rawLabel || !id) continue;
    const parts = rawLabel.split(/\s*[·|-]\s*/).map((part) => part.trim()).filter(Boolean);
    results.push({ id, label: rawLabel, name: parts[0] || rawLabel, tenantLabel: parts.slice(1).join(" · ") });
  }
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.id}|${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseReceiptLinksFromText(text: string): ParsedReceiptLink[] {
  const results: ParsedReceiptLink[] = [];
  const regex = /\[([^\]]+)\]\(\/rechnungen\?receipt=([a-zA-Z0-9_-]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawLabel = match[1].replace(/^Beleg öffnen:\s*/i, "").trim();
    const id = match[2].trim();
    if (!rawLabel || !id) continue;
    results.push({ id, label: rawLabel, receiptNumber: rawLabel });
  }
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.id}|${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectOrdinalIndex(question: string) {
  const q = question.toLowerCase();
  if (/\b(1|erste|ersten|erstes|erster)\b/.test(q)) return 0;
  if (/\b(2|zweite|zweiten|zweites|zweiter)\b/.test(q)) return 1;
  if (/\b(3|dritte|dritten|drittes|dritter)\b/.test(q)) return 2;
  if (/\b(4|vierte|vierten|viertes|vierter)\b/.test(q)) return 3;
  return null;
}

function rowsFromParsedCustomerLinks(links: ParsedCustomerLink[]) {
  return links.map((link) => ({
    id: link.id,
    person_id: null,
    person: { full_name: link.name },
    tenant: { display_name: link.tenantLabel },
  }));
}

function wantsSelectionFollowUp(question: string) {
  return /\b(dafür|dafuer|diesen|diese|dieses|nimm|nehme|öffne|oeffne|auswahl|profil|ersten|erste|zweiten|zweite|dritten|dritte)\b/i.test(question)
    || Boolean(detectPractitionerName(question));
}

function inferFollowUpIntent(question: string, messages: IncomingMessage[]): "appointment_create" | "invoice_create" | "open_profile" | "open_receipt" | null {
  const q = question.toLowerCase();
  if (/\b(öffne|oeffne).*\b(beleg|rechnung)\b|\b(beleg|rechnung).*\b(öffnen|oeffnen)\b/i.test(q)) return "open_receipt";
  if (/\b(öffne|oeffne).*\b(profil|kunde)\b|\b(profil|kunde).*\b(öffnen|oeffnen)\b/i.test(q)) return "open_profile";
  if (wantsAppointments(question)) return "appointment_create";
  if (wantsInvoice(question)) return "invoice_create";
  const lastUser = previousUserTexts(messages)[0]?.toLowerCase() ?? "";
  if (lastUser.includes("termin")) return "appointment_create";
  if (lastUser.includes("rechnung") || lastUser.includes("beleg")) return "invoice_create";
  return null;
}

function resolveFollowUpFromConversation(messages: IncomingMessage[], question: string): DbLookupResult | null {
  if (!wantsSelectionFollowUp(question)) return null;
  const mergedText = previousAssistantTexts(messages).slice(0, 4).join("\n\n");
  const customerLinks = parseCustomerLinksFromText(mergedText);
  const receiptLinks = parseReceiptLinksFromText(mergedText);
  const intent = inferFollowUpIntent(question, messages);
  const q = question.toLowerCase();

  if ((intent === "open_receipt" || (receiptLinks.length > 0 && /\b(beleg|rechnung)\b/i.test(q) && /\b(öffne|oeffne|öffnen|oeffnen)\b/i.test(q))) && receiptLinks.length > 0) {
    const ordinal = detectOrdinalIndex(question);
    const receipt = receiptLinks[ordinal ?? 0];
    return {
      kind: "invoice",
      title: "Belegauswahl",
      summary: `Ich habe den letzten gefundenen Beleg ausgewählt: [${receipt.receiptNumber}](/rechnungen?receipt=${receipt.id})`,
      data: { receipts: [{ id: receipt.id, receipt_number: receipt.receiptNumber }] },
      actionIntent: "invoice_lookup",
    };
  }

  if (customerLinks.length === 0) return null;
  const ordinal = detectOrdinalIndex(question);
  const practitionerName = detectPractitionerName(question);
  const directTerm = removeCommonWords(question).toLowerCase();
  let selected = customerLinks;
  if (ordinal !== null && customerLinks[ordinal]) selected = [customerLinks[ordinal]];
  else if (practitionerName) {
    const byPractitioner = customerLinks.filter((link) => link.label.toLowerCase().includes(practitionerName));
    if (byPractitioner.length > 0) selected = byPractitioner;
  } else if (directTerm) {
    const byText = customerLinks.filter((link) => link.label.toLowerCase().includes(directTerm));
    if (byText.length > 0) selected = byText;
  }

  const rows = rowsFromParsedCustomerLinks(selected.slice(0, 6));
  if (rows.length === 0) return null;
  const linkedLines = selected.slice(0, 6).map((link, index) => `${index + 1}. [${link.label}](/customers/${link.id})`);

  if (intent === "appointment_create") {
    return { kind: "customers", title: "Auswahl aus vorheriger Suche", summary: [rows.length === 1 ? "Ich habe aus der vorherigen Suche dieses Profil ausgewählt:" : `Ich habe ${rows.length} passende Profile aus der vorherigen Suche ausgewählt:`, "", ...linkedLines, "", rows.length === 1 ? "Du kannst dafür jetzt einen Termin vorbereiten." : "Wähle das passende Profil aus, um einen Termin vorzubereiten."].join("\n"), data: rows, actionIntent: "appointment_create" };
  }
  if (intent === "invoice_create") {
    return { kind: "customers", title: "Auswahl aus vorheriger Suche", summary: [rows.length === 1 ? "Ich habe aus der vorherigen Suche dieses Profil ausgewählt:" : `Ich habe ${rows.length} passende Profile aus der vorherigen Suche ausgewählt:`, "", ...linkedLines, "", rows.length === 1 ? "Du kannst dafür jetzt eine Rechnung vorbereiten." : "Wähle das passende Profil aus, um eine Rechnung vorzubereiten."].join("\n"), data: rows, actionIntent: "invoice_create" };
  }
  return { kind: "customers", title: "Auswahl aus vorheriger Suche", summary: [rows.length === 1 ? "Ich habe aus der vorherigen Suche dieses Profil ausgewählt:" : `Ich habe ${rows.length} passende Profile aus der vorherigen Suche ausgewählt:`, "", ...linkedLines].join("\n"), data: rows };
}

async function lookupDbData(question: string, messages: IncomingMessage[] = [], context?: AssistantContext): Promise<DbLookupResult> {
  const q = question.toLowerCase();
  const followUp = resolveFollowUpFromConversation(messages, question);
  if (followUp) return followUp;

  const supabase = await supabaseServer();

  if (context) {
    const smartFollowUp = await lookupSmartAppointmentFollowUp(supabase, question, messages, context);
    if (smartFollowUp) return smartFollowUp;
  }

  if (context && wantsSmartAppointmentCreate(question)) {
    return lookupSmartAppointmentPreview(supabase, question, context);
  }

  if (wantsInvoice(question) && wantsPreparedAction(question)) {
    const name = removeCommonWords(question) || normalizeSearchTerm(question, "invoice") || question;
    const customerLookup = await lookupCustomers(supabase, `Kunde ${name}`);
    const customers = Array.isArray(customerLookup.data) ? customerLookup.data as any[] : [];
    const realCustomers = customers.filter((row: any) => row?.id);

    if (realCustomers.length > 0) {
      return {
        ...customerLookup,
        actionIntent: "invoice_create",
        queryName: name,
        summary: [
          `Ich habe ${realCustomers.length} Kundenprofil(e) zu „${name}“ gefunden.`,
          "",
          "Wähle das passende Profil aus. Danach kannst du eine Rechnung vorbereiten.",
          "",
          ...String(customerLookup.summary || "").split("\n").slice(2),
        ].filter(Boolean).join("\n"),
      };
    }

    const invoiceLookup = await lookupLastInvoice(supabase, `Rechnungen von ${name}`);
    if (invoiceLookup.kind !== "none" && invoiceLookup.data) {
      return {
        ...invoiceLookup,
        actionIntent: "invoice_create",
        queryName: name,
        summary: [
          `Ich habe kein Kundenprofil zu „${name}“ gefunden, mit dem ich eine neue Rechnung vorbereiten kann.`,
          "",
          "Ich habe aber bestehende Belege/Rechnungen dazu gefunden:",
          "",
          invoiceLookup.summary,
        ].join("\n"),
      };
    }

    return { ...customerLookup, actionIntent: "invoice_create", queryName: name };
  }

  if (wantsAppointments(question) && wantsPreparedAction(question)) {
    const name = removeCommonWords(question) || normalizeSearchTerm(question, "customer") || question;
    const customerLookup = await lookupCustomers(supabase, `Kunde ${name}`);
    return { ...customerLookup, actionIntent: "appointment_create", queryName: name };
  }

  if (wantsAppointments(question) && !q.includes("morgen") && !q.includes("heute") && !q.includes("gestern") && /\b(für|fuer|mit)\b/i.test(q)) {
    const name = removeCommonWords(question) || normalizeSearchTerm(question, "customer") || question;
    const customerLookup = await lookupCustomers(supabase, `Kunde ${name}`);
    const customers = Array.isArray(customerLookup.data) ? customerLookup.data as any[] : [];
    const realCustomers = customers.filter((row: any) => row?.id);

    if (realCustomers.length > 0) {
      return {
        ...customerLookup,
        actionIntent: "appointment_create",
        queryName: name,
        summary: [
          `Ich habe ${realCustomers.length} Kundenprofil(e) zu „${name}“ gefunden.`,
          "",
          "Wähle das passende Profil aus. Danach kannst du einen Termin vorbereiten.",
          "",
          ...String(customerLookup.summary || "").split("\n").slice(2),
        ].filter(Boolean).join("\n"),
      };
    }

    return { ...customerLookup, actionIntent: "appointment_create", queryName: name };
  }

  if (wantsInvoice(question) && (q.includes("letzte") || q.includes("letzten") || q.includes("von") || q.includes("zu"))) {
    const invoiceLookup = await lookupLastInvoice(supabase, question);
    return { ...invoiceLookup, actionIntent: "invoice_lookup", queryName: normalizeSearchTerm(question, "invoice") };
  }

  if (wantsAppointments(question) && (q.includes("morgen") || q.includes("heute") || q.includes("termin") || q.includes("termine"))) {
    return lookupAppointments(supabase, question);
  }

  if (wantsCustomerSearch(question)) {
    const clean = normalizeSearchTerm(question, "customer");
    if (clean || extractQuotedName(question)) return lookupCustomers(supabase, question);
  }

  return { kind: "none", title: "Keine Datenabfrage", summary: "", data: null };
}

function receiptCustomerNameFromLookupData(data: any) {
  const receipt = Array.isArray(data?.receipts) ? data.receipts[0] : null;
  return receiptCustomerName(receipt) || "";
}

function customerActionLabel(row: any) {
  const person = firstJoin(row?.person) as any;
  const tenant = firstJoin(row?.tenant) as any;
  const name = String(person?.full_name ?? "Kunde").trim();
  const tenantLabel = tenant?.display_name ? String(tenant.display_name).trim() : "";
  return tenantLabel ? `${name} · ${tenantLabel}` : name;
}

function buildActionsFromLookup(dbLookup: DbLookupResult): AssistantAction[] {
  const actions: AssistantAction[] = [];
  const intent = dbLookup.actionIntent;


  if (dbLookup.kind === "smart_action") {
    const data = (dbLookup.data ?? {}) as any;
    const selected = data?.selectedCustomer;
    const selectedProfileId = String(selected?.id ?? "").trim();
    const customerName = String(data?.customerName ?? "").trim();
    const serviceName = String(data?.service?.name ?? data?.serviceName ?? "").trim();
    const serviceId = String(data?.service?.id ?? "").trim();
    const isoDate = String(data?.isoDate ?? "").trim();
    const time = String(data?.time ?? "").trim();
    const startsAt = String(data?.startsAt ?? "").trim();

    const appointmentParams = new URLSearchParams();
    appointmentParams.set("assistantAction", "newAppointment");
    if (selectedProfileId) appointmentParams.set("customerProfileId", selectedProfileId);
    if (customerName) appointmentParams.set("customerName", customerName);
    if (isoDate) appointmentParams.set("date", isoDate);
    if (time) appointmentParams.set("time", time);
    if (startsAt) appointmentParams.set("start", startsAt);
    if (serviceId) appointmentParams.set("serviceId", serviceId);
    if (serviceName) appointmentParams.set("serviceQuery", serviceName);

    if (selectedProfileId) {
      const isFocusedAppointmentIntent = Boolean(data?.followUp);

      actions.push({
        label: "Termin erstellen",
        href: "#",
        tone: "primary",
        requiresConfirm: true,
        confirmLabel: `Termin wirklich erstellen${customerName ? ` für ${customerName}` : ""}${isoDate && time ? ` am ${String(data?.dateInput ?? isoDate)} um ${time}` : ""}?`,
        assistantAction: {
          type: "create_appointment",
          payload: { customerProfileId: selectedProfileId, customerName, dateInput: String(data?.dateInput ?? "").trim(), isoDate, time, serviceName, serviceId },
        },
      });
      actions.push({ label: "Termin-Flow öffnen", href: `/calendar?${appointmentParams.toString()}`, tone: "secondary" });

      if (!isFocusedAppointmentIntent) {
        actions.push({ label: "Kundenprofil öffnen", href: `/customers/${encodeURIComponent(selectedProfileId)}`, tone: "secondary" });

        if (customerName) {
          actions.push({
            label: `Neuen Kunden trotzdem anlegen: ${customerName}`,
            href: "#",
            tone: "secondary",
            requiresConfirm: true,
            confirmLabel: `Achtung: ${customerName} ist bereits vorhanden. Trotzdem einen neuen Kundendatensatz mit gleichem Namen anlegen?`,
            assistantAction: {
              type: "create_customer",
              payload: {
                customerName,
                dateInput: String(data?.dateInput ?? "").trim(),
                isoDate,
                time,
                serviceName,
                serviceId,
                forceNewPerson: true,
              },
            },
          });
        }
      }
    } else {
      const newCustomerParams = new URLSearchParams();
      if (customerName) newCustomerParams.set("name", customerName);
      newCustomerParams.set("assistantNext", "appointment");
      if (isoDate) newCustomerParams.set("date", isoDate);
      if (time) newCustomerParams.set("time", time);
      if (serviceName) newCustomerParams.set("serviceQuery", serviceName);
      actions.push({
        label: `Kunden anlegen${customerName ? `: ${customerName}` : ""}`,
        href: `/customers/new?${newCustomerParams.toString()}`,
        tone: "primary",
        requiresConfirm: true,
        confirmLabel: `Kunden wirklich anlegen${customerName ? `: ${customerName}` : ""}`,
        assistantAction: {
          type: "create_customer",
          payload: {
            customerName,
            dateInput: String(data?.dateInput ?? "").trim(),
            isoDate,
            time,
            serviceName,
            serviceId,
          },
        },
      });
      actions.push({ label: "Kalender öffnen", href: `/calendar?${appointmentParams.toString()}`, tone: "secondary" });
    }

    if (selectedProfileId && !data?.followUp) {
      actions.push({ label: "Kalender öffnen", href: "/calendar", tone: "secondary" });
    }
  }

  if (dbLookup.kind === "customers" && Array.isArray(dbLookup.data)) {
    const rows = (dbLookup.data as any[]).filter((row) => row?.id).slice(0, 4);

    if (intent === "appointment_create") {
      for (const row of rows) {
        const profileId = String(row?.id ?? "").trim();
        const label = customerActionLabel(row);
        actions.push({
          label: `Termin vorbereiten: ${label}`,
          href: `/calendar?customerProfileId=${encodeURIComponent(profileId)}&assistantAction=newAppointment`,
          tone: actions.length === 0 ? "primary" : "secondary",
        });
      }
      for (const row of rows.slice(0, 3)) {
        const profileId = String(row?.id ?? "").trim();
        const label = customerActionLabel(row);
        actions.push({ label: `Profil öffnen: ${label}`, href: `/customers/${profileId}`, tone: "secondary" });
      }
    } else if (intent === "invoice_create") {
      for (const row of rows) {
        const profileId = String(row?.id ?? "").trim();
        const label = customerActionLabel(row);
        actions.push({
          label: `Rechnung vorbereiten: ${label}`,
          href: `/rechnungen?invoice=1&customerProfileId=${encodeURIComponent(profileId)}&assistantAction=newInvoice`,
          tone: actions.length === 0 ? "primary" : "secondary",
        });
      }
      for (const row of rows.slice(0, 3)) {
        const profileId = String(row?.id ?? "").trim();
        const label = customerActionLabel(row);
        actions.push({ label: `Profil öffnen: ${label}`, href: `/customers/${profileId}`, tone: "secondary" });
      }
    } else {
      for (const row of rows.slice(0, 3)) {
        const profileId = String(row?.id ?? "").trim();
        const label = customerActionLabel(row);
        actions.push({ label: `Profil öffnen: ${label}`, href: `/customers/${profileId}`, tone: actions.length === 0 ? "primary" : "secondary" });
      }

      const firstProfileId = String(rows[0]?.id ?? "").trim();
      if (firstProfileId) {
        actions.push({ label: "Termin vorbereiten", href: `/calendar?customerProfileId=${encodeURIComponent(firstProfileId)}&assistantAction=newAppointment`, tone: "secondary" });
        actions.push({ label: "Rechnung vorbereiten", href: `/rechnungen?invoice=1&customerProfileId=${encodeURIComponent(firstProfileId)}&assistantAction=newInvoice`, tone: "secondary" });
      }
    }
  }

  if (dbLookup.kind === "invoice") {
    const data = dbLookup.data as any;
    const receipt = Array.isArray(data?.receipts) ? data.receipts[0] : null;
    const receiptId = String(receipt?.id ?? "").trim();
    const receiptNumber = String(receipt?.receipt_number ?? "Beleg").trim();
    if (receiptId) {
      actions.push({ label: `Beleg öffnen: ${receiptNumber}`, href: `/rechnungen?receipt=${encodeURIComponent(receiptId)}`, tone: "primary" });
      actions.push({ label: "Rechnungen öffnen", href: "/rechnungen", tone: "secondary" });
    }

    const customers = Array.isArray(data?.customers) ? data.customers : [];
    const customer = customers.find((row: any) => row?.id);
    const customerId = String(customer?.id ?? "").trim();
    if (customerId) {
      const label = customerActionLabel(customer);
      if (intent === "invoice_create") {
        actions.push({ label: `Rechnung vorbereiten: ${label}`, href: `/rechnungen?invoice=1&customerProfileId=${encodeURIComponent(customerId)}&assistantAction=newInvoice`, tone: receiptId ? "secondary" : "primary" });
      }
      actions.push({ label: `Kundenprofil öffnen: ${label}`, href: `/customers/${customerId}`, tone: receiptId ? "secondary" : "primary" });
    } else if (intent === "invoice_create") {
      const fallbackName = receiptCustomerNameFromLookupData(data) || dbLookup.queryName || "Kunde";
      actions.push({ label: `Neuen Kunden anlegen: ${fallbackName}`, href: `/customers/new?name=${encodeURIComponent(fallbackName)}`, tone: receiptId ? "secondary" : "primary" });
    }
  }

  if (dbLookup.kind === "appointments" && Array.isArray(dbLookup.data)) {
    const rows = (dbLookup.data as any[]).filter((row) => row?.id).slice(0, 6);

    for (const row of rows) {
      const appointmentId = String(row?.id ?? "").trim();
      const startAt = String(row?.start_at ?? "").trim();
      const dateParam = startAt ? startAt.slice(0, 10) : "";
      const person = firstJoin(row?.person) as any;
      const tenant = firstJoin(row?.tenant) as any;
      const customerName = String(person?.full_name ?? "Termin").trim();
      const tenantName = String(tenant?.display_name ?? "").trim();
      const label = tenantName ? `${customerName} · ${tenantName}` : customerName;
      const calendarHref = `/calendar?appointmentId=${encodeURIComponent(appointmentId)}${dateParam ? `&date=${encodeURIComponent(dateParam)}` : ""}`;

      actions.push({
        label: `Termin öffnen: ${label}`,
        href: calendarHref,
        tone: actions.length === 0 ? "primary" : "secondary",
      });

      actions.push({
        label: `Bearbeiten: ${label}`,
        href: `${calendarHref}&assistantAction=editAppointment`,
        tone: "secondary",
      });

      const customerProfileId = String(row?.customer_profile_id ?? "").trim();
      if (customerProfileId) {
        actions.push({
          label: `Kunde öffnen: ${customerName}`,
          href: `/customers/${encodeURIComponent(customerProfileId)}`,
          tone: "secondary",
        });
      }
    }
  }

  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.label}|${action.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}
function localUsefulFallback(question: string, context: AssistantContext, dbLookup?: DbLookupResult) {
  if (dbLookup && dbLookup.kind !== "none" && dbLookup.summary) return dbLookup.summary;

  const q = question.toLowerCase();
  const page = context.pageLabel || "CRM";
  const snapshot = context.pageSnapshot;

  if (page === "Dashboard" && (q.includes("heute") || q.includes("machen") || q.includes("prüfen") || q.includes("dashboard"))) {
    return [
      `Für dein Dashboard würde ich jetzt diese Reihenfolge nehmen${context.userLabel ? `, ${context.userLabel}` : ""}:`,
      "",
      "1. Termine heute prüfen: Wer kommt, welcher Behandler ist zuständig, gibt es Lücken oder Überschneidungen?",
      "2. Offene Reminder abarbeiten: zuerst die dringendsten, dann die restlichen.",
      "3. Warteliste prüfen: Falls kurzfristig ein Slot frei ist, direkt passende Kunden kontaktieren.",
      "4. Rechnungen prüfen: offene Kartenzahlungen, heutige Belege und Monatsstand kontrollieren.",
      snapshot ? `\nIch sehe auf der aktuellen Seite zusätzlich diesen Kontext: ${snapshot.slice(0, 700)}` : "",
    ].filter(Boolean).join("\n");
  }

  if (page === "Rechnungen" || q.includes("rechnung")) {
    return [
      "Für eine neue Rechnung gehst du so vor:",
      "",
      "1. Im Rechnungsbereich auf „+ Rechnung“ klicken.",
      "2. Kunde auswählen oder über den Termin-/Checkout-Flow abrechnen.",
      "3. Dienstleistung bzw. Positionen prüfen.",
      "4. Zahlungsart wählen: Bar oder Karte.",
      "5. Zahlung abschließen und danach den Beleg bzw. Fiscal Receipt erzeugen.",
      "6. Danach kannst du Details öffnen, drucken oder den Versand vorbereiten.",
    ].join("\n");
  }

  if (page === "Kalender" || q.includes("termin")) {
    return [
      "Für Termine ist der sauberste Ablauf:",
      "",
      "1. freien Slot im Kalender wählen oder „+ Neuer Termin“ nutzen.",
      "2. Kunde auswählen.",
      "3. Dienstleistung wählen, damit Dauer und Preis korrekt vorbelegt sind.",
      "4. Behandler und Kalender prüfen.",
      "5. Termin speichern.",
    ].join("\n");
  }

  if (page === "Kunden" || q.includes("kunde")) {
    return [
      "Im Kundenbereich solltest du vor allem sauber halten:",
      "",
      "1. Name, Telefon und E-Mail korrekt erfassen.",
      "2. Kundenprofil pro Behandler prüfen, damit Notizen beim richtigen Tenant landen.",
      "3. Fotos und Dokumente direkt beim Kunden ablegen.",
      "4. Bei Erstkunden den Fragebogen starten und unterschreiben lassen.",
    ].join("\n");
  }

  return [
    `Ich helfe dir auf der Seite „${page}“.`,
    "",
    "Stell mir am besten eine konkrete Frage, zum Beispiel:",
    "• „Finde Kunde Berbec“",
    "• „Zeige mir die letzte Rechnung von Bauer“",
    "• „Welche Termine hat Alexandra morgen?“",
  ].join("\n");
}

async function resolveCurrentTenantId(supabase: Awaited<ReturnType<typeof supabaseServer>>, context: AssistantContext) {
  const explicitTenantId = cleanText(context.tenantId, 120);
  if (explicitTenantId) return explicitTenantId;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return "";

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  return cleanText((profile as any)?.tenant_id, 120);
}

async function getTenantLabel(supabase: Awaited<ReturnType<typeof supabaseServer>>, tenantId: string) {
  if (!tenantId) return "";
  const { data } = await supabase
    .from("tenants")
    .select("id, display_name")
    .eq("id", tenantId)
    .maybeSingle();
  return cleanText((data as any)?.display_name, 120) || "aktueller Behandler";
}

async function findExistingPersonByName(supabase: Awaited<ReturnType<typeof supabaseServer>>, customerName: string) {
  const name = customerName.trim();
  if (!name) return null;
  const first = name.split(/\s+/)[0] || name;
  const { data } = await supabase
    .from("persons")
    .select("id, full_name, phone, email, birthday")
    .ilike("full_name", `%${escapeLike(first)}%`)
    .limit(25);

  const normalized = name.toLowerCase();
  return ((data ?? []) as any[]).find((row) => String(row?.full_name ?? "").trim().toLowerCase() === normalized) ?? null;
}

function smartAppointmentHref(profileId: string, payload: AssistantWriteAction["payload"]) {
  const params = new URLSearchParams();
  params.set("assistantAction", "newAppointment");
  if (profileId) params.set("customerProfileId", profileId);
  if (payload.customerName) params.set("customerName", payload.customerName);
  if (payload.isoDate) params.set("date", payload.isoDate);
  if (payload.time) params.set("time", payload.time);
  if (payload.isoDate && payload.time) params.set("start", `${payload.isoDate}T${payload.time}:00`);
  if (payload.serviceId) params.set("serviceId", payload.serviceId);
  if (payload.serviceName) params.set("serviceQuery", payload.serviceName);
  return `/calendar?${params.toString()}`;
}

async function createCustomerFromAssistantAction(body: any, context: AssistantContext) {
  const action = body?.assistantAction as AssistantWriteAction | undefined;
  if (!action || action.type !== "create_customer") return null;

  const payload = action.payload ?? {};
  const customerName = cleanText(payload.customerName, 140);
  if (!customerName || customerName.length < 2) {
    return NextResponse.json({ answer: "Ich kann den Kunden noch nicht anlegen, weil kein sauberer Kundenname erkannt wurde.", lookup: { kind: "none", title: "Kundenanlage", summary: "", data: null }, actions: [] });
  }

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ answer: "Bitte melde dich zuerst an. Danach kann GIGI den Kunden anlegen.", lookup: { kind: "none", title: "Kundenanlage", summary: "", data: null }, actions: [] }, { status: 401 });
  }

  const tenantId = await resolveCurrentTenantId(supabase, context);
  if (!tenantId) {
    return NextResponse.json({ answer: "Ich kann den Kunden noch nicht anlegen, weil kein aktueller Behandler/Tenant erkannt wurde.", lookup: { kind: "none", title: "Kundenanlage", summary: "", data: null }, actions: [] });
  }

  const existingLookup = await lookupCustomers(supabase, `Kunde ${customerName}`);
  const existingRows = Array.isArray(existingLookup.data) ? existingLookup.data as any[] : [];
  const existingProfile = existingRows.find((row) => {
    const person = firstJoin(row?.person) as any;
    const sameName = String(person?.full_name ?? "").trim().toLowerCase() === customerName.toLowerCase();
    const sameTenant = String(row?.tenant_id ?? "") === tenantId;
    return sameName && sameTenant && row?.id;
  });

  if (existingProfile?.id && !payload.forceNewPerson) {
    const person = firstJoin(existingProfile.person) as any;
    const label = String(person?.full_name ?? customerName).trim();
    const appointmentHref = smartAppointmentHref(String(existingProfile.id), payload);
    return NextResponse.json({
      answer: `Den Kunden ${label} gibt es bereits im aktuellen Behandler-Profil. Ich habe nichts doppelt angelegt.`,
      lookup: { kind: "customers", title: "Kunde bereits vorhanden", summary: "", data: [existingProfile] },
      actions: [
        { label: `Profil öffnen: ${label}`, href: `/customers/${encodeURIComponent(String(existingProfile.id))}`, tone: "primary" },
        { label: `Termin vorbereiten: ${label}`, href: appointmentHref, tone: "secondary" },
      ],
    });
  }

  let person = payload.forceNewPerson ? null : await findExistingPersonByName(supabase, customerName);
  if (!person) {
    const { data: insertedPerson, error: personError } = await supabase
      .from("persons")
      .insert({ full_name: customerName })
      .select("id, full_name, phone, email, birthday")
      .single();

    if (personError || !insertedPerson) {
      return NextResponse.json({ answer: `Ich konnte den Kunden ${customerName} nicht anlegen: ${personError?.message ?? "Unbekannter Fehler"}`, lookup: { kind: "none", title: "Kundenanlage fehlgeschlagen", summary: "", data: null }, actions: [] });
    }
    person = insertedPerson;
  }

  const { data: insertedProfile, error: profileError } = await supabase
    .from("customer_profiles")
    .insert({ tenant_id: tenantId, person_id: person.id })
    .select("id, created_at, tenant_id, person_id")
    .single();

  if (profileError || !insertedProfile) {
    return NextResponse.json({ answer: `Die Person ${customerName} wurde gefunden/angelegt, aber das Kundenprofil konnte nicht erstellt werden: ${profileError?.message ?? "Unbekannter Fehler"}`, lookup: { kind: "none", title: "Kundenprofil fehlgeschlagen", summary: "", data: null }, actions: [] });
  }

  const tenantLabel = await getTenantLabel(supabase, tenantId);
  const row = { ...insertedProfile, person, tenant: { id: tenantId, display_name: tenantLabel } };
  const appointmentHref = smartAppointmentHref(String(insertedProfile.id), payload);
  const cleanService = cleanText(payload.serviceName, 120);
  const dateText = [cleanText(payload.dateInput, 40), cleanText(payload.time, 10)].filter(Boolean).join(" um ");

  return NextResponse.json({
    answer: [
      `Kunde angelegt: ${customerName}`,
      tenantLabel ? `Profil: ${tenantLabel}` : "",
      dateText || cleanService ? "" : "Du kannst jetzt im Kundenprofil weiterarbeiten.",
      dateText ? `Nächster Schritt: Termin ${dateText}${cleanService ? ` für ${cleanService}` : ""} vorbereiten.` : "",
    ].filter(Boolean).join("\n"),
    lookup: { kind: "customers", title: "Kunde angelegt", summary: "", data: [row] },
    actions: [
      { label: `Profil öffnen: ${customerName}`, href: `/customers/${encodeURIComponent(String(insertedProfile.id))}`, tone: "primary" },
      { label: `Termin vorbereiten: ${customerName}`, href: appointmentHref, tone: "secondary" },
    ],
  });
}

async function createAppointmentFromAssistantAction(body: any, context: AssistantContext) {
  const action = body?.assistantAction as AssistantWriteAction | undefined;
  if (!action || action.type !== "create_appointment") return null;

  const payload = action.payload ?? {};
  const customerProfileId = cleanText(payload.customerProfileId, 120);
  const customerName = cleanText(payload.customerName, 140) || "Kunde";
  const isoDate = cleanText(payload.isoDate, 20);
  const time = cleanText(payload.time, 10);
  const serviceNameFromPayload = cleanText(payload.serviceName, 160);
  const serviceIdFromPayload = cleanText(payload.serviceId, 120);

  if (!customerProfileId) return NextResponse.json({ answer: "Ich kann den Termin noch nicht erstellen, weil kein eindeutiges Kundenprofil ausgewählt wurde.", lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] });
  if (!isoDate || !time) return NextResponse.json({ answer: "Ich kann den Termin noch nicht erstellen, weil Datum oder Uhrzeit fehlen.", lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] });

  const start = new Date(`${isoDate}T${time}:00`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ answer: "Ich kann den Termin noch nicht erstellen, weil Datum oder Uhrzeit ungültig sind.", lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] });

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ answer: "Bitte melde dich zuerst an. Danach kann GIGI den Termin erstellen.", lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] }, { status: 401 });

  const tenantId = await resolveCurrentTenantId(supabase, context);
  if (!tenantId) return NextResponse.json({ answer: "Ich kann den Termin noch nicht erstellen, weil kein aktueller Behandler/Tenant erkannt wurde.", lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] });

  const { data: profileRow, error: profileError } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id, person:persons(id, full_name, phone, email), tenant:tenants(id, display_name)")
    .eq("id", customerProfileId)
    .maybeSingle();
  if (profileError || !profileRow?.id) return NextResponse.json({ answer: `Ich konnte das Kundenprofil für ${customerName} nicht laden.`, lookup: { kind: "none", title: "Termin erstellen", summary: "", data: null }, actions: [] });

  const person = firstJoin((profileRow as any).person) as any;
  const tenant = firstJoin((profileRow as any).tenant) as any;
  const assignedTenantId = cleanText((profileRow as any).tenant_id, 120) || tenantId;

  let service: any = null;
  if (serviceIdFromPayload) {
    const { data } = await supabase.from("services").select("id, name, default_price_cents, duration_minutes, buffer_minutes, tenant_id").eq("id", serviceIdFromPayload).maybeSingle();
    service = data;
  }
  if (!service && serviceNameFromPayload) service = await lookupServiceByName(supabase, serviceNameFromPayload, assignedTenantId, serviceNameFromPayload);

  const title = cleanText(service?.name, 160) || serviceNameFromPayload || "Termin";
  const durationMinutes = Number(service?.duration_minutes ?? 60);
  const safeDurationMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
  const end = new Date(start.getTime() + safeDurationMinutes * 60 * 1000);
  const reminderAt = new Date(start.getTime() - 24 * 60 * 60 * 1000);

  const insertPayload: Record<string, any> = {
    tenant_id: assignedTenantId,
    person_id: (profileRow as any).person_id,
    service_id: service?.id ?? null,
    service_name_snapshot: service?.name ?? null,
    service_price_cents_snapshot: service?.default_price_cents ?? null,
    service_duration_minutes_snapshot: service?.duration_minutes ?? null,
    service_buffer_minutes_snapshot: service?.buffer_minutes ?? null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reminder_at: reminderAt.toISOString(),
    reminder_sent_at: null,
    notes_internal: ["GIGI-TERMIN: ja", `Titel: ${title}`, service?.name ? `Dienstleistung: ${service.name}` : "", `Erstellt von: ${context.userLabel || "GIGI"}`].filter(Boolean).join("\n"),
  };

  let { data: inserted, error } = await supabase.from("appointments").insert({ ...insertPayload, status: "scheduled" }).select("id, start_at, end_at, tenant_id, person_id, service_name_snapshot").single();
  if (error && String(error.message ?? "").toLowerCase().includes("status")) {
    const retry = await supabase.from("appointments").insert(insertPayload).select("id, start_at, end_at, tenant_id, person_id, service_name_snapshot").single();
    inserted = retry.data;
    error = retry.error;
  }
  if (error || !inserted?.id) return NextResponse.json({ answer: `Ich konnte den Termin nicht erstellen: ${error?.message ?? "Unbekannter Fehler"}`, lookup: { kind: "none", title: "Termin erstellen fehlgeschlagen", summary: "", data: null }, actions: [] });

  const dateLabel = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(start);
  const customerLabel = cleanText(person?.full_name, 160) || customerName;
  const tenantLabel = cleanText(tenant?.display_name, 120) || context.userLabel || "Behandler";
  return NextResponse.json({
    answer: [`Termin wurde erstellt: ${customerLabel}`, `Zeit: ${dateLabel}`, `Leistung: ${title}`, `Behandler: ${tenantLabel}`, "", "Hinweis: Der Termin wurde im CRM-Kalender gespeichert. Die direkte Google-Anbindung für GIGI-Aktionen prüfen wir als nächsten separaten Schritt."].join("\n"),
    lookup: { kind: "appointments", title: "Termin erstellt", summary: "", data: [{ ...inserted, person: { full_name: customerLabel }, tenant: { display_name: tenantLabel }, service_name_snapshot: title }] },
    actions: [
      { label: "Kalender öffnen", href: `/calendar?date=${encodeURIComponent(isoDate)}`, tone: "primary" },
      { label: `Kundenprofil öffnen: ${customerLabel}`, href: `/customers/${encodeURIComponent(customerProfileId)}`, tone: "secondary" },
    ],
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const body = await request.json();
    const messages = cleanMessages(body?.messages);
    const context: AssistantContext = {
      pageLabel: cleanText(body?.context?.pageLabel, 80) || "App",
      pagePath: cleanText(body?.context?.pagePath, 160),
      userLabel: cleanText(body?.context?.userLabel, 120),
      tenantId: cleanText(body?.context?.tenantId, 120),
      pageSnapshot: cleanText(body?.context?.pageSnapshot, 3500),
    };

    const appointmentActionResponse = await createAppointmentFromAssistantAction(body, context);
    if (appointmentActionResponse) return appointmentActionResponse;

    const actionResponse = await createCustomerFromAssistantAction(body, context);
    if (actionResponse) return actionResponse;

    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht übergeben." }, { status: 400 });
    }

    const lastQuestion = getLastUserQuestion(messages);

    if (wantsTextDraft(lastQuestion)) {
      const recipientName = await enrichRecipientName(lastQuestion);

      if (!apiKey) {
        return NextResponse.json({
          answer: localTextDraft(lastQuestion, recipientName),
          lookup: { kind: "none", title: "Textmodus", summary: "", data: null },
          actions: [],
        });
      }

      const textPrompt = [
        "Du bist GIGI, die interne Studio-KI für ein Beauty-CRM.",
        "Der Benutzer will einen Text, keine Datenabfrage und keine Aktion.",
        "Antworte auf Deutsch, freundlich, praxistauglich und direkt kopierbar.",
        "Gib bei Kommunikationsnachrichten am besten eine kurze Hauptversion und optional eine kurze WhatsApp-Version.",
        "Behaupte nicht, dass du etwas versendet oder geändert hast.",
        recipientName ? `Erkannter Kunde/Empfänger: ${recipientName}.` : "Kein eindeutiger Empfänger erkannt.",
        `Benutzerfrage: ${lastQuestion}`,
      ].filter(Boolean).join("\n");

      try {
        const textResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            max_output_tokens: 650,
            input: [{ role: "developer", content: textPrompt }],
          }),
        });

        if (textResponse.ok) {
          const textData = await textResponse.json();
          const answer = extractAssistantText(textData);
          return NextResponse.json({
            answer: answer || localTextDraft(lastQuestion, recipientName),
            lookup: { kind: "none", title: "Textmodus", summary: "", data: null },
            actions: [],
          });
        }
      } catch {
        // local fallback below
      }

      return NextResponse.json({
        answer: localTextDraft(lastQuestion, recipientName),
        lookup: { kind: "none", title: "Textmodus", summary: "", data: null },
        actions: [],
      });
    }

    if (wantsProcessAdvice(lastQuestion) && !wantsAppointments(lastQuestion) && !wantsCustomerSearch(lastQuestion)) {
      return NextResponse.json({
        answer: localProcessAdvice(lastQuestion, context),
        lookup: { kind: "none", title: "Ablaufhilfe", summary: "", data: null },
        actions: [],
      });
    }

    const dbLookup = await lookupDbData(lastQuestion, messages, context).catch((error) => ({
      kind: "none" as const,
      title: "Datenabfrage fehlgeschlagen",
      summary: `Ich konnte die CRM-Daten gerade nicht lesen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      data: null,
    }));

    if (dbLookup.kind !== "none" && dbLookup.summary) {
      return NextResponse.json({ answer: dbLookup.summary, lookup: dbLookup, actions: buildActionsFromLookup(dbLookup) });
    }

    if (!apiKey) {
      return NextResponse.json({ answer: localUsefulFallback(lastQuestion, context, dbLookup), lookup: dbLookup, actions: buildActionsFromLookup(dbLookup) });
    }

    const systemPrompt = [
      "Du bist der interne Studio-Assistent für ein Beauty-CRM namens Magnifique CRM.",
      "Antworte immer auf Deutsch.",
      "Version 2.9: Du unterscheidest Datenabfrage, Textmodus, Smart Actions und Folgeaktionen. Wenn der Benutzer nach einem vorbereiteten Auftrag sagt „für den Kunden“, „nur Termin“ oder „dafür“, nutzt du den letzten Smart-Action-Kontext weiter statt eine neue Kundensuche aus dem ganzen Satz zu machen. Kunden können nur nach expliziter Button-Bestätigung angelegt werden. Termine/Rechnungen werden weiterhin nur vorbereitet.",
      "Du hast keinen Schreibzugriff. Behaupte niemals, du hättest Termine, Kunden, Rechnungen oder Daten geändert.",
      "Gib keine langen allgemeinen Erklärungen. Antworte praktisch und direkt.",
      `Aktuelle Seite: ${context.pageLabel}${context.pagePath ? ` (${context.pagePath})` : ""}.`,
      context.userLabel ? `Eingeloggter Benutzer: ${context.userLabel}.` : "",
      context.tenantId ? `Aktuelle tenant_id: ${context.tenantId}.` : "",
      context.pageSnapshot ? `Sichtbarer Seitenkontext aus der App:\n${context.pageSnapshot}` : "Kein sichtbarer Seitenkontext übergeben.",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_output_tokens: 800,
        input: [
          { role: "developer", content: systemPrompt },
          ...messages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        answer: localUsefulFallback(lastQuestion, context, dbLookup),
        lookup: dbLookup,
        actions: buildActionsFromLookup(dbLookup),
        providerWarning: mapProviderError(response.status, errorText),
      });
    }

    const data = await response.json();
    const answer = extractAssistantText(data);
    return NextResponse.json({ answer: answer || localUsefulFallback(lastQuestion, context, dbLookup), lookup: dbLookup, actions: buildActionsFromLookup(dbLookup) });
  } catch (error) {
    return NextResponse.json({
      answer: "Ich konnte die Anfrage gerade nicht sauber verarbeiten. Bitte versuche es erneut oder stelle die Frage etwas konkreter.",
      error: error instanceof Error ? error.message : "Unbekannter Fehler im Studio-Assistenten.",
    });
  }
}
