import { NextResponse } from "next/server";
import { stripe, requireStripeTerminalLocationId } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const location = requireStripeTerminalLocationId();

    const reader = await stripe.terminal.readers.create({
      registration_code: "simulated-wpe",
      label: `Simulated Reader ${new Date().toISOString()}`,
      location,
    });

    return NextResponse.json({
      ok: true,
      reader: {
        id: reader.id,
        label: reader.label,
        device_type: reader.device_type,
        status: reader.status,
        location: reader.location,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Simulierter Reader konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}
