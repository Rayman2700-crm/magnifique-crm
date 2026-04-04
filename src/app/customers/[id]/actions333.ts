"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function addCustomerNote(
  customerProfileId: string,
  formData: FormData
) {
  const note = String(formData.get("note") ?? "").trim();
  if (!note) redirect(`/customers/${customerProfileId}`);

  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Benutzerprofil gefunden"
      )}`
    );
  }

  let tenantId: string | null = profile.tenant_id ?? null;

  if (profile.role === "ADMIN") {
    const { data: cp, error: cpError } = await supabase
      .from("customer_profiles")
      .select("tenant_id")
      .eq("id", customerProfileId)
      .single();

    if (cpError || !cp?.tenant_id) {
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          "Konnte Tenant des Kunden nicht laden"
        )}`
      );
    }

    tenantId = cp.tenant_id;
  }

  if (!tenantId) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Tenant gefunden"
      )}`
    );
  }

  const { error: insertError } = await supabase.from("customer_notes").insert({
    customer_profile_id: customerProfileId,
    tenant_id: tenantId,
    created_by: user.id,
    note,
  });

  if (insertError) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        `Notiz konnte nicht gespeichert werden: ${insertError.message}`
      )}`
    );
  }

  redirect(`/customers/${customerProfileId}`);
}

type WaitlistStatus = "active" | "contacted" | "booked" | "expired" | "removed";

type RequestedRecentlyPreset = "" | "today" | "yesterday";

const WAITLIST_STAFF_PREFIX = "Behandlerwunsch:";

function parseRequestedRecentlyAt(preset: RequestedRecentlyPreset) {
  const now = new Date();

  if (preset === "today") return now.toISOString();

  if (preset === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(Math.max(now.getHours(), 9), now.getMinutes(), 0, 0);
    return yesterday.toISOString();
  }

  return null;
}

function buildWaitlistNotes(preferredStaffName: string, notes: string) {
  const parts: string[] = [];

  if (preferredStaffName) {
    parts.push(`${WAITLIST_STAFF_PREFIX} ${preferredStaffName}`);
  }

  if (notes) {
    parts.push(notes);
  }

  return parts.join("\n").trim() || null;
}

async function resolveCustomerContext(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  customerProfileId: string,
  userId: string
) {
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("Kein Benutzerprofil gefunden");
  }

  const { data: customerProfile, error: customerProfileError } = await supabase
    .from("customer_profiles")
    .select("tenant_id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (customerProfileError || !customerProfile) {
    throw new Error("Kundenprofil nicht gefunden");
  }

  if (!customerProfile.person_id) {
    throw new Error("Diesem Kunden ist keine Person zugeordnet");
  }

  let tenantId: string | null = profile.tenant_id ?? null;

  if (profile.role === "ADMIN") {
    tenantId = customerProfile.tenant_id ?? null;
  }

  if (!tenantId) {
    throw new Error("Kein Tenant gefunden");
  }

  return {
    tenantId,
    personId: customerProfile.person_id,
  };
}

export async function addCustomerToWaitlist(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const serviceName = String(formData.get("service_name") ?? "").trim();
  const preferredStaffName = String(formData.get("preferred_staff_name") ?? "").trim();
  const preferredDaysRaw = String(formData.get("preferred_days") ?? "").trim();
  const timeFrom = String(formData.get("time_from") ?? "").trim();
  const timeTo = String(formData.get("time_to") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal").trim() || "normal";
  const notes = String(formData.get("notes") ?? "").trim();
  const shortNoticeOk = String(formData.get("short_notice_ok") ?? "") === "on";
  const reachableToday = String(formData.get("reachable_today") ?? "") === "on";
  const requestedRecentlyPreset = String(formData.get("requested_recently_preset") ?? "").trim().toLowerCase() as RequestedRecentlyPreset;
  const requestedRecentlyAt = parseRequestedRecentlyAt(requestedRecentlyPreset);

  let customerContext: Awaited<ReturnType<typeof resolveCustomerContext>>;
  try {
    customerContext = await resolveCustomerContext(supabase, customerProfileId, user.id);
  } catch (error: any) {
    redirect(
      `/customers/${customerProfileId}?tab=waitlist&error=${encodeURIComponent(
        error?.message ?? "Wartelisten-Eintrag konnte nicht vorbereitet werden"
      )}#waitlist`
    );
  }

  const { error: insertError } = await supabase.from("appointment_waitlist").insert({
    customer_profile_id: customerProfileId,
    tenant_id: customerContext.tenantId,
    person_id: customerContext.personId,
    created_by: user.id,
    service_title: serviceName || null,
    preferred_staff_id: null,
    preferred_days: preferredDaysRaw
      ? preferredDaysRaw.split(",").map((entry) => entry.trim()).filter(Boolean)
      : [],
    time_from: timeFrom || null,
    time_to: timeTo || null,
    priority,
    notes: buildWaitlistNotes(preferredStaffName, notes),
    short_notice_ok: shortNoticeOk,
    reachable_today: reachableToday,
    requested_recently_at: requestedRecentlyAt,
    status: "active" satisfies WaitlistStatus,
  });

  if (insertError) {
    redirect(
      `/customers/${customerProfileId}?tab=waitlist&error=${encodeURIComponent(
        `Wartelisten-Eintrag konnte nicht gespeichert werden: ${insertError.message}`
      )}#waitlist`
    );
  }

  redirect(`/customers/${customerProfileId}?tab=waitlist&success=${encodeURIComponent("Zur Warteliste hinzugefügt ✅")}#waitlist`);
}

export async function updateCustomerWaitlistStatus(
  customerProfileId: string,
  waitlistId: string,
  nextStatus: WaitlistStatus
) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  let customerContext: Awaited<ReturnType<typeof resolveCustomerContext>>;
  try {
    customerContext = await resolveCustomerContext(supabase, customerProfileId, user.id);
  } catch (error: any) {
    redirect(
      `/customers/${customerProfileId}?tab=waitlist&error=${encodeURIComponent(
        error?.message ?? "Wartelisten-Status konnte nicht vorbereitet werden"
      )}#waitlist`
    );
  }

  const { error } = await supabase
    .from("appointment_waitlist")
    .update({
      status: nextStatus,
    })
    .eq("id", waitlistId)
    .eq("tenant_id", customerContext.tenantId)
    .eq("customer_profile_id", customerProfileId);

  if (error) {
    redirect(
      `/customers/${customerProfileId}?tab=waitlist&error=${encodeURIComponent(
        `Wartelisten-Status konnte nicht geändert werden: ${error.message}`
      )}#waitlist`
    );
  }

  redirect(`/customers/${customerProfileId}?tab=waitlist&success=${encodeURIComponent("Warteliste aktualisiert ✅")}#waitlist`);
}

export async function uploadCustomerPhotos(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const files = formData.getAll("photos") as File[];
  if (!files || files.length === 0) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Keine Fotos gewählt"
      )}`
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Benutzerprofil gefunden"
      )}`
    );
  }

  let tenantId: string | null = profile.tenant_id ?? null;

  if (profile.role === "ADMIN") {
    const { data: cp, error: cpError } = await supabase
      .from("customer_profiles")
      .select("tenant_id")
      .eq("id", customerProfileId)
      .single();

    if (cpError || !cp?.tenant_id) {
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          "Konnte Tenant des Kunden nicht laden"
        )}`
      );
    }
    tenantId = cp.tenant_id;
  }

  if (!tenantId) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Tenant gefunden"
      )}`
    );
  }

  for (const file of files) {
    const ext =
      file.name.split(".").pop()?.toLowerCase() ||
      (file.type === "image/png" ? "png" : "jpg");

    const objectName = `${tenantId}/${customerProfileId}/${crypto.randomUUID()}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("customer-photos")
      .upload(objectName, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (upErr) {
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          `Upload fehlgeschlagen: ${upErr.message}`
        )}`
      );
    }

    const { error: dbErr } = await supabase.from("customer_photos").insert({
      customer_profile_id: customerProfileId,
      tenant_id: tenantId,
      created_by: user.id,
      storage_path: objectName,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    });

    if (dbErr) {
      await supabase.storage.from("customer-photos").remove([objectName]);
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          `DB-Insert fehlgeschlagen: ${dbErr.message}`
        )}`
      );
    }
  }

  redirect(`/customers/${customerProfileId}`);
}

export async function uploadCustomerPhoto(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const file = formData.get("photo") as File | null;
  if (!file) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Foto gewählt"
      )}`
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Benutzerprofil gefunden"
      )}`
    );
  }

  let tenantId: string | null = profile.tenant_id ?? null;

  if (profile.role === "ADMIN") {
    const { data: cp, error: cpError } = await supabase
      .from("customer_profiles")
      .select("tenant_id")
      .eq("id", customerProfileId)
      .single();

    if (cpError || !cp?.tenant_id) {
      redirect(
        `/customers/${customerProfileId}?error=${encodeURIComponent(
          "Konnte Tenant des Kunden nicht laden"
        )}`
      );
    }
    tenantId = cp.tenant_id;
  }

  if (!tenantId) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Kein Tenant gefunden"
      )}`
    );
  }

  const ext =
    file.name.split(".").pop()?.toLowerCase() ||
    (file.type === "image/png" ? "png" : "jpg");

  const objectName = `${tenantId}/${customerProfileId}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("customer-photos")
    .upload(objectName, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (upErr) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        `Upload fehlgeschlagen: ${upErr.message}`
      )}`
    );
  }

  const { error: dbErr } = await supabase.from("customer_photos").insert({
    customer_profile_id: customerProfileId,
    tenant_id: tenantId,
    created_by: user.id,
    storage_path: objectName,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });

  if (dbErr) {
    await supabase.storage.from("customer-photos").remove([objectName]);
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        `DB-Insert fehlgeschlagen: ${dbErr.message}`
      )}`
    );
  }

  redirect(`/customers/${customerProfileId}`);
}

export async function deleteCustomerPhoto(
  customerProfileId: string,
  photoId: string
) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: row, error } = await supabase
    .from("customer_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .single();

  if (error || !row) {
    redirect(
      `/customers/${customerProfileId}?error=${encodeURIComponent(
        "Foto nicht gefunden"
      )}`
    );
  }

  await supabase.storage.from("customer-photos").remove([row.storage_path]);
  await supabase.from("customer_photos").delete().eq("id", photoId);

  redirect(`/customers/${customerProfileId}`);
}

async function resolveIntakeTenantAndPerson(
  customerProfileId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof supabaseServer>>
) {
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .single();

  if (profileError || !profile) throw new Error("Kein Benutzerprofil gefunden");

  const { data: customerProfile, error: customerError } = await supabase
    .from("customer_profiles")
    .select("tenant_id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (customerError || !customerProfile) throw new Error("Kundenprofil nicht gefunden");
  if (!customerProfile.person_id) throw new Error("Diesem Kunden ist keine Person zugeordnet");

  const tenantId = profile.role === "ADMIN"
    ? (customerProfile.tenant_id ?? null)
    : (profile.tenant_id ?? null);

  if (!tenantId) throw new Error("Kein Tenant gefunden");

  return {
    tenantId,
    personId: customerProfile.person_id as string,
  };
}

export async function saveCustomerIntake(
  customerProfileId: string,
  formData: FormData
) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  let context: { tenantId: string; personId: string };
  try {
    context = await resolveIntakeTenantAndPerson(customerProfileId, user.id, supabase);
  } catch (error: any) {
    redirect(`/customers/${customerProfileId}?error=${encodeURIComponent(error?.message ?? "Fragebogen konnte nicht vorbereitet werden")}`);
  }

  const textField = (key: string) => String(formData.get(key) ?? "").trim();
  const yesNoField = (key: string) => {
    const value = String(formData.get(key) ?? "").trim().toLowerCase();
    return value === "yes" || value === "no" ? value : "";
  };

  const lastName = textField("last_name");
  const firstName = textField("first_name");
  const street = textField("street");
  const postalCity = textField("postal_city");
  const birthDate = textField("birth_date");
  const phone = textField("phone");
  const mobile = textField("mobile");
  const email = textField("email");
  const healthInsurance = textField("health_insurance");
  const familyDoctor = textField("family_doctor");
  const allergies = textField("allergies");
  const medications = textField("medications");
  const notes = textField("notes");
  const placeDate = textField("place_date");
  const signatureName = textField("signature_name");

  const consentTreatment = String(formData.get("consent_treatment") ?? "") === "on";
  const consentPrivacy = String(formData.get("consent_privacy") ?? "") === "on";

  if (!signatureName || !consentTreatment || !consentPrivacy) {
    redirect(`/customers/${customerProfileId}/intake?error=${encodeURIComponent("Bitte Einwilligungen bestätigen und Namen als Unterschrift eintragen.")}`);
  }

  const payload = {
    version: "v2",
    answers_json: {
      last_name: lastName,
      first_name: firstName,
      street,
      postal_city: postalCity,
      birth_date: birthDate,
      phone,
      mobile,
      email,
      health_insurance: healthInsurance,
      family_doctor: familyDoctor,
      first_foot_care: yesNoField("first_foot_care"),
      diabetic: yesNoField("diabetic"),
      rheumatic: yesNoField("rheumatic"),
      blood_thinners: yesNoField("blood_thinners"),
      circulation_disorders: yesNoField("circulation_disorders"),
      high_blood_pressure: yesNoField("high_blood_pressure"),
      heart_disease: yesNoField("heart_disease"),
      pacemaker: yesNoField("pacemaker"),
      infectious_disease: yesNoField("infectious_disease"),
      foot_operations: yesNoField("foot_operations"),
      varicose_veins: yesNoField("varicose_veins"),
      thrombosis_risk: yesNoField("thrombosis_risk"),
      stand_walk_a_lot: yesNoField("stand_walk_a_lot"),
      tetanus_vaccinated: yesNoField("tetanus_vaccinated"),
      allergies,
      medications,
      notes,
      place_date: placeDate,
      signature_name: signatureName,
      consent_treatment: consentTreatment,
      consent_privacy: consentPrivacy,
    },
    status: "SIGNED",
    signed_at: new Date().toISOString(),
    created_by_user_id: user.id,
    tenant_id: context.tenantId,
    person_id: context.personId,
    customer_profile_id: customerProfileId,
  };

  const { data: latest, error: latestError } = await supabase
    .from("intake_forms")
    .select("id")
    .eq("customer_profile_id", customerProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    redirect(`/customers/${customerProfileId}/intake?error=${encodeURIComponent(`Fragebogen konnte nicht geladen werden: ${latestError.message}`)}`);
  }

  if (latest?.id) {
    const { error: updateError } = await supabase
      .from("intake_forms")
      .update(payload)
      .eq("id", latest.id);

    if (updateError) {
      redirect(`/customers/${customerProfileId}/intake?error=${encodeURIComponent(`Fragebogen konnte nicht gespeichert werden: ${updateError.message}`)}`);
    }
  } else {
    const { error: insertError } = await supabase.from("intake_forms").insert(payload);
    if (insertError) {
      redirect(`/customers/${customerProfileId}/intake?error=${encodeURIComponent(`Fragebogen konnte nicht erstellt werden: ${insertError.message}`)}`);
    }
  }

  redirect(`/customers/${customerProfileId}?success=${encodeURIComponent("Fragebogen gespeichert ✅")}`);
}
