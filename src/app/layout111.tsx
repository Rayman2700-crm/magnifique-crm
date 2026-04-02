import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app/AppShell";
import { supabaseServer } from "@/lib/supabase/server";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  let userLabel: string | undefined;
  let tenantId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, role, tenant_id")
      .eq("user_id", user.id)
      .single();

    userLabel = profile?.full_name ?? user.email ?? undefined;
    tenantId = profile?.tenant_id ?? null;
  }

  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {user ? (
          <AppShell
            userLabel={userLabel}
            tenantId={tenantId}
            currentUserId={user.id}
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