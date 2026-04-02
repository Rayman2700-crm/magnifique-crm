import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
    }

    const { data: users, error: usersError } = await admin
      .from("user_profiles")
      .select("user_id, full_name")
      .not("user_id", "is", null)
      .not("full_name", "is", null)
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
