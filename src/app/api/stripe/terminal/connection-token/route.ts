import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getIsDemoTenant } from "@/lib/demoMode";

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
        secret: `demo_connection_token_${Date.now()}`,
        demo: true,
        message: "Demo-Modus: Es wurde kein echter Stripe Terminal Connection Token erstellt.",
      });
    }

    const connectionToken = await stripe.terminal.connectionTokens.create();

    return NextResponse.json({
      secret: connectionToken.secret,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "Connection Token konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}