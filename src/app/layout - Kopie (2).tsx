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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Magnifique CRM",
  },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#120f0c",
};

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
    // Not logged in or no valid user context → render public layout without AppShell
  }

  return (
    <html lang="de" style={{ backgroundColor: "#120f0c" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: "#120f0c", color: "#f6f0e8" }}
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
