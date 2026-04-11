import { NextResponse } from "next/server";
import { buildDailyClosingPdf, type DailyClosingPdfGroup } from "@/lib/buildFiscalReceiptPdf";

type DailyClosingPdfReceipt = {
  receiptNumber?: string | null;
  issuedAt?: string | null;
  customerName?: string | null;
  paymentMethodLabel?: string | null;
  amountCents?: number;
  isStorno?: boolean;
};

type DailyClosingPdfSnapshotGroup = DailyClosingPdfGroup & {
  receipts?: DailyClosingPdfReceipt[];
};

type DailyClosingPdfSnapshot = {
  summary?: {
    closingDate?: string;
    receiptCount?: number;
    cashCents?: number;
    cardCents?: number;
    transferCents?: number;
    totalCents?: number;
    stornoCount?: number;
    stornoCents?: number;
  };
  groups?: DailyClosingPdfSnapshotGroup[];
};

function toNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseSnapshot(raw: string): DailyClosingPdfSnapshot {
  if (!raw) return {};

  try {
    return JSON.parse(raw) as DailyClosingPdfSnapshot;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw)) as DailyClosingPdfSnapshot;
    } catch {
      return {};
    }
  }
}

function normalizeReceipts(value: unknown): DailyClosingPdfReceipt[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => ({
    receiptNumber: toText((entry as Record<string, unknown>)?.receiptNumber) || null,
    issuedAt: toText((entry as Record<string, unknown>)?.issuedAt) || null,
    customerName: toText((entry as Record<string, unknown>)?.customerName) || null,
    paymentMethodLabel: toText((entry as Record<string, unknown>)?.paymentMethodLabel) || null,
    amountCents: toNumber((entry as Record<string, unknown>)?.amountCents),
    isStorno: normalizeBoolean((entry as Record<string, unknown>)?.isStorno),
  }));
}

function normalizeGroups(value: unknown): DailyClosingPdfSnapshotGroup[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;

    return {
      key: toText(row.key) || null,
      tenantId: toText(row.tenantId) || null,
      cashRegisterId: toText(row.cashRegisterId) || null,
      providerName: toText(row.providerName) || null,
      receiptCount: toNumber(row.receiptCount),
      cashCents: toNumber(row.cashCents),
      cardCents: toNumber(row.cardCents),
      transferCents: toNumber(row.transferCents),
      totalCents: toNumber(row.totalCents),
      stornoCount: toNumber(row.stornoCount),
      stornoCents: toNumber(row.stornoCents),
      latestIssuedAt: toText(row.latestIssuedAt) || null,
      receipts: normalizeReceipts(row.receipts),
    };
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const mode = searchParams.get("mode") === "single" ? "single" : "all";
    const closingDate =
      toText(searchParams.get("closingDate")) || new Date().toISOString().slice(0, 10);
    const practitioner = toText(searchParams.get("practitioner"));
    const generatedByName = toText(searchParams.get("generatedByName")) || "Unbekannt";
    const generatedAt = toText(searchParams.get("generatedAt")) || new Date().toISOString();
    const snapshotRaw = searchParams.get("snapshot") ?? "";

    const snapshot = parseSnapshot(snapshotRaw);
    const summary = snapshot.summary ?? {};
    const groups = normalizeGroups(snapshot.groups);

    const pdf = await buildDailyClosingPdf({
      closingDate,
      mode,
      practitionerLabel: practitioner && practitioner !== "all" ? practitioner : "Alle",
      generatedByName,
      generatedAtLabel: generatedAt,
      summary: {
        receiptCount: toNumber(summary.receiptCount),
        cashCents: toNumber(summary.cashCents),
        cardCents: toNumber(summary.cardCents),
        transferCents: toNumber(summary.transferCents),
        totalCents: toNumber(summary.totalCents),
        stornoCount: toNumber(summary.stornoCount),
        stornoCents: toNumber(summary.stornoCents),
      },
      groups: groups as DailyClosingPdfGroup[],
    });

    const safeDate = closingDate.replace(/[^0-9-]/g, "") || "tagesabschluss";
    const filename =
      mode === "single"
        ? `tagesabschluss-kassa-${safeDate}.pdf`
        : `tagesabschluss-${safeDate}.pdf`;

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF konnte nicht erzeugt werden.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}