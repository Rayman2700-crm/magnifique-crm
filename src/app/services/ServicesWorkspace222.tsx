"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
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
};

type Props = {
  selectedTenantId: string;
  tenantName: string | null;
  services: ServiceRow[];
  initialCreateOpen?: boolean;
};

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
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
    active
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : "border-white/10 bg-white/5 text-white/70",
  ].join(" ");
}

function tenantAccentColor(tenantId: string | null | undefined) {
  const id = String(tenantId ?? "").toLowerCase();

  if (id.includes("radu")) return "#3b82f6";
  if (id.includes("raluca")) return "#a855f7";
  if (id.includes("alexandra")) return "#22c55e";
  if (id.includes("barbara")) return "#f97316";

  return "rgba(255,255,255,0.38)";
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

export default function ServicesWorkspace({ selectedTenantId, tenantName, services, initialCreateOpen = false }: Props) {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [createShown, setCreateShown] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editShown, setEditShown] = useState(false);

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
    window.setTimeout(() => setCreateOpen(false), 180);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
    }
  };

  const closeEdit = () => {
    setEditShown(false);
    window.setTimeout(() => setEditingServiceId(null), 180);
  };

  const editingService = useMemo(
    () => services.find((service) => service.id === editingServiceId) ?? null,
    [editingServiceId, services]
  );

  return (
    <>
      <section className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-4 px-1">
          <h2 className="text-xl font-semibold text-[var(--text)]">Dienstleistungen</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Kompakte Liste mit schnellen Aktionen für <span className="text-[var(--text)]">{tenantName ?? "aktuellen Behandler"}</span>.
          </p>
        </div>

        {services.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            Keine Dienstleistungen gefunden. Passe Suche oder Statusfilter an.
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => {
              const active = Boolean(service.is_active);
              const accent = tenantAccentColor(service.tenant_id);

              return (
                <article
                  key={service.id}
                  className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/25 md:p-5"
                >
                  <div
                    className="absolute bottom-4 left-0 top-4 w-[4px] rounded-r-full"
                    style={{ backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }}
                  />

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 pl-3">
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
                        <span>Geändert: {formatDate(service.updated_at)}</span>
                      </div>
                      {service.description ? (
                        <p className="mt-3 line-clamp-2 text-sm text-white/55">{service.description}</p>
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
          <input type="hidden" name="tenant_id" value={selectedTenantId} />

          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
            <div className="text-xs text-white/55">Behandler</div>
            <div className="mt-1 font-medium text-white">{tenantName ?? "Aktueller Behandler"}</div>
          </div>

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

          <Button type="submit" className="w-full">
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

            <Button type="submit" className="w-full">
              Änderungen speichern
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
          </form>
        ) : null}
      </ServiceSheet>
    </>
  );
}
