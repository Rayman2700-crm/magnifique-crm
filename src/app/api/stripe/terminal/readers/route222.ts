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

export async function GET() {
  try {
    const readers = await listStripeTerminalReaders();
    const ordered = [...readers].sort((a, b) => rankReader(a) - rankReader(b));

    return NextResponse.json({
      preferredReaderId: ordered[0]?.id ?? null,
      readers: ordered.map((reader) => ({
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
