export type StudioTarget = {
  key: string;
  label: string;
  calendarId: string;
};

function readEnv(name: string, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBooleanEnv(name: string, fallback = false) {
  const value = readEnv(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "ja", "on"].includes(value.toLowerCase());
}

function readJsonArray<T>(name: string, fallback: T[]): T[] {
  const raw = readEnv(name);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeStudioTargets(input: StudioTarget[]) {
  return input
    .map((target) => ({
      key: String(target?.key ?? "").trim(),
      label: String(target?.label ?? "").trim(),
      calendarId: String(target?.calendarId ?? "").trim(),
    }))
    .filter((target) => target.key && target.label && target.calendarId);
}

const configuredStudioTargets = normalizeStudioTargets(
  readJsonArray<StudioTarget>("NEXT_PUBLIC_STUDIO_TARGETS", [])
);

export const appBranding = {
  appName: readEnv("NEXT_PUBLIC_APP_NAME", "Clientique CRM"),
  shortName: readEnv("NEXT_PUBLIC_APP_SHORT_NAME", "Clientique"),
  studioName: readEnv("NEXT_PUBLIC_STUDIO_NAME", "Clientique"),
  dashboardLabel: readEnv("NEXT_PUBLIC_DASHBOARD_LABEL", "Studio Dashboard"),
  backofficeLabel: readEnv("NEXT_PUBLIC_BACKOFFICE_LABEL", "Backoffice"),
  description: readEnv("NEXT_PUBLIC_APP_DESCRIPTION", "Kunden, Termine, Rechnungen & Intake"),
  loginTitle: readEnv("NEXT_PUBLIC_LOGIN_TITLE", "Willkommen zurück"),
  loginSubtitle: readEnv("NEXT_PUBLIC_LOGIN_SUBTITLE", "Bitte einloggen, um fortzufahren."),
  inviteSenderName: readEnv("NEXT_PUBLIC_INVITE_SENDER_NAME", "deinem Studio"),
  loginLogoPath: readEnv("NEXT_PUBLIC_LOGIN_LOGO", "/brand/apple-touch-icon.png"),
  loginHeroLogoPath: readEnv("NEXT_PUBLIC_LOGIN_HERO_LOGO", ""),
  navLogoPath: readEnv("NEXT_PUBLIC_NAV_LOGO", "/brand/apple-touch-icon.png"),
  faviconSvgPath: readEnv("NEXT_PUBLIC_FAVICON_SVG", "/brand/favicon.svg"),
  faviconIcoPath: readEnv("NEXT_PUBLIC_FAVICON_ICO", "/favicon.ico"),
  appleTouchIconPath: readEnv("NEXT_PUBLIC_APPLE_TOUCH_ICON", "/brand/apple-touch-icon.png"),
  pwaIconPath: readEnv("NEXT_PUBLIC_PWA_ICON", "/brand/logo.png"),
  brandColor: readEnv("NEXT_PUBLIC_BRAND_COLOR", "#D9A441"),
  themeColor: readEnv("NEXT_PUBLIC_THEME_COLOR", "#120f0c"),
  isDemoInstance: readBooleanEnv("NEXT_PUBLIC_IS_DEMO_INSTANCE", false),
  defaultStudioCalendarId: readEnv("NEXT_PUBLIC_DEFAULT_STUDIO_CALENDAR_ID", "primary"),
  studioTargets: configuredStudioTargets,
  loginPreloadImages: readJsonArray<string>("NEXT_PUBLIC_LOGIN_PRELOAD_IMAGES", [
    "/brand/rings.png",
    "/brand/text.png",
    "/brand/line.png",
  ]),
} as const;

export function brandInitials(value = appBranding.studioName) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
