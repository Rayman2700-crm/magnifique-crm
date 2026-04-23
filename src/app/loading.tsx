import Image from "next/image";

export default function Loading() {
  return (
    <main className="clientique-app-loading-screen" aria-label="Clientique lädt">
      <div className="clientique-app-loading-logo" aria-hidden="true">
        <div className="clientique-app-loading-stage">
          <Image src="/brand/rings.png" alt="" fill priority className="clientique-app-loading-rings object-contain" />
          <Image
            src="/brand/text.png"
            alt="Clientique"
            fill
            priority
            className="clientique-app-loading-text object-contain"
          />
          <div className="clientique-app-loading-line-wrap">
            <Image src="/brand/line.png" alt="" fill priority className="clientique-app-loading-line object-contain" />
          </div>
        </div>
      </div>

      <style>{`
        .clientique-app-loading-screen {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at 16% 16%, rgba(182, 150, 112, 0.16), transparent 0 24%),
            radial-gradient(circle at 84% 12%, rgba(213, 183, 146, 0.12), transparent 0 22%),
            radial-gradient(circle at 74% 68%, rgba(146, 111, 79, 0.1), transparent 0 28%),
            radial-gradient(circle at 18% 82%, rgba(92, 67, 48, 0.18), transparent 0 26%),
            linear-gradient(140deg, #120f0c 0%, #1b1511 44%, #0d0a08 100%);
          overflow: hidden;
        }

        .clientique-app-loading-logo {
          width: min(92vw, 560px);
          display: flex;
          justify-content: center;
          filter: drop-shadow(0 18px 50px rgba(0, 0, 0, 0.34));
        }

        .clientique-app-loading-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          animation: clientiqueLoadingPulse 2.4s ease-in-out infinite;
          will-change: transform, opacity, filter;
        }

        .clientique-app-loading-rings,
        .clientique-app-loading-text,
        .clientique-app-loading-line {
          pointer-events: none;
          user-select: none;
        }

        .clientique-app-loading-rings {
          opacity: 0.98;
        }

        .clientique-app-loading-text {
          opacity: 1;
        }

        .clientique-app-loading-line-wrap {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .clientique-app-loading-line {
          opacity: 1;
        }

        @keyframes clientiqueLoadingPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.9;
            filter: brightness(1) drop-shadow(0 0 0 rgba(216, 193, 160, 0));
          }
          50% {
            transform: scale(1.018);
            opacity: 1;
            filter: brightness(1.03) drop-shadow(0 0 26px rgba(216, 193, 160, 0.14));
          }
        }

        @media (max-width: 640px) {
          .clientique-app-loading-logo {
            width: min(92vw, 420px);
          }
        }
      `}</style>
    </main>
  );
}
