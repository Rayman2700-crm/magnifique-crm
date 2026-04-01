import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message || "Profil konnte nicht geladen werden" },
        { status: 500 }
      );
    }

    const tenantId = profile?.tenant_id ?? null;

    if (!tenantId) {
      return NextResponse.json({ users: [] });
    }

    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .eq("tenant_id", tenantId)
      .order("full_name", { ascending: true });

    if (usersError) {
      return NextResponse.json(
        { error: usersError.message || "User konnten nicht geladen werden" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      users: (users ?? [])
        .filter((u) => u?.user_id && u?.full_name)
        .map((u) => ({
          userId: String(u.user_id),
          fullName: String(u.full_name),
        })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unbekannter Fehler" },
      { status: 500 }
    );
  }
}