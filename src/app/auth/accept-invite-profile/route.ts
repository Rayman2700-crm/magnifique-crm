import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value: unknown) {
  return String(value ?? "PRACTITIONER").toUpperCase() === "ADMIN" ? "ADMIN" : "PRACTITIONER";
}

export async function POST() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  const email = normalizeEmail(user.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "Keine E-Mail am Benutzer gefunden." }, { status: 400 });
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("user_profiles")
    .select("id, tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json(
      { ok: false, error: `Profilprüfung fehlgeschlagen: ${existingProfileError.message}` },
      { status: 500 }
    );
  }

  if (existingProfile?.id && existingProfile.tenant_id) {
    return NextResponse.json({ ok: true, status: "profile_exists" });
  }

  const { data: invite, error: inviteError } = await admin
    .from("user_invites")
    .select("id, email, full_name, tenant_id, role, accepted_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    return NextResponse.json(
      { ok: false, error: `Einladung konnte nicht gelesen werden: ${inviteError.message}` },
      { status: 500 }
    );
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    String((invite as any)?.full_name ?? metadata.full_name ?? email)
      .trim()
      .replace(/\s+/g, " ") || email;
  const tenantId = String((invite as any)?.tenant_id ?? metadata.tenant_id ?? "").trim() || null;
  const role = normalizeRole((invite as any)?.role ?? metadata.role);

  if (!tenantId && role !== "ADMIN") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Für diese Einladung wurde kein Tenant gefunden. Bitte die Einladung widerrufen und mit Tenant erneut senden.",
      },
      { status: 400 }
    );
  }

  if (tenantId) {
    const { data: tenantExists, error: tenantError } = await admin
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenantExists) {
      return NextResponse.json(
        { ok: false, error: "Der Tenant aus der Einladung wurde nicht gefunden." },
        { status: 400 }
      );
    }
  }

  if (existingProfile?.id) {
    const { error: updateError } = await admin
      .from("user_profiles")
      .update({ full_name: fullName, role, tenant_id: tenantId })
      .eq("id", existingProfile.id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Profil konnte nicht aktualisiert werden: ${updateError.message}` },
        { status: 500 }
      );
    }
  } else {
    const { error: insertError } = await admin.from("user_profiles").insert({
      user_id: user.id,
      full_name: fullName,
      role,
      tenant_id: tenantId,
    });

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: `Profil konnte nicht erstellt werden: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  if ((invite as any)?.id && !(invite as any)?.accepted_at) {
    await admin
      .from("user_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", (invite as any).id);
  }

  return NextResponse.json({ ok: true, status: "profile_created" });
}
