import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const readerId = String(body.reader_id ?? "").trim();

    if (!readerId) {
      return NextResponse.json(
        { ok: false, error: "reader_id fehlt." },
        { status: 400 }
      );
    }

    const reader = await stripe.testHelpers.terminal.readers.presentPaymentMethod(
      readerId,
      {}
    );

    return NextResponse.json({
      ok: true,
      reader: {
        id: reader.id,
        label: reader.label,
        status: reader.status,
        action: reader.action,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Simulierte Kartenpräsentation fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
