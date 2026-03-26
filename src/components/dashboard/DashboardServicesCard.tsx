"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createService } from "@/app/services/actions";

type TenantOption = {
  id: string;
  displayName: string;
};

function fieldClassName() {
  return [
    "mt-1 w-full rounded-xl border px-3 py-2.5",
    "bg-black/30 text-white placeholder:text-white/35 border-white/15",
    "focus:outline-none focus:ring-2 focus:ring-white/20",
  ].join(" ");
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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setSelectedTenantId(tenantId ?? "");
  }, [tenantId, open]);

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
    return tenantOptions.find((entry) => entry.id === selectedTenantId)?.displayName ?? tenantName ?? "Behandler";
  }, [tenantOptions, selectedTenantId, tenantName]);

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
              Neue Dienstleistung
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
              Schneller Zugriff direkt aus dem Dashboard.
            </div>
          </div>

          <Button variant="secondary" onClick={onClose}>
            Schließen
          </Button>
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>
          <form action={createService} className="space-y-5">
            <input type="hidden" name="tenant_id" value={selectedTenantId} />

            {isAdmin ? (
              <div>
                <label className="text-white text-sm">Behandler</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className={fieldClassName()}
                  style={{ colorScheme: "dark" }}
                  required
                >
                  <option value="" disabled className="bg-[#0b0b0c] text-white">
                    Bitte wählen…
                  </option>
                  {tenantOptions.map((tenant) => (
                    <option key={tenant.id} value={tenant.id} className="bg-[#0b0b0c] text-white">
                      {tenant.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-sm text-white/55">Behandler</div>
                <div className="mt-2 text-base font-medium text-white">
                  {selectedTenantName}
                </div>
              </div>
            )}

            <div>
              <label className="text-white text-sm">Name *</label>
              <input
                name="name"
                required
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

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-white">
              <input type="checkbox" name="is_active" value="1" defaultChecked className="h-4 w-4" />
              Sofort aktiv
            </label>

            <Button type="submit" className="w-full" disabled={!selectedTenantId}>
              Dienstleistung speichern
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
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
      <Card className="h-full min-w-0 border-[var(--border)] bg-[var(--surface)] transition hover:border-white/20 hover:bg-white/[0.03]">
        <CardContent className="flex h-full min-h-[130px] flex-col justify-center items-center p-3">
          <div className="min-w-0 text-center">
            <div className="truncate text-[13px] font-semibold leading-4 text-white">Dienstleistungen</div>
            <div className="mt-0.5 text-[10px] leading-4 text-white/60">{tenantName ?? "Behandler"}</div>
          </div>

          <div className="mt-3 flex items-center justify-center">
            <div
              className="text-[22px] font-bold leading-none tracking-tight"
              style={{ color: "#ffffff" }}
            >
              {activeCount}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-wide transition"
              style={{
                backgroundColor: "rgba(96,165,250,0.08)",
                borderColor: "rgba(96,165,250,0.22)",
                color: "#60a5fa",
              }}
            >
              + Neu
            </button>

            <Link href="/services">
              <span
                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-wide transition"
                style={{
                  backgroundColor: "rgba(96,165,250,0.08)",
                  border: "1px solid rgba(96,165,250,0.22)",
                  color: "#60a5fa",
                }}
              >
                Öffnen
              </span>
            </Link>
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
