"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { createAppointmentQuick } from "@/app/calendar/actions";
import { useEffect, useMemo, useState } from "react";

type TenantOption = { id: string; display_name: string | null };
type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function roundUpToNextMinutes(d: Date, stepMin: number) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  const next = Math.ceil(m / stepMin) * stepMin;
  if (next === m) return x;
  x.setMinutes(next);
  return x;
}

function formatPrice(cents: number | null | undefined) {
  if (typeof cents !== "number" || Number.isNaN(cents)) return null;
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export default function CreateAppointmentSlideover({
  mounted,
  createVisible,
  createShown,
  onClose,
  tenants,
  services,
  creatorTenantId,
  defaultWeekISO,
  initialWalkInName,
  initialWalkInPhone,
  forceTenantId,
  hideTenantSelect = false,
  tenantLabel,
}: {
  mounted: boolean;
  createVisible: boolean;
  createShown: boolean;
  onClose: () => void;
  tenants: TenantOption[];
  services: ServiceOption[];
  creatorTenantId: string | null;
  defaultWeekISO?: string;
  initialWalkInName?: string;
  initialWalkInPhone?: string;
  forceTenantId?: string | null;
  hideTenantSelect?: boolean;
  tenantLabel?: string;
}) {
  const sortedTenants = useMemo(() => {
    const copy = [...(tenants ?? [])];
    copy.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "de"));
    return copy;
  }, [tenants]);

  const effectiveInitialTenantId = forceTenantId ?? creatorTenantId ?? sortedTenants[0]?.id ?? "";

  const [selectedTenantId, setSelectedTenantId] = useState<string>(effectiveInitialTenantId);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [startValue, setStartValue] = useState<string>("");
  const [walkInName, setWalkInName] = useState(initialWalkInName ?? "");
  const [walkInPhone, setWalkInPhone] = useState(initialWalkInPhone ?? "");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [returnTo, setReturnTo] = useState<string>("");

  const activeTenantId = forceTenantId ?? selectedTenantId;

  const tenantServices = useMemo(() => {
    return (services ?? [])
      .filter((service) => service.tenant_id === activeTenantId && service.is_active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [services, activeTenantId]);

  const selectedService = useMemo(
    () => tenantServices.find((service) => service.id === selectedServiceId) ?? null,
    [tenantServices, selectedServiceId]
  );

  useEffect(() => {
    if (!createVisible) return;

    const next = roundUpToNextMinutes(new Date(), 15);
    setStartValue(toDatetimeLocalValue(next));
    setWalkInName(initialWalkInName ?? "");
    setWalkInPhone(initialWalkInPhone ?? "");
    setNotes("");
    setStatus("scheduled");
    setSelectedServiceId("");
    setSelectedTenantId(forceTenantId ?? creatorTenantId ?? sortedTenants[0]?.id ?? "");

    if (typeof window !== "undefined") {
      setReturnTo(window.location.pathname + window.location.search);
    }
  }, [createVisible, creatorTenantId, forceTenantId, initialWalkInName, initialWalkInPhone, sortedTenants]);

  useEffect(() => {
    if (forceTenantId) {
      setSelectedTenantId(forceTenantId);
      return;
    }

    if (!creatorTenantId) return;
    setSelectedTenantId((prev) => prev || creatorTenantId);
  }, [creatorTenantId, forceTenantId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (createVisible) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [createVisible, onClose]);

  useEffect(() => {
    if (!activeTenantId) {
      setSelectedServiceId("");
      return;
    }

    setSelectedServiceId((current) => {
      if (current && tenantServices.some((service) => service.id === current)) return current;
      return tenantServices[0]?.id ?? "";
    });
  }, [activeTenantId, tenantServices]);

  if (!mounted || !createVisible || typeof document === "undefined") return null;

  const titleValue = selectedService?.name ?? "Termin";
  const durationValue = selectedService?.duration_minutes ?? 60;
  const bufferValue = selectedService?.buffer_minutes ?? 0;
  const priceLabel = formatPrice(selectedService?.default_price_cents ?? null);
  const selectedTenantLabel =
    tenantLabel ?? sortedTenants.find((t) => t.id === activeTenantId)?.display_name ?? "Behandler";

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate" }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: createShown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: createShown ? "auto" : "none",
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
          transform: createShown ? "translateX(0)" : "translateX(18px)",
          opacity: createShown ? 1 : 0,
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Kalender</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
              Neuer Termin
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
              {hideTenantSelect
                ? "Termin direkt für diesen Kunden anlegen"
                : "Behandler wählen · Dienstleistung wählen · Kunde optional (Walk-in)"}
            </div>
          </div>

          <Button variant="secondary" onClick={onClose}>
            Schließen
          </Button>
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>
          <form action={createAppointmentQuick} className="space-y-4">
            {hideTenantSelect ? (
              <div>
                <label className="text-white text-sm">Behandler</label>
                <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/85">
                  {selectedTenantLabel}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-white text-sm">Behandler</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                  style={{ colorScheme: "dark", backgroundColor: "rgba(0,0,0,0.30)" }}
                >
                  <option value="" disabled className="bg-[#0b0b0c] text-white">
                    Bitte wählen…
                  </option>
                  {sortedTenants.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#0b0b0c] text-white">
                      {t.display_name ?? "Behandler"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input type="hidden" name="tenantId" value={activeTenantId} />
            <input type="hidden" name="creatorTenantId" value={creatorTenantId ?? ""} />
            <input type="hidden" name="week" value={defaultWeekISO ?? ""} />
            <input type="hidden" name="tenant" value="" />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div>
              <label className="text-white text-sm">Dienstleistung</label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                style={{ colorScheme: "dark", backgroundColor: "rgba(0,0,0,0.30)" }}
              >
                <option value="" disabled className="bg-[#0b0b0c] text-white">
                  {activeTenantId ? "Dienstleistung wählen…" : "Bitte zuerst Behandler wählen…"}
                </option>
                {tenantServices.map((service) => (
                  <option key={service.id} value={service.id} className="bg-[#0b0b0c] text-white">
                    {service.name}
                  </option>
                ))}
              </select>

              <input type="hidden" name="serviceId" value={selectedServiceId} />
              <input type="hidden" name="title" value={titleValue} />
              <input type="hidden" name="duration" value={durationValue} />
              <input type="hidden" name="buffer" value={bufferValue} />

              {selectedService ? (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
                  <div className="font-medium text-white">{selectedService.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/65">
                    <span>Dauer: {durationValue} Min</span>
                    <span>Buffer: {bufferValue} Min</span>
                    {priceLabel ? <span>Preis: {priceLabel}</span> : null}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-white/50">
                  Für diesen Behandler sind noch keine aktiven Dienstleistungen hinterlegt.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm">Kunde (Name) – optional</label>
                <input
                  name="walkinName"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                  placeholder="z.B. Maria Muster"
                />
              </div>
              <div>
                <label className="text-white text-sm">Telefon – optional</label>
                <input
                  name="walkinPhone"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                  placeholder="z.B. +43 660 1234567"
                />
              </div>
            </div>

            <div>
              <label className="text-white text-sm">Notiz</label>
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                placeholder="Interne Notiz"
              />
            </div>

            <div>
              <label className="text-white text-sm">Status</label>
              <select
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                style={{ colorScheme: "dark", backgroundColor: "rgba(0,0,0,0.30)" }}
              >
                <option value="scheduled" className="bg-[#0b0b0c] text-white">
                  Geplant
                </option>
                <option value="completed" className="bg-[#0b0b0c] text-white">
                  Gekommen
                </option>
                <option value="cancelled" className="bg-[#0b0b0c] text-white">
                  Abgesagt
                </option>
                <option value="no_show" className="bg-[#0b0b0c] text-white">
                  Nicht gekommen
                </option>
              </select>
            </div>

            <div>
              <label className="text-white text-sm">Start</label>
              <input
                type="datetime-local"
                name="start"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                style={{ colorScheme: "dark" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm">Dauer (Min)</label>
                <input
                  value={durationValue}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/85 outline-none"
                />
              </div>

              <div>
                <label className="text-white text-sm">Buffer</label>
                <input
                  value={bufferValue}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/85 outline-none"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!activeTenantId || !selectedServiceId}>
              Termin erstellen
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
