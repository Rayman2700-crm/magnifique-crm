"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createService,
  toggleServiceActive,
  updateService,
} from "./actions";

type ServiceRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  default_price_cents: number | null;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  description: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  tenant?:
    | {
        display_name: string | null;
      }
    | {
        display_name: string | null;
      }[]
    | null;
};

type TenantOption = {
  id: string;
  display_name: string | null;
};

type Props = {
  selectedTenantId: string;
  tenantName: string | null;
  services: ServiceRow[];
  initialCreateOpen?: boolean;
  tenantOptions?: TenantOption[];
  isAdmin?: boolean;
};

function getTenantDisplayLabel(name: string | null | undefined, fallback: string) {
  const source = String(name ?? "").trim() || fallback;
  return source.split(/\s+/)[0] || fallback;
}

function euroFromCents(value: number | null | undefined) {
  const cents = Number(value ?? 0);
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fieldClassName() {
  return [
    "mt-1 w-full rounded-[16px] border px-4 py-3",
    "bg-black/30 text-white placeholder:text-white/35 border-white/10",
    "focus:outline-none focus:ring-2 focus:ring-white/15",
  ].join(" ");
}

function badgeClassName(active: boolean) {
  return [
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
    active
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : "border-white/10 bg-white/5 text-white/70",
  ].join(" ");
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function tenantAccentColor(label: string | null | undefined) {
  const value = String(label ?? "").toLowerCase();

  if (value.includes("radu")) return "#3b82f6";
  if (value.includes("raluca")) return "#a855f7";
  if (value.includes("alexandra")) return "#22c55e";
  if (value.includes("barbara")) return "#f97316";

  return "rgba(255,255,255,0.42)";
}

function withAlpha(hexOrRgba: string, alpha: number) {
  if (hexOrRgba.startsWith("#")) {
    const hex = hexOrRgba.slice(1);
    const normalized = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (hexOrRgba.startsWith("rgba(")) {
    return hexOrRgba.replace(/rgba\(([^)]+),\s*[^,]+\)$/, `rgba($1, ${alpha})`);
  }

  if (hexOrRgba.startsWith("rgb(")) {
    return hexOrRgba.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  return hexOrRgba;
}

function ServiceSheet({
  mounted,
  open,
  shown,
  title,
  subtitle,
  onClose,
  children,
}: {
  mounted: boolean;
  open: boolean;
  shown: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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

  if (!mounted || !open || typeof document === "undefined") return null;

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate", pointerEvents: shown ? "auto" : "none" }}>
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
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.92) 0%, rgba(10,10,10,0.92) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          pointerEvents: shown ? "auto" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Dienstleistungen</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
              {title}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{subtitle}</div>
          </div>

          <Button variant="secondary" onClick={onClose}>
            Schließen
          </Button>
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default function ServicesWorkspace({
  selectedTenantId,
  tenantName,
  services,
  initialCreateOpen = false,
  tenantOptions = [],
  isAdmin = false,
}: Props) {
  const missingCreateTenant = selectedTenantId === "all";
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [createShown, setCreateShown] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editShown, setEditShown] = useState(false);
  const [expandedMobileServiceId, setExpandedMobileServiceId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCreateOpen(initialCreateOpen);
  }, [initialCreateOpen]);

  useEffect(() => {
    if (!createOpen) {
      setCreateShown(false);
      return;
    }
    const t = window.setTimeout(() => setCreateShown(true), 10);
    return () => window.clearTimeout(t);
  }, [createOpen]);

  useEffect(() => {
    if (!editingServiceId) {
      setEditShown(false);
      return;
    }
    const t = window.setTimeout(() => setEditShown(true), 10);
    return () => window.clearTimeout(t);
  }, [editingServiceId]);

  const closeCreate = () => {
    setCreateShown(false);
    window.setTimeout(() => {
      setCreateOpen(false);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("create");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 180);
  };

  const openCreate = () => {
    setCreateOpen(true);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("create", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeEdit = () => {
    setEditShown(false);
    window.setTimeout(() => setEditingServiceId(null), 180);
  };

  const editingService = useMemo(
    () => services.find((service) => service.id === editingServiceId) ?? null,
    [editingServiceId, services]
  );

  const availableTenantOptions = useMemo(() => {
    if (tenantOptions.length > 0) {
      return tenantOptions;
    }

    const seen = new Set<string>();
    const derived = services.reduce<TenantOption[]>((acc, service) => {
      const tenantId = String(service.tenant_id ?? "").trim();
      if (!tenantId || seen.has(tenantId)) return acc;
      seen.add(tenantId);

      const tenant = firstJoin(service.tenant);
      acc.push({
        id: tenantId,
        display_name: tenant?.display_name ?? tenantId,
      });
      return acc;
    }, []);

    if (derived.length > 0) {
      return derived.sort((a, b) =>
        getTenantDisplayLabel(a.display_name, a.id).localeCompare(
          getTenantDisplayLabel(b.display_name, b.id)
        )
      );
    }

    if (selectedTenantId && selectedTenantId !== "all") {
      return [{ id: selectedTenantId, display_name: tenantName ?? selectedTenantId }];
    }

    return [];
  }, [tenantOptions, services, selectedTenantId, tenantName]);

  const shouldShowTenantSelect = availableTenantOptions.length > 0;
  const selectedCreateTenantId = selectedTenantId !== "all" ? selectedTenantId : "";

  return (
    <>
      <section className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-4 flex items-start justify-between gap-4 px-1">
          <div className="hidden md:block">
            <h2 className="text-xl font-semibold text-[var(--text)]">Dienstleistungen</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Kompakte Liste mit schnellen Aktionen für <span className="text-[var(--text)]">{tenantName ?? "aktuellen Behandler"}</span>.
            </p>
          </div>

        </div>

        {services.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            Keine Dienstleistungen gefunden. Passe Suche oder Statusfilter an.
          </div>
        ) : (
          <div className="space-y-3 relative z-0">
            {services.map((service) => {
              const active = Boolean(service.is_active);
              const tenant = firstJoin(service.tenant);
              const accent = tenantAccentColor(tenant?.display_name ?? service.tenant_id);
              const borderColor = withAlpha(accent, 0.7);
              const softGlow = withAlpha(accent, 0.18);
              const fillGlow = withAlpha(accent, 0.08);
              const isExpandedMobile = expandedMobileServiceId === service.id;

              return (
                <article
                  key={service.id}
                  className="relative overflow-hidden rounded-[24px] border bg-black/20 px-4 py-4 transition hover:bg-black/25 md:px-5 md:py-5"
                  style={{
                    borderColor,
                    boxShadow: `0 0 0 1px ${withAlpha(accent, 0.14)} inset, 0 0 0 1px ${softGlow}, 0 12px 34px rgba(0,0,0,0.22)`,
                    backgroundImage: `linear-gradient(90deg, ${fillGlow} 0%, rgba(255,255,255,0) 22%)`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-[6px]"
                    style={{
                      background: `linear-gradient(180deg, ${withAlpha(accent, 0.95)} 0%, ${withAlpha(accent, 0.45)} 100%)`,
                      boxShadow: `0 0 22px ${withAlpha(accent, 0.65)}`,
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setExpandedMobileServiceId((current) => current === service.id ? null : service.id)}
                    className="flex w-full items-start justify-between gap-3 pr-1 text-left md:hidden"
                    aria-expanded={isExpandedMobile}
                  >
                    <div className="min-w-0 flex-1 pl-2">
                      <h3 className="text-[12px] font-semibold leading-[1.25] text-white break-words">
                        {service.name ?? "Unbenannte Dienstleistung"}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/70">
                        <span>Dauer: {service.duration_minutes ?? 0} Min</span>
                        <span>Preis: {euroFromCents(service.default_price_cents)} €</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 transition-transform duration-200 ${isExpandedMobile ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>

                      <span className={badgeClassName(active)}>{active ? "Aktiv" : "Inaktiv"}</span>
                    </div>
                  </button>

                  <div className={`${isExpandedMobile ? "mt-4 block" : "hidden"} md:hidden`}>
                    {service.description ? (
                      <p className="pl-2 text-sm text-white/55">{service.description}</p>
                    ) : null}

                    <div className="mt-4 flex w-full flex-col gap-2">
                      <form action={toggleServiceActive} className="w-full">
                        <input type="hidden" name="service_id" value={service.id} />
                        <input type="hidden" name="next_active" value={active ? "0" : "1"} />
                        <button
                          type="submit"
                          className="inline-flex h-10 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          {active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => setEditingServiceId(service.id)}
                        className="inline-flex h-10 w-full items-center justify-center rounded-[16px] bg-white px-3 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        Bearbeiten
                      </button>
                    </div>
                  </div>

                  <div className="hidden md:flex md:flex-col md:gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 pl-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-white">
                          {service.name ?? "Unbenannte Dienstleistung"}
                        </h3>
                        <span className={badgeClassName(active)}>{active ? "Aktiv" : "Inaktiv"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/70">
                        <span>{service.duration_minutes ?? 0} Min</span>
                        <span>Buffer {service.buffer_minutes ?? 0} Min</span>
                        <span>€ {euroFromCents(service.default_price_cents)}</span>
                        <span className="hidden md:inline">Geändert: {formatDate(service.updated_at)}</span>
                      </div>
                      {service.description ? (
                        <p className="mt-3 hidden line-clamp-2 text-sm text-white/55 md:block">{service.description}</p>
                      ) : null}
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[160px]">
                      <form action={toggleServiceActive} className="w-full">
                        <input type="hidden" name="service_id" value={service.id} />
                        <input type="hidden" name="next_active" value={active ? "0" : "1"} />
                        <button
                          type="submit"
                          className="inline-flex h-10 w-full items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          {active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => setEditingServiceId(service.id)}
                        className="inline-flex h-10 w-full items-center justify-center rounded-[16px] bg-white px-3 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        Bearbeiten
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ServiceSheet
        mounted={mounted}
        open={createOpen}
        shown={createShown}
        title="Neue Dienstleistung"
        subtitle="Lege eine neue Leistung für den aktuell ausgewählten Behandler an."
        onClose={closeCreate}
      >
        <form action={createService} className="space-y-4">
          {shouldShowTenantSelect ? (
            <div>
              <label className="text-white text-sm">Behandler *</label>
              <select
                name="tenant_id"
                defaultValue={selectedCreateTenantId}
                required
                className={fieldClassName()}
              >
                <option value="">Behandler auswählen</option>
                {availableTenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {getTenantDisplayLabel(tenant.display_name, tenant.id)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <input type="hidden" name="tenant_id" value={selectedTenantId} />
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
                <div className="text-xs text-white/55">Behandler</div>
                <div className="mt-1 font-medium text-white">{tenantName ?? "Aktueller Behandler"}</div>
              </div>
            </>
          )}

          {missingCreateTenant ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Wähle hier im Slideover einen Behandler aus, bevor du die neue Dienstleistung speicherst.
            </div>
          ) : null}

          <div>
            <label className="text-white text-sm">Name *</label>
            <input name="name" required className={fieldClassName()} placeholder="z. B. Neues Set Klassisch" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white text-sm">Dauer (Min) *</label>
              <input name="duration_minutes" type="number" min="1" defaultValue="60" className={fieldClassName()} />
            </div>

            <div>
              <label className="text-white text-sm">Buffer (Min)</label>
              <input name="buffer_minutes" type="number" min="0" defaultValue="0" className={fieldClassName()} />
            </div>
          </div>

          <div>
            <label className="text-white text-sm">Preis (€)</label>
            <input name="default_price" className={fieldClassName()} placeholder="z. B. 89,00" />
          </div>

          <div>
            <label className="text-white text-sm">Beschreibung</label>
            <textarea
              name="description"
              className={fieldClassName()}
              placeholder="Optional: kurze interne Beschreibung"
              rows={5}
            />
          </div>

          <div>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">
              <input type="checkbox" name="is_active" value="1" defaultChecked className="h-4 w-4" />
              Sofort aktiv
            </label>
          </div>

          <Button type="submit" className="w-full" disabled={!shouldShowTenantSelect && missingCreateTenant}>
            Dienstleistung speichern
          </Button>

          <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
        </form>
      </ServiceSheet>

      <ServiceSheet
        mounted={mounted}
        open={Boolean(editingService)}
        shown={editShown}
        title={editingService?.name ?? "Dienstleistung bearbeiten"}
        subtitle="Änderungen wirken auf neue Termine. Bestehende Termine behalten ihre Snapshot-Werte."
        onClose={closeEdit}
      >
        {editingService ? (
          <form action={updateService} className="space-y-4">
            <input type="hidden" name="service_id" value={editingService.id} />
            <input type="hidden" name="is_active" value={editingService.is_active ? "1" : "0"} />

            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs text-white/55">Status</div>
                <span className={badgeClassName(Boolean(editingService.is_active))}>
                  {editingService.is_active ? "Aktiv" : "Inaktiv"}
                </span>
              </div>
              <div className="mt-2 text-xs text-white/55">
                Letzte Änderung: {formatDate(editingService.updated_at)}
              </div>
            </div>

            <div>
              <label className="text-white text-sm">Name *</label>
              <input
                name="name"
                required
                defaultValue={editingService.name ?? ""}
                className={fieldClassName()}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm">Dauer (Min) *</label>
                <input
                  name="duration_minutes"
                  type="number"
                  min="1"
                  defaultValue={editingService.duration_minutes ?? 60}
                  className={fieldClassName()}
                />
              </div>

              <div>
                <label className="text-white text-sm">Buffer (Min)</label>
                <input
                  name="buffer_minutes"
                  type="number"
                  min="0"
                  defaultValue={editingService.buffer_minutes ?? 0}
                  className={fieldClassName()}
                />
              </div>
            </div>

            <div>
              <label className="text-white text-sm">Preis (€)</label>
              <input
                name="default_price"
                defaultValue={euroFromCents(editingService.default_price_cents)}
                className={fieldClassName()}
              />
            </div>

            <div>
              <label className="text-white text-sm">Beschreibung</label>
              <textarea
                name="description"
                defaultValue={editingService.description ?? ""}
                className={fieldClassName()}
                rows={6}
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">
              Aktiv-Status änderst du direkt in der Liste über den Button Aktivieren / Deaktivieren.
            </div>

            <Button type="submit" className="w-full" disabled={missingCreateTenant}>
              Änderungen speichern
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
          </form>
        ) : null}
      </ServiceSheet>
    </>
  );
}
