// ServiceSlideover.tsx
"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function ServiceSlideover({
  open,
  onClose,
  mode,
  service,
  tenants,
  selectedTenantId,
}: any) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !open || typeof document === "undefined") return null;

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200 }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Panel */}
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
          background: "linear-gradient(180deg, rgba(16,16,16,0.92), rgba(10,10,10,0.92))",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Dienstleistungen</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {mode === "edit" ? "Dienstleistung bearbeiten" : "Neue Dienstleistung"}
            </div>
          </div>
          <Button variant="secondary" onClick={onClose}>Schließen</Button>
        </div>

        {/* Content */}
        <div style={{ padding: 16, overflow: "auto" }}>
          <div className="space-y-4">
            <input placeholder="Name" className="w-full p-2 rounded bg-black/30 border border-white/10" defaultValue={service?.name} />
            <input placeholder="Dauer (Min)" className="w-full p-2 rounded bg-black/30 border border-white/10" defaultValue={service?.duration_minutes} />
            <input placeholder="Preis (€)" className="w-full p-2 rounded bg-black/30 border border-white/10" defaultValue={service?.price} />
            <textarea placeholder="Beschreibung" className="w-full p-2 rounded bg-black/30 border border-white/10" defaultValue={service?.description} />
            <Button className="w-full">Speichern</Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
