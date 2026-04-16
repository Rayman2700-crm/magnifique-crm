import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("SIGN_IN_ERROR:", error); // <— ganz wichtig

    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("msg", error.message); // <— zeig uns die Ursache
    return NextResponse.redirect(url);
  }

  // Falls data.session fehlt, ist Auth grundsätzlich blockiert
  if (!data.session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("msg", "No session returned");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, req.url));
}