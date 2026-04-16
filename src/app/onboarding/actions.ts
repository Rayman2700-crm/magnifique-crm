"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_SMALL_BUSINESS_NOTICE = "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.";
const DEFAULT_FOOTER =
  "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

async function uploadRequiredImage(
  admin: ReturnType<typeof supabaseAdmin>,
  params: { bucket: string; path: string; file: File }
) {
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error } = await admin.storage.from(params.bucket).upload(params.path, buffer, {
    cacheControl: "3600",
    contentType: params.file.type || "application/octet-stream",
    upsert: true,
  });

  if (error) throw new Error(error.message);
}

export async function completeOnboarding(formData: FormData) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    redirect("/login?error=1&msg=Profil+nicht+gefunden");
  }

  const tenantId = profile.tenant_id as string;
  const iban = String(formData.get("iban") ?? "").trim();
  const bic = String(formData.get("bic") ?? "").trim();
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const taxNumber = String(formData.get("tax_number") ?? "").trim();
  const invoicePrefix = String(formData.get("invoice_prefix") ?? "").trim().toUpperCase();
  const smallBusinessNotice = String(formData.get("kleinunternehmer_text") ?? DEFAULT_SMALL_BUSINESS_NOTICE).trim();
  const invoiceFooterText = String(formData.get("invoice_footer_text") ?? DEFAULT_FOOTER).trim();
  const companyAppName = String(formData.get("app_name") ?? "").trim();
  const avatarFile = formData.get("avatar") as File | null;
  const logoFile = formData.get("invoice_logo") as File | null;

  if (!iban || !taxNumber || !invoicePrefix || !avatarFile || avatarFile.size === 0 || !logoFile || logoFile.size === 0) {
    redirect("/onboarding?error=Bitte+alle+Pflichtfelder+inklusive+Avatar+und+Logo+hochladen");
  }

  if (avatarFile.size > 5 * 1024 * 1024 || logoFile.size > 5 * 1024 * 1024) {
    redirect("/onboarding?error=Dateien+d%C3%BCrfen+maximal+5+MB+gro%C3%9F+sein");
  }

  const avatarPath = `${user.id}/avatar-${Date.now()}-${sanitizeFileName(avatarFile.name || "avatar.png")}`;
  const logoPath = `${tenantId}/logo-${Date.now()}-${sanitizeFileName(logoFile.name || "logo.png")}`;

  try {
    await uploadRequiredImage(admin, { bucket: "avatars", path: avatarPath, file: avatarFile });
    await uploadRequiredImage(admin, { bucket: "tenant-logos", path: logoPath, file: logoFile });
  } catch (e: any) {
    redirect(`/onboarding?error=${encodeURIComponent(e?.message || "Upload fehlgeschlagen")}`);
  }

  const completedAt = new Date().toISOString();

  const { error: tenantError } = await admin
    .from("tenants")
    .update({
      iban,
      bic: bic || null,
      bank_name: bankName || null,
      kleinunternehmer_text: smallBusinessNotice || DEFAULT_SMALL_BUSINESS_NOTICE,
      invoice_prefix: invoicePrefix || null,
    })
    .eq("id", tenantId);

  if (tenantError) {
    redirect(`/onboarding?error=${encodeURIComponent(tenantError.message)}`);
  }

  const { error: brandingError } = await admin.from("tenant_branding").upsert({
    tenant_id: tenantId,
    app_name: companyAppName || null,
    logo_path: logoPath,
    invoice_logo_path: logoPath,
  });

  if (brandingError) {
    redirect(`/onboarding?error=${encodeURIComponent(brandingError.message)}`);
  }

  const { error: settingsError } = await admin.from("tenant_settings").upsert({
    tenant_id: tenantId,
    tax_number: taxNumber,
    invoice_footer_text: invoiceFooterText || DEFAULT_FOOTER,
    onboarding_required: false,
    onboarding_completed_at: completedAt,
  });

  if (settingsError) {
    redirect(`/onboarding?error=${encodeURIComponent(settingsError.message)}`);
  }

  const { error: userProfileError } = await admin
    .from("user_profiles")
    .update({
      avatar_path: avatarPath,
      onboarding_completed_at: completedAt,
    })
    .eq("user_id", user.id);

  if (userProfileError) {
    redirect(`/onboarding?error=${encodeURIComponent(userProfileError.message)}`);
  }

  redirect("/dashboard");
}
