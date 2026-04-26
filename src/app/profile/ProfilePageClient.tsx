"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  userEmail: string | null;
};

export default function ProfilePageClient({ userEmail }: Props) {
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
    <div className="rounded-[26px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.045)_0%,rgba(255,248,240,0.018)_52%,rgba(255,248,240,0.008)_100%)] p-5 shadow-[0_26px_72px_rgba(0,0,0,0.20)] backdrop-blur-[20px]">
      <h2 className="text-lg font-semibold text-white/95">Passwort ändern</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
        Das Passwort wird direkt für den aktuell eingeloggten Benutzer geändert{userEmail ? ` (${userEmail})` : ""}.
      </p>

      <form action={onPasswordSubmit} className="mt-6 grid gap-4 rounded-[22px] border border-[rgba(255,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,250,244,0.04)_0%,rgba(255,248,240,0.012)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:max-w-xl">
        <label className="grid gap-2 text-sm text-white/80">
          <span>Neues Passwort</span>
          <input
            type="password"
            name="password"
            minLength={8}
            required
            className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
          />
        </label>

        <label className="grid gap-2 text-sm text-white/80">
          <span>Passwort wiederholen</span>
          <input
            type="password"
            name="confirmPassword"
            minLength={8}
            required
            className="h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-[rgba(214,195,163,0.30)] focus:bg-white/[0.05]"
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
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(214,195,163,0.20)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Speichert …" : "Passwort speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
