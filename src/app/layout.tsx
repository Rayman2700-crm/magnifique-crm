import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app/AppShell";
import { getCurrentUserContext } from "@/lib/auth/get-current-user-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Magnifique CRM",
  description: "Kunden, Termine, Rechnungen & Intake",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#120f0c",
};

const startupImages = [
  {
    href: "/startup-images/clientique-startup-1170x2532.svg",
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-1179x2556.svg",
    media:
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-1290x2796.svg",
    media:
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-1125x2436.svg",
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-1242x2688.svg",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-828x1792.svg",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-750x1334.svg",
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  },
  {
    href: "/startup-images/clientique-startup-640x1136.svg",
    media:
      "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
  },
] as const;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let currentUserId: string | null = null;
  let userLabel: string | undefined;
  let tenantId: string | null = null;

  try {
    const context = await getCurrentUserContext();
    currentUserId = context.authUser.id;
    userLabel = context.profile.full_name ?? context.authUser.email ?? undefined;
    tenantId = context.profile.tenant_id ?? null;
  } catch {
    // Public route / not logged in
  }

  return (
    <html lang="de" style={{ backgroundColor: "#120f0c" }}>
      <head>
        <meta name="theme-color" content="#120f0c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Magnifique CRM" />
        <meta name="mobile-web-app-capable" content="yes" />

        <link rel="preload" as="image" href="/brand/rings.png" />
        <link rel="preload" as="image" href="/brand/text.png" />
        <link rel="preload" as="image" href="/brand/line.png" />

        {startupImages.map((item) => (
          <link
            key={item.href}
            rel="apple-touch-startup-image"
            media={item.media}
            href={item.href}
          />
        ))}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: "#120f0c" }}
      >
        {currentUserId ? (
          <AppShell
            userLabel={userLabel}
            tenantId={tenantId}
            currentUserId={currentUserId}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
