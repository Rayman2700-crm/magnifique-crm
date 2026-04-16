import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "signup"
    | "recovery"
    | "email_change"
    | "magiclink"
    | null;
  const next = url.searchParams.get("next") ?? "/onboarding";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=1&msg=Ung%C3%BCltiger+Best%C3%A4tigungslink", url));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    const errorUrl = new URL("/login", url);
    errorUrl.searchParams.set("error", "1");
    errorUrl.searchParams.set("msg", error.message);
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(next, url));
}
