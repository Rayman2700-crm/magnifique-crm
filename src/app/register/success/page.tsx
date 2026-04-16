import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default async function RegisterSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string; warning?: string; debug_link?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const email = sp?.email ?? "";
  const warning = sp?.warning ?? "";
  const debugLink = sp?.debug_link ?? "";

  return (
    <main className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-black via-[#030303] to-[#050505] p-6 md:p-10">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-7">
        <div className="text-white">
          <Logo size="md" />
        </div>

        <h1 className="mt-5 text-2xl font-semibold text-white">Fast geschafft</h1>
        <p className="mt-2 text-sm text-white/70">
          Wir haben den neuen Benutzer angelegt. Bitte bestätige jetzt die E-Mail-Adresse{email ? ` ${email}` : ""}. Danach startet
          direkt das Pflicht-Onboarding.
        </p>

        {warning ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Mailversand-Hinweis: {warning}
          </div>
        ) : null}

        {debugLink ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60 break-all">
            Dev-Hilfe: Falls lokal gerade keine Mail ankommt, kannst du diesen Bestätigungslink direkt öffnen:<br />
            <a className="text-white underline" href={debugLink}>
              {debugLink}
            </a>
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Zum Login
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Weitere Registrierung
          </Link>
        </div>
      </div>
    </main>
  );
}
