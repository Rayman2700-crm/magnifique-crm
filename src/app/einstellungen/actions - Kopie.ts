"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function redirectWithInviteError(message: string) {
  redirect(`/einstellungen?invite_error=${encodeURIComponent(message)}`);
}

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");

  return "https://magnifique-crm.vercel.app";
}

export async function inviteCrmUser(formData: FormData) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentProfile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (String(currentProfile?.role ?? "").toUpperCase() !== "ADMIN") {
    redirectWithInviteError("Nur Admins dürfen neue Benutzer einladen.");
  }

  const fullName = normalizeText(formData.get("full_name"));
  const email = normalizeEmail(formData.get("email"));
  const tenantId = normalizeText(formData.get("tenant_id"));
  const roleRaw = normalizeText(formData.get("role")).toUpperCase();
  const role = roleRaw === "ADMIN" ? "ADMIN" : "PRACTITIONER";

  if (fullName.length < 2) {
    redirectWithInviteError("Bitte einen gültigen Namen eingeben.");
  }

  if (!email || !email.includes("@")) {
    redirectWithInviteError("Bitte eine gültige E-Mail-Adresse eingeben.");
  }

  if (!tenantId && role !== "ADMIN") {
    redirectWithInviteError("Bitte einen Tenant/Behandler für den neuen Benutzer auswählen.");
  }

  if (tenantId) {
    const { data: tenantExists } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();

    if (!tenantExists) {
      redirectWithInviteError("Der ausgewählte Tenant wurde nicht gefunden.");
    }
  }

  const { data: existingInvite } = await admin
    .from("user_invites")
    .select("id, accepted_at")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingInvite) {
    redirectWithInviteError("Für diese E-Mail gibt es bereits eine offene Einladung.");
  }

  const siteUrl = getSiteUrl();

  const { error: inviteInsertError } = await admin.from("user_invites").insert({
    email,
    full_name: fullName,
    tenant_id: tenantId || null,
    role,
    invited_by: user.id,
  });

  if (inviteInsertError) {
    redirectWithInviteError(`Einladung konnte nicht vorbereitet werden: ${inviteInsertError.message}`);
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/update-password`,
    data: {
      full_name: fullName,
      tenant_id: tenantId || null,
      role,
    },
  });

  if (inviteError) {
    await admin.from("user_invites").delete().eq("email", email).is("accepted_at", null);
    redirectWithInviteError(`Supabase-Einladung fehlgeschlagen: ${inviteError.message}`);
  }

  revalidatePath("/einstellungen");
  redirect(`/einstellungen?invite_success=${encodeURIComponent(`Einladung an ${email} wurde gesendet.`)}`);
}
