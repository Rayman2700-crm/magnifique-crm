import { NextResponse } from "next/server";
import { stripe, requireStripeTerminalLocationId } from "@/lib/stripe/server";
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

export async function POST() {
  try {
    const isDemoMode = await getIsCurrentUserDemoTenant();
    if (isDemoMode) {
      return NextResponse.json({
        ok: true,
        demo: true,
        reader: {
          id: `demo_reader_${Date.now()}`,
          label: "Demo Terminal",
          device_type: "simulated_wisepos_e",
          status: "online",
          location: "demo_location",
        },
        message: "Demo-Modus: Simulierter Reader wurde ohne Stripe erstellt.",
      });
    }

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
