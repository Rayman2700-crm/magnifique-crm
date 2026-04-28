"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function UpdatePasswordClient() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(data.session));
    }

    checkSession();

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
        setError(updateError.message);
        return;
      }

      setMessage("Passwort wurde gespeichert. Du wirst weitergeleitet …");
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {!ready ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          Falls du über einen Einladungslink hier gelandet bist, wird deine Sitzung gerade vorbereitet. Wenn diese Meldung bleibt,
          öffne den Einladungslink bitte nochmal direkt aus der E-Mail.
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

      <Button type="button" onClick={submit} disabled={!ready || isPending} className="w-full">
        {isPending ? "Wird gespeichert …" : "Passwort speichern und starten"}
      </Button>

      <p className="text-center text-xs leading-5 text-white/45">
        Danach wird dein Benutzerprofil automatisch aus der Admin-Einladung erstellt.
      </p>
    </div>
  );
}
