import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

export default async function EinstellungenPage() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

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

  const avatarUrl = resolveStorageAvatarUrl(profile?.avatar_path ?? null, admin);
  const initials = initialsFromName(profile?.full_name ?? user.email ?? null);
  const ringColor = String(profile?.avatar_ring_color ?? "").trim() || "#6366F1";

  const tenantId = profile?.tenant_id ?? null;
  const { data: tenantProfile } = tenantId
    ? await admin
        .from("tenants")
        .select("legal_name, email, phone")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null as any };

  const cards = [
    {
      title: "Profil & Firma",
      text: "Name, Passwort, Avatar, Ringfarbe, Rechnungsadresse, Bankdaten und Steuernummer verwalten.",
      href: "/profile",
      cta: "Zum Profil",
      status: "Aktiv",
    },
    {
      title: "Google Kalender",
      text: "Kalender-Verbindung pro Benutzer vorbereiten. Hier kommt als Nächstes die OAuth-Anbindung hinein.",
      href: null,
      cta: "Demnächst",
      status: "Als Nächstes",
    },
    {
      title: "E-Mail / Versand",
      text: "Eigene Mailadresse für Rechnungsversand und Vorlagen pro Benutzer anschließen.",
      href: null,
      cta: "Demnächst",
      status: "Geplant",
    },
    {
      title: "Benachrichtigungen",
      text: "Reminder, Standardoptionen und weitere persönliche App-Einstellungen folgen hier später.",
      href: null,
      cta: "Demnächst",
      status: "Geplant",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6">
        <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white/5 text-lg font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                style={{ borderColor: ringColor, boxShadow: `0 0 0 1px ${ringColor}22, 0 10px 24px rgba(0,0,0,0.35)` }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={profile?.full_name ?? "Avatar"} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d7c097]">
                  Magnifique Beauty Institut Einstellungen
                </p>
                <h1 className="mt-1 truncate text-3xl font-semibold text-white sm:text-4xl">Einstellungen</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  Benutzerbezogene Einstellungen und die nächsten Anschlusspunkte für Kalender, Versand und App-Optionen.
                </p>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="font-semibold text-white">{profile?.full_name ?? user.email ?? "Benutzer"}</div>
              <div className="mt-1 text-white/60">{tenantProfile?.legal_name ?? "Eigene Firma"}</div>
              <div className="mt-1 text-white/60">{profile?.role ?? "USER"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Dein Bereich</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Von hier kommst du direkt zu deinen persönlichen Daten und siehst, welche Einstellungen als Nächstes im CRM dazukommen.
            </p>

            <div className="mt-6 space-y-4 rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Benutzer</div>
                <div className="mt-2 text-lg font-semibold text-white">{profile?.full_name ?? "–"}</div>
                <div className="text-sm text-white/60">{user.email}</div>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Firma</div>
                <div className="mt-2 text-base font-medium text-white">{tenantProfile?.legal_name ?? "–"}</div>
                <div className="text-sm text-white/60">{tenantProfile?.email ?? "Keine Firmen-E-Mail hinterlegt"}</div>
                <div className="text-sm text-white/60">{tenantProfile?.phone ?? "Keine Firmen-Telefonnummer hinterlegt"}</div>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/profile"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#dcc7a1] px-4 text-sm font-semibold text-black transition hover:brightness-105"
              >
                Profil öffnen
              </Link>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">{card.status}</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
                    {card.status}
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/70">{card.text}</p>

                <div className="mt-6">
                  {card.href ? (
                    <Link
                      href={card.href}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      {card.cta}
                    </Link>
                  ) : (
                    <span className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white/50">
                      {card.cta}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
