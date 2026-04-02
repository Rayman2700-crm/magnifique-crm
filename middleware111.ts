import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
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