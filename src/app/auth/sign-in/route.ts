import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "").trim();

  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("msg", error.message);
    return NextResponse.redirect(url);
  }

  if (!data.user || !data.session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("msg", "No session returned");
    return NextResponse.redirect(url);
  }

  const admin = supabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("msg", profileError.message);
    return NextResponse.redirect(url);
  }

  const onboardingDone = Boolean(profile?.onboarding_completed_at);

  const safeNext =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  const target = onboardingDone ? safeNext : "/onboarding";

  return NextResponse.redirect(new URL(target, req.url));
}