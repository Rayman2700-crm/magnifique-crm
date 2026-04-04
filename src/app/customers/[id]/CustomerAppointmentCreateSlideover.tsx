"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { createAppointment } from "./appointments/actions";

type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function nextRoundedHalfHourValue() {
  const d = new Date();
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  if (minutes === 0 || minutes === 30) {
    d.setMinutes(minutes, 0, 0);
  } else if (minutes < 30) {
    d.setMinutes(30, 0, 0);
  } else {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatEuroFromCents(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format((Number(value || 0)) / 100);
}

export default function CustomerAppointmentCreateSlideover({
  customerProfileId,
  customerName,
  tenantId,
  tenantName,
  services,
  initialOpen = false,
  buttonLabel = "Neuer Termin",
  buttonSize = "sm",
}: {
  customerProfileId: string;
  customerName: string;
  tenantId: string | null;
  tenantName: string;
  services: ServiceOption[];
  initialOpen?: boolean;
  buttonLabel?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? "");
  const [startValue, setStartValue] = useState(nextRoundedHalfHourValue());
  const [notesValue, setNotesValue] = useState("");
  const [statusValue, setStatusValue] = useState("scheduled");

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(initialOpen), [initialOpen]);

  useEffect(() => {
    if (!selectedServiceId && services[0]?.id) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const titleValue = selectedService?.name ?? "";
  const durationValue = Math.max(5, Number(selectedService?.durationMinutes ?? 60) || 60);
  const bufferValue = Math.max(0, Number(selectedService?.bufferMinutes ?? 0) || 0);
  const priceValue = Number(selectedService?.priceCents ?? 0) || 0;

  if (!mounted) {
    return (
      <Button size={buttonSize} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
    );
  }

  const slideover = open ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, isolation: "isolate" }}>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(6px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(620px, calc(100vw - 1rem))",
          padding: 12,
          display: "flex",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#0b0b0c",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Neuer Termin</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
                {customerName}
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                Behandler: {tenantName}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Schließen
            </Button>
          </div>

          <div style={{ padding: 16, overflow: "auto" }}>
            <form
              action={createAppointment.bind(null, customerProfileId)}
              className="space-y-4"
            >
              <input type="hidden" name="return_to_customer" value="1" />
              <input type="hidden" name="service_id" value={selectedService?.id ?? ""} />
              <input type="hidden" name="service_name_snapshot" value={selectedService?.name ?? ""} />
              <input type="hidden" name="service_duration_minutes_snapshot" value={String(durationValue)} />
              <input type="hidden" name="service_buffer_minutes_snapshot" value={String(bufferValue)} />
              <input type="hidden" name="service_price_cents_snapshot" value={String(priceValue)} />
              <input type="hidden" name="title" value={titleValue} />
              <input type="hidden" name="duration" value={String(durationValue)} />
              <input type="hidden" name="buffer" value={String(bufferValue)} />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/80">Kunde</div>
                <div className="mt-2 text-base font-semibold text-white">{customerName}</div>
                <div className="mt-1 text-xs text-white/50">
                  Kunde ist bereits vorausgewählt, weil du dich im Kundenprofil befindest.
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Service</label>
                <select
                  name="service_select"
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                  required
                >
                  {services.length === 0 ? (
                    <option value="">Keine aktiven Dienstleistungen gefunden</option>
                  ) : null}
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                {services.length === 0 ? (
                  <div className="mt-2 text-xs text-amber-200">
                    Für diesen Behandler wurden keine aktiven Dienstleistungen gefunden.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/45">Dauer</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{durationValue} Min</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/45">Buffer</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{bufferValue} Min</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/45">Preis</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{formatEuroFromCents(priceValue)}</div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Start</label>
                <input
                  name="start"
                  type="datetime-local"
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Status</label>
                <select
                  name="status"
                  value={statusValue}
                  onChange={(e) => setStatusValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                >
                  <option value="scheduled">Geplant</option>
                  <option value="completed">Gekommen</option>
                  <option value="cancelled">Abgesagt</option>
                  <option value="no_show">Nicht gekommen</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Interne Notiz</label>
                <textarea
                  name="notes"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  className="mt-1 min-h-[100px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder:text-white/35"
                  placeholder="Notizen..."
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-white/45">
                  Dauer und Buffer werden automatisch aus der gewählten Dienstleistung übernommen.
                </div>
                <button className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                  Termin erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button size={buttonSize} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      {mounted && typeof document !== "undefined" ? createPortal(slideover, document.body) : null}
    </>
  );
}
