"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createService } from "@/app/services/actions";

type TenantOption = {
  id: string;
  displayName: string;
};

type TenantProfile = {
  user_id: string;
  tenant_id: string;
  full_name: string | null;
  avatar_path: string | null;
  avatar_ring_color: string | null;
};

function tenantAccentColor(name: string | null | undefined) {
  const normalized = String(name ?? "").toLowerCase();
  if (normalized.includes("alexandra")) return "#00d26a";
  if (normalized.includes("raluca")) return "#a855f7";
  if (normalized.includes("barbara")) return "#fb923c";
  if (normalized.includes("boba")) return "#d9f99d";
  if (normalized.includes("radu")) return "#3b82f6";
  return "#d6b98a";
}

function resolveAvatarUrl(avatarPath: string | null | undefined, userId: string | null | undefined) {
  const raw = String(avatarPath ?? "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
    const normalized = raw.replace(/^\/+/, "").replace(/^avatars\//i, "");
    const { data } = supabaseBrowser().storage.from("avatars").getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }
  const uid = String(userId ?? "").trim();
  return uid ? `/users/${uid}.png` : "";
}

function avatarHideOnError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
  const parent = event.currentTarget.parentElement;
  if (parent) parent.dataset.avatarBroken = "1";
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function PractitionerAvatar({
  label,
  profile,
  size = 42,
}: {
  label: string;
  profile: TenantProfile | null;
  size?: number;
}) {
  const ringColor = String(profile?.avatar_ring_color ?? "").trim() || tenantAccentColor(label);
  const avatarUrl = resolveAvatarUrl(profile?.avatar_path, profile?.user_id);
  const initial = String(label || "B").slice(0, 1).toUpperCase();

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_22px_rgba(0,0,0,0.28)]"
      style={{ width: size, height: size, borderColor: ringColor }}
      title={label}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={label} className="h-full w-full object-cover" onError={avatarHideOnError} />
      ) : (
        <span className="text-sm font-bold text-white/85">{initial}</span>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${ringColor}` }} />
    </div>
  );
}


function menuIconButtonClass(active = false, danger = false) {
  if (danger) {
    return "inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-600/90 hover:text-white active:scale-[0.98]";
  }

  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.10] active:scale-[0.98]`;
}

function menuSubmitButtonClass(canSubmit: boolean) {
  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border px-3 text-sm font-semibold transition-colors active:scale-[0.98] ${
    canSubmit
      ? "border-emerald-400/35 bg-emerald-500/16 text-emerald-50 hover:bg-emerald-500/24"
      : "border-white/10 bg-white/[0.04] text-white/38 cursor-not-allowed"
  }`;
}

function menuToggleButtonClass(active: boolean) {
  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border px-3 text-sm font-semibold transition-colors active:scale-[0.98] ${
    active
      ? "border-sky-400/40 bg-sky-500/16 text-sky-50 shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_12px_32px_rgba(14,165,233,0.10)] hover:bg-sky-500/24"
      : "border-orange-400/35 bg-orange-500/14 text-orange-100 shadow-[0_0_0_1px_rgba(251,146,60,0.08),0_12px_32px_rgba(249,115,22,0.08)] hover:bg-orange-500/22"
  }`;
}

function fieldClassName() {
  return [
    "mt-1 w-full rounded-xl border px-3 py-2.5",
    "bg-black/30 text-white placeholder:text-white/35 border-white/15",
    "focus:outline-none focus:ring-2 focus:ring-white/20",
  ].join(" ");
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[24px] w-[24px] md:h-[24px] md:w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M10 14 19 5" />
      <path d="M13 5h6v6" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[24px] w-[24px] md:h-[24px] md:w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7v10" />
      <path d="M7 12h10" />
    </svg>
  );
}

function ServicesActionPill({
  accentColor = "#60a5fa",
  icon,
}: {
  accentColor?: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--service-pill-border)] bg-[var(--service-pill-bg)] px-0 font-semibold uppercase tracking-[0.12em] text-[var(--service-pill-color)] shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition duration-200 group-hover:-translate-y-[1px] group-hover:border-white/18 group-hover:bg-white/[0.10] group-hover:text-white group-active:scale-[0.98] md:h-9 md:w-9 md:group-hover:bg-white/[0.08] [&_svg]:transition-transform [&_svg]:duration-200 group-hover:[&_svg]:scale-110"
      style={
        {
          "--service-pill-bg": `${accentColor}16`,
          "--service-pill-border": `${accentColor}38`,
          "--service-pill-color": accentColor,
        } as React.CSSProperties
      }
    >
      {icon}
    </span>
  );
}

function ServiceQuickCreateSlideover({
  open,
  shown,
  onClose,
  tenantId,
  tenantName,
  isAdmin,
  tenantOptions,
}: {
  open: boolean;
  shown: boolean;
  onClose: () => void;
  tenantId: string | null;
  tenantName: string | null;
  isAdmin: boolean;
  tenantOptions: TenantOption[];
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenantId ?? "");
  const [serviceName, setServiceName] = useState("");
  const [tenantProfiles, setTenantProfiles] = useState<TenantProfile[]>([]);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setSelectedTenantId(tenantId ?? "");
    setTenantSelectOpen(false);
    if (open) {
      setServiceName("");
      setIsActive(true);
    }
  }, [tenantId, open]);

  useEffect(() => {
    if (!open) return;

    const ids = Array.from(
      new Set(
        [tenantId, ...tenantOptions.map((option) => option.id)]
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      ),
    );

    if (ids.length === 0) {
      setTenantProfiles([]);
      return;
    }

    let cancelled = false;

    supabaseBrowser()
      .from("user_profiles")
      .select("user_id, tenant_id, full_name, avatar_path, avatar_ring_color")
      .in("tenant_id", ids)
      .then(({ data }: { data: TenantProfile[] | null }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const rows = (data ?? [])
          .filter((row) => {
            const rowTenantId = String(row?.tenant_id ?? "").trim();
            if (!rowTenantId || seen.has(rowTenantId)) return false;
            seen.add(rowTenantId);
            return true;
          })
          .map((row) => ({
            user_id: String(row.user_id ?? ""),
            tenant_id: String(row.tenant_id ?? ""),
            full_name: row.full_name ?? null,
            avatar_path: row.avatar_path ?? null,
            avatar_ring_color: row.avatar_ring_color ?? null,
          }));
        setTenantProfiles(rows);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tenantId, tenantOptions]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const selectedTenantName = useMemo(() => {
    return (
      tenantOptions.find((entry) => entry.id === selectedTenantId)?.displayName ??
      tenantName ??
      "Behandler"
    );
  }, [tenantOptions, selectedTenantId, tenantName]);

  const selectedTenantProfile = useMemo(() => {
    return tenantProfiles.find((profile) => profile.tenant_id === selectedTenantId) ?? null;
  }, [tenantProfiles, selectedTenantId]);

  const canSubmit = Boolean(selectedTenantId && serviceName.trim());
  const formId = "dashboard-service-quick-create-form";

  if (!mounted || !open || typeof document === "undefined") return null;

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate" }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          bottom: 10,
          width: 470,
          minWidth: 0,
          maxWidth: "calc(100vw - 20px)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.92) 0%, rgba(10,10,10,0.92) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 16px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form={formId}
              disabled={!canSubmit}
              aria-label="Dienstleistung speichern"
              title="Dienstleistung speichern"
              className={menuSubmitButtonClass(canSubmit)}
            >
              <PlusCircleIcon />
            </button>

            <button
              type="button"
              onClick={() => setIsActive((current) => !current)}
              aria-pressed={isActive}
              className={menuToggleButtonClass(isActive)}
              title={isActive ? "Sofort aktiv" : "Nicht aktiv"}
            >
              {isActive ? "Sofort aktiv" : "Nicht aktiv"}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              title="Schließen"
              className={menuIconButtonClass(false, true)}
            >
              <XIcon />
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 px-4 pt-4">
          <div className="min-w-0">
            <div className="text-xl font-extrabold leading-tight text-white">Neue Dienstleistung</div>
          </div>

          {selectedTenantId ? (
            <PractitionerAvatar
              label={selectedTenantName}
              profile={selectedTenantProfile}
              size={46}
            />
          ) : null}
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>
          <form id={formId} action={createService} className="space-y-5">
            <input type="hidden" name="tenant_id" value={selectedTenantId} />
            {isActive ? <input type="hidden" name="is_active" value="1" /> : null}

            {isAdmin ? (
              <div className="relative">
                <label className="text-white text-sm">Behandler *</label>
                <button
                  type="button"
                  onClick={() => setTenantSelectOpen((current) => !current)}
                  className="mt-1 flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-left text-white transition hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-white/15"
                  aria-expanded={tenantSelectOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {selectedTenantId ? (
                      <PractitionerAvatar
                        label={selectedTenantName}
                        profile={selectedTenantProfile}
                        size={34}
                      />
                    ) : null}
                    <span className={`truncate text-sm font-semibold ${selectedTenantId ? "text-white" : "text-white/45"}`}>
                      {selectedTenantId ? selectedTenantName : "Bitte wählen…"}
                    </span>
                  </span>

                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 flex-shrink-0 text-white/55 transition ${tenantSelectOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {tenantSelectOpen ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/12 bg-[#101010] shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                    {tenantOptions.map((tenant) => {
                      const profile = tenantProfiles.find((entry) => entry.tenant_id === tenant.id) ?? null;
                      const active = tenant.id === selectedTenantId;

                      return (
                        <button
                          key={tenant.id}
                          type="button"
                          onClick={() => {
                            setSelectedTenantId(tenant.id);
                            setTenantSelectOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                            active ? "bg-white/[0.08] text-white" : "text-white/86 hover:bg-white/[0.05]"
                          }`}
                        >
                          <PractitionerAvatar
                            label={tenant.displayName}
                            profile={profile}
                            size={34}
                          />
                          <span className="min-w-0 flex-1 truncate text-base font-semibold">
                            {tenant.displayName}
                          </span>
                          {active ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5 text-emerald-300"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <PractitionerAvatar label={selectedTenantName} profile={selectedTenantProfile} size={36} />
                <div>
                  <div className="text-sm text-white/55">Behandler</div>
                  <div className="mt-1 text-base font-medium text-white">{selectedTenantName}</div>
                </div>
              </div>
            )}

            <div>
              <label className="text-white text-sm">Name *</label>
              <input
                name="name"
                required
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                className={fieldClassName()}
                placeholder="z. B. Neues Set Klassisch"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm">Dauer (Min) *</label>
                <input
                  name="duration_minutes"
                  type="number"
                  min="1"
                  defaultValue="60"
                  className={fieldClassName()}
                  required
                />
              </div>
              <div>
                <label className="text-white text-sm">Buffer (Min)</label>
                <input
                  name="buffer_minutes"
                  type="number"
                  min="0"
                  defaultValue="0"
                  className={fieldClassName()}
                />
              </div>
            </div>

            <div>
              <label className="text-white text-sm">Preis (€)</label>
              <input
                name="default_price"
                className={fieldClassName()}
                placeholder="z. B. 89,00"
              />
            </div>

            <div>
              <label className="text-white text-sm">Beschreibung</label>
              <textarea
                name="description"
                rows={5}
                className={fieldClassName()}
                placeholder="Optional: kurze interne Beschreibung"
              />
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              Dienstleistung speichern
            </Button>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default function DashboardServicesCard({
  activeCount,
  tenantId,
  tenantName,
  isAdmin = false,
  tenantOptions = [],
}: {
  activeCount: number;
  tenantId: string | null;
  tenantName: string | null;
  isAdmin?: boolean;
  tenantOptions?: TenantOption[];
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setShown(true), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  const close = () => {
    setShown(false);
    window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <>
      <Card className="h-full overflow-hidden border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] shadow-[0_26px_72px_rgba(0,0,0,0.26)] backdrop-blur-[22px] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.07)] hover:shadow-[0_34px_84px_rgba(0,0,0,0.30)]">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-start gap-3">
              <div
                className="shrink-0 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[28px] lg:text-[31px]"
                style={{ color: "#60a5fa" }}
              >
                {activeCount}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium leading-5 text-[var(--text-muted)] sm:text-[12px]">Services</div>
                <div className="mt-0.5 text-[9px] leading-4 text-white/42 sm:text-[10px]">{tenantName ?? "Behandler"}</div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setOpen(true)} className="group shrink-0" aria-label="Neue Dienstleistung">
                <ServicesActionPill icon={<PlusCircleIcon />} accentColor="#60a5fa" />
              </button>

              <Link href="/services" className="group shrink-0" aria-label="Services öffnen">
                <ServicesActionPill icon={<OpenIcon />} accentColor="#60a5fa" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <ServiceQuickCreateSlideover
        open={open}
        shown={shown}
        onClose={close}
        tenantId={tenantId}
        tenantName={tenantName}
        isAdmin={isAdmin}
        tenantOptions={tenantOptions}
      />
    </>
  );
}
