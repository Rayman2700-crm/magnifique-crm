"use client";

import { useRef, useState, useTransition } from "react";
import { uploadCustomerPhotos } from "./actions";

async function compressImageToJpeg(file: File, maxSize = 1600, quality = 0.8) {
  // ✅ nur Bilder komprimieren
  if (!file.type.startsWith("image/")) return file;

  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
      img.src = url;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const scale = Math.min(1, maxSize / Math.max(w, h));
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, nw, nh);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", quality)
    );

    const newName = file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PhotoUpload({
  customerProfileId,
}: {
  customerProfileId: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [info, setInfo] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="font-semibold text-white">Fotos hinzufügen</div>

      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length === 0) {
            setFiles([]);
            setInfo("");
            return;
          }

          setInfo(`Verarbeite ${list.length} Datei(en)...`);

          const out: File[] = [];
          let skipped = 0;

          for (const f of list) {
            try {
              // ✅ Bilder komprimieren, Videos unverändert lassen
              const processed = await compressImageToJpeg(f);
              out.push(processed);
            } catch {
              out.push(f);
              skipped++;
            }
          }

          setFiles(out);

          const kbOld = Math.round(list.reduce((s, f) => s + f.size, 0) / 1024);
          const kbNew = Math.round(out.reduce((s, f) => s + f.size, 0) / 1024);

          setInfo(
            `Bereit: ${list.length} Datei(en) • ${kbOld} KB → ${kbNew} KB` +
              (skipped ? ` • ${skipped} ohne Verarbeitung` : "")
          );
        }}
      />

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {/* ✅ Dateien uploaden Button */}
        <button
          type="button"
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          onClick={() => inputRef.current?.click()}
        >
          Dateien uploaden
        </button>

        {/* ✅ Upload Button gelb */}
        <button
          className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{
            backgroundColor: "#F7C948",
            color: "#0b0b0c",
            border: "1px solid rgba(0,0,0,0.25)",
          }}
          disabled={files.length === 0 || isPending}
          onClick={() => {
            if (files.length === 0) return;

            startTransition(async () => {
              const fd = new FormData();
              for (const f of files) fd.append("photos", f);
              await uploadCustomerPhotos(customerProfileId, fd);
              // redirect passiert serverseitig in der Action
            });
          }}
        >
          {isPending ? "Upload..." : "Upload"}
        </button>
      </div>

      {/* Info nur wenn gewählt/verarbeitet */}
      {info && <div className="mt-2 text-xs text-white/60">{info}</div>}
      {files.length > 0 && (
        <div className="mt-2 text-xs text-white/60">
          Ausgewählt: {files.length} Datei(en)
        </div>
      )}
    </div>
  );
}