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

function formatDateTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

const STUDIO_TARGETS = [
  { key: "studio_radu", label: "Studio Radu", calendarId: "radu.craus@gmail.com" },
  { key: "studio_raluca", label: "Studio Raluca", calendarId: "raluca.magnifique@gmail.com" },
] as const;

export default async function EinstellungenPage() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: tokenRow }, { data: connectionRows }] = await Promise.all([
    admin
      .from("user_profiles")
      .select("full_name, avatar_path, role, tenant_id, avatar_ring_color")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("google_oauth_tokens")
      .select("default_calendar_id, enabled_calendar_ids, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("google_oauth_connections")
      .select(
        "id, connection_label, google_account_email, google_account_name, connection_type, is_primary, is_read_only, is_active, created_at, updated_at"
      )
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  const avatarUrl = resolveStorageAvatarUrl(profile?.avatar_path ?? null, admin);
  const initials = initialsFromName(profile?.full_name ?? user.email ?? null);
  const ringColor = String(profile?.avatar_ring_color ?? "").trim() || "#6366F1";
  const isAdmin = String(profile?.role ?? "").toUpperCase() === "ADMIN";

  const tenantId = profile?.tenant_id ?? null;
  const { data: tenantProfile } = tenantId
    ? await admin
        .from("tenants")
        .select("legal_name, email, phone")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null as any };

  const connections = Array.isArray(connectionRows) ? connectionRows : [];
  const activeConnections = connections.filter((row) => row.is_active !== false);
  const primaryConnection =
    activeConnections.find((row) => row.is_primary && row.is_read_only !== true) ??
    activeConnections.find((row) => row.is_read_only !== true) ??
    null;
  const readOnlyConnections = activeConnections.filter((row) => row.is_read_only === true);
  const writableConnections = activeConnections.filter((row) => row.is_read_only !== true);
  const connectedGoogleMail =
    String(primaryConnection?.google_account_email ?? "").trim() ||
    String(primaryConnection?.google_account_name ?? "").trim() ||
    "Nicht verbunden";

  const defaultCalendarId = String((tokenRow as any)?.default_calendar_id ?? "").trim() || null;
  const enabledCalendarIds = uniqueStrings((tokenRow as any)?.enabled_calendar_ids ?? []);
  const lastSync = formatDateTime((tokenRow as any)?.updated_at ?? primaryConnection?.updated_at ?? null);

  const activeCalendarLabels = enabledCalendarIds.length > 0 ? enabledCalendarIds : defaultCalendarId ? [defaultCalendarId] : [];

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
      text: "Verbindungen, Hauptkalender, Zusatzkalender und Sync-Status pro Benutzer verwalten.",
      href: "/calendar/google",
      cta: "Google öffnen",
      status: primaryConnection ? "Verbunden" : "Offen",
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
                  Benutzerbezogene Einstellungen, Google-Kalender-Status und die nächsten Anschlusspunkte für Versand und App-Optionen.
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
          <div className="space-y-6">
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
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dcc7a1]/40 bg-[#dcc7a1] px-4 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(220,199,161,0.18)] transition hover:brightness-105"
                >
                  Profil öffnen
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Google Status</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Kalender</h2>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${primaryConnection ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/70"}`}>
                  {primaryConnection ? "Verbunden" : "Nicht verbunden"}
                </div>
              </div>

              <div className="mt-5 space-y-4 rounded-[22px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Google-Mail</div>
                  <div className="mt-2 text-sm font-medium text-white break-all">{connectedGoogleMail}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Hauptkalender</div>
                  <div className="mt-2 text-sm text-white/80 break-all">{defaultCalendarId ?? "Noch nicht gesetzt"}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Aktive Kalender</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeCalendarLabels.length > 0 ? (
                      activeCalendarLabels.map((calendarId) => (
                        <span key={calendarId} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                          {calendarId}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-white/50">Noch keine aktiven Kalender gespeichert.</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Letzter Sync</div>
                  <div className="mt-2 text-sm text-white/80">{lastSync}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#d7c097]">Zusatzkalender</div>
                  <div className="mt-2 text-sm text-white/80">
                    {isAdmin
                      ? readOnlyConnections.length > 0
                        ? `${readOnlyConnections.length} read-only Verbindung(en) aktiv`
                        : "Noch keine read-only Zusatzkalender aktiv"
                      : "Nur für Admin sichtbar und verwaltbar"}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/calendar/google"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dcc7a1]/40 bg-[#dcc7a1] px-4 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(220,199,161,0.18)] transition hover:brightness-105"
                >
                  Google öffnen
                </Link>
                <Link
                  href="/calendar"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-white/10"
                >
                  Zum Kalender
                </Link>
              </div>
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

                {card.title === "Google Kalender" ? (
                  <div className="mt-5 space-y-3 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Hauptverbindung</span>
                      <span className="text-right font-medium text-white break-all">{connectedGoogleMail}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Schreibziele</span>
                      <div className="text-right">
                        {STUDIO_TARGETS.map((target) => (
                          <div key={target.key} className="font-medium text-white">{target.label}</div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Zusatzkalender</span>
                      <span className="text-right font-medium text-white">
                        {isAdmin ? `${readOnlyConnections.length} aktiv` : "Nur Admin"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/60">Zuletzt aktualisiert</span>
                      <span className="text-right font-medium text-white">{lastSync}</span>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  {card.href ? (
                    <Link
                      href={card.href}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-white/10"
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
