import { NextResponse } from "next/server";
import { listStripeTerminalReaders } from "@/lib/stripe/server";

export const runtime = "nodejs";

function isReaderBlockingActionStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "in_progress" || normalized === "pending";
}

function isReaderRecoverableActionStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "failed" || normalized === "succeeded" || normalized === "canceled" || normalized === "cancelled";
}

function rankReader(reader: any) {
  const status = String(reader.status ?? "").trim().toLowerCase();
  const actionStatus = String(reader.action?.status ?? "").trim().toLowerCase();
  if (status === "online" && !actionStatus) return 0;
  if (status === "online" && isReaderRecoverableActionStatus(actionStatus)) return 1;
  if (status === "online") return 2;
  if (status === "offline") return 4;
  return 3;
}

function buildReadiness(reader: any) {
  const status = String(reader.status ?? "").trim().toLowerCase();
  const actionStatus = String(reader.action?.status ?? "").trim().toLowerCase();

  if (status !== "online") {
    return {
      isReady: false,
      reason: status ? `Reader ist ${status}.` : "Reader ist nicht online.",
    };
  }

  if (isReaderBlockingActionStatus(actionStatus)) {
    return {
      isReady: false,
      reason: `Reader ist gerade beschäftigt (${actionStatus}).`,
    };
  }

  if (isReaderRecoverableActionStatus(actionStatus)) {
    return {
      isReady: true,
      reason: `Reader hatte einen alten Abschlusszustand (${actionStatus}) und kann erneut verwendet werden.`,
    };
  }

  return {
    isReady: true,
    reason: null,
  };
}

export async function GET() {
  try {
    const readers = await listStripeTerminalReaders();
    const ordered = [...readers].sort((a, b) => rankReader(a) - rankReader(b));
    const prepared = ordered.map((reader) => {
      const readiness = buildReadiness(reader);
      return {
        id: reader.id,
        label: reader.label ?? null,
        serialNumber: reader.serial_number ?? null,
        deviceType: reader.device_type ?? null,
        status: reader.status ?? null,
        location: typeof reader.location === "string" ? reader.location : reader.location?.id ?? null,
        actionStatus: reader.action?.status ?? null,
        actionType: reader.action?.type ?? null,
        lastSeenAt: reader.last_seen_at ?? null,
        isReady: readiness.isReady,
        readinessReason: readiness.reason,
      };
    });

    const preferred = prepared.find((reader) => reader.isReady) ?? prepared[0] ?? null;

    return NextResponse.json(
      {
        preferredReaderId: preferred?.id ?? null,
        hasReadyReader: prepared.some((reader) => reader.isReady),
        readers: prepared,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Reader konnten nicht geladen werden." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
