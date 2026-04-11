import { NextResponse } from "next/server";
import { listStripeTerminalReaders } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const readers = await listStripeTerminalReaders();

    return NextResponse.json({
      readers: readers.map((reader) => ({
        id: reader.id,
        label: reader.label ?? null,
        serialNumber: reader.serial_number ?? null,
        deviceType: reader.device_type ?? null,
        status: reader.status ?? null,
        location: typeof reader.location === "string" ? reader.location : reader.location?.id ?? null,
        actionStatus: reader.action?.status ?? null,
        actionType: reader.action?.type ?? null,
        lastSeenAt: reader.last_seen_at ?? null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Reader konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
