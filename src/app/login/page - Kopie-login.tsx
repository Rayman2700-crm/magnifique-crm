import Image from "next/image";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

function AnimatedLoginLogo() {
  return (
    <>
      <div className="clientique-login-logo">
        <div className="clientique-stage">
          <Image src="/brand/rings.png" alt="" fill priority className="clientique-rings object-contain" />
          <Image
            src="/brand/text.png"
            alt="CLIENTIQUE Digital Solutions"
            fill
            priority
            className="clientique-text object-contain"
          />
          <div className="clientique-line-wrap">
            <Image src="/brand/line.png" alt="" fill priority className="clientique-line object-contain" />
          </div>
        </div>
      </div>

      <style>{`
        .clientique-login-logo { width: 100%; display: flex; justify-content: center; margin-bottom: 8px; }
        .clientique-stage { position: relative; width: 100%; max-width: 720px; aspect-ratio: 16 / 9; overflow: hidden; background: transparent; }
        .clientique-rings, .clientique-text, .clientique-line { pointer-events: none; user-select: none; }
        .clientique-rings { opacity: 0.28; animation: ringsReveal 700ms ease-out forwards; }
        .clientique-text { opacity: 0; transform: scale(1.15); transform-origin: center; animation: textReveal 700ms ease-out forwards; animation-delay: 250ms; }
        .clientique-line-wrap { position: absolute; inset: 0; overflow: hidden; transform-origin: left center; }
        .clientique-line { opacity: 0; transform: scaleX(0); transform-origin: left center; animation: lineDraw 320ms ease-out forwards; animation-delay: 700ms; }
        @keyframes ringsReveal { from { opacity: 0.2; } to { opacity: 1; } }
        @keyframes textReveal { 0% { opacity: 0; transform: scale(1.15); filter: blur(1.5px); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
        @keyframes lineDraw { 0% { opacity: 0; transform: scaleX(0); } 100% { opacity: 1; transform: scaleX(1); } }
        @media (max-width: 640px) { .clientique-stage { max-width: 500px; } }
      `}</style>
    </>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; msg?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (data.user) redirect("/dashboard");

  const sp = await searchParams;
  const next = sp.next ?? "/dashboard";
  const hasError = sp.error === "1";
  const msg = sp.msg ?? "";

  return (
    <main className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-black via-[#030303] to-[#050505] p-6 md:p-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 md:mb-10 flex justify-center">
          <AnimatedLoginLogo />
        </div>

        <div className="mx-auto max-w-md rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 md:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="text-[var(--foreground)]">
            <Logo size="md" />
          </div>

          <p className="mt-1 text-sm text-white/60">Bitte einloggen, um fortzufahren.</p>

          {hasError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              Login fehlgeschlagen: {msg || "Bitte E-Mail/Passwort prüfen."}
            </div>
          )}

          <form action="/auth/sign-in" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next} />

            <div>
              <label className="text-sm font-medium text-white/80">E-Mail</label>
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                placeholder="name@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white/80">Passwort</label>
              <input
                name="password"
                type="password"
                required
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full">
              Einloggen
            </Button>
          </form>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center text-xs leading-5 text-white/55">
            Neuer Zugang? Radu lädt neue Benutzer über <span className="font-semibold text-white/75">Einstellungen → Benutzer einladen</span> ein.
            Danach kommt der Aktivierungslink per E-Mail von Studio Magnifique Beauty Institut.
          </div>
        </div>
      </div>
    </main>
  );
}
