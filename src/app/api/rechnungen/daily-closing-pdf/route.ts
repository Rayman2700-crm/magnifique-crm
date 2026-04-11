import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyClosingPdf,
  type DailyClosingPdfGroup,
} from "@/lib/buildFiscalReceiptPdf";

export const runtime = "nodejs";

type PeriodType = "day" | "month" | "year";
type ModeType = "all" | "single";

type DailyClosingPdfReceipt = {
  receiptNumber?: string | null;
  issuedAt?: string | null;
  customerName?: string | null;
  paymentMethodLabel?: string | null;
  amountCents?: number;
  statusLabel?: string | null;
  isStorno?: boolean | null;
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
    return {};
  }
}

function normalizeReceipts(value: unknown): DailyClosingPdfReceipt[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      receiptNumber: toText(row.receiptNumber) || null,
      issuedAt: toText(row.issuedAt) || null,
      customerName: toText(row.customerName) || null,
      paymentMethodLabel: toText(row.paymentMethodLabel) || null,
      amountCents: toNumber(row.amountCents),
      statusLabel: toText(row.statusLabel) || null,
      isStorno: normalizeBoolean(row.isStorno),
    };
  });
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

function buildFileName(periodType: PeriodType, mode: ModeType, closingDate: string) {
  const safeDate = closingDate.replace(/[^0-9-]/g, "") || "abschluss";

  if (periodType === "month") {
    return mode === "single"
      ? `monatsabschluss-kassa-${safeDate}.pdf`
      : `monatsabschluss-${safeDate}.pdf`;
  }

  if (periodType === "year") {
    return mode === "single"
      ? `jahresabschluss-kassa-${safeDate}.pdf`
      : `jahresabschluss-${safeDate}.pdf`;
  }

  return mode === "single"
    ? `tagesabschluss-kassa-${safeDate}.pdf`
    : `tagesabschluss-${safeDate}.pdf`;
}

async function createPdfFromInput(input: {
  periodType: PeriodType;
  mode: ModeType;
  closingDate: string;
  practitioner: string;
  generatedByName: string;
  generatedAt: string;
  snapshotRaw: string;
}) {
  const snapshot = parseSnapshot(input.snapshotRaw);
  const summary = snapshot.summary ?? {};
  const groups = normalizeGroups(snapshot.groups);

  const pdf = await buildDailyClosingPdf(({
    closingDate: input.closingDate,
    mode: input.mode,
    periodType: input.periodType,
    practitionerLabel:
      input.practitioner && input.practitioner !== "all" ? input.practitioner : "Alle",
    generatedByName: input.generatedByName || "Unbekannt",
    generatedAtLabel: input.generatedAt || new Date().toISOString(),
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
  }) as any);

  const filename = buildFileName(input.periodType, input.mode, input.closingDate);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const periodTypeRaw = toText(formData.get("periodType"));
    const modeRaw = toText(formData.get("mode"));
    const closingDate =
      toText(formData.get("closingDate")) || new Date().toISOString().slice(0, 10);
    const practitioner = toText(formData.get("practitioner"));
    const generatedByName = toText(formData.get("generatedByName")) || "Unbekannt";
    const generatedAt = toText(formData.get("generatedAt")) || new Date().toISOString();
    const snapshotRaw = toText(formData.get("snapshot"));

    const periodType: PeriodType =
      periodTypeRaw === "month" || periodTypeRaw === "year" ? periodTypeRaw : "day";
    const mode: ModeType = modeRaw === "single" ? "single" : "all";

    return await createPdfFromInput({
      periodType,
      mode,
      closingDate,
      practitioner,
      generatedByName,
      generatedAt,
      snapshotRaw,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF konnte nicht erzeugt werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const periodTypeRaw = toText(searchParams.get("periodType"));
    const modeRaw = toText(searchParams.get("mode"));
    const closingDate =
      toText(searchParams.get("closingDate")) || new Date().toISOString().slice(0, 10);
    const practitioner = toText(searchParams.get("practitioner"));
    const generatedByName = toText(searchParams.get("generatedByName")) || "Unbekannt";
    const generatedAt = toText(searchParams.get("generatedAt")) || new Date().toISOString();
    const snapshotRaw = toText(searchParams.get("snapshot"));

    const periodType: PeriodType =
      periodTypeRaw === "month" || periodTypeRaw === "year" ? periodTypeRaw : "day";
    const mode: ModeType = modeRaw === "single" ? "single" : "all";

    return await createPdfFromInput({
      periodType,
      mode,
      closingDate,
      practitioner,
      generatedByName,
      generatedAt,
      snapshotRaw,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF konnte nicht erzeugt werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
