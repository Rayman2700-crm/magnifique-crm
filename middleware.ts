import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/register/success"];
const AUTH_HELPER_PREFIXES = ["/auth/confirm", "/auth/sign-in", "/auth/sign-out"];
const PROTECTED_PATHS = [
  "/dashboard",
  "/customers",
  "/kunden",
  "/calendar",
  "/kalender",
  "/dienstleistungen",
  "/rechnungen",
  "/services",
  "/warteliste",
  "/team-chat",
  "/reminder",
  "/settings",
  "/admin",
  "/onboarding",
];

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => matchesPath(pathname, path));
}

function isPublicAuthPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => matchesPath(pathname, path));
}

function isAuthHelperPath(pathname: string) {
  return AUTH_HELPER_PREFIXES.some((path) => matchesPath(pathname, path));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isProtectedPath(pathname) && pathname !== "/onboarding") {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboardingComplete = Boolean(profile?.onboarding_completed_at);

  if (!onboardingComplete && pathname !== "/onboarding" && !isAuthHelperPath(pathname)) {
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding";
    onboardingUrl.searchParams.delete("next");
    return NextResponse.redirect(onboardingUrl);
  }

  if (onboardingComplete && (isPublicAuthPath(pathname) || pathname === "/onboarding")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.searchParams.delete("next");
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
