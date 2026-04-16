"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_SMALL_BUSINESS_NOTICE = "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.";
const DEFAULT_FOOTER =
  "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createPrefix(fullName: string, companyName: string) {
  const source = `${fullName} ${companyName}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (source.slice(0, 3) || "NEW").padEnd(3, "X");
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export async function registerPractitioner(formData: FormData) {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? companyName).trim();
  const address1 = String(formData.get("address_line1") ?? "").trim();
  const address2 = String(formData.get("address_line2") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const country = String(formData.get("country") ?? "Österreich").trim();

  if (!fullName || !email || !password || !companyName || !address1 || !zip || !city) {
    redirect("/register?error=Bitte+alle+Pflichtfelder+ausf%C3%BCllen");
  }

  if (password.length < 8) {
    redirect("/register?error=Das+Passwort+muss+mindestens+8+Zeichen+haben");
  }

  const admin = supabaseAdmin();
  const slugBase = slugify(companyName || fullName || email.split("@")[0] || "tenant");
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;
  const invoicePrefix = createPrefix(fullName, companyName);

  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: fullName,
      company_name: companyName,
    },
  });

  if (signUpError || !signUpData.user) {
    redirect(`/register?error=${encodeURIComponent(signUpError?.message || "Registrierung fehlgeschlagen")}`);
  }

  const userId = signUpData.user.id;

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      slug,
      display_name: companyName,
      legal_name: legalName,
      invoice_address_line1: address1,
      invoice_address_line2: address2 || null,
      zip,
      city,
      country,
      phone: phone || null,
      email,
      kleinunternehmer_text: DEFAULT_SMALL_BUSINESS_NOTICE,
      invoice_prefix: invoicePrefix,
      mail_sender_name: fullName,
      mail_reply_to_email: email,
      mail_delivery_mode: "tenant_email",
      mail_is_active: true,
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    redirect(`/register?error=${encodeURIComponent(tenantError?.message || "Tenant konnte nicht angelegt werden")}`);
  }

  const tenantId = tenant.id as string;

  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: userId,
    tenant_id: tenantId,
    calendar_tenant_id: tenantId,
    role: "PRACTITIONER",
    full_name: fullName,
    is_active: true,
  });

  if (profileError) {
    await admin.from("tenants").delete().eq("id", tenantId).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    redirect(`/register?error=${encodeURIComponent(profileError.message)}`);
  }

  await admin.from("tenant_branding").upsert({
    tenant_id: tenantId,
    app_name: companyName,
    email_sender_name: fullName,
  });

  await admin.from("tenant_settings").upsert({
    tenant_id: tenantId,
    invoice_footer_text: DEFAULT_FOOTER,
    onboarding_required: true,
  });

  const { error: linkError, data: linkData } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      redirectTo: `${getBaseUrl()}/auth/confirm?next=/onboarding`,
    },
  });

  if (linkError) {
    redirect(`/register/success?email=${encodeURIComponent(email)}&warning=${encodeURIComponent(linkError.message)}`);
  }

  // Supabase verschickt bei generateLink nicht immer automatisch die Mail.
  // Darum zusätzlich regulären Signup-Confirmation-Mailversand anstoßen.
  await admin.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${getBaseUrl()}/auth/confirm?next=/onboarding`,
    },
  }).catch(() => undefined);

  const maybeActionLink = linkData?.properties?.action_link;
  const target = new URL("/register/success", getBaseUrl());
  target.searchParams.set("email", email);
  if (maybeActionLink) {
    target.searchParams.set("debug_link", maybeActionLink);
  }
  redirect(target.toString());
}
