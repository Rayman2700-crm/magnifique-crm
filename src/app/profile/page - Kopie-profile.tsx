import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ProfilePageClient from "./ProfilePageClient";
import ProfilePhotoCardClient from "./ProfilePhotoCardClient";

function resolveStorageAvatarUrl(raw: string | null | undefined, admin: ReturnType<typeof supabaseAdmin>) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, "").replace(/^avatars\//i, "");
  const { data } = admin.storage.from("avatars").getPublicUrl(normalized);
  return data?.publicUrl ?? null;
}

function initialsFromName(name: string | null | undefined) {
  const raw = String(name ?? "").trim();
  if (!raw) return "U";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; updated?: string }>;
}) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const sp = searchParams ? await searchParams : undefined;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name, avatar_path, role, tenant_id, avatar_ring_color")
    .eq("user_id", user.id)
    .maybeSingle();

  const avatarUrlBase = resolveStorageAvatarUrl(profile?.avatar_path ?? null, admin);
  const avatarUrl = avatarUrlBase ? `${avatarUrlBase}${sp?.updated ? `?v=${encodeURIComponent(sp.updated)}` : ""}` : null;
  const initials = initialsFromName(profile?.full_name ?? user.email ?? null);

  const defaultRingColor = String(profile?.avatar_ring_color ?? "").trim() || "#6366F1";

  const tenantId = profile?.tenant_id ?? null;
  const { data: tenantProfile } = tenantId
    ? await admin
        .from("tenants")
        .select("legal_name, invoice_address_line1, invoice_address_line2, zip, city, country, iban, bic, bank_name, tax_number")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null as any };


  async function uploadAvatar(formData: FormData) {
    "use server";

    const supabase = await supabaseServer();
    const admin = supabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      redirect("/profile?error=Bitte+w%C3%A4hle+ein+Bild+aus.");
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowed.includes(file.type)) {
      redirect("/profile?error=Erlaubt+sind+nur+JPG%2C+PNG+oder+WEBP.");
    }

    if (file.size > 5 * 1024 * 1024) {
      redirect("/profile?error=Das+Bild+ist+zu+gro%C3%9F.+Maximal+5+MB.");
    }

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `profiles/${user.id}/avatar.${extension}`;
    const legacyPaths = [
      `profiles/${user.id}/avatar`,
      `profiles/${user.id}/avatar.jpg`,
      `profiles/${user.id}/avatar.jpeg`,
      `profiles/${user.id}/avatar.png`,
      `profiles/${user.id}/avatar.webp`,
    ].filter((candidate, index, list) => list.indexOf(candidate) === index && candidate !== path);

    if (legacyPaths.length > 0) {
      await admin.storage.from("avatars").remove(legacyPaths);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage.from("avatars").upload(path, buffer, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "0",
    });

    if (uploadError) {
      redirect(`/profile?error=${encodeURIComponent(`Upload fehlgeschlagen: ${uploadError.message}`)}`);
    }

    const { error: updateError } = await admin
      .from("user_profiles")
      .update({ avatar_path: path })
      .eq("user_id", user.id);

    if (updateError) {
      redirect(`/profile?error=${encodeURIComponent(`Profil konnte nicht aktualisiert werden: ${updateError.message}`)}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    redirect(`/profile?success=${encodeURIComponent("Profilfoto gespeichert.")}&updated=${Date.now()}`);
  }

  async function removeAvatar() {
    "use server";

    const supabase = await supabaseServer();
    const admin = supabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    await admin.storage.from("avatars").remove([
      `profiles/${user.id}/avatar`,
      `profiles/${user.id}/avatar.jpg`,
      `profiles/${user.id}/avatar.jpeg`,
      `profiles/${user.id}/avatar.png`,
      `profiles/${user.id}/avatar.webp`,
    ]);

    const { error: updateError } = await admin
      .from("user_profiles")
      .update({ avatar_path: null })
      .eq("user_id", user.id);

    if (updateError) {
      redirect(`/profile?error=${encodeURIComponent(`Profil konnte nicht aktualisiert werden: ${updateError.message}`)}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    redirect(`/profile?success=${encodeURIComponent("Profilfoto entfernt.")}&updated=${Date.now()}`);
  }

  async function updateProfile(formData: FormData) {
    "use server";

    const supabase = await supabaseServer();
    const admin = supabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const fullName = String(formData.get("full_name") ?? "").trim();

    if (fullName.length < 2) {
      redirect("/profile?error=Bitte+einen+g%C3%BCltigen+Namen+eingeben.");
    }

    const { error: updateError } = await admin
      .from("user_profiles")
      .update({ full_name: fullName })
      .eq("user_id", user.id);

    if (updateError) {
      redirect(`/profile?error=${encodeURIComponent(`Name konnte nicht gespeichert werden: ${updateError.message}`)}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    redirect(`/profile?success=${encodeURIComponent("Profil gespeichert.")}&updated=${Date.now()}`);
  }


  async function updateBusinessSettings(formData: FormData) {
    "use server";

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
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentTenantId = currentProfile?.tenant_id ?? null;
    if (!currentTenantId) {
      redirect("/profile?error=Kein+Tenant+f%C3%BCr+diesen+Benutzer+gefunden.");
    }

    const payload = {
      legal_name: String(formData.get("legal_name") ?? "").trim() || null,
      invoice_address_line1: String(formData.get("invoice_address_line1") ?? "").trim() || null,
      invoice_address_line2: String(formData.get("invoice_address_line2") ?? "").trim() || null,
      zip: String(formData.get("zip") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      country: String(formData.get("country") ?? "").trim() || null,
      iban: String(formData.get("iban") ?? "").trim() || null,
      bic: String(formData.get("bic") ?? "").trim() || null,
      bank_name: String(formData.get("bank_name") ?? "").trim() || null,
      tax_number: String(formData.get("tax_number") ?? "").trim() || null,
    };

    const { error } = await admin.from("tenants").update(payload).eq("id", currentTenantId);

    if (error) {
      redirect(`/profile?error=${encodeURIComponent(`Firmendaten konnten nicht gespeichert werden: ${error.message}`)}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    redirect(`/profile?success=${encodeURIComponent("Firmendaten gespeichert.")}&updated=${Date.now()}`);
  }

  async function updateAvatarRingColor(formData: FormData) {
    "use server";

    const supabase = await supabaseServer();
    const admin = supabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const raw = String(formData.get("avatar_ring_color") ?? "").trim();
    const normalized = /^#([0-9a-fA-F]{6})$/.test(raw) ? raw.toUpperCase() : "#6366F1";

    const { error } = await admin
      .from("user_profiles")
      .update({ avatar_ring_color: normalized })
      .eq("user_id", user.id);

    if (error) {
      redirect(`/profile?error=${encodeURIComponent(`Avatar-Ring-Farbe konnte nicht gespeichert werden: ${error.message}`)}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    redirect(`/profile?success=${encodeURIComponent("Avatar-Ring-Farbe gespeichert.")}&updated=${Date.now()}`);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--primary)]/80">Magnifique Beauty Institut</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Profil - Einstellungen</h1>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/90 transition hover:bg-white/[0.07]"
        >
          Zurück zum Dashboard
        </Link>
      </div>

      {sp?.success ? (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {sp.success}
        </div>
      ) : null}

      {sp?.error ? (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {sp.error}
        </div>
      ) : null}

      <section className="rounded-[28px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] p-6 shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px]">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col items-center rounded-[26px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] p-5 text-center shadow-[0_26px_72px_rgba(0,0,0,0.20)] backdrop-blur-[20px]">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profilfoto"
                className="h-auto w-full max-w-[170px] rounded-[28px] border border-[rgba(255,255,255,0.06)] object-cover shadow-[0_18px_38px_rgba(0,0,0,0.28)]"
                style={{ boxShadow: `0 0 0 3px rgba(10,10,12,0.9), 0 0 0 7px ${defaultRingColor}, 0 18px 38px rgba(0,0,0,0.28)` }}
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[170px] items-center justify-center rounded-[28px] border border-[rgba(255,255,255,0.06)] bg-white/[0.05] text-4xl font-semibold text-white/90 shadow-[0_18px_38px_rgba(0,0,0,0.28)]"
                style={{ boxShadow: `0 0 0 3px rgba(10,10,12,0.9), 0 0 0 7px ${defaultRingColor}, 0 18px 38px rgba(0,0,0,0.28)` }}>
                {initials}
              </div>
            )}

            <div className="mt-4 text-lg font-semibold text-white/95">{profile?.full_name ?? user.email ?? "Benutzer"}</div>
            <div className="mt-1 text-sm text-white/55">{user.email ?? "—"}</div>
            <div className="mt-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.14em] text-white/55">
              {profile?.role ?? "USER"}
            </div>

            <ProfilePhotoCardClient
              uploadAvatarAction={uploadAvatar}
              removeAvatarAction={removeAvatar}
            />

            <div className="w-full pt-1">
              <h2 className="text-base font-semibold text-white/95">Avatar-Ring-Farbe</h2>

              <form action={updateAvatarRingColor} className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm text-white/80">
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="color"
                      name="avatar_ring_color"
                      defaultValue={defaultRingColor}
                      className="h-11 w-16 shrink-0 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] p-1"
                    />
                    <input
                      type="text"
                      value={defaultRingColor}
                      readOnly
                      className="h-11 min-w-0 flex-1 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-3 text-sm text-white/60 outline-none"
                    />
                  </div>
                </label>

                <div>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(214,195,163,0.20)] transition hover:brightness-105"
                  >
                    Ring-Farbe speichern
                  </button>
                </div>
              </form>
            </div>

          </div>

          <div className="grid gap-6">
            <div className="rounded-[26px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] p-5 shadow-[0_26px_72px_rgba(0,0,0,0.20)] backdrop-blur-[20px]">
              <h2 className="text-lg font-semibold text-white/95">Persönliche Daten</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Der Name hier wird im System für dein Benutzerprofil und an allen Stellen mit Avatar/Fallback verwendet.
              </p>

              <form action={updateProfile} className="mt-6 grid gap-4 rounded-[22px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.04)_0%,rgba(255,248,240,0.012)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:max-w-xl">
                <label className="grid gap-2 text-sm text-white/80">
                  <span>Vollständiger Name</span>
                  <input
                    type="text"
                    name="full_name"
                    defaultValue={profile?.full_name ?? ""}
                    required
                    className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                  />
                </label>

                <label className="grid gap-2 text-sm text-white/55">
                  <span>E-Mail</span>
                  <input
                    type="email"
                    value={user.email ?? ""}
                    disabled
                    className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-3 text-sm text-white/60 outline-none"
                  />
                </label>

                <div>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(214,195,163,0.20)] transition hover:brightness-105"
                  >
                    Name speichern
                  </button>
                </div>
              </form>
            </div>


            <div className="rounded-[26px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] p-5 shadow-[0_26px_72px_rgba(0,0,0,0.20)] backdrop-blur-[20px]">
              <h2 className="text-lg font-semibold text-white/95">Rechnungs- und Firmendaten</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Diese Daten gehören zu deiner eigenen Firma und werden für Rechnungen, Bankblock und Absender verwendet.
              </p>

              <form action={updateBusinessSettings} className="mt-6 grid gap-4 rounded-[22px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.04)_0%,rgba(255,248,240,0.012)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-white/80 md:col-span-2">
                    <span>Firmenname / Rechnungsname</span>
                    <input
                      type="text"
                      name="legal_name"
                      defaultValue={tenantProfile?.legal_name ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80 md:col-span-2">
                    <span>Rechnungsadresse Zeile 1</span>
                    <input
                      type="text"
                      name="invoice_address_line1"
                      defaultValue={tenantProfile?.invoice_address_line1 ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80 md:col-span-2">
                    <span>Rechnungsadresse Zeile 2</span>
                    <input
                      type="text"
                      name="invoice_address_line2"
                      defaultValue={tenantProfile?.invoice_address_line2 ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>PLZ</span>
                    <input
                      type="text"
                      name="zip"
                      defaultValue={tenantProfile?.zip ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>Ort</span>
                    <input
                      type="text"
                      name="city"
                      defaultValue={tenantProfile?.city ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80 md:col-span-2">
                    <span>Land</span>
                    <input
                      type="text"
                      name="country"
                      defaultValue={tenantProfile?.country ?? "Österreich"}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>IBAN</span>
                    <input
                      type="text"
                      name="iban"
                      defaultValue={tenantProfile?.iban ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>BIC</span>
                    <input
                      type="text"
                      name="bic"
                      defaultValue={tenantProfile?.bic ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>Bankname</span>
                    <input
                      type="text"
                      name="bank_name"
                      defaultValue={tenantProfile?.bank_name ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-white/80">
                    <span>Steuernummer</span>
                    <input
                      type="text"
                      name="tax_number"
                      defaultValue={(tenantProfile as any)?.tax_number ?? ""}
                      className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
                    />
                  </label>
                </div>

                <div>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(214,195,163,0.20)] transition hover:brightness-105"
                  >
                    Firmendaten speichern
                  </button>
                </div>
              </form>
            </div>

            <ProfilePageClient
              userEmail={user.email ?? null}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
