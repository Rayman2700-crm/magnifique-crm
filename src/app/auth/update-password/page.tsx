import Image from "next/image";
import { Logo } from "@/components/brand/Logo";
import UpdatePasswordClient from "./UpdatePasswordClient";

function AnimatedLoginLogo() {
  return (
    <>
      <div className="clientique-login-logo">
        <div className="clientique-stage">
          <Image src="/brand/rings.png" alt="" fill priority className="clientique-rings object-contain" />
          <Image src="/brand/text.png" alt="CLIENTIQUE Digital Solutions" fill priority className="clientique-text object-contain" />
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

export default function UpdatePasswordPage() {
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

          <h1 className="mt-5 text-2xl font-semibold text-white">Passwort festlegen</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Lege jetzt dein Passwort für den eingeladenen CRM-Zugang fest. Danach wirst du zum Dashboard weitergeleitet.
          </p>

          <UpdatePasswordClient />
        </div>
      </div>
    </main>
  );
}
