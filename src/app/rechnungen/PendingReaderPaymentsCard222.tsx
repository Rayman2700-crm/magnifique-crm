"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PendingPaymentListItem = {
  id: string;
  tenantId: string | null;
  salesOrderId: string | null;
  customerName: string | null;
  providerName: string | null;
  amount: number | null;
  currencyCode: string | null;
  status: string | null;
  paymentMethodLabel: string | null;
  provider: string | null;
  providerTransactionId: string | null;
  createdAt: string | null;
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

type Props = {
  items: PendingPaymentListItem[];
  qRaw: string;
  currentFilter: string;
  practitionerFilter: string;
  pendingStripeCount: number;
  processingStripeCount: number;
};

function euroFromGross(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function formatPaymentStatus(value: string | null | undefined) {
  const normalized = normalizeStatus(value);
  if (normalized === "PENDING") return "Ausstehend";
  if (normalized === "PROCESSING") return "Wird verarbeitet";
  if (normalized === "COMPLETED") return "Bezahlt";
  if (normalized === "FAILED") return "Fehlgeschlagen";
  if (normalized === "CANCELLED") return "Abgebrochen";
  return normalized || "—";
}

function toneClass(value: string | null | undefined) {
  const normalized = normalizeStatus(value);
  if (normalized === "COMPLETED") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (normalized === "PENDING" || normalized === "PROCESSING") return "border-amber-400/25 bg-amber-500/10 text-amber-200";
  if (normalized === "FAILED" || normalized === "CANCELLED") return "border-red-400/25 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-white/75";
}

function readerStatusLabel(reader: ReaderSummary) {
  const status = normalizeStatus(reader.status);
  const actionType = String(reader.actionType ?? "").trim();
  const actionStatus = String(reader.actionStatus ?? "").trim();
  if (actionType && actionStatus) return `${status || "unbekannt"} · ${actionType} · ${actionStatus}`;
  return status || "unbekannt";
}

function buildRechnungenHref({
  qRaw,
  filter,
  practitioner,
  salesOrder,
  payment,
}: {
  qRaw?: string;
  filter?: string;
  practitioner?: string;
  salesOrder?: string;
  payment?: string;
}) {
  const params = new URLSearchParams();
  if (qRaw?.trim()) params.set("q", qRaw.trim());
  if (filter && filter !== "all") params.set("filter", filter);
  if (practitioner && practitioner !== "all") params.set("practitioner", practitioner);
  if (salesOrder) params.set("salesOrder", salesOrder);
  if (payment) params.set("payment", payment);
  const query = params.toString();
  return query ? `/rechnungen?${query}` : "/rechnungen";
}

export default function PendingReaderPaymentsCard({
  items,
  qRaw,
  currentFilter,
  practitionerFilter,
  pendingStripeCount,
  processingStripeCount,
}: Props) {
  const router = useRouter();
  const [readers, setReaders] = useState<ReaderSummary[]>([]);
  const [readersLoaded, setReadersLoaded] = useState(false);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [selectedReaderByPayment, setSelectedReaderByPayment] = useState<Record<string, string>>({});
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [statusByPayment, setStatusByPayment] = useState<Record<string, string>>({});
  const [errorByPayment, setErrorByPayment] = useState<Record<string, string>>({});

  const readerOptions = useMemo(
    () => readers.map((reader) => ({ value: reader.id, label: `${reader.label || reader.serialNumber || reader.id} · ${readerStatusLabel(reader)}` })),
    [readers]
  );

  async function loadReaders() {
    if (loadingReaders) return;
    setLoadingReaders(true);
    try {
      const res = await fetch("/api/stripe/terminal/readers", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? "Reader konnten nicht geladen werden."));
      const nextReaders = Array.isArray(json?.readers) ? (json.readers as ReaderSummary[]) : [];
      setReaders(nextReaders);
      setReadersLoaded(true);
      setErrorByPayment((prev) => {
        const next = { ...prev };
        for (const item of items) delete next[item.id];
        return next;
      });
      setSelectedReaderByPayment((prev) => {
        const next = { ...prev };
        if (nextReaders.length === 1) {
          for (const item of items) {
            if (!next[item.id]) next[item.id] = nextReaders[0].id;
          }
        }
        return next;
      });
    } catch (error: any) {
      const message = String(error?.message ?? "Reader konnten nicht geladen werden.");
      setErrorByPayment((prev) => ({ ...prev, global: message }));
    } finally {
      setLoadingReaders(false);
    }
  }

  async function sendToReader(paymentId: string) {
    const readerId = selectedReaderByPayment[paymentId];
    if (!readerId) {
      setErrorByPayment((prev) => ({ ...prev, [paymentId]: "Bitte zuerst einen Reader auswählen." }));
      return;
    }

    setBusyPaymentId(paymentId);
    setErrorByPayment((prev) => ({ ...prev, [paymentId]: "" }));
    setStatusByPayment((prev) => ({ ...prev, [paymentId]: "Sende an Reader…" }));

    try {
      const res = await fetch("/api/stripe/terminal/readers/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, reader_id: readerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? "Payment konnte nicht an den Reader gesendet werden."));
      const readerLabel = json?.reader?.label || json?.reader?.id || readerId;
      const statusMessage = json?.auto_presented_test_card
        ? `An Reader gesendet: ${readerLabel} · Sandbox-Testkarte automatisch präsentiert`
        : `An Reader gesendet: ${readerLabel}`;
      setStatusByPayment((prev) => ({
        ...prev,
        [paymentId]: statusMessage,
      }));
      router.refresh();
    } catch (error: any) {
      setErrorByPayment((prev) => ({ ...prev, [paymentId]: String(error?.message ?? "Payment konnte nicht an den Reader gesendet werden.") }));
      setStatusByPayment((prev) => ({ ...prev, [paymentId]: "" }));
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function confirmPayment(paymentId: string) {
    setBusyPaymentId(paymentId);
    setErrorByPayment((prev) => ({ ...prev, [paymentId]: "" }));
    setStatusByPayment((prev) => ({ ...prev, [paymentId]: "Prüfe Payment-Status…" }));

    try {
      const res = await fetch(`/api/stripe/terminal/payments/confirm?payment_id=${encodeURIComponent(paymentId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? "Payment-Status konnte nicht geprüft werden."));
      const paymentStatus = String(json?.payment?.status_label ?? json?.payment?.status ?? "Unbekannt");
      const stripeStatus = String(json?.stripe?.status ?? "").trim();
      setStatusByPayment((prev) => ({
        ...prev,
        [paymentId]: stripeStatus ? `${paymentStatus} · Stripe ${stripeStatus}` : paymentStatus,
      }));
      router.refresh();
    } catch (error: any) {
      setErrorByPayment((prev) => ({ ...prev, [paymentId]: String(error?.message ?? "Payment-Status konnte nicht geprüft werden.") }));
      setStatusByPayment((prev) => ({ ...prev, [paymentId]: "" }));
    } finally {
      setBusyPaymentId(null);
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-500/10">
      <div className="border-b border-white/8 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Offene Kartenzahlungen</div>
            <div className="mt-1 text-sm text-white/65">
              Stripe-Payments ohne Fiscal-Beleg. Pending: {pendingStripeCount} · Verarbeitung: {processingStripeCount}
            </div>
            <div className="mt-2 text-xs text-white/45">
              Im Sandbox-Modus wird bei simulierten Readern die Testkarte nach „An Reader senden“ automatisch präsentiert.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadReaders}
              className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
              disabled={loadingReaders}
            >
              {loadingReaders ? "Lade Reader…" : readersLoaded ? "Reader aktualisieren" : "Reader laden"}
            </button>
            <div className="text-xs text-white/55">Server-driven Reader-Block v1</div>
          </div>
        </div>
        {errorByPayment.global ? (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{errorByPayment.global}</div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] table-auto text-sm">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className="w-[14%] px-6 py-4 text-left font-semibold text-white/60">Payment</th>
              <th className="w-[20%] px-4 py-4 text-left font-semibold text-white/60">Kunde</th>
              <th className="w-[12%] px-4 py-4 text-left font-semibold text-white/60">Erstellt</th>
              <th className="w-[10%] px-4 py-4 text-left font-semibold text-white/60">Betrag</th>
              <th className="w-[14%] px-4 py-4 text-left font-semibold text-white/60">Status</th>
              <th className="w-[30%] px-6 py-4 text-left font-semibold text-white/60">Reader-Aktion</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const detailHref = buildRechnungenHref({
                qRaw,
                filter: currentFilter,
                practitioner: practitionerFilter,
                salesOrder: item.salesOrderId ?? undefined,
                payment: item.id,
              });
              const selectedReader = selectedReaderByPayment[item.id] ?? "";
              const isBusy = busyPaymentId === item.id;
              const statusText = statusByPayment[item.id];
              const errorText = errorByPayment[item.id];

              return (
                <tr key={`pending-reader-${item.id}`} className="border-t border-white/8 align-top transition hover:bg-white/[0.025]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={detailHref}
                        title="Payment öffnen"
                        aria-label="Payment öffnen"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </Link>
                      <div>
                        <div className="font-semibold leading-none text-white">{shortId(item.id)}</div>
                        <div className="mt-1.5 text-[11px] text-white/50">
                          {item.providerTransactionId ? `Stripe ${shortId(item.providerTransactionId)}` : "PaymentIntent wird bei Bedarf erzeugt"}
                        </div>
                        {item.salesOrderId ? <div className="mt-1 text-[11px] text-white/45">Sales Order {shortId(item.salesOrderId)}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-white">{item.customerName || "Kunde offen"}</div>
                    <div className="mt-1 text-xs text-white/50">{item.providerName || "Behandler"}</div>
                  </td>
                  <td className="px-4 py-4 text-white/75">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-4 font-medium text-white">{euroFromGross(item.amount, item.currencyCode)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(item.status)}`}>
                      {formatPaymentStatus(item.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="grid gap-3">
                      <select
                        value={selectedReader}
                        onChange={(event) => setSelectedReaderByPayment((prev) => ({ ...prev, [item.id]: event.target.value }))}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                      >
                        <option value="">Reader wählen</option>
                        {readerOptions.map((reader) => (
                          <option key={`${item.id}-${reader.value}`} value={reader.value}>
                            {reader.label}
                          </option>
                        ))}
                      </select>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => sendToReader(item.id)}
                          disabled={isBusy || !selectedReader}
                          className="inline-flex h-10 items-center rounded-xl border border-amber-500/30 bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? "Läuft…" : "An Reader senden"}
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmPayment(item.id)}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Status prüfen
                        </button>
                      </div>

                      {statusText ? <div className="text-xs text-emerald-200">{statusText}</div> : null}
                      {errorText ? <div className="text-xs text-red-200">{errorText}</div> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
