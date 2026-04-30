import Image from "next/image";
import { appBranding } from "@/lib/appBranding";

export default function Loading() {
  const preloadImages =
    appBranding.loginPreloadImages.length >= 3
      ? appBranding.loginPreloadImages
      : ["/brand/rings.png", "/brand/text.png", "/brand/line.png"];

  const heroLogo = appBranding.loginHeroLogoPath || "";
  const ringsLogo = preloadImages[0] || "/brand/rings.png";
  const textLogo = preloadImages[1] || appBranding.pwaIconPath || "/brand/text.png";
  const lineLogo = preloadImages[2] || "/brand/line.png";

  return (
    <main className="clientique-app-loading-screen" aria-label={`${appBranding.appName} lädt`}>
      <div className="clientique-app-loading-logo" aria-hidden="true">
        {heroLogo ? (
          <div className="clientique-app-loading-hero">
            <Image src={heroLogo} alt="" fill priority className="object-contain" />
          </div>
        ) : (
          <div className="clientique-app-loading-stage">
            <Image src={ringsLogo} alt="" fill priority className="clientique-app-loading-rings object-contain" />
            <Image
              src={textLogo}
              alt=""
              fill
              priority
              className="clientique-app-loading-text object-contain"
            />
            <div className="clientique-app-loading-line-wrap">
              <Image src={lineLogo} alt="" fill priority className="clientique-app-loading-line object-contain" />
            </div>
          </div>
        )}
      </div>

      <span className="sr-only">{appBranding.appName} lädt</span>

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
            linear-gradient(140deg, #070605 0%, #120f0c 48%, #050403 100%);
        }

        .clientique-app-loading-logo {
          width: min(72vw, 620px);
          opacity: 0;
          transform: translateY(8px) scale(0.985);
          animation: loadingFade 520ms ease-out forwards;
        }

        .clientique-app-loading-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: transparent;
        }

        .clientique-app-loading-hero {
          position: relative;
          width: min(72vw, 520px);
          height: min(34vw, 220px);
          margin: 0 auto;
          overflow: hidden;
          background: transparent;
        }

        .clientique-app-loading-rings,
        .clientique-app-loading-text,
        .clientique-app-loading-line {
          pointer-events: none;
          user-select: none;
        }

        .clientique-app-loading-rings {
          opacity: 0.24;
          animation: loadingRingsReveal 760ms ease-out forwards;
        }

        .clientique-app-loading-text {
          opacity: 0;
          transform: scale(1.14);
          transform-origin: center;
          animation: loadingTextReveal 760ms ease-out forwards;
          animation-delay: 180ms;
        }

        .clientique-app-loading-line-wrap {
          position: absolute;
          inset: 0;
          overflow: hidden;
          transform-origin: left center;
        }

        .clientique-app-loading-line {
          opacity: 0;
          transform: scaleX(0);
          transform-origin: left center;
          animation: loadingLineDraw 360ms ease-out forwards;
          animation-delay: 620ms;
        }

        @keyframes loadingFade {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes loadingRingsReveal {
          from { opacity: 0.18; filter: blur(1px); }
          to { opacity: 1; filter: blur(0); }
        }

        @keyframes loadingTextReveal {
          0% { opacity: 0; transform: scale(1.14); filter: blur(1.5px); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }

        @keyframes loadingLineDraw {
          0% { opacity: 0; transform: scaleX(0); }
          100% { opacity: 1; transform: scaleX(1); }
        }

        @media (max-width: 640px) {
          .clientique-app-loading-logo {
            width: min(86vw, 500px);
          }

          .clientique-app-loading-hero {
            width: min(82vw, 420px);
            height: min(42vw, 180px);
          }
        }
      `}</style>
    </main>
  );
}
