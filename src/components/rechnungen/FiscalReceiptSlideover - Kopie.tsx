
"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cancelFiscalReceiptMvp, openFiscalReceiptWhatsApp, sendFiscalReceiptEmail, updateFiscalReceiptDetails } from "@/app/rechnungen/actions";

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
  paymentMethodLabel?: string | null;
  paymentStatus?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  deliveries?: SlideoverDelivery[];
};

type SlideoverDelivery = {
  id: string;
  channel: string | null;
  status: string | null;
  recipient: string | null;
  subject: string | null;
  messagePreview: string | null;
  provider: string | null;
  providerMessageId: string | null;
  sentBy: string | null;
  sentByLabel: string | null;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  const abs = Math.abs(value) / 100;
  const formatted = new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
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

function formatReceiptStatus(
  value: string | null | undefined,
  options?: { isStornoReceipt?: boolean }
) {
  if (options?.isStornoReceipt) return "Stornobeleg";
  const normalized = String(value ?? "").toUpperCase();
  const labels: Record<string, string> = {
    REQUESTED: "Angelegt",
    CREATED: "Erstellt",
    ISSUED: "Ausgestellt",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Storniert",
    REVERSED: "Storniert",
    VERIFIED: "Verifiziert",
  };
  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "—");
}

function formatPaymentStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  const labels: Record<string, string> = {
    PENDING: "Ausstehend",
    PROCESSING: "Wird verarbeitet",
    COMPLETED: "Bezahlt",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Abgebrochen",
    REFUNDED: "Rückerstattet",
  };
  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "—");
}

function paymentStatusBadgeClass(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "COMPLETED") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (normalized === "PENDING" || normalized === "PROCESSING") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (normalized === "FAILED" || normalized === "CANCELLED") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (normalized === "REFUNDED") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/5 text-white/80";
}


function paymentStatusHint(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "PENDING") {
    return {
      className: "border-amber-400/20 bg-amber-400/10 text-amber-100",
      title: "Kartenzahlung wartet auf Stripe",
      text: "Die Zahlung ist angelegt, aber noch nicht bestätigt. Erst nach Stripe-COMPLETED gilt sie wirklich als bezahlt.",
    };
  }

  if (normalized === "PROCESSING") {
    return {
      className: "border-amber-400/20 bg-amber-400/10 text-amber-100",
      title: "Kartenzahlung wird verarbeitet",
      text: "Stripe verarbeitet die Zahlung gerade. Bitte noch keinen finalen Bezahlt-Stand annehmen, bis COMPLETED zurückkommt.",
    };
  }

  if (normalized === "FAILED") {
    return {
      className: "border-red-400/20 bg-red-400/10 text-red-200",
      title: "Kartenzahlung fehlgeschlagen",
      text: "Diese Zahlung ist nicht erfolgreich abgeschlossen. Prüfe den Terminal-/Stripe-Flow, bevor du weiterarbeitest.",
    };
  }

  if (normalized === "CANCELLED") {
    return {
      className: "border-red-400/20 bg-red-400/10 text-red-200",
      title: "Kartenzahlung abgebrochen",
      text: "Der Bezahlvorgang wurde abgebrochen. Es liegt keine erfolgreiche Kartenzahlung vor.",
    };
  }

  if (normalized === "REFUNDED") {
    return {
      className: "border-sky-400/20 bg-sky-400/10 text-sky-200",
      title: "Zahlung rückerstattet",
      text: "Diese Zahlung wurde bereits rückerstattet.",
    };
  }

  return null;
}


function formatDeliveryChannel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "EMAIL") return "E-Mail";
  if (normalized === "WHATSAPP") return "WhatsApp";
  return normalized || "—";
}

function formatDeliveryStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SENT") return "Gesendet";
  if (normalized === "FAILED") return "Fehlgeschlagen";
  if (normalized === "PENDING") return "Wird verarbeitet";
  return normalized || "—";
}

function deliveryBadgeClass(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SENT") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (normalized === "FAILED") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (normalized === "PENDING") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/80";
}

function isReceiptCancelled(value: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "CANCELLED" || normalized === "REVERSED";
}

function isStornoReceiptType(value: string | null | undefined, verificationNotes?: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "REVERSAL") return true;
  return String(verificationNotes ?? "").includes("Stornobeleg zu");
}

function parseStornoInfoFromNotes(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return { originalReceiptNumber: "", stornoReceiptNumber: "" };
  const originalMatch = text.match(/Stornobeleg zu\s+([A-Za-z0-9-]+)/i);
  const stornoMatch = text.match(/Storniert durch Beleg\s+([A-Za-z0-9-]+)/i);
  return {
    originalReceiptNumber: originalMatch?.[1] ?? "",
    stornoReceiptNumber: stornoMatch?.[1] ?? "",
  };
}

function badgeClass(value: string | null | undefined, kind: "signature" | "verification" | "event" | "status" = "event") {
  const normalized = String(value ?? "").toUpperCase();

  if (kind === "verification") {
    if (normalized === "VALID") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    if (normalized.includes("INVALID") || normalized.includes("FAIL")) return "border-red-400/20 bg-red-400/10 text-red-200";
  }

  if (kind === "signature") {
    if (normalized === "SIMULATED" || normalized === "SIGNED") return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    if (normalized === "PENDING") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  if (kind === "status") {
    if (normalized === "REQUESTED") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
    if (["CREATED", "ISSUED", "VERIFIED", "COMPLETED"].includes(normalized)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    if (["REQUESTED", "PENDING"].includes(normalized)) return "border-amber-400/20 bg-amber-400/10 text-amber-100";
    if (normalized.includes("FAIL") || normalized.includes("CANCEL") || normalized.includes("REVERSE")) return "border-red-400/20 bg-red-400/10 text-red-200";
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


function normalizePhoneForWhatsApp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let normalized = raw.replace(/[^\d+]/g, "");
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith("0")) normalized = `+43${normalized.slice(1)}`;
  if (!normalized.startsWith("+")) normalized = `+${normalized}`;
  return normalized.replace(/[^\d]/g, "");
}

function buildReceiptMailto(receiptNumber: string, providerName: string, paymentMethodLabel: string) {
  const subject = encodeURIComponent(`Beleg ${receiptNumber} – ${providerName || "Magnifique CRM"}`);
  const body = encodeURIComponent(
    `Hallo,\n\nim Anhang bzw. zur Ansicht dein Beleg ${receiptNumber}.\nZahlungsart: ${paymentMethodLabel || "—"}\n\nLiebe Grüße\n${providerName || "Magnifique CRM"}`
  );
  return `?subject=${subject}&body=${body}`;
}

function buildReceiptWhatsAppText(receiptNumber: string, providerName: string, amountLabel: string) {
  return `Hallo, hier ist dein Beleg ${receiptNumber}${amountLabel && amountLabel !== "—" ? ` über ${amountLabel}` : ""}.\n\nLiebe Grüße\n${providerName || "Magnifique CRM"}`;
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
      lineType:
        String(line.line_type ?? (String(line.reference_id ?? "").trim() ? "SERVICE" : "ITEM"))
          .trim()
          .toUpperCase() === "SERVICE"
          ? "SERVICE"
          : "ITEM",
      taxRate: Number(line.tax_rate ?? 20) || 20,
      name: String(line.name ?? ""),
      quantity: Number.isFinite(quantity) && quantity > 0 ? String(quantity) : "1",
      unitPriceGross: moneyInputFromCents(Number.isFinite(unitCents) ? unitCents : fallbackUnitCents),
      lineTotalGross: moneyInputFromCents(totalCents),
      manualTotalOverride: false,
    } satisfies EditableLine;
  });
}

function InfoCard({
  title,
  children,
  printKeepTogether = false,
}: {
  title: string;
  children: React.ReactNode;
  printKeepTogether?: boolean;
}) {
  return (
    <div className={`rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-[0_14px_40px_rgba(0,0,0,0.26)] receipt-print-card ${printKeepTogether ? "print-keep-together" : ""}`}>
      <div className="text-sm font-semibold text-white/92 print:text-black">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
  hoverClassName,
  className,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  hoverClassName?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/15 bg-white/5 transition-colors ${hoverClassName ?? "hover:bg-white/10"} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function HeaderActionButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/5"
    >
      {label}
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
  const [customerEmailDraft, setCustomerEmailDraft] = useState("");
  const [customerPhoneDraft, setCustomerPhoneDraft] = useState("");
  const [communicationOpen, setCommunicationOpen] = useState(false);
  const customerSubmitArmedRef = useRef(false);

  const selectedId = searchParams?.get("receipt") ?? "";
  const currentQuery = searchParams?.toString() ?? "";

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("receipt");
      params.delete("appointmentId");
      params.delete("salesOrder");
      params.delete("payment");
      const q = String(params.get("q") ?? "").trim();
      const filter = String(params.get("filter") ?? "").trim();
      const practitioner = String(params.get("practitioner") ?? "").trim();
      const success = String(params.get("success") ?? "").trim();
      const error = String(params.get("error") ?? "").trim();

      const clean = new URLSearchParams();
      if (q) clean.set("q", q);
      if (filter && filter !== "all") clean.set("filter", filter);
      if (practitioner && practitioner !== "all") clean.set("practitioner", practitioner);
      if (success) clean.set("success", success);
      if (error) clean.set("error", error);

      const qs = clean.toString();
      router.replace(qs ? `/rechnungen?${qs}` : "/rechnungen", { scroll: false });
    };
  }, [router, searchParams]);

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

  const paymentMethodLabel =
    selected?.paymentMethodLabel?.trim() ||
    readFirstString(payloadJson, [
      ["payment_method"],
      ["payment_method_name"],
      ["payment", "method_name"],
      ["payment", "method"],
      ["payment", "payment_method_name"],
    ]) || "—";

  const issuedAtLabel = selected ? (selected.issuedAt ? formatDateTime(selected.issuedAt) : formatDateTime(selected.createdAt)) : "—";
  const serviceOptions = selected?.availableServices ?? [];
  const customerEmail = selected?.customerEmail?.trim() || "";
  const customerPhone = selected?.customerPhone?.trim() || "";
  const deliveries = selected?.deliveries ?? [];
  const emailDeliveryCount = deliveries.filter(
    (delivery) => String(delivery.channel ?? "").trim().toUpperCase() === "EMAIL"
  ).length;
  const whatsappDeliveryCount = deliveries.filter(
    (delivery) => String(delivery.channel ?? "").trim().toUpperCase() === "WHATSAPP"
  ).length;
  const whatsappNumber = normalizePhoneForWhatsApp(customerPhone);
  const whatsappHref = whatsappNumber && selected
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildReceiptWhatsAppText(selected.receiptNumber, providerName, euroFromCents(selected.turnoverValueCents, selected.currencyCode))) }`
    : "";
  const isStornoReceipt = isStornoReceiptType(selected?.receiptType, selected?.verificationNotes);
  const isCancelled = isReceiptCancelled(selected?.status) || isStornoReceipt;
  const stornoInfo = parseStornoInfoFromNotes(selected?.verificationNotes);
  const statusLabel = formatReceiptStatus(selected?.status, { isStornoReceipt });
  const receiptTypeLabel = isStornoReceipt ? "STORNOBELEG" : (selected?.receiptType || "—");
  const paymentMethodDisplayLabel = isStornoReceipt ? "Storno / Gegenbeleg" : paymentMethodLabel;
  const paymentStatusLabel = formatPaymentStatus(selected?.paymentStatus);

  useEffect(() => {
    if (!selected) return;
    setCustomerDraft(customerName);
    setCustomerEmailDraft(customerEmail);
    setCustomerPhoneDraft(customerPhone);
    setCommunicationOpen(false);
    setLinesDraft(buildEditableLines(payloadLines));
    setIsEditingCustomer(false);
    setIsEditingLines(false);
    setShowProviderImage(true);
    customerSubmitArmedRef.current = false;
  }, [selected?.id, customerName, customerEmail, customerPhone, payloadLines]);

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

  const receipt = selected;

  return createPortal(
    <>
      <style jsx global>{`
        .receipt-scroll-hidden {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .receipt-scroll-hidden::-webkit-scrollbar {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          html,
          body {
            background: #ffffff !important;
            color: #111111 !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden;
          }

          .receipt-print-root,
          .receipt-print-root * {
            visibility: visible;
          }

          .receipt-print-root {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #111111 !important;
            box-shadow: none !important;
            border: 0 !important;
            transform: none !important;
          }

          .receipt-print-hide {
            display: none !important;
          }

          .receipt-print-scroll {
            overflow: visible !important;
            padding: 0 !important;
            height: auto !important;
            flex: none !important;
          }

          .receipt-print-card,
          .receipt-print-card * {
            color: #111111 !important;
          }

          .receipt-print-card {
            background: #ffffff !important;
            border: 1px solid #d4d4d8 !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .receipt-print-grid-card {
            background: #ffffff !important;
            border: 1px solid #d4d4d8 !important;
          }

          .print-text-muted {
            color: #52525b !important;
          }

          .print-table thead {
            background: #f4f4f5 !important;
          }

          .print-table th,
          .print-table td {
            color: #111111 !important;
            border-color: #d4d4d8 !important;
          }

          .print-keep-together {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 1400 }}>
        <div
          onClick={close}
          className="receipt-print-hide"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.68)",
            backdropFilter: "blur(6px)",
            opacity: shown ? 1 : 0,
            transition: "opacity 200ms ease",
            pointerEvents: shown ? "auto" : "none",
          }}
        />
        <div
          className="receipt-print-root"
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            bottom: 18,
            width: 470,
            maxWidth: "calc(100vw - 36px)",
            transform: shown ? "translateX(0)" : "translateX(24px)",
            opacity: shown ? 1 : 0,
            transition: "transform 220ms ease, opacity 220ms ease",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, rgba(16,16,16,0.96), rgba(10,10,10,0.96))",
            color: "white",
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="receipt-print-hide">
            <div className="p-4 pb-3">
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: receipt.salesOrderId ? "repeat(6, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))" }}
              >
                {receipt.salesOrderId ? (
                  <Link
                    href={`/rechnungen?${new URLSearchParams({ q: receipt.salesOrderId }).toString()}`}
                    aria-label="Sales Order suchen"
                    title="Sales Order suchen"
                    className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    const iframe = document.createElement("iframe");
                    iframe.style.position = "fixed";
                    iframe.style.right = "0";
                    iframe.style.bottom = "0";
                    iframe.style.width = "0";
                    iframe.style.height = "0";
                    iframe.style.border = "0";
                    iframe.style.opacity = "0";
                    iframe.style.pointerEvents = "none";
                    iframe.setAttribute("aria-hidden", "true");
                    iframe.src = `/rechnungen/thermal-print?receipt=${encodeURIComponent(receipt.id)}`;

                    const cleanup = () => {
                      window.removeEventListener("afterprint", cleanup);
                      setTimeout(() => {
                        iframe.remove();
                      }, 300);
                    };

                    window.addEventListener("afterprint", cleanup, { once: true });
                    document.body.appendChild(iframe);
                  }}
                  aria-label="Thermal drucken"
                  title="Thermal drucken"
                  className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9V3h12v6" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 14h12v7H6z" />
                    <path d="M6 18h12" />
                  </svg>
                </button>

                {customerEmail && !isCancelled ? (
                  <form action={sendFiscalReceiptEmail} className="contents">
                    <input type="hidden" name="receipt_id" value={receipt.id} />
                    <input type="hidden" name="return_query" value={currentQuery} />
                    <button
                      type="submit"
                      aria-label="E-Mail senden"
                      title="E-Mail senden"
                      className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 transition-colors hover:bg-white/10"
                    >
                      <span className="relative inline-flex h-9 w-9 items-center justify-center">
                        <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_rgba(11,11,12,0.82),0_0_12px_rgba(37,99,235,0.42)]">
                          {emailDeliveryCount}
                        </span>
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 6h16v12H4z" />
                          <path d="m4 8 8 6 8-6" />
                        </svg>
                      </span>
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-label={isCancelled ? "Versand bei storniertem Beleg deaktiviert" : "Keine E-Mail hinterlegt"}
                    title={isCancelled ? "Versand bei storniertem Beleg deaktiviert" : "Keine E-Mail hinterlegt"}
                    className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-white opacity-45 cursor-not-allowed"
                  >
                    <span className="relative inline-flex h-9 w-9 items-center justify-center">
                      <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_rgba(11,11,12,0.82),0_0_12px_rgba(37,99,235,0.42)] opacity-100">
                        {emailDeliveryCount}
                      </span>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 8 8 6 8-6" />
                      </svg>
                    </span>
                  </button>
                )}

                {whatsappHref && !isCancelled ? (
                  <form action={openFiscalReceiptWhatsApp} className="contents">
                    <input type="hidden" name="receipt_id" value={receipt.id} />
                    <input type="hidden" name="return_query" value={currentQuery} />
                    <button
                      type="submit"
                      aria-label="WhatsApp senden"
                      title="WhatsApp senden"
                      className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 transition-colors hover:bg-white/10"
                    >
                      <span className="relative inline-flex h-9 w-9 items-center justify-center">
                        <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_rgba(11,11,12,0.82),0_0_12px_rgba(37,99,235,0.42)]">
                          {whatsappDeliveryCount}
                        </span>
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#34d399" aria-hidden="true">
                          <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Zm-8.45 18.3h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.66-.24-.38a9.9 9.9 0 0 1-1.52-5.21c0-5.46 4.45-9.91 9.92-9.91 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.92-9.92 9.92Zm5.44-7.42c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.66.15-.2.3-.76.98-.94 1.18-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.91-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.35Z" />
                        </svg>
                      </span>
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-label={isCancelled ? "Versand bei storniertem Beleg deaktiviert" : "Keine Telefonnummer hinterlegt"}
                    title={isCancelled ? "Versand bei storniertem Beleg deaktiviert" : "Keine Telefonnummer hinterlegt"}
                    className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-white opacity-45 cursor-not-allowed"
                  >
                    <span className="relative inline-flex h-9 w-9 items-center justify-center">
                      <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_rgba(11,11,12,0.82),0_0_12px_rgba(37,99,235,0.42)] opacity-100">
                        {whatsappDeliveryCount}
                      </span>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#34d399" aria-hidden="true">
                        <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Zm-8.45 18.3h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.66-.24-.38a9.9 9.9 0 0 1-1.52-5.21c0-5.46 4.45-9.91 9.92-9.91 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.92-9.92 9.92Zm5.44-7.42c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.66.15-.2.3-.76.98-.94 1.18-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.91-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.35Z" />
                      </svg>
                    </span>
                  </button>
                )}

                <form
                  action={cancelFiscalReceiptMvp}
                  className="contents"
                  onSubmit={(event) => {
                    if (isCancelled) {
                      event.preventDefault();
                      return;
                    }
                    const confirmed = window.confirm(`Beleg ${receipt.receiptNumber} wirklich stornieren?`);
                    if (!confirmed) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="receipt_id" value={receipt.id} />
                  <input type="hidden" name="return_query" value={currentQuery} />
                  <button
                    type="submit"
                    disabled={isCancelled}
                    className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/5 disabled:hover:text-white"
                    title={isStornoReceipt ? "Ein Stornobeleg kann nicht erneut storniert werden" : isCancelled ? "Beleg ist bereits storniert" : "Beleg stornieren"}
                  >
                    {isStornoReceipt ? "Stornobeleg" : isCancelled ? "Storniert" : "Storno"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Schließen"
                  title="Schließen"
                  className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-white transition-colors hover:bg-red-600/90 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mx-4 border-t border-white/10" />

            <div className="px-4 pt-3 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-white/58">Rechnungen / Belegdetails</div>
                  <div className="text-[28px] font-extrabold leading-none text-white">Beleg {receipt.receiptNumber}</div>
                  <div className="mt-2 text-[13px] text-white/46">
                    {formatDateTime(receipt.createdAt)} · {euroFromCents(receipt.turnoverValueCents, receipt.currencyCode)}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(receipt.status, "status")}`}>
                      {statusLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                      {paymentMethodDisplayLabel}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentStatusBadgeClass(receipt.paymentStatus)}`}>
                      {paymentStatusLabel}
                    </span>
                  </div>
                </div>

                <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-base font-bold text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
                  {receipt.providerAvatarUrl && showProviderImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={receipt.providerAvatarUrl}
                      alt={providerName}
                      className="h-full w-full object-cover"
                      onError={() => setShowProviderImage(false)}
                    />
                  ) : (
                    <span>{providerInitials(providerName, receipt.providerInitials)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="receipt-scroll-hidden hide-scrollbar flex-1 overflow-y-auto p-4 receipt-print-scroll">
            <div className="space-y-4">
              <div className="hidden print:block">
                <div className="flex items-start justify-between gap-6 border-b border-black/10 pb-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-black/60">Magnifique CRM</div>
                    <div className="mt-2 text-3xl font-extrabold text-black">Beleg {receipt.receiptNumber}</div>
                    <div className="mt-2 text-sm text-black/65">{issuedAtLabel}</div>
                  </div>
                  <div className="text-right text-sm text-black/75">
                    <div className="font-semibold text-black">{providerName}</div>
                    <div>Kunde: {customerDraft || customerName}</div>
                    <div>Zahlungsart: {paymentMethodDisplayLabel}</div>
                    <div>Zahlungsstatus: {paymentStatusLabel}</div>
                  </div>
                </div>
              </div>

              {isStornoReceipt ? (
                <div className="rounded-[18px] border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-100 print-keep-together">
                  Dieser Beleg ist ein Stornobeleg{stornoInfo.originalReceiptNumber ? ` zu Beleg ${stornoInfo.originalReceiptNumber}` : ""}.
                </div>
              ) : isCancelled ? (
                <div className="rounded-[18px] border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-100 print-keep-together">
                  Dieser Beleg ist storniert{stornoInfo.stornoReceiptNumber ? ` durch Beleg ${stornoInfo.stornoReceiptNumber}` : ""}.
                </div>
              ) : null}

              {paymentStatusHint(receipt.paymentStatus) ? (
                <div className={`rounded-[18px] border px-5 py-4 text-sm print-keep-together ${paymentStatusHint(receipt.paymentStatus)?.className}`}>
                  <div className="font-semibold">{paymentStatusHint(receipt.paymentStatus)?.title}</div>
                  <div className="mt-1">{paymentStatusHint(receipt.paymentStatus)?.text}</div>
                </div>
              ) : null}

              <InfoCard title="Kunde" printKeepTogether>
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
                  <input type="hidden" name="receipt_id" value={receipt.id} />
                  <input type="hidden" name="return_query" value={currentQuery} />
                  <input type="hidden" name="provider_name" value={providerName} />
                  <input type="hidden" name="lines_json" value={serializedLines} />

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 receipt-print-grid-card md:col-span-2">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs uppercase tracking-wide text-white/45 print-text-muted">Kunde</div>
                          {isEditingCustomer ? (
                            <input
                              autoFocus
                              value={customerDraft}
                              onChange={(e) => setCustomerDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                              }}
                              className="mt-1 h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-3 text-base font-semibold text-white outline-none receipt-print-hide"
                            />
                          ) : null}
                          <input type="hidden" name="customer_name" value={customerDraft} />
                          <div className="mt-1 text-base font-semibold text-white print:text-black">{customerDraft || "Nicht hinterlegt"}</div>
                        </div>

                      </div>
                    </div>

                    <div className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 receipt-print-grid-card">
                      <div className="text-xs uppercase tracking-wide text-white/45 print-text-muted">E-Mail</div>
                      {isEditingCustomer ? (
                        <input
                          value={customerEmailDraft}
                          onChange={(e) => setCustomerEmailDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                          className="mt-1 h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none receipt-print-hide"
                          placeholder="kunde@mail.com"
                        />
                      ) : null}
                      <input type="hidden" name="customer_email" value={customerEmailDraft} />
                      <div className="mt-1 text-[13px] font-semibold leading-5 text-white print:text-black break-all">{customerEmailDraft || "Nicht hinterlegt"}</div>
                    </div>

                    <div className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 receipt-print-grid-card">
                      <div className="text-xs uppercase tracking-wide text-white/45 print-text-muted">Telefon / WhatsApp</div>
                      {isEditingCustomer ? (
                        <input
                          value={customerPhoneDraft}
                          onChange={(e) => setCustomerPhoneDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                          className="mt-1 h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none receipt-print-hide"
                          placeholder="+43..."
                        />
                      ) : null}
                      <input type="hidden" name="customer_phone" value={customerPhoneDraft} />
                      <div className="mt-1 text-[13px] font-semibold leading-5 text-white print:text-black">{customerPhoneDraft || "Nicht hinterlegt"}</div>
                    </div>
                  </div>

                  {isEditingCustomer ? (
                    <div className="flex flex-wrap gap-2 receipt-print-hide">
                      <button
                        type="submit"
                        onClick={() => {
                          customerSubmitArmedRef.current = true;
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-[16px] border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          customerSubmitArmedRef.current = false;
                          setCustomerDraft(customerName);
                          setCustomerEmailDraft(customerEmail);
                          setCustomerPhoneDraft(customerPhone);
                          setIsEditingCustomer(false);
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : null}
                </form>
              </InfoCard>

              <InfoCard title="Leistungen" printKeepTogether>
                <form action={updateFiscalReceiptDetails} className="space-y-4">
                  <input type="hidden" name="receipt_id" value={receipt.id} />
                  <input type="hidden" name="return_query" value={currentQuery} />
                  <input type="hidden" name="provider_name" value={providerName} />
                  <input type="hidden" name="customer_name" value={customerDraft} />
                  <input type="hidden" name="customer_email" value={customerEmailDraft} />
                  <input type="hidden" name="customer_phone" value={customerPhoneDraft} />
                  <input type="hidden" name="lines_json" value={serializedLines} />

                  {false ? (
                    <div className="space-y-3 receipt-print-hide">
                      {linesDraft.length === 0 ? (
                        <div className="rounded-[16px] border border-dashed border-white/10 bg-black/20 px-4 py-5 text-center text-sm text-white/55">
                          Keine Positionen vorhanden.
                        </div>
                      ) : (
                        linesDraft.map((line, index) => {
                          const autoTotal = formatMoneyInput(computeLineTotal(line.quantity, line.unitPriceGross));
                          const shownTotal = line.manualTotalOverride ? line.lineTotalGross : autoTotal;

                          return (
                            <div
                              key={`${receipt.id}-edit-line-${index}`}
                              className="rounded-[18px] border border-white/10 bg-black/20 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Position {index + 1}</div>
                                  <div className="mt-1 text-sm font-semibold text-white/88">
                                    {line.name || "Neue Leistung"}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setLinesDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-red-500/20 bg-red-500/10 text-lg font-semibold text-red-100 transition-colors hover:bg-red-500/15"
                                  title="Zeile entfernen"
                                >
                                  −
                                </button>
                              </div>

                              <div className="grid gap-3">
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                    Leistung wählen
                                  </label>
                                  <select
                                    value={line.serviceId ?? "__custom__"}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      if (nextValue === "__custom__") {
                                        updateLine(index, (current) => ({
                                          ...current,
                                          serviceId: null,
                                          lineType: "ITEM",
                                        }));
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
                                          lineType: "SERVICE",
                                          name: selectedService?.name ?? current.name,
                                          unitPriceGross: nextUnitPrice,
                                          lineTotalGross: current.manualTotalOverride ? current.lineTotalGross : recalculatedTotal,
                                        };
                                      });
                                    }}
                                    className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                  >
                                    <option value="__custom__">Freie Eingabe / manuell</option>
                                    {serviceOptions.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.name}
                                        {typeof service.defaultPriceCents === "number"
                                          ? ` · ${euroFromCents(service.defaultPriceCents, receipt.currencyCode || "EUR")}`
                                          : ""}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                    Bezeichnung
                                  </label>
                                  <input
                                    value={line.name}
                                    onChange={(e) =>
                                      updateLine(index, (current) => ({
                                        ...current,
                                        name: e.target.value,
                                        serviceId: current.serviceId,
                                        lineType: current.serviceId ? "SERVICE" : "ITEM",
                                      }))
                                    }
                                    className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                    placeholder="Leistungsname"
                                  />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                      Menge
                                    </label>
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
                                      className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-3 text-center text-sm text-white outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                      Einzelpreis
                                    </label>
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
                                      className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                                      Gesamt
                                    </label>
                                    <input
                                      value={shownTotal}
                                      disabled={!line.manualTotalOverride}
                                      onChange={(e) => updateLine(index, (current) => ({ ...current, lineTotalGross: e.target.value }))}
                                      className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateLine(index, (current) => ({
                                        ...current,
                                        manualTotalOverride: !current.manualTotalOverride,
                                        lineTotalGross: !current.manualTotalOverride ? current.lineTotalGross : autoTotal,
                                      }))
                                    }
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                      line.manualTotalOverride
                                        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
                                        : "border-white/10 bg-white/5 text-white/70"
                                    }`}
                                  >
                                    {line.manualTotalOverride ? "Manueller Gesamtpreis aktiv" : "Gesamtpreis automatisch"}
                                  </button>
                                  <div className="text-[11px] text-white/48">
                                    {!line.manualTotalOverride ? "Automatik = Menge × Einzelpreis" : "Du überschreibst den Gesamtpreis manuell"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[16px] border border-white/10 receipt-print-grid-card">
                      <table className="min-w-full table-fixed text-sm print-table">
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
                              <td colSpan={4} className="px-4 py-6 text-center text-white/45 print:text-black/60">
                                Keine Positionen gefunden.
                              </td>
                            </tr>
                          ) : (
                            linesDraft.map((line, index) => (
                              <tr key={`${receipt.id}-payload-line-${index}`} className="border-b border-white/5 last:border-b-0 align-top">
                                <td className="px-4 py-3 text-white/90 print:text-black">{line.name || "—"}</td>
                                <td className="px-2 py-3 text-white/70 print:text-black">{line.quantity || "—"}</td>
                                <td className="px-2 py-3 text-white/85 print:text-black">
                                  {line.unitPriceGross ? `${line.unitPriceGross} €` : "—"}
                                </td>
                                <td className="px-2 py-3 text-white/90 print:text-black">
                                  {line.lineTotalGross ? `${line.lineTotalGross} €` : "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 receipt-print-grid-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-white/45 print-text-muted">Aktuelle Summe</div>
                        <div className="mt-1 text-[15px] font-semibold text-white print:text-black">
                          {euroFromCents(totalDraftCents, receipt.currencyCode)}
                        </div>
                      </div>

                    </div>
                  </div>
                </form>
              </InfoCard>

              <InfoCard title="Versand & Kommunikation" printKeepTogether>
                <button
                  type="button"
                  onClick={() => setCommunicationOpen((value) => !value)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-white print:text-black">Versandhistorie</div>
                    <div className="mt-1 text-xs text-white/50 print:text-black/60">
                      {communicationOpen ? "Historie geöffnet." : "Eingeklappt – bei Bedarf öffnen."}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/60 print:border-black/10 print:bg-black/5 print:text-black/70">
                      {deliveries.length} Eintrag{deliveries.length === 1 ? "" : "e"}
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-white/80 print:border-black/10 print:bg-black/5 print:text-black">
                      {communicationOpen ? "−" : "+"}
                    </span>
                  </div>
                </button>

                {communicationOpen ? (
                  <div className="mt-5 space-y-3">
                    {deliveries.length === 0 ? (
                      <div className="rounded-[16px] border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55 print:text-black/60">
                        Noch kein Versand protokolliert.
                      </div>
                    ) : (
                      deliveries.map((delivery) => (
                        <div key={delivery.id} className="rounded-[16px] border border-white/10 bg-black/20 p-4 receipt-print-grid-card">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${deliveryBadgeClass(delivery.status)}`}>
                                  {formatDeliveryStatus(delivery.status)}
                                </span>
                                <span className="text-sm font-semibold text-white print:text-black">{formatDeliveryChannel(delivery.channel)}</span>
                              </div>
                              <div className="mt-2 text-sm text-white/80 print:text-black">{delivery.recipient || "—"}</div>
                            </div>
                            <div className="text-right text-xs text-white/55 print:text-black/60">
                              <div>{formatDateTime(delivery.sentAt || delivery.failedAt || delivery.createdAt)}</div>
                              {delivery.sentByLabel ? <div className="mt-1">von {delivery.sentByLabel}</div> : null}
                            </div>
                          </div>

                          {delivery.subject ? (
                            <div className="mt-3 text-xs uppercase tracking-wide text-white/40 print-text-muted">Betreff</div>
                          ) : null}
                          {delivery.subject ? <div className="mt-1 text-sm text-white/75 print:text-black">{delivery.subject}</div> : null}

                          {delivery.errorMessage ? (
                            <div className="mt-3 rounded-[16px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100 print:border-red-200 print:bg-red-50 print:text-red-700">
                              {delivery.errorMessage}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </InfoCard>

              <div className="hidden rounded-[18px] border border-black/10 bg-white p-5 print:block print-keep-together">
                {isCancelled ? (
                  <div className="mb-4 rounded-[16px] border border-red-300 bg-red-50 px-4 py-3 text-center text-base font-extrabold uppercase tracking-[0.16em] text-red-700">
                    Storniert
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-4 text-sm">
                  <div className="text-black/70">Zahlungsart: {paymentMethodDisplayLabel}</div>
                  <div className="font-semibold text-black">
                    {paymentMethodDisplayLabel !== "—" ? `${paymentMethodDisplayLabel} · ${issuedAtLabel}` : `Belegdatum ${issuedAtLabel}`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
