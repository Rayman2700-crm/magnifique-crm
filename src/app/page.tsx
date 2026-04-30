"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { appBranding, brandInitials } from "@/lib/appBranding";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.replace("/dashboard");
    }, 80);

    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#120f0c] text-[#f6f0e8]">
      <div className="relative flex flex-col items-center justify-center px-6 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(216,193,160,0.16),transparent_0_42%)] blur-3xl" />

        <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-[rgba(255,244,232,0.08)] bg-[rgba(255,248,240,0.03)] shadow-[0_18px_60px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl animate-[clientiqueAppPulse_2.8s_ease-in-out_infinite]">
          <span className="text-[34px] font-semibold tracking-[-0.04em] text-[var(--primary)]">
            {brandInitials(appBranding.shortName)}
          </span>
        </div>

        <div className="mt-5 text-[26px] font-semibold tracking-[-0.04em] text-white/95">
          {appBranding.shortName}
        </div>
        <div className="mt-1 text-sm text-white/45">Dashboard wird geladen…</div>
      </div>

      <style jsx global>{`
        @keyframes clientiqueAppPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.94;
          }
          50% {
            transform: scale(1.018);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}
