"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { deleteCustomerPhoto } from "./actions";

type MediaItem = {
  id: string;
  url: string | null;
  mimeType: string | null;
  createdAt: string | null;
};

function isVideo(mimeType?: string | null) {
  return !!mimeType && mimeType.startsWith("video/");
}

export default function CustomerMediaGalleryClient({
  customerProfileId,
  items,
}: {
  customerProfileId: string;
  items: MediaItem[];
}) {
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ESC schließt
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const slideOver = selected ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        isolation: "isolate",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={() => setSelected(null)}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Center panel (größer als Kalender) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(1100px, calc(100vw - 2rem))",
            height: "min(780px, calc(100vh - 2rem))",
            backgroundColor: "#0b0b0c",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Tipp: ESC schließt • Klick außerhalb schließt
            </div>

            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.92)",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Schließen
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected.url ? (
              isVideo(selected.mimeType) ? (
                <video
                  src={selected.url}
                  controls
                  autoPlay
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    background: "#000",
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.url}
                  alt="Media"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    background: "#000",
                  }}
                />
              )
            ) : (
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                Kein Zugriff / URL nicht verfügbar
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  }, [items]);

  if (sorted.length === 0) {
    return <div className="text-sm text-white/50">Noch keine Fotos.</div>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {sorted.map((ph) => {
          const url = ph.url;

          return (
            <div
              key={ph.id}
              className="rounded-xl border border-white/10 overflow-hidden bg-black/20"
              style={{ width: 180 }}
            >
              {/* Preview */}
              <button
                type="button"
                onClick={() => setSelected(ph)}
                className="block w-full"
                title="Öffnen"
                style={{ background: "#000" }}
              >
                <div style={{ width: 180, height: 120 }}>
                  {url ? (
                    isVideo(ph.mimeType) ? (
                      <video
                        src={url}
                        muted
                        playsInline
                        preload="metadata"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt="Vorschau"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )
                  ) : (
                    <div className="text-xs text-white/50 p-3">Keine Vorschau</div>
                  )}
                </div>
              </button>

              {/* Meta: NUR Zeitstempel */}
              <div className="p-2 text-xs text-white/60">
                <div className="mt-0.5">
                  {ph.createdAt ? new Date(ph.createdAt).toLocaleString() : "-"}
                </div>

                {/* Actions: Öffnen + Löschen (kein neuer Tab) */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(ph)}
                    className="rounded-lg border border-white/15 px-2 py-1 text-white/80 hover:bg-white/5"
                  >
                    Öffnen
                  </button>

                  <form action={deleteCustomerPhoto.bind(null, customerProfileId, ph.id)}>
                    <button className="rounded-lg border border-white/15 px-2 py-1 text-white/80 hover:bg-white/5">
                      Löschen
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {mounted && typeof document !== "undefined"
        ? createPortal(slideOver, document.body)
        : null}
    </>
  );
}