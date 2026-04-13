import Image from "next/image";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

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
    <main className="min-h-dvh bg-gradient-to-b from-black to-[#050505] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <div className="relative w-full h-[260px] sm:h-[300px]">
            <Image
              src="/brand/login-logo.png"
              alt="CLIENTIQUE Digital Solutions"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="text-[var(--foreground)]">
            <Logo size="md" />
          </div>

          <p className="mt-1 text-sm text-white/60">
            Bitte einloggen, um fortzufahren.
          </p>

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
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
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
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full">
              Einloggen
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}