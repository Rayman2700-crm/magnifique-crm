"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getAdminTenantCookie } from "@/lib/effectiveTenant";

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string) {
  let p = v.trim();
  if (!p) return null;
  p = p.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  if (!p.startsWith("+") && p.startsWith("0")) {
    p = "+43" + p.slice(1);
  }
  return p;
}

function phoneMatchVariants(input: string) {
  const raw = input.trim().replace(/[^\d+]/g, "");
  const norm = normalizePhone(input);

  const variants = new Set<string>();
  if (raw) variants.add(raw);
  if (norm) variants.add(norm);

  if (norm && norm.startsWith("+43")) {
    variants.add("0" + norm.slice(3));
  }

  if (raw.startsWith("0")) {
    variants.add("+43" + raw.slice(1));
  }

  if (raw.startsWith("+43")) {
    variants.add("0" + raw.slice(3));
  }

  return Array.from(variants);
}

function parsePreferredDays(input: string) {
  const cleaned = input.trim();
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRequestedRecentlyAt(value: string) {
  const now = new Date();

  if (value === "today") {
    return now.toISOString();
  }

  if (value === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return yesterday.toISOString();
  }

  return null;
}

export async function createCustomer(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const birthdayRaw = String(formData.get("birthday") ?? "").trim();

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const tenantIdFromForm = String(formData.get("tenantId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  const createWaitlistEntry = String(formData.get("create_waitlist_entry") ?? "0") === "1";
  const waitlistServiceTitle = String(formData.get("waitlist_service_title") ?? "").trim();
  const waitlistPreferredDaysRaw = String(formData.get("waitlist_preferred_days") ?? "").trim();
  const waitlistTimeFrom = String(formData.get("waitlist_time_from") ?? "").trim() || null;
  const waitlistTimeTo = String(formData.get("waitlist_time_to") ?? "").trim() || null;
  const waitlistPriority = String(formData.get("waitlist_priority") ?? "normal").trim() || "normal";
  const waitlistRequestedRecently = String(formData.get("waitlist_requested_recently") ?? "today").trim();
  const waitlistShortNoticeOk = String(formData.get("waitlist_short_notice_ok") ?? "") === "1";
  const waitlistReachableToday = String(formData.get("waitlist_reachable_today") ?? "") === "1";
  const waitlistNotes = String(formData.get("waitlist_notes") ?? "").trim();

  if (!fullName) redirect("/customers/new?error=Bitte%20Name%20eingeben");

  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const phoneNorm = phoneRaw ? normalizePhone(phoneRaw) : null;

  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, calendar_tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    redirect("/customers/new?error=Kein%20Profil%20gefunden");
  }

  let tenantId: string | null = null;

  if (profile.role === "ADMIN") {
    if (tenantIdFromForm) {
      tenantId = tenantIdFromForm;
    } else {
      const c = await getAdminTenantCookie();
      if (c && c !== "all") tenantId = c;
      else tenantId = profile.tenant_id ?? null;
    }
  } else {
    tenantId = profile.calendar_tenant_id ?? profile.tenant_id ?? null;
  }

  if (!tenantId) {
    redirect("/customers/new?error=Kein%20Tenant%20gefunden%20(Profil%20tenant_id%20leer)");
  }

  let personId: string | null = null;

  if (email) {
    const { data: existing } = await supabase.from("persons").select("id").eq("email", email).maybeSingle();
    personId = existing?.id ?? null;
  }

  if (!personId && phoneRaw) {
    const variants = phoneMatchVariants(phoneRaw);
    if (variants.length) {
      const { data: rows, error } = await supabase
        .from("persons")
        .select("id, phone")
        .in("phone", variants)
        .limit(1);

      if (!error && rows && rows.length) {
        personId = rows[0].id as string;
      }
    }
  }

  if (!personId) {
    const { data: inserted, error: insErr } = await supabase
      .from("persons")
      .insert({
        full_name: fullName,
        email,
        phone: phoneNorm,
        birthday: birthdayRaw || null,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      const msg = encodeURIComponent(insErr?.message ?? "unknown");
      redirect(`/customers/new?error=Person%20konnte%20nicht%20erstellt%20werden&details=${msg}`);
    }
    personId = inserted.id;
  } else {
    await supabase
      .from("persons")
      .update({
        full_name: fullName,
        email,
        phone: phoneNorm,
        birthday: birthdayRaw || null,
      })
      .eq("id", personId);
  }

  let customerProfileId: string | null = null;

  const { data: existingProfile } = await supabase
    .from("customer_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("person_id", personId)
    .maybeSingle();

  if (existingProfile?.id) {
    customerProfileId = String(existingProfile.id);
  } else {
    const { data: insertedProfile, error: cpErr } = await supabase
      .from("customer_profiles")
      .insert({
        tenant_id: tenantId,
        person_id: personId,
      })
      .select("id")
      .single();

    if (cpErr || !insertedProfile) {
      const msg = encodeURIComponent(cpErr?.message ?? "unknown");
      redirect(`/customers/new?error=CustomerProfile%20konnte%20nicht%20erstellt%20werden&details=${msg}`);
    }

    customerProfileId = String(insertedProfile.id);
  }

  if (appointmentId) {
    const { error: apErr } = await supabase
      .from("appointments")
      .update({ person_id: personId })
      .eq("id", appointmentId);

    if (apErr) {
      const msg = encodeURIComponent(apErr.message ?? "unknown");
      redirect(`/customers/new?error=Termin%20konnte%20nicht%20verkn%C3%BCpft%20werden&details=${msg}`);
    }
  }

  if (createWaitlistEntry && customerProfileId) {
    const preferredDays = parsePreferredDays(waitlistPreferredDaysRaw);
    const requestedRecentlyAt = buildRequestedRecentlyAt(waitlistRequestedRecently);

    const { error: waitlistErr } = await supabase.from("appointment_waitlist").insert({
      tenant_id: tenantId,
      person_id: personId,
      customer_profile_id: customerProfileId,
      service_title: waitlistServiceTitle || null,
      preferred_staff_id: tenantId,
      preferred_days: preferredDays,
      time_from: waitlistTimeFrom,
      time_to: waitlistTimeTo,
      notes: waitlistNotes || null,
      priority: waitlistPriority,
      short_notice_ok: waitlistShortNoticeOk,
      reachable_today: waitlistReachableToday,
      requested_recently_at: requestedRecentlyAt,
      status: "active",
      created_by: user.id,
    });

    if (waitlistErr) {
      const msg = encodeURIComponent(waitlistErr.message ?? "unknown");
      redirect(`/customers/new?error=Wartelisten-Eintrag%20konnte%20nicht%20erstellt%20werden&details=${msg}`);
    }
  }

  if (appointmentId) {
    redirect("/dashboard?success=Kunde%20zugeordnet%20%E2%9C%85");
  }

  if (returnTo === "dashboard") {
    redirect("/dashboard?success=Kunde%20angelegt%20%E2%9C%85");
  }

  if (createWaitlistEntry) {
    redirect("/dashboard?success=Kunde%20und%20Warteliste%20angelegt%20%E2%9C%85");
  }

  redirect("/customers?success=Kunde%20angelegt%20%E2%9C%85");
}
