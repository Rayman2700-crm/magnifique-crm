import { NextResponse } from "next/server";
import { listStripeTerminalReaders } from "@/lib/stripe/server";

export const runtime = "nodejs";

function rankReader(reader: any) {
  const status = String(reader.status ?? "").trim().toLowerCase();
  const actionStatus = String(reader.action?.status ?? "").trim().toLowerCase();
  if (status === "online" && !actionStatus) return 0;
  if (status === "online") return 1;
  if (status === "offline") return 3;
  return 2;
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
  if (actionStatus) {
    return {
      isReady: false,
      reason: `Reader ist gerade beschäftigt (${actionStatus}).`,
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
