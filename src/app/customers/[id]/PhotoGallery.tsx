"use client";

import { useEffect, useMemo, useState } from "react";

type Photo = {
  id: string;
  url: string;
  created_at?: string | null;
  original_name?: string | null;
  size_kb?: number | null;
  onDelete?: () => void;
};

export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openPhoto = useMemo(() => {
    if (!openId) return null;
    return photos.find((p) => p.id === openId) ?? null;
  }, [openId, photos]);

  // ESC schließt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!photos || photos.length === 0) {
    return <div className="text-sm text-gray-500">Noch keine Fotos.</div>;
  }

  return (
    <div className="mt-4">
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="rounded-xl border overflow-hidden bg-black/5">
            <button
              type="button"
              className="group relative block w-full"
              onClick={() => setOpenId(p.id)}
              title={p.original_name ?? "Foto öffnen"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.original_name ?? "Kundenfoto"}
                loading="lazy"
                className="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20" />
            </button>

            <div className="p-2 text-[11px] text-gray-600">
              <div className="truncate font-medium text-gray-800">
                {p.original_name ?? "Foto"}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate">
                  {p.created_at ? new Date(p.created_at).toLocaleString() : ""}
                </span>
                <span className="shrink-0">{p.size_kb ? `${p.size_kb} KB` : ""}</span>
              </div>

              {p.onDelete && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg border px-2 py-1 text-xs"
                  onClick={p.onDelete}
                >
                  Löschen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {openPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[95vw] overflow-hidden rounded-2xl bg-black shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="absolute right-3 top-3 rounded-xl bg-white/90 px-3 py-1 text-sm"
            >
              Schließen
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openPhoto.url}
              alt={openPhoto.original_name ?? "Kundenfoto"}
              className="max-h-[90vh] max-w-[95vw] object-contain"
            />

            <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black px-4 py-2 text-xs text-white/80">
              <div className="truncate">{openPhoto.original_name ?? "Foto"}</div>
              <div className="shrink-0">
                {openPhoto.created_at
                  ? new Date(openPhoto.created_at).toLocaleString()
                  : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}