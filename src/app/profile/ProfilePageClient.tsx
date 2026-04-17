"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  userEmail: string | null;
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

export default function ProfilePageClient({ userEmail, uploadAvatarAction, removeAvatarAction }: Props) {
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const helperText = useMemo(() => {
    if (isCompressing) return "Bild wird vorbereitet …";
    if (selectedFileName) return `Ausgewählt: ${selectedFileName}`;
    return "Empfohlen: quadratisches Bild. Vor dem Upload wird automatisch verkleinert und komprimiert.";
  }, [isCompressing, selectedFileName]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPasswordMessage(null);
    setPasswordError(null);
    setUploadError(null);

    if (!file) {
      setSelectedFileName(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSelectedFileName(null);
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

      setSelectedFileName(`${compressed.name} (${Math.round(compressed.size / 1024)} KB)`);
      const objectUrl = URL.createObjectURL(compressed);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } catch {
      setSelectedFileName(file.name);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } finally {
      setIsCompressing(false);
    }
  }

  async function onPasswordSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "").trim();
    const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

    setPasswordMessage(null);
    setPasswordError(null);

    if (password.length < 8) {
      setPasswordError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Die Passwörter stimmen nicht überein.");
      return;
    }

    startTransition(async () => {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setPasswordError(error.message || "Passwort konnte nicht geändert werden.");
        return;
      }

      setPasswordMessage("Passwort erfolgreich geändert.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white/95">Profilfoto ändern</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          Erlaubt sind JPG, PNG und WEBP. Das Bild wird vor dem Upload automatisch verkleinert und komprimiert, damit Speicher und Ladezeit sauber bleiben.
        </p>

        <form action={uploadAvatarAction} className="mt-6 grid gap-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
          <label className="grid gap-2 text-sm text-white/80">
            <span>Neues Foto auswählen</span>
            <input
              ref={fileInputRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              className="block w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black"
              required
            />
          </label>

          <div className="text-xs text-white/50">{helperText}</div>

          {uploadError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {uploadError}
            </div>
          ) : null}

          {previewUrl ? (
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <img src={previewUrl} alt="Vorschau" className="h-16 w-16 rounded-2xl object-cover" />
              <div className="text-sm text-white/70">Vorschau des komprimierten Bildes</div>
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={isCompressing}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isCompressing ? "Bild wird vorbereitet …" : "Foto speichern"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white/95">Passwort ändern</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          Das Passwort wird direkt für den aktuell eingeloggten Benutzer geändert{userEmail ? ` (${userEmail})` : ""}.
        </p>

        <form action={onPasswordSubmit} className="mt-6 grid gap-4 rounded-[22px] border border-white/10 bg-black/20 p-4 md:max-w-xl">
          <label className="grid gap-2 text-sm text-white/80">
            <span>Neues Passwort</span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-white/20"
            />
          </label>

          <label className="grid gap-2 text-sm text-white/80">
            <span>Passwort wiederholen</span>
            <input
              type="password"
              name="confirmPassword"
              minLength={8}
              required
              className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-white/20"
            />
          </label>

          {passwordMessage ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {passwordMessage}
            </div>
          ) : null}

          {passwordError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {passwordError}
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? "Speichert …" : "Passwort speichern"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white/95">Profilfoto entfernen</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          Wenn du dein Foto entfernst, zeigt das System wieder automatisch den Initialen-Fallback an.
        </p>

        <form action={removeAvatarAction} className="mt-6">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white/85 transition hover:bg-white/[0.07]"
          >
            Foto entfernen
          </button>
        </form>
      </div>
    </div>
  );
}
