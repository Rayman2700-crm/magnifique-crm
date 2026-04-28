"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function readHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash);
}

function cleanAuthUrlHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

export default function UpdatePasswordClient() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let mounted = true;

    async function prepareSession() {
      setIsBooting(true);
      setError(null);

      const hashParams = readHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const errorDescription = hashParams.get("error_description");

      if (errorDescription) {
        if (!mounted) return;
        setReady(false);
        setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
        setIsBooting(false);
        return;
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        cleanAuthUrlHash();

        if (sessionError) {
          if (!mounted) return;
          setReady(false);
          setError(sessionError.message);
          setIsBooting(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(data.session));
      setIsBooting(false);
    }

    prepareSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;
      setReady(Boolean(session));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  function submit() {
    setError(null);
    setMessage(null);

    if (!ready) {
      setError("Die Einladungssitzung ist noch nicht aktiv. Öffne den Einladungslink bitte erneut direkt aus der E-Mail.");
      return;
    }

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    startTransition(async () => {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message || "Passwort konnte nicht gespeichert werden.");
        return;
      }

      setMessage("Passwort wurde gespeichert. Benutzerprofil wird vorbereitet …");

      const acceptResponse = await fetch("/api/auth/accept-invite-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const acceptPayload = (await acceptResponse.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!acceptResponse.ok || !acceptPayload?.ok) {
        setError(acceptPayload?.error || "Benutzerprofil konnte nach der Einladung nicht erstellt werden.");
        return;
      }

      setMessage("Profil wurde erstellt. Du wirst weitergeleitet …");
      router.replace("/dashboard");
      router.refresh();
    });
  }

  const passwordIsValid = password.length >= 8 && password === confirmPassword;

  return (
    <div className="mt-6 space-y-4">
      {isBooting ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/70">
          Einladung wird vorbereitet …
        </div>
      ) : null}

      {!isBooting && !ready && !error ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          Falls du über einen Einladungslink hier gelandet bist, konnte die Sitzung noch nicht erkannt werden. Öffne den
          Einladungslink bitte erneut direkt aus der E-Mail, am besten in einem Inkognito-Fenster.
        </div>
      ) : null}

      {ready && !error ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
          Einladung erkannt. Lege jetzt dein Passwort fest.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">{error}</div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">{message}</div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-white/80">Neues Passwort</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={8}
          required
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
          placeholder="Mindestens 8 Zeichen"
          autoComplete="new-password"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-white/80">Passwort wiederholen</label>
        <input
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          minLength={8}
          required
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
          placeholder="Passwort erneut eingeben"
          autoComplete="new-password"
        />
      </div>

      <Button type="button" onClick={submit} disabled={!ready || !passwordIsValid || isPending || isBooting} className="w-full">
        {isPending ? "Wird gespeichert …" : "Passwort speichern und starten"}
      </Button>

      <p className="text-center text-xs leading-5 text-white/45">
        Danach wird dein Benutzerprofil automatisch aus der Admin-Einladung erstellt.
      </p>
    </div>
  );
}
