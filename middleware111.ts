import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/kunden",
  "/kalender",
  "/dienstleistungen",
  "/rechnungen",
  "/team-chat",
  "/warteliste",
  "/reminder",
  "/services",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function hasSupabaseAuthCookie(req: NextRequest) {
  const cookies = req.cookies.getAll();

  return cookies.some((cookie) => {
    const name = cookie.name || "";

    return (
      name.startsWith("sb-") &&
      (name.includes("auth-token") || name.includes("access-token"))
    );
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|woff|woff2)$/i.test(pathname);

  if (isAsset) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Lightweight gate only:
  // no network roundtrip to Supabase Auth here, to avoid /user spam in middleware.
  // Real auth enforcement still happens server-side in layouts / routes.
  if (!hasSupabaseAuthCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/kunden/:path*",
    "/kalender/:path*",
    "/dienstleistungen/:path*",
    "/rechnungen/:path*",
    "/team-chat/:path*",
    "/warteliste/:path*",
    "/reminder/:path*",
    "/services/:path*",
  ],
};
