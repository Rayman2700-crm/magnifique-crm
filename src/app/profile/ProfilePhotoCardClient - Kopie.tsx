"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  uploadAvatarAction: (formData: FormData) => void | Promise<void>;
  removeAvatarAction: () => void | Promise<void>;
};

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxSize = 1200;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });

  if (!blob) return file;

  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return compressed.size < file.size ? compressed : file;
}

export default function ProfilePhotoCardClient({ uploadAvatarAction, removeAvatarAction }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const helperText = useMemo(() => {
    if (isCompressing) return "Bild wird vorbereitet …";
    return null;
  }, [isCompressing]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setUploadError(null);

    if (!file) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setUploadError("Bitte nur Bilddateien auswählen.");
      event.target.value = "";
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(compressed);

      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
      }

      const objectUrl = URL.createObjectURL(compressed);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } catch {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } finally {
      setIsCompressing(false);
    }
  }

  return (
    <div className="mt-3 w-full text-left">
      <form action={removeAvatarAction} className="mb-4">
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/85 transition hover:bg-white/[0.07]"
        >
          Foto entfernen
        </button>
      </form>

      <div className="mb-4 h-px w-full bg-[rgba(255,255,255,0.08)]" />

      <div className="text-center text-sm font-semibold text-white/95">Profilfoto ändern</div>

      <form action={uploadAvatarAction} className="mt-3 grid gap-3">
        <div className="grid gap-2 text-sm text-white/80">
          <span className="text-center">Neues Foto auswählen</span>
          <input
            ref={fileInputRef}
            id="profile-avatar-upload"
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            className="hidden"
            required
          />
          <label
            htmlFor="profile-avatar-upload"
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
          >
            Datei auswählen
          </label>
        </div>

        {helperText ? <div className="text-xs text-white/50">{helperText}</div> : null}

        {uploadError ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {uploadError}
          </div>
        ) : null}

        {previewUrl ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-white/[0.03] p-3">
            <img src={previewUrl} alt="Vorschau" className="h-14 w-14 rounded-2xl object-cover" />
            <div className="text-sm text-white/70">Vorschau des komprimierten Bildes</div>
          </div>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={isCompressing}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(214,195,163,0.20)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isCompressing ? "Bild wird vorbereitet …" : "Foto speichern"}
          </button>
        </div>

        <div className="mt-1 h-px w-full bg-[rgba(255,255,255,0.08)]" />
      </form>
    </div>
  );
}
