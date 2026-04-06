"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { updateFiscalReceiptDetails } from "@/app/rechnungen/actions";

type SlideoverEvent = {
  id: string;
  eventType: string;
  eventTimestamp: string | null;
  performedBy: string | null;
  notes: string | null;
  referenceData: Record<string, unknown> | null;
  createdAt: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
  defaultPriceCents: number | null;
};

type SlideoverReceipt = {
  id: string;
  tenantId: string | null;
  cashRegisterId: string | null;
  salesOrderId: string | null;
  paymentId: string | null;
  receiptNumber: string;
  receiptType: string | null;
  status: string | null;
  issuedAt: string | null;
  currencyCode: string | null;
  turnoverValueCents: number | null;
  sumTaxSetNormal: number | null;
  sumTaxSetReduced1: number | null;
  sumTaxSetReduced2: number | null;
  sumTaxSetZero: number | null;
  chainPreviousReceiptId: string | null;
  chainPreviousHash: string | null;
  receiptPayloadHash: string | null;
  receiptPayloadCanonical: string | null;
  signatureValue: string | null;
  signatureAlgorithm: string | null;
  signatureCreatedAt: string | null;
  signatureState: string | null;
  verificationStatus: string | null;
  verificationCheckedAt: string | null;
  verificationNotes: string | null;
  createdAt: string | null;
  latestEventType: string | null;
  events: SlideoverEvent[];
  customerName?: string | null;
  providerName?: string | null;
  providerAvatarUrl?: string | null;
  providerInitials?: string | null;
  availableServices?: ServiceOption[];
};

type EditableLine = {
  sourceLineId: string | null;
  serviceId: string | null;
  lineType: "SERVICE" | "ITEM";
  taxRate: number;
  name: string;
  quantity: string;
  unitPriceGross: string;
  lineTotalGross: string;
  manualTotalOverride: boolean;
};

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

function euroFromCents(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(value / 100);
}

function moneyInputFromCents(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0,00";
  return (value / 100).toFixed(2).replace(".", ",");
}

function parsePayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getNestedValue(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readFirstString(source: unknown, candidates: string[][]) {
  for (const path of candidates) {
    const value = getNestedValue(source, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function formatEventLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();

  const labels: Record<string, string> = {
    RECEIPT_CREATION_STARTED: "Belegerstellung gestartet",
    STANDARD_RECEIPT_CREATED: "Beleg erfolgreich erstellt",
    RECEIPT_VERIFICATION_SUCCEEDED: "Verifikation erfolgreich",
    RECEIPT_CREATION_FAILED: "Belegerstellung fehlgeschlagen",
  };

  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "—");
}

function badgeClass(value: string | null | undefined, kind: "signature" | "verification" | "event" = "event") {
  const normalized = String(value ?? "").toUpperCase();

  if (kind === "verification") {
    if (normalized === "VALID") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    if (normalized.includes("INVALID") || normalized.includes("FAIL")) return "border-red-400/20 bg-red-400/10 text-red-200";
  }

  if (kind === "signature") {
    if (normalized === "SIMULATED" || normalized === "SIGNED") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    if (normalized === "PENDING") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  if (normalized.includes("FAIL")) return "border-red-400/20 bg-red-400/10 text-red-200";
  if (normalized.includes("VERIFY") || normalized.includes("VALID")) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/80";
}

function providerInitials(name: string, fallback?: string | null) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return fallback || "BE";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\s+/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoneyInput(value: number) {
  return Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "0,00";
}

function computeLineTotal(quantityRaw: string, unitPriceRaw: string) {
  const quantity = Number(quantityRaw.replace(",", "."));
  const unitPrice = parseMoneyInput(unitPriceRaw);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return safeQuantity * unitPrice;
}

function buildEditableLines(payloadLines: Record<string, unknown>[]) {
  if (payloadLines.length === 0) {
    return [
      {
        sourceLineId: null,
        serviceId: null,
        lineType: "ITEM",
        taxRate: 20,
        name: "",
        quantity: "1",
        unitPriceGross: "0,00",
        lineTotalGross: "0,00",
        manualTotalOverride: false,
      },
    ] satisfies EditableLine[];
  }

  return payloadLines.map((line) => {
    const quantity = Number(line.quantity ?? NaN);
    const totalCents = Number(line.line_total_gross ?? NaN);
    const unitCents = Number(line.unit_price_gross ?? NaN);
    const fallbackUnitCents =
      Number.isFinite(quantity) && quantity > 0 && Number.isFinite(totalCents)
        ? Math.round(totalCents / quantity)
        : NaN;

    return {
      sourceLineId: String(line.source_line_id ?? "").trim() || null,
      serviceId: String(line.reference_id ?? "").trim() || null,
      lineType: String(line.line_type ?? (String(line.reference_id ?? "").trim() ? "SERVICE" : "ITEM")).trim().toUpperCase() === "SERVICE" ? "SERVICE" : "ITEM",
      taxRate: Number(line.tax_rate ?? 20) || 20,
      name: String(line.name ?? ""),
      quantity: Number.isFinite(quantity) && quantity > 0 ? String(quantity) : "1",
      unitPriceGross: moneyInputFromCents(Number.isFinite(unitCents) ? unitCents : fallbackUnitCents),
      lineTotalGross: moneyInputFromCents(totalCents),
      manualTotalOverride: false,
    } satisfies EditableLine;
  });
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
  hoverClassName,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  hoverClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition-colors ${hoverClassName ?? "hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

export default function FiscalReceiptSlideover({ items }: { items: SlideoverReceipt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [linesDraft, setLinesDraft] = useState<EditableLine[]>([]);
  const [showProviderImage, setShowProviderImage] = useState(true);
  const customerSubmitArmedRef = useRef(false);

  const selectedId = searchParams?.get("receipt") ?? "";
  const currentQuery = searchParams?.toString() ?? "";

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("receipt");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    if (selected) {
      setVisible(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timeout = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timeout);
  }, [selected, mounted]);

  useEffect(() => {
    if (!selected) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, close]);

  const payloadJson = useMemo(() => parsePayload(selected?.receiptPayloadCanonical), [selected?.receiptPayloadCanonical]);
  const payloadLines = Array.isArray(payloadJson?.lines) ? (payloadJson.lines as Record<string, unknown>[]) : [];

  const customerName =
    selected?.customerName?.trim() ||
    readFirstString(payloadJson, [
      ["customer_name"],
      ["person_name"],
      ["customer", "full_name"],
      ["customer", "name"],
      ["customer", "display_name"],
      ["person", "full_name"],
      ["person", "name"],
      ["person", "display_name"],
    ]) ||
    "Nicht hinterlegt";

  const providerName =
    selected?.providerName?.trim() ||
    readFirstString(payloadJson, [
      ["tenant_display_name"],
      ["tenant_name"],
      ["provider_name"],
      ["company_name"],
      ["business_name"],
      ["studio_name"],
      ["tenant", "display_name"],
      ["tenant", "name"],
      ["provider", "name"],
    ]) ||
    "—";

  const serviceOptions = selected?.availableServices ?? [];

  useEffect(() => {
    if (!selected) return;
    setCustomerDraft(customerName);
    setLinesDraft(buildEditableLines(payloadLines));
    setIsEditingCustomer(false);
    setIsEditingLines(false);
    setShowProviderImage(true);
    customerSubmitArmedRef.current = false;
  }, [selected?.id]);

  const linesForSubmit = useMemo(() => {
    return linesDraft.map((line) => {
      const computedTotal = computeLineTotal(line.quantity, line.unitPriceGross);
      return {
        sourceLineId: line.sourceLineId,
        serviceId: line.serviceId,
        lineType: line.serviceId ? "SERVICE" : line.lineType,
        taxRate: line.taxRate,
        name: line.name,
        quantity: line.quantity,
        unitPriceGross: line.unitPriceGross,
        lineTotalGross: line.manualTotalOverride ? line.lineTotalGross : formatMoneyInput(computedTotal),
      };
    });
  }, [linesDraft]);

  const totalDraftCents = useMemo(() => {
    return linesForSubmit.reduce((sum, line) => sum + Math.round(parseMoneyInput(line.lineTotalGross) * 100), 0);
  }, [linesForSubmit]);

  const serializedLines = useMemo(() => JSON.stringify(linesForSubmit), [linesForSubmit]);

  function updateLine(index: number, updater: (line: EditableLine) => EditableLine) {
    setLinesDraft((current) => current.map((line, rowIndex) => (rowIndex === index ? updater(line) : line)));
  }

  function addLine() {
    setLinesDraft((current) => [
      ...current,
      {
        sourceLineId: null,
        serviceId: null,
        lineType: "ITEM",
        taxRate: 20,
        name: "",
        quantity: "1",
        unitPriceGross: "0,00",
        lineTotalGross: "0,00",
        manualTotalOverride: false,
      },
    ]);
  }

  if (!mounted || !visible || !selected || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1350, isolation: "isolate" }}>
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(860px, calc(100vw - 1rem))",
          transform: shown ? "translateX(0)" : "translateX(24px)",
          opacity: shown ? 1 : 0,
          transition: "transform 220ms ease, opacity 220ms ease",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgb(9,9,11)",
          color: "white",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-white/55">Rechnungen / Fiscal</div>
              <div className="text-2xl font-extrabold text-white">Beleg {selected.receiptNumber}</div>
              <div className="mt-1 text-sm text-white/55">
                {formatDateTime(selected.createdAt)} · {euroFromCents(selected.turnoverValueCents, selected.currencyCode)}
              </div>


            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {selected.salesOrderId ? (
                <Link href={`/rechnungen?${new URLSearchParams({ q: selected.salesOrderId }).toString()}`}>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    Sales Order suchen
                  </button>
                </Link>
              ) : null}

              <IconButton onClick={() => window.print()} title="Drucken" hoverClassName="transition-colors hover:bg-emerald-400">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9V3h12v6" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 14h12v7H6z" />
                  <path d="M6 18h12" />
                </svg>
              </IconButton>

              <IconButton onClick={close} title="Schließen" hoverClassName="transition-colors hover:bg-red-600">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </IconButton>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            <InfoCard title="Beleg erfolgreich erstellt">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Belegnummer</div>
                  <div className="mt-2 text-lg font-bold text-white">{selected.receiptNumber}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Betrag</div>
                  <div className="mt-2 text-lg font-bold text-white">{euroFromCents(selected.turnoverValueCents, selected.currencyCode)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Datum</div>
                  <div className="mt-2 text-sm font-semibold text-white">{formatDateTime(selected.createdAt)}</div>
                </div>

              </div>

              <div className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-50/90">
                Fachlich ist Bearbeiten hier möglich. Für den finalen Live-Flow wäre es sauberer, Änderungen vor Fiscal in der Sales Order zu machen. Für euren aktuellen Simulationsstand ist es aber absolut sinnvoll.
              </div>
            </InfoCard>

            <InfoCard title="Kunde">
              <form
                action={updateFiscalReceiptDetails}
                className="space-y-4"
                onSubmit={(event) => {
                  if (!customerSubmitArmedRef.current) {
                    event.preventDefault();
                    return;
                  }
                  customerSubmitArmedRef.current = false;
                }}
              >
                <input type="hidden" name="receipt_id" value={selected.id} />
                <input type="hidden" name="return_query" value={currentQuery} />
                <input type="hidden" name="provider_name" value={providerName} />
                <input type="hidden" name="lines_json" value={serializedLines} />

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Kunde</div>
                    {isEditingCustomer ? (
                      <input
                        autoFocus
                        name="customer_name"
                        value={customerDraft}
                        onChange={(e) => setCustomerDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-base font-semibold text-white outline-none"
                      />
                    ) : (
                      <>
                        <input type="hidden" name="customer_name" value={customerDraft} />
                        <div className="mt-2 text-lg font-bold text-white">{customerDraft || "Nicht hinterlegt"}</div>
                      </>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Firma / Behandler</div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{providerName}</div>
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-xs font-bold text-white/90">
                        {selected.providerAvatarUrl && showProviderImage ? (
                          <img
                            src={selected.providerAvatarUrl}
                            alt={providerName}
                            className="h-full w-full object-cover"
                            onError={() => setShowProviderImage(false)}
                          />
                        ) : (
                          <span>{providerInitials(providerName, selected.providerInitials)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!isEditingCustomer ? (
                    <button
                      type="button"
                      onClick={() => {
                        customerSubmitArmedRef.current = false;
                        setIsEditingCustomer(true);
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Bearbeiten
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        onClick={() => {
                          customerSubmitArmedRef.current = true;
                        }}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          customerSubmitArmedRef.current = false;
                          setCustomerDraft(customerName);
                          setIsEditingCustomer(false);
                        }}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        Abbrechen
                      </button>
                    </>
                  )}
                </div>
              </form>
            </InfoCard>

            <InfoCard title="Leistungen">
              <form action={updateFiscalReceiptDetails} className="space-y-4">
                <input type="hidden" name="receipt_id" value={selected.id} />
                <input type="hidden" name="return_query" value={currentQuery} />
                <input type="hidden" name="provider_name" value={providerName} />
                <input type="hidden" name="customer_name" value={customerDraft} />
                <input type="hidden" name="lines_json" value={serializedLines} />

                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[46%]" />
                      <col className="w-[11%]" />
                      <col className="w-[19%]" />
                      <col className="w-[24%]" />
                    </colgroup>
                    <thead className="border-b border-white/10 bg-white/[0.04] text-left text-white/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Leistung</th>
                        <th className="px-2 py-3 font-medium">Menge</th>
                        <th className="px-2 py-3 font-medium">Einzelpreis</th>
                        <th className="px-2 py-3 font-medium">Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linesDraft.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-white/45">
                            Keine Positionen gefunden.
                          </td>
                        </tr>
                      ) : (
                        linesDraft.map((line, index) => {
                          const autoTotal = formatMoneyInput(computeLineTotal(line.quantity, line.unitPriceGross));
                          const shownTotal = line.manualTotalOverride ? line.lineTotalGross : autoTotal;

                          return (
                            <tr key={`${selected.id}-payload-line-${index}`} className="border-b border-white/5 last:border-b-0 align-top">
                              <td className="px-4 py-3 text-white/90">
                                {isEditingLines ? (
                                  <div className="space-y-2">
                                    <select
                                      value={line.serviceId ?? "__custom__"}
                                      onChange={(e) => {
                                        const nextValue = e.target.value;
                                        if (nextValue === "__custom__") {
                                          updateLine(index, (current) => ({ ...current, serviceId: null, lineType: 'ITEM' }));
                                          return;
                                        }
                                        const selectedService = serviceOptions.find((service) => service.id === nextValue);
                                        updateLine(index, (current) => {
                                          const nextUnitPrice =
                                            typeof selectedService?.defaultPriceCents === "number"
                                              ? moneyInputFromCents(selectedService.defaultPriceCents)
                                              : current.unitPriceGross;
                                          const recalculatedTotal = formatMoneyInput(computeLineTotal(current.quantity, nextUnitPrice));
                                          return {
                                            ...current,
                                            serviceId: nextValue,
                                            lineType: 'SERVICE',
                                            name: selectedService?.name ?? current.name,
                                            unitPriceGross: nextUnitPrice,
                                            lineTotalGross: current.manualTotalOverride ? current.lineTotalGross : recalculatedTotal,
                                          };
                                        });
                                      }}
                                      className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                    >
                                      <option value="__custom__">Freie Eingabe / manuell</option>
                                      {serviceOptions.map((service) => (
                                        <option key={service.id} value={service.id}>
                                          {service.name}
                                          {typeof service.defaultPriceCents === "number" ? ` · ${euroFromCents(service.defaultPriceCents, selected.currencyCode || "EUR")}` : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      value={line.name}
                                      onChange={(e) => updateLine(index, (current) => ({ ...current, name: e.target.value, serviceId: current.serviceId, lineType: current.serviceId ? 'SERVICE' : 'ITEM' }))}
                                      className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                      placeholder="Leistungsname"
                                    />
                                  </div>
                                ) : (
                                  <span>{line.name || "—"}</span>
                                )}
                              </td>
                              <td className="px-2 py-3 text-white/70">
                                {isEditingLines ? (
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(index, (current) => {
                                        const nextQuantity = e.target.value;
                                        const recalculatedTotal = formatMoneyInput(computeLineTotal(nextQuantity, current.unitPriceGross));
                                        return {
                                          ...current,
                                          quantity: nextQuantity,
                                          lineTotalGross: current.manualTotalOverride ? current.lineTotalGross : recalculatedTotal,
                                        };
                                      })
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-2 text-center text-sm text-white outline-none"
                                  />
                                ) : (
                                  <span>{line.quantity || "—"}</span>
                                )}
                              </td>
                              <td className="px-2 py-3 text-white/85">
                                {isEditingLines ? (
                                  <input
                                    value={line.unitPriceGross}
                                    onChange={(e) =>
                                      updateLine(index, (current) => {
                                        const nextUnitPrice = e.target.value;
                                        const recalculatedTotal = formatMoneyInput(computeLineTotal(current.quantity, nextUnitPrice));
                                        return {
                                          ...current,
                                          unitPriceGross: nextUnitPrice,
                                          lineTotalGross: current.manualTotalOverride ? current.lineTotalGross : recalculatedTotal,
                                        };
                                      })
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                  />
                                ) : (
                                  <span>{line.unitPriceGross ? `${line.unitPriceGross} €` : "—"}</span>
                                )}
                              </td>
                              <td className="px-2 py-3 text-white/90">
                                {isEditingLines ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        value={shownTotal}
                                        disabled={!line.manualTotalOverride}
                                        onChange={(e) => updateLine(index, (current) => ({ ...current, lineTotalGross: e.target.value }))}
                                        className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setLinesDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                        title="Zeile entfernen"
                                      >
                                        −
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-white/55">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateLine(index, (current) => ({
                                            ...current,
                                            manualTotalOverride: !current.manualTotalOverride,
                                            lineTotalGross: !current.manualTotalOverride ? current.lineTotalGross : autoTotal,
                                          }))
                                        }
                                        className={`rounded-full border px-2 py-1 font-semibold ${line.manualTotalOverride ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/5 text-white/70"}`}
                                      >
                                        {line.manualTotalOverride ? "Manueller Override aktiv" : "Automatik aktiv"}
                                      </button>
                                      {!line.manualTotalOverride ? <span>Auto = Menge × Einzelpreis</span> : null}
                                    </div>
                                  </div>
                                ) : (
                                  <span>{shownTotal ? `${shownTotal} €` : "—"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-white/45">Aktuelle Summe</div>
                    <div className="mt-1 text-lg font-bold text-white">{euroFromCents(totalDraftCents, selected.currencyCode)}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isEditingLines ? (
                      <>
                        <button
                          type="button"
                          onClick={addLine}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-sky-300/40 bg-sky-500/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-500/15"
                        >
                          + Leistung hinzufügen
                        </button>
                        <button
                          type="submit"
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLinesDraft(buildEditableLines(payloadLines));
                            setIsEditingLines(false);
                          }}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingLines(true)}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        Bearbeiten
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </InfoCard>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
