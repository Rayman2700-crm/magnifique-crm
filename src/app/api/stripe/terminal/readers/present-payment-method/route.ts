import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getIsDemoTenant } from "@/lib/demoMode";

export const runtime = "nodejs";

async function getIsCurrentUserDemoTenant() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user?.id) return false;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return getIsDemoTenant(supabase, (profile as any)?.tenant_id ?? null);
}

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

    const isDemoMode = await getIsCurrentUserDemoTenant();
    if (isDemoMode) {
      return NextResponse.json({
        ok: true,
        demo: true,
        reader: {
          id: readerId || "demo_reader",
          label: "Demo Terminal",
          status: "online",
          action: {
            type: "process_payment_intent",
            status: "succeeded",
          },
        },
        message: "Demo-Modus: Kartenpräsentation wurde simuliert.",
      });
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
