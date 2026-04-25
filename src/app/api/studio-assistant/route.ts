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

type AssistantAction = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
  requiresConfirm?: boolean;
  confirmLabel?: string;
};

type DbLookupResult = {
  kind: "none" | "customers" | "appointments" | "invoice";
  title: string;
  summary: string;
  data: unknown;
  actionIntent?: "customer_search" | "appointment_create" | "invoice_create" | "invoice_lookup";
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
    .replace(/\b(zeige|zeig|mir|bitte|die|der|das|den|dem|eine|einen|einer|von|für|zu|mit|hat|haben|suche|such|finde|finden|kunde|kunden|rechnung|rechnungen|letzte|letzten|termin|termine|morgen|heute|gestern|wann|welche|welcher|alexandra|raluca|radu|barbara|erstellen|anlegen|machen|vorbereiten|neu|neue|neuen)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function detectDateRange(question: string) {
  const q = question.toLowerCase();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
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
  return q.includes("termin") || q.includes("termine") || q.includes("kalender") || q.includes("morgen") || q.includes("heute");
}

function wantsInvoice(question: string) {
  const q = question.toLowerCase();
  return q.includes("rechnung") || q.includes("rechnungen") || q.includes("beleg") || q.includes("receipt") || q.includes("fiscal");
}

function wantsPreparedAction(question: string) {
  const q = question.toLowerCase();
  return /\b(erstellen|anlegen|machen|vorbereiten|neu|neue|neuen)\b/i.test(q);
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
  const rows = data ?? [];

  if (error) {
    return { kind: "appointments", title: "Terminsuche", summary: `Ich konnte die Termine gerade nicht lesen: ${error.message}`, data: [] };
  }

  const who = practitionerName ? ` für ${practitionerName[0].toUpperCase()}${practitionerName.slice(1)}` : "";
  if (rows.length === 0) {
    return { kind: "appointments", title: "Terminsuche", summary: `Ich habe ${label}${who} keine Termine gefunden.`, data: [] };
  }

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

async function lookupDbData(question: string, messages: IncomingMessage[] = []): Promise<DbLookupResult> {
  const q = question.toLowerCase();
  const followUp = resolveFollowUpFromConversation(messages, question);
  if (followUp) return followUp;

  const supabase = await supabaseServer();

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
          requiresConfirm: true,
          confirmLabel: "Termin wirklich vorbereiten",
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
          requiresConfirm: true,
          confirmLabel: "Rechnung wirklich vorbereiten",
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
        actions.push({ label: "Termin vorbereiten", href: `/calendar?customerProfileId=${encodeURIComponent(firstProfileId)}&assistantAction=newAppointment`, tone: "secondary", requiresConfirm: true, confirmLabel: "Termin wirklich vorbereiten" });
        actions.push({ label: "Rechnung vorbereiten", href: `/rechnungen?invoice=1&customerProfileId=${encodeURIComponent(firstProfileId)}&assistantAction=newInvoice`, tone: "secondary", requiresConfirm: true, confirmLabel: "Rechnung wirklich vorbereiten" });
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
        actions.push({ label: `Rechnung vorbereiten: ${label}`, href: `/rechnungen?invoice=1&customerProfileId=${encodeURIComponent(customerId)}&assistantAction=newInvoice`, tone: receiptId ? "secondary" : "primary", requiresConfirm: true, confirmLabel: "Rechnung wirklich vorbereiten" });
      }
      actions.push({ label: `Kundenprofil öffnen: ${label}`, href: `/customers/${customerId}`, tone: receiptId ? "secondary" : "primary" });
    } else if (intent === "invoice_create") {
      const fallbackName = receiptCustomerNameFromLookupData(data) || dbLookup.queryName || "Kunde";
      actions.push({ label: `Neuen Kunden anlegen: ${fallbackName}`, href: `/customers/new?name=${encodeURIComponent(fallbackName)}`, tone: receiptId ? "secondary" : "primary", requiresConfirm: true, confirmLabel: "Kundenanlage wirklich öffnen" });
    }
  }

  if (dbLookup.kind === "appointments") {
    actions.push({ label: "Kalender öffnen", href: "/calendar", tone: "primary" });
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

    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht übergeben." }, { status: 400 });
    }

    const lastQuestion = getLastUserQuestion(messages);
    const dbLookup = await lookupDbData(lastQuestion, messages).catch((error) => ({
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
      "Version 2.0: Du darfst echte CRM-Daten lesen, vorherige Suchtreffer im Gespräch berücksichtigen und bestätigungspflichtige Aktionslinks vorbereiten. Du änderst keine Daten im Hintergrund.",
      "Behaupte niemals, du hättest Termine, Kunden, Rechnungen oder Daten geändert. Aktionen werden erst nach Klick des Nutzers geöffnet oder vorbereitet.",
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
