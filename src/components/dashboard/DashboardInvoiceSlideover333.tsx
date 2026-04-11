"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createDashboardInvoice } from "@/app/dashboard/actions";

type TenantOption = {
  id: string;
  displayName: string;
};

type ServiceOption = {
  id: string;
  tenantId: string;
  name: string;
  defaultPriceCents: number | null;
};

type CustomerOption = {
  id: string;
  tenantId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
};

type ReaderSummary = {
  id: string;
  label: string | null;
  serialNumber: string | null;
  deviceType: string | null;
  status: string | null;
  location: string | null;
  actionStatus: string | null;
  actionType: string | null;
  lastSeenAt: number | null;
};

type ConfirmResult = {
  ok?: boolean;
  payment?: {
    id?: string;
    status?: string | null;
    status_label?: string | null;
    failure_reason?: string | null;
  } | null;
  stripe?: {
    id?: string | null;
    status?: string | null;
    last_error?: string | null;
  } | null;
  receipt?: {
    id?: string | null;
    receipt_number?: string | null;
  } | null;
  reader?: {
    id?: string | null;
    label?: string | null;
    status?: string | null;
    action_status?: string | null;
    action_type?: string | null;
    last_seen_at?: number | null;
  } | null;
  should_reload?: boolean;
  terminal_done?: boolean;
  terminal_state?: string | null;
  retry_allowed?: boolean;
  error?: string;
};

function closeQuery(pathname: string, searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("invoice");
  next.delete("salesOrder");
  next.delete("payment");
  next.delete("receipt");
  next.delete("success");
  next.delete("error");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function centsToMoneyInput(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function euroLabel(value: string) {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(safeAmount);
}

function buildReceiptUrl(receiptId: string, success?: string) {
  const params = new URLSearchParams();
  params.set("receipt", receiptId);
  if (success) params.set("success", success);
  return `/rechnungen?${params.toString()}`;
}

function CustomerPickIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </svg>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-[16px] bg-[var(--primary)] px-4 text-base font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Rechnung wird erstellt..." : "Rechnung erstellen"}
    </button>
  );
}

function AutoCardPaymentPanel({
  paymentId,
  salesOrderId,
  onClose,
}: {
  paymentId: string;
  salesOrderId: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("Stripe-Terminal wird vorbereitet…");
  const [error, setError] = useState("");
  const [readerLabel, setReaderLabel] = useState("");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [readerHint, setReaderHint] = useState("");
  const pollTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const wasClosedRef = useRef(false);

  function clearPollTimer() {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearPollTimer();
    };
  }, []);

  async function poll() {
    try {
      const res = await fetch(`/api/stripe/terminal/payments/confirm?payment_id=${encodeURIComponent(paymentId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ConfirmResult;
      const responseError = String(json?.error ?? "").trim();
      const paymentStatus = String(json?.payment?.status_label ?? json?.payment?.status ?? "Unbekannt");
      const stripeStatus = String(json?.stripe?.status ?? "").trim();
      const receiptId = String(json?.receipt?.id ?? "").trim();
      const receiptNumber = String(json?.receipt?.receipt_number ?? "").trim();
      const failureReason = String(json?.payment?.failure_reason ?? json?.stripe?.last_error ?? responseError ?? "").trim();
      const terminalState = String(json?.terminal_state ?? "").trim().toUpperCase();
      const readerStateParts = [
        String(json?.reader?.label ?? "").trim(),
        String(json?.reader?.status ?? "").trim(),
        String(json?.reader?.action_status ?? "").trim(),
      ].filter(Boolean);
      if (readerStateParts.length > 0) {
        setReaderHint(readerStateParts.join(" · "));
      }

      if (receiptId) {
        window.location.href = buildReceiptUrl(
          receiptId,
          receiptNumber ? `Dashboard-Beleg ${receiptNumber} erstellt ✅` : "Dashboard-Beleg erstellt ✅"
        );
        return;
      }

      if (!res.ok) {
        throw new Error(responseError || failureReason || "Payment-Status konnte nicht geprüft werden.");
      }

      setStatus(stripeStatus ? `${paymentStatus} · Stripe ${stripeStatus}` : paymentStatus);

      if (terminalState === "FAILED" || terminalState === "CANCELLED") {
        setError(
          failureReason ||
            (terminalState === "CANCELLED"
              ? "Die Kartenzahlung wurde am Terminal abgebrochen."
              : "Die Kartenzahlung konnte nicht abgeschlossen werden.")
        );
        setCanRetry(Boolean(json?.retry_allowed));
        clearPollTimer();
        return;
      }

      if (json?.terminal_done) {
        setStatus(`${paymentStatus} · Bitte kurz warten…`);
        clearPollTimer();
        return;
      }

      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed > 90000) {
        setError("Timeout beim Warten auf die Kartenzahlung. Bitte Status erneut laden oder Slideover schließen.");
        setCanRetry(true);
        clearPollTimer();
        return;
      }

      clearPollTimer();
      pollTimerRef.current = window.setTimeout(() => {
        void poll();
      }, 1800);
    } catch (err: any) {
      setError(String(err?.message ?? "Terminal-Status konnte nicht geprüft werden."));
      setCanRetry(true);
      clearPollTimer();
    }
  }

  async function startFlow() {
    clearPollTimer();
    setBusy(true);
    setError("");
    setCanRetry(false);
    setReaderHint("");
    startedAtRef.current = Date.now();

    try {
      setStatus("Reader wird automatisch gesucht…");

      const readerRes = await fetch("/api/stripe/terminal/readers", { cache: "no-store" });
      const readerJson = await readerRes.json();
      if (!readerRes.ok) throw new Error(String(readerJson?.error ?? "Reader konnten nicht geladen werden."));
      const readers = Array.isArray(readerJson?.readers) ? (readerJson.readers as ReaderSummary[]) : [];
      const preferredReader =
        readers.find((reader) => String(reader.status ?? "").trim().toLowerCase() === "online" && !String(reader.actionStatus ?? "").trim()) ??
        readers.find((reader) => String(reader.status ?? "").trim().toLowerCase() === "online") ??
        readers[0] ??
        null;

      if (!preferredReader?.id) {
        throw new Error("Kein Stripe-Reader gefunden. Bitte zuerst einen Reader in Stripe Terminal registrieren.");
      }

      const label = preferredReader.label || preferredReader.serialNumber || preferredReader.id;
      setReaderLabel(label);
      if (String(preferredReader.status ?? "").trim().toLowerCase() !== "online") {
        throw new Error(`Reader ${label} ist aktuell nicht online.`);
      }
      if (String(preferredReader.actionStatus ?? "").trim()) {
        throw new Error(`Reader ${label} ist gerade beschäftigt (${preferredReader.actionStatus}).`);
      }

      setStatus(`Reader bereit: ${label}. Zahlung wird gestartet…`);

      const sendRes = await fetch("/api/stripe/terminal/readers/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          sales_order_id: salesOrderId,
          reader_id: preferredReader.id,
        }),
      });
      const sendJson = await sendRes.json();
      if (!sendRes.ok) throw new Error(String(sendJson?.error ?? "Payment konnte nicht an den Reader gesendet werden."));

      const activeReaderLabel =
        String(sendJson?.reader?.label ?? "").trim() ||
        String(sendJson?.reader?.id ?? "").trim() ||
        label;
      setReaderLabel(activeReaderLabel);
      setReaderHint([
        String(sendJson?.reader?.status ?? "").trim(),
        String(sendJson?.reader?.actionStatus ?? sendJson?.reader?.action_status ?? "").trim(),
      ].filter(Boolean).join(" · "));
      setStatus(
        sendJson?.auto_presented_test_card
          ? "Testkarte wird automatisch präsentiert. Warte auf erfolgreichen Abschluss…"
          : "Zahlung wurde an den Reader gesendet. Warte auf erfolgreichen Abschluss…"
      );

      pollTimerRef.current = window.setTimeout(() => {
        void poll();
      }, 1200);
    } catch (err: any) {
      setError(String(err?.message ?? "Kartenzahlung konnte nicht automatisch gestartet werden."));
      setCanRetry(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started) return;
    setStarted(true);
    void startFlow();
  }, [started]);

  function handleClose() {
    wasClosedRef.current = true;
    clearPollTimer();
    onClose();
  }

  return (
    <div className="hide-scrollbar" style={{ padding: 16, overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <div className="space-y-4">
        <div className="rounded-[18px] border border-amber-400/20 bg-amber-500/10 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-amber-200/80">Kartenzahlung</div>
          <div className="mt-2 text-xl font-bold text-white">Terminal läuft automatisch</div>
          <div className="mt-2 text-sm text-white/70">
            Reader wird automatisch geprüft, Payment gesendet und laufend auf Erfolg, Fehler oder Abbruch überwacht.
          </div>
        </div>

        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Sales Order</div>
          <div className="mt-2 font-semibold text-white break-all">{salesOrderId}</div>
          <div className="mt-3 text-xs uppercase tracking-[0.14em] text-white/45">Payment</div>
          <div className="mt-2 font-semibold text-white break-all">{paymentId}</div>
          {readerLabel ? (
            <>
              <div className="mt-3 text-xs uppercase tracking-[0.14em] text-white/45">Reader</div>
              <div className="mt-2 font-semibold text-white">{readerLabel}</div>
              {readerHint ? <div className="mt-1 text-sm text-white/55">{readerHint}</div> : null}
            </>
          ) : null}
        </div>

        <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.14em] text-white/45">Status</div>
          <div className="mt-2 text-base font-semibold text-white">{status}</div>
          {!error ? (
            <div className="mt-2 text-sm text-white/60">
              Sobald Stripe erfolgreich ist, öffnet sich direkt der fertige Beleg-Slideover.
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              setError("");
              setStatus("Status wird erneut geladen…");
              void poll();
            }}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Status erneut laden
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={() => {
                void startFlow();
              }}
              disabled={busy}
              className="inline-flex h-12 items-center justify-center rounded-[16px] border border-amber-300/20 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Kartenflow erneut starten
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-12 items-center justify-center rounded-[16px] border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardInvoiceSlideover({
  tenants,
  services,
  customers,
  selectedTenantId,
  currentUserName,
  currentTenantName,
  isAdmin,
}: {
  tenants: TenantOption[];
  services: ServiceOption[];
  customers: CustomerOption[];
  selectedTenantId: string;
  currentUserName: string;
  currentTenantName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isOpen = searchParams?.get("invoice") === "1";
  const paymentIdParam = String(searchParams?.get("payment") ?? "").trim();
  const salesOrderIdParam = String(searchParams?.get("salesOrder") ?? "").trim();
  const successParam = String(searchParams?.get("success") ?? "").trim();
  const errorParam = String(searchParams?.get("error") ?? "").trim();
  const [mounted, setMounted] = useState(false);

  const [tenantId, setTenantId] = useState(selectedTenantId || tenants[0]?.id || "");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [serviceTitle, setServiceTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [taxRate, setTaxRate] = useState("0");
  const [price, setPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const visibleServices = useMemo(() => {
    if (!tenantId) return [];
    return services.filter((service) => service.tenantId === tenantId);
  }, [services, tenantId]);

  const tenantNameById = useMemo(() => {
    return new Map(tenants.map((tenant) => [tenant.id, tenant.displayName]));
  }, [tenants]);

  const customerMatches = useMemo(() => {
    const search = normalizeSearch(customerSearch);

    const matchesSearch = (customer: CustomerOption) => {
      if (!search) return true;
      return normalizeSearch([customer.displayName, customer.phone ?? "", customer.email ?? ""].join(" ")).includes(search);
    };

    const matchingCustomers = customers.filter(matchesSearch);

    const sorted = [...matchingCustomers].sort((a, b) => {
      const aPriority = a.tenantId === tenantId ? 0 : 1;
      const bPriority = b.tenantId === tenantId ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" });
    });

    return sorted.slice(0, 16);
  }, [customers, customerSearch, tenantId]);

  useEffect(() => {
    if (isOpen && !paymentIdParam) {
      const nextTenantId = selectedTenantId || tenants[0]?.id || "";
      setTenantId(nextTenantId);
      setSelectedServiceId("");
      setSelectedCustomerId("");
      setCustomerName("");
      setCustomerSearch("");
      setPickerOpen(false);
      setServiceTitle("");
      setQuantity("1");
      setTaxRate("0");
      setPrice("");
      setPaymentMethod("CASH");
      setNotes("");
      setNotesOpen(false);
    }
  }, [isOpen, selectedTenantId, tenants, paymentIdParam]);

  useEffect(() => {
    if (paymentIdParam) return;
    setSelectedServiceId("");
    setSelectedCustomerId("");
    setCustomerName("");
    setCustomerSearch("");
    setPickerOpen(false);
    setServiceTitle("");
    setPrice("");
    setNotes("");
    setNotesOpen(false);
  }, [tenantId, paymentIdParam]);

  const totalPreview = useMemo(() => {
    const qty = Math.max(1, Number(quantity.replace(",", ".")) || 1);
    const normalized = String(price).trim().replace(/\s+/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
    const amount = Number(normalized);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(qty * safeAmount);
  }, [price, quantity]);

  const activeTenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.displayName ||
    currentTenantName ||
    "Behandler";

  const isValid = !!tenantId && !!customerName.trim() && !!serviceTitle.trim() && !!price.trim();

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  const handleClose = () => {
    router.replace(closeQuery(pathname, new URLSearchParams(searchParams?.toString() ?? "")), { scroll: false });
  };

  const handleServiceSelect = (nextServiceId: string) => {
    setSelectedServiceId(nextServiceId);
    if (!nextServiceId) return;
    const selectedService = visibleServices.find((service) => service.id === nextServiceId);
    if (!selectedService) return;
    setServiceTitle(selectedService.name);
    setPrice(centsToMoneyInput(selectedService.defaultPriceCents));
  };

  const handleCustomerPick = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.displayName);
    setCustomerSearch(customer.displayName);
    if (customer.tenantId && customer.tenantId !== tenantId) {
      setTenantId(customer.tenantId);
    }
    setPickerOpen(false);
  };

  const renderCustomerButton = (customer: CustomerOption) => {
    const tenantLabel = tenantNameById.get(customer.tenantId) ?? "Anderer Bereich";
    const isFromCurrentTenant = customer.tenantId === tenantId;
    const isActive = selectedCustomerId === customer.id;

    return (
      <button
        key={customer.id}
        type="button"
        onClick={() => handleCustomerPick(customer)}
        className="flex w-full items-start justify-between rounded-[14px] border border-transparent bg-white/[0.03] px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/[0.06]"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{customer.displayName}</div>
          <div className="truncate text-xs text-white/45">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "Gespeichertes Kundenprofil"}
          </div>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {!isFromCurrentTenant ? (
            <span className="inline-flex h-7 items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/75">
              {tenantLabel}
            </span>
          ) : null}
          {isActive ? <span className="text-xs font-semibold text-emerald-300">Aktiv</span> : null}
        </div>
      </button>
    );
  };

  const showAutoCardStage = Boolean(paymentIdParam && salesOrderIdParam);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1400 }}>
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.68)",
          backdropFilter: "blur(6px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.96), rgba(10,10,10,0.96))",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>Rechnungen</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>
              {showAutoCardStage ? "Kartenzahlung" : "Neue Rechnung"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.46)" }}>
              {showAutoCardStage
                ? "Reader wird automatisch verwendet und der Beleg danach direkt geöffnet."
                : "Sales Order, Payment und Fiskalbeleg werden direkt erzeugt."}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        {successParam && !showAutoCardStage ? (
          <div className="mx-4 mt-4 rounded-[16px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successParam}
          </div>
        ) : null}
        {errorParam ? (
          <div className="mx-4 mt-4 rounded-[16px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorParam}
          </div>
        ) : null}

        {showAutoCardStage ? (
          <AutoCardPaymentPanel
            paymentId={paymentIdParam}
            salesOrderId={salesOrderIdParam}
            onClose={handleClose}
          />
        ) : (
          <form action={createDashboardInvoice} className="hide-scrollbar" style={{ padding: 16, overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <div className="space-y-4">
              <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(12,12,12,0.96))] px-4 pb-4 pt-3 backdrop-blur-xl">
                <div className="grid gap-3">
                  <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">Vorschau</div>
                    <div className="mt-1.5 truncate text-sm text-white/70">
                      {customerName || "Kein Kunde"} · {serviceTitle || "Keine Leistung"} · {activeTenantName}
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div className="text-[18px] font-bold leading-none text-white sm:text-[20px]">{totalPreview}</div>
                      <div className="shrink-0 text-[11px] text-white/45">
                        {paymentMethod === "CASH" ? "Bar" : paymentMethod === "CARD" ? "Karte" : "Überweisung"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <SubmitButton disabled={!isValid} />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">Behandler</label>
                {isAdmin ? (
                  <select
                    name="tenant_id"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  >
                    <option value="">Bitte wählen...</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="tenant_id" value={tenantId} />
                    <div className="flex h-12 items-center rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white">
                      {activeTenantName}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">Kunde *</label>
                <input type="hidden" name="customer_profile_id" value={selectedCustomerId} />
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-[var(--primary)]/30 bg-[linear-gradient(180deg,rgba(214,195,163,0.14),rgba(214,195,163,0.08))] px-4 text-base font-semibold text-white shadow-[0_8px_24px_rgba(214,195,163,0.10)] transition hover:border-[var(--primary)]/45 hover:bg-[linear-gradient(180deg,rgba(214,195,163,0.18),rgba(214,195,163,0.10))]"
                >
                  <CustomerPickIcon />
                  <span>{selectedCustomerId ? "Kundenwahl ändern" : "Kunde auswählen"}</span>
                </button>

                {selectedCustomerId ? (
                  <div className="mt-2 rounded-[16px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                    <div className="text-sm font-semibold text-white">{customerName}</div>
                    <div className="mt-1 text-xs text-white/50">{tenantNameById.get(tenantId) ?? activeTenantName}</div>
                  </div>
                ) : null}

                {pickerOpen ? (
                  <div className="mt-3 rounded-[18px] border border-white/10 bg-[#0d0e11] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.38)]">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-white">Kunde auswählen</div>
                      <div className="mt-1 text-xs text-white/45">Bestehende Kunden suchen und direkt übernehmen.</div>
                    </div>

                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Name, Telefon oder E-Mail suchen"
                      className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-white/30 outline-none"
                    />

                    <div className="hide-scrollbar mt-3 max-h-64 overflow-auto space-y-1">
                      {customerMatches.length > 0 ? (
                        customerMatches.map((customer) => renderCustomerButton(customer))
                      ) : (
                        <div className="rounded-[14px] border border-dashed border-white/10 px-3 py-3 text-sm text-white/55">
                          Kein Treffer. Dann im Hauptformular einfach frei eingeben.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <input
                  type="hidden"
                  name="customer_name"
                  value={customerName}
                />

                {!selectedCustomerId ? (
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Oder Kunde frei eingeben"
                    className="mt-3 h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  />
                ) : null}

                <div className="mt-2 text-xs text-white/45">
                  Der Picker durchsucht jetzt immer alle geladenen Kunden. Treffer vom aktiven Behandler stehen oben.
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">Leistung aus Liste (optional)</label>
                <select
                  name="service_id"
                  value={selectedServiceId}
                  onChange={(e) => handleServiceSelect(e.target.value)}
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                >
                  <option value="">Bitte wählen...</option>
                  {visibleServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {euroLabel(centsToMoneyInput(service.defaultPriceCents))}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">Leistung *</label>
                <input
                  name="service_title"
                  value={serviceTitle}
                  onChange={(e) => setServiceTitle(e.target.value)}
                  placeholder="z. B. PMU Brows"
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                />
                <div className="mt-2 text-xs text-white/45">
                  Du kannst eine Leistung aus der Liste wählen oder hier frei etwas eingeben.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white">Menge *</label>
                  <input
                    name="quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white">Steuer %</label>
                  <input
                    name="tax_rate"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white">Preis (€) *</label>
                  <input
                    name="price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white">Zahlungsart</label>
                  <select
                    name="payment_method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                  >
                    <option value="CASH">Bar</option>
                    <option value="CARD">Karte</option>
                    <option value="TRANSFER">Überweisung</option>
                  </select>
                </div>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setNotesOpen((open) => !open)}
                  className="flex h-12 w-full items-center justify-between px-4 text-left"
                >
                  <span className="text-sm font-medium text-white/88">Interne Notiz</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                    {notesOpen ? "ZUKLAPPEN" : "AUFKLAPPEN"}
                  </span>
                </button>

                {notesOpen ? (
                  <div className="border-t border-white/10 px-4 pb-4 pt-3">
                    <textarea
                      name="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      placeholder="Optionaler Hinweis für das Team"
                      className="w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none"
                    />
                  </div>
                ) : null}
              </div>

              <div className="pt-2 text-xs text-white/40">Eingeloggt als {currentUserName || "Benutzer"}</div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
