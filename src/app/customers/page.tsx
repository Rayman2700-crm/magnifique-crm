import Link from "next/link";
import Script from "next/script";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setAdminTenant } from "@/app/admin/actions";
import { getAdminTenantCookie, getEffectiveTenantId } from "@/lib/effectiveTenant";
import DeleteCustomerButton from "./DeleteCustomerButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CustomerRow = {
  id: string;
  created_at: string | null;
  tenant_id: string | null;
  person_id: string | null;
  person:
    | {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday: string | null;
      }[]
    | null;
  tenant:
    | {
        id: string;
        display_name: string | null;
      }
    | {
        id: string;
        display_name: string | null;
      }[]
    | null;
};

type AppointmentRow = {
  id: string;
  person_id: string | null;
  start_at: string | null;
  end_at: string | null;
  notes_internal: string | null;
  tenant_id?: string | null;
};

type CustomerAnalytics = {
  visitCount: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
  noShowCount: number;
  isWithoutFollowUp: boolean;
};

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function tenantThemeByName(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("radu")) return { pillBg: "rgba(59,130,246,0.16)", border: "rgba(59,130,246,0.26)", pillText: "#bfdbfe" };
  if (n.includes("raluca")) return { pillBg: "rgba(168,85,247,0.16)", border: "rgba(168,85,247,0.26)", pillText: "#e9d5ff" };
  if (n.includes("alexandra")) return { pillBg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.26)", pillText: "#bbf7d0" };
  if (n.includes("barbara")) return { pillBg: "rgba(249,115,22,0.16)", border: "rgba(249,115,22,0.26)", pillText: "#fed7aa" };
  return { pillBg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.10)", pillText: "rgba(255,255,255,0.88)" };
}

function formatShortDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function getUserShortCode(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("alexandra")) return "AS";
  if (label.includes("barbara")) return "BE";
  if (label.includes("radu")) return "RC";
  if (label.includes("raluca")) return "RC";
  if (label.includes("demo")) return "DB";
  return "—";
}

function getTenantDisplayLabel(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "Radu";
  if (label.includes("raluca")) return "Raluca";
  if (label.includes("alexandra")) return "Alexandra";
  if (label.includes("barbara")) return "Barbara";
  if (label.includes("demo")) return "Demo";
  return (tenantLabel || "—").trim().split(/\s+/)[0] || "—";
}

function getTenantAvatarRing(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "#3b82f6";
  if (label.includes("raluca")) return "#a855f7";
  if (label.includes("alexandra")) return "#22c55e";
  if (label.includes("barbara")) return "#f97316";
  if (label.includes("demo")) return "#d8c1a0";
  return "rgba(255,255,255,0.30)";
}

function normalizeTenantSortKey(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "1-radu";
  if (label.includes("raluca")) return "2-raluca";
  if (label.includes("alexandra")) return "3-alexandra";
  if (label.includes("barbara")) return "4-barbara";
  if (label.includes("demo")) return "5-demo";
  return `9-${label}`;
}

function AdminTenantAvatarPicker({
  current,
  options,
  action,
}: {
  current: string;
  options: { tenant_id: string; label: string; user_id: string | null }[];
  action: (formData: FormData) => Promise<void>;
}) {
  const orderedOptions = [...options]
    .map((option) => ({
      ...option,
      displayLabel: getTenantDisplayLabel(option.label),
      shortCode: getUserShortCode(option.label),
      ringColor: getTenantAvatarRing(option.label),
      sortKey: normalizeTenantSortKey(option.label),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <div className="pb-1">
      <div className="flex items-start gap-3 overflow-x-auto md:flex-wrap md:overflow-visible">
        <form action={action} className="shrink-0">
          <input type="hidden" name="tenant" value="all" />
          <button type="submit" className="flex flex-col items-center gap-2" title="Alle Kunden anzeigen">
            <div className="relative overflow-hidden rounded-full flex items-center justify-center text-sm font-extrabold" style={{ width: 44, height: 44, border: "3px solid rgba(255,255,255,0.55)", boxShadow: "0 10px 22px rgba(0,0,0,0.28)", background: "rgba(255,255,255,0.96)", color: "#000" }}>Alle</div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${current === "all" ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"}`}>Alle</div>
          </button>
        </form>

        {orderedOptions.map((entry) => {
          const active = current === entry.tenant_id;
          return (
            <form key={entry.tenant_id} action={action} className="shrink-0">
              <input type="hidden" name="tenant" value={entry.tenant_id} />
              <button type="submit" className="flex flex-col items-center gap-2" title={`${entry.displayLabel} anzeigen`}>
                <div className="relative overflow-hidden rounded-full" style={{ width: 44, height: 44, border: `3px solid ${entry.ringColor}`, boxShadow: "0 10px 22px rgba(0,0,0,0.28)", background: "rgba(255,255,255,0.04)" }}>
                  {entry.user_id ? (
                    <img src={`/users/${entry.user_id}.png`} alt={entry.displayLabel} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[11px] font-extrabold text-white/90">{entry.shortCode}</div>
                  )}
                  <div style={{ position: "absolute", right: 2, bottom: 2, width: 8, height: 8, borderRadius: 999, backgroundColor: entry.ringColor, boxShadow: "0 0 0 2px rgba(0,0,0,0.65)" }} />
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${active ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"}`}>{entry.displayLabel}</div>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );

}

function DesktopCustomersAvatarCompactMenu({
  current,
  options,
  action,
}: {
  current: string;
  options: { tenant_id: string; label: string; user_id: string | null }[];
  action: (formData: FormData) => Promise<void>;
}) {
  const orderedOptions = [...options]
    .map((option) => ({
      ...option,
      displayLabel: getTenantDisplayLabel(option.label),
      shortCode: getUserShortCode(option.label),
      ringColor: getTenantAvatarRing(option.label),
      sortKey: normalizeTenantSortKey(option.label),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const items = [
    { tenant_id: "all", label: "Alle", displayLabel: "Alle", shortCode: "AL", ringColor: "rgba(255,255,255,0.55)", user_id: null as string | null },
    ...orderedOptions,
  ];
  const active = items.find((item) => item.tenant_id === current) ?? items[0];
  const ringColors = ["#d6c3a3", ...orderedOptions.map((item) => item.ringColor)];
  const step = 100 / Math.max(1, ringColors.length);
  const ringBackground = `conic-gradient(${ringColors.map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`).join(", ")})`;

  return (
    <details id="desktop-customers-avatar-compact" className="relative">
      <summary
        className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-full"
        aria-label="Behandler auswählen"
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[37px] w-[37px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {active.tenant_id === "all" ? (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
          ) : active.user_id ? (
            <img src={`/users/${active.user_id}.png`} alt={active.displayLabel} className="h-full w-full object-cover" />
          ) : (
            active.shortCode
          )}
        </span>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {active.tenant_id === "all" ? items.length : "1"}
        </span>
      </summary>

      <div
        className="absolute right-0 top-[calc(100%+16px)] z-[2147483647] w-[320px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Behandler wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Kunden filtern</div>
        </div>
        <div className="grid gap-2">
          {items.map((item) => {
            const selected = item.tenant_id === current;
            return (
              <form key={`desktop-customer-avatar-${item.tenant_id}`} action={action}>
                <input type="hidden" name="tenant" value={item.tenant_id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left"
                  style={{
                    borderColor: selected ? `${item.ringColor}66` : "rgba(255,255,255,0.10)",
                    backgroundColor: selected ? `${item.ringColor}22` : "rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white" style={{ borderColor: item.tenant_id === "all" ? "rgba(255,255,255,0.55)" : item.ringColor }}>
                      {item.tenant_id === "all" ? (
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
                      ) : item.user_id ? (
                        <img src={`/users/${item.user_id}.png`} alt={item.displayLabel} className="h-full w-full object-cover" />
                      ) : (
                        item.shortCode
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{item.displayLabel}</div>
                      <div className="truncate text-xs text-white/50">{item.tenant_id === "all" ? "Alle Behandler" : item.label}</div>
                    </div>
                  </div>
                  {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}


function SummaryCard({ label, value, subtext }: { label: string; value: number; subtext: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/55">{subtext}</div>
    </div>
  );
}

function readLineValue(notesInternal: string | null, prefix: string) {
  const lines = (notesInternal ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const line = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function parseStatus(notesInternal: string | null): AppointmentStatus | null {
  const raw = readLineValue(notesInternal, "Status:").toLowerCase();
  if (!raw) return null;
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  if (raw === "no_show") return "no_show";
  return "scheduled";
}

function statusLinkClass(isActive: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition whitespace-nowrap",
    isActive
      ? "border-white bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.10)]"
      : "border-white/10 bg-black/20 text-white hover:bg-white/10",
  ].join(" ");
}

function statusCountClass(isActive: boolean) {
  return [
    "inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
    isActive ? "bg-black/10 text-black" : "bg-white/10 text-white/90",
  ].join(" ");
}


function buildCustomersHref({ qRaw, only }: { qRaw?: string; only?: string }) {
  const params = new URLSearchParams();
  if (qRaw?.trim()) params.set('q', qRaw.trim());
  if (only && only !== 'all') params.set('only', only);
  const query = params.toString();
  return query ? `/customers?${query}` : '/customers';
}

function MobileCustomersFilterMenu({
  qRaw,
  only,
  counts,
}: {
  qRaw: string;
  only: string;
  counts: { all: number; noFollowUp: number };
}) {
  const items = [
    { key: 'all', label: 'Alle', count: counts.all },
    { key: 'no-followup', label: 'Ohne Folgetermin', count: counts.noFollowUp },
  ];
  const activeCount = items.find((item) => item.key === only)?.count ?? counts.all;

  return (
    <>
      <button
        type="button"
        popoverTarget="customers-filter-menu"
        popoverTargetAction="toggle"
        className="relative flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_0_0_2px_rgba(11,11,12,0.95),0_10px_28px_rgba(0,0,0,0.30)] md:hidden"
        aria-label="Kundenfilter öffnen"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeCount}
        </span>
      </button>

      <div
        id="customers-filter-menu"
        popover="auto"
        className="md:hidden fixed left-[116px] top-[332px] z-[2147483647] m-0 w-[224px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.995)_0%,rgba(12,13,16,0.995)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.62)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Filter wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Kunden filtern</div>
        </div>
        <div className="grid gap-2">
          {items.map((item) => {
            const selected = only === item.key;
            return (
              <Link
                key={item.key}
                href={buildCustomersHref({ qRaw, only: item.key })}
                className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                style={{
                  borderColor: selected ? 'rgba(214,195,163,0.28)' : 'rgba(255,255,255,0.10)',
                  backgroundColor: selected ? 'rgba(214,195,163,0.14)' : 'rgba(255,255,255,0.04)',
                }}
              >
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/90">
                  {item.count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function MobileCustomersAvatarMenu({
  current,
  options,
  action,
}: {
  current: string;
  options: { tenant_id: string; label: string; user_id: string | null }[];
  action: (formData: FormData) => Promise<void>;
}) {
  const orderedOptions = [...options]
    .map((option) => ({
      ...option,
      displayLabel: getTenantDisplayLabel(option.label),
      shortCode: getUserShortCode(option.label),
      ringColor: getTenantAvatarRing(option.label),
      sortKey: normalizeTenantSortKey(option.label),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const items = [
    { tenant_id: 'all', label: 'Alle', displayLabel: 'Alle', shortCode: 'AL', ringColor: 'rgba(255,255,255,0.55)', user_id: null as string | null },
    ...orderedOptions,
  ];
  const active = items.find((item) => item.tenant_id === current) ?? items[0];
  const ringColors = ['#d6c3a3', ...orderedOptions.map((item) => item.ringColor)];
  const step = 100 / Math.max(1, ringColors.length);
  const ringBackground = `conic-gradient(${ringColors.map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`).join(', ')})`;

  return (
    <>
      <button
        type="button"
        popoverTarget="mobile-customers-avatar-menu"
        popoverTargetAction="toggle"
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full md:hidden"
        aria-label="Behandler auswählen"
        style={{
          background: ringBackground,
          boxShadow: '0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)',
        }}
      >
        <span className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[12px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {active.tenant_id === 'all' ? (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
          ) : active.user_id ? (
            <img src={`/users/${active.user_id}.png`} alt={active.displayLabel} className="h-full w-full object-cover" />
          ) : (
            active.shortCode
          )}
        </span>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {active.tenant_id === 'all' ? items.length : '1'}
        </span>
      </button>

      <div
        id="mobile-customers-avatar-menu"
        popover="auto"
        className="md:hidden fixed left-[84px] right-4 top-[332px] z-[2147483647] m-0 max-h-[60vh] overflow-y-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Behandler wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Kunden filtern</div>
        </div>
        <div className="grid gap-2">
          {items.map((item) => {
            const selected = item.tenant_id === current;
            return (
              <form key={`mobile-customer-avatar-${item.tenant_id}`} action={action}>
                <input type="hidden" name="tenant" value={item.tenant_id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left"
                  style={{
                    borderColor: selected ? `${item.ringColor}66` : 'rgba(255,255,255,0.10)',
                    backgroundColor: selected ? `${item.ringColor}22` : 'rgba(255,255,255,0.04)',
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white" style={{ borderColor: item.tenant_id === 'all' ? 'rgba(255,255,255,0.55)' : item.ringColor }}>
                      {item.tenant_id === 'all' ? (
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
                      ) : item.user_id ? (
                        <img src={`/users/${item.user_id}.png`} alt={item.displayLabel} className="h-full w-full object-cover" />
                      ) : (
                        item.shortCode
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{item.displayLabel}</div>
                      <div className="truncate text-xs text-white/50">{item.tenant_id === 'all' ? 'Alle Behandler' : item.label}</div>
                    </div>
                  </div>
                  {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?:
    | { q?: string; success?: string; error?: string; only?: string }
    | Promise<{ q?: string; success?: string; error?: string; only?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const qRaw = (sp?.q ?? "").toString();
  const errorMsg = (sp?.error ?? "").toString();
  const only = (sp?.only ?? "").toString();
  const onlyNoFollowUp = only === "no-followup";

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return <main className="mx-auto max-w-6xl p-6"><Link href="/login" className="underline">Bitte einloggen</Link></main>;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id, full_name")
    .eq("user_id", user.id)
    .single();

  const role = (profile?.role ?? "PRACTITIONER") as string;
  let tenantOptions: { tenant_id: string; label: string; user_id: string | null }[] = [];
  let currentAdminTenant = "all";

  if (role === "ADMIN") {
    currentAdminTenant = await getAdminTenantCookie();

    const [{ data: tenantProfiles }, { data: allTenants }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("user_id, role, tenant_id, calendar_tenant_id, full_name")
        .in("role", ["PRACTITIONER", "ADMIN"]),
      admin
        .from("tenants")
        .select("id, display_name")
        .order("display_name", { ascending: true }),
    ]);

    const seen = new Set<string>();
    const nextTenantOptions: { tenant_id: string; label: string; user_id: string | null }[] = [];

    // 1) Bestehende echte Benutzer-Tenants zuerst aufnehmen, damit deren Avatar/User-ID erhalten bleibt.
    for (const p of tenantProfiles ?? []) {
      const tenantId = (p?.tenant_id ?? p?.calendar_tenant_id ?? null) as string | null;
      if (!tenantId || seen.has(tenantId)) continue;

      seen.add(tenantId);
      nextTenantOptions.push({
        tenant_id: tenantId,
        label: (p?.full_name as string) || tenantId,
        user_id: (p?.user_id as string | null) ?? null,
      });
    }

    // 2) Zusätzlich alle Tenants aufnehmen, die noch keinen User haben.
    // Wichtig für Demo-Tenants: Demo Beauty Studio soll im Admin-Switch sichtbar sein,
    // auch wenn dafür kein echter Login/User existiert.
    for (const tenant of allTenants ?? []) {
      const tenantId = (tenant?.id ?? null) as string | null;
      if (!tenantId || seen.has(tenantId)) continue;

      seen.add(tenantId);
      nextTenantOptions.push({
        tenant_id: tenantId,
        label: (tenant?.display_name as string) || tenantId,
        user_id: null,
      });
    }

    tenantOptions = nextTenantOptions;
  }

  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
    calendar_tenant_id: null,
  });

  let customerQuery = admin
    .from("customer_profiles")
    .select(`
      id,
      created_at,
      tenant_id,
      person_id,
      person:persons (
        id,
        full_name,
        phone,
        email,
        birthday
      ),
      tenant:tenants (
        id,
        display_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (effectiveTenantId) customerQuery = customerQuery.eq("tenant_id", effectiveTenantId);

  let appointmentQuery = admin.from("appointments").select("id, person_id, start_at, end_at, notes_internal, tenant_id").limit(5000);
  if (effectiveTenantId) appointmentQuery = appointmentQuery.eq("tenant_id", effectiveTenantId);

  const [{ data: rowsRaw, error }, { data: appointmentsRaw, error: appointmentsError }] = await Promise.all([customerQuery, appointmentQuery]);
  const rows = (rowsRaw ?? []) as CustomerRow[];
  const appointments = (appointmentsRaw ?? []) as AppointmentRow[];

  const customerPersonIds = new Set(rows.map((row) => row.person_id).filter((value): value is string => Boolean(value)));
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const visitsByPersonId = new Map<string, number>();
  const lastVisitByPersonId = new Map<string, string>();
  const nextAppointmentByPersonId = new Map<string, string>();
  const noShowsByPersonId = new Map<string, number>();

  for (const appointment of appointments) {
    const personId = appointment.person_id ?? null;
    const startAt = appointment.start_at ?? null;
    if (!personId || !customerPersonIds.has(personId) || !startAt) continue;
    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) continue;
    const explicitStatus = parseStatus(appointment.notes_internal);
    const isPast = startDate < now;

    if (isPast) {
      const isCompleted = explicitStatus === "completed" || explicitStatus === null;
      const isNoShow = explicitStatus === "no_show";
      if (isCompleted) {
        visitsByPersonId.set(personId, (visitsByPersonId.get(personId) ?? 0) + 1);
        const currentLastVisit = lastVisitByPersonId.get(personId);
        if (!currentLastVisit || new Date(currentLastVisit) < startDate) lastVisitByPersonId.set(personId, startAt);
      }
      if (isNoShow) noShowsByPersonId.set(personId, (noShowsByPersonId.get(personId) ?? 0) + 1);
    } else {
      const isCancelled = explicitStatus === "cancelled";
      if (!isCancelled) {
        const currentNextAppointment = nextAppointmentByPersonId.get(personId);
        if (!currentNextAppointment || new Date(currentNextAppointment) > startDate) nextAppointmentByPersonId.set(personId, startAt);
      }
    }
  }

  const analyticsByCustomerId = new Map<string, CustomerAnalytics>();
  let totalCustomers = 0;
  let activeCustomers30Days = 0;
  let inactiveCustomers60Days = 0;
  let withoutFollowUp = 0;

  for (const row of rows) {
    totalCustomers += 1;
    const personId = row.person_id ?? "";
    const visitCount = visitsByPersonId.get(personId) ?? 0;
    const lastVisitAt = lastVisitByPersonId.get(personId) ?? null;
    const nextAppointmentAt = nextAppointmentByPersonId.get(personId) ?? null;
    const noShowCount = noShowsByPersonId.get(personId) ?? 0;
    const isWithoutFollowUp = visitCount > 0 && !!lastVisitAt && !nextAppointmentAt;

    if (visitCount > 0 && lastVisitAt) {
      const lastVisitDate = new Date(lastVisitAt);
      if (!Number.isNaN(lastVisitDate.getTime()) && lastVisitDate >= thirtyDaysAgo) activeCustomers30Days += 1;
      if (!Number.isNaN(lastVisitDate.getTime()) && !nextAppointmentAt && lastVisitDate < sixtyDaysAgo) inactiveCustomers60Days += 1;
      if (!nextAppointmentAt) withoutFollowUp += 1;
    }

    analyticsByCustomerId.set(row.id, { visitCount, lastVisitAt, nextAppointmentAt, noShowCount, isWithoutFollowUp });
  }

  const searchScopedRows = rows;

  const filteredRows = searchScopedRows.filter((row) => {
    const analytics = analyticsByCustomerId.get(row.id);
    if (onlyNoFollowUp && !analytics?.isWithoutFollowUp) return false;
    return true;
  });

  const adminMissingOwnTenant = role === "ADMIN" && currentAdminTenant === "all" && !profile?.tenant_id;
  const resetHref = "/customers";

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-5 md:p-6 xl:p-8">
            <div className="md:hidden">
              <div
                className="overflow-visible rounded-[28px] border p-5"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex flex-col gap-6">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                      Clientique Backoffice
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Kunden</h1>
                  </div>

                  <div className="md:hidden flex items-center justify-between gap-3">
                    <MobileCustomersFilterMenu
                      qRaw={qRaw}
                      only={onlyNoFollowUp ? 'no-followup' : 'all'}
                      counts={{
                        all: searchScopedRows.length,
                        noFollowUp: searchScopedRows.filter((row) => analyticsByCustomerId.get(row.id)?.isWithoutFollowUp).length,
                      }}
                    />

                    <Link
                      href="/customers/new"
                      aria-label="Neuen Kunden anlegen"
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
                      style={{
                        color: '#0b0b0c',
                        background: 'linear-gradient(180deg, rgba(214,195,163,0.96) 0%, rgba(214,195,163,0.88) 100%)',
                        borderColor: 'rgba(214,195,163,0.28)',
                        boxShadow: '0 12px 28px rgba(214,195,163,0.22), 0 0 0 2px rgba(11,11,12,0.95)',
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </Link>

                    {role === 'ADMIN' ? (
                      <MobileCustomersAvatarMenu current={currentAdminTenant} options={tenantOptions} action={setAdminTenant} />
                    ) : null}
                  </div>

                  <div className="md:hidden flex flex-col gap-3">
                    <form id="mobile-customers-search-form" role="search" className="w-full">
                      <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                        <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                          </svg>
                        </span>
                        <input
                          id="mobile-customers-search-input"
                          type="text"
                          defaultValue={qRaw}
                          placeholder="Name, Telefon, E-Mail oder Behandler suchen"
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                        />
                        <button
                          id="mobile-customers-search-clear"
                          type="button"
                          aria-label="Suche löschen"
                          title="Suche löschen"
                          className="ml-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M6 6l12 12" />
                            <path d="M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </div>

                  {(error || appointmentsError || errorMsg) ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                      {error?.message || appointmentsError?.message || errorMsg}
                    </div>
                  ) : null}

                  <div className="md:hidden grid grid-cols-3 gap-2">
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Gesamt</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{totalCustomers}</div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Aktiv 30</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{activeCustomers30Days}</div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-2.5 py-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Ohne Termin</div>
                      <div className="mt-1 text-[11px] font-semibold leading-tight text-white">{withoutFollowUp}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div id="desktop-customers-header" className="relative pr-[360px] xl:pr-[520px]">
                <div className="absolute right-0 top-0 z-30 flex items-start justify-end gap-3">
                  {role === "ADMIN" ? (
                    <>
                      <div id="desktop-customers-avatar-strip" className="max-w-[520px] overflow-hidden">
                        <AdminTenantAvatarPicker current={currentAdminTenant} options={tenantOptions} action={setAdminTenant} />
                      </div>
                      <DesktopCustomersAvatarCompactMenu current={currentAdminTenant} options={tenantOptions} action={setAdminTenant} />
                    </>
                  ) : null}

                  <details id="desktop-customers-search-wrap" className="relative">
                    <summary
                      id="desktop-customers-search-toggle"
                      className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.08]"
                      aria-label="Suche öffnen"
                      title="Suche"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </summary>

                    <div
                      id="desktop-customers-search-stack"
                      className="absolute right-0 top-[calc(100%+28px)] z-20"
                      style={{ width: "420px", maxWidth: "620px" }}
                    >
                      <div
                        id="desktop-customers-search-panel"
                        className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                      >
                        <form id="desktop-customers-search-form" role="search" className="w-full">
                          <div className="flex h-12 items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                            <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                              </svg>
                            </span>
                            <input
                              id="desktop-customers-search-input"
                              type="text"
                              defaultValue={qRaw}
                              placeholder="Name, Telefon, E-Mail oder Behandler suchen"
                              autoComplete="off"
                              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                            />
                            <button
                              id="desktop-customers-search-clear"
                              type="button"
                              aria-label="Suche löschen"
                              title="Suche löschen"
                              className="ml-3 inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <path d="M6 6l12 12" />
                                <path d="M18 6 6 18" />
                              </svg>
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </details>

                  <Link
                    href="/customers/new"
                    aria-label="Neuen Kunden anlegen"
                    title="Neuer Kunde"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] bg-[var(--primary)] text-black shadow-[0_12px_26px_rgba(214,195,163,0.18)] transition hover:opacity-90"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </Link>
                </div>

                <div className="min-w-0">
                  <div id="desktop-customers-kicker" className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">Magnifique Beauty Institut Kundenbereich</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Kunden</h1>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Eingeloggt als {profile?.full_name ?? user.email} ({profile?.role ?? "—"})</p>
                  {role === "ADMIN" && adminMissingOwnTenant ? (
                    <div className="mt-5 text-xs text-red-300">Dein ADMIN-Profil hat aktuell kein tenant_id.</div>
                  ) : null}
                </div>
              </div>

              {(error || appointmentsError || errorMsg) ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error?.message || appointmentsError?.message || errorMsg}
                </div>
              ) : null}

              <div className="mt-6 flex items-center gap-2 md:flex-wrap">
                {[
                  ["all", "Alle", searchScopedRows.length],
                  ["no-followup", "Ohne Folgetermin", searchScopedRows.filter((row) => analyticsByCustomerId.get(row.id)?.isWithoutFollowUp).length],
                ].map(([key, label, count]) => {
                  const active = (onlyNoFollowUp ? "no-followup" : "all") === key;
                  return (
                    <Link key={String(key)} href={key === "all" ? "/customers" : `/customers?only=no-followup${qRaw ? `&q=${encodeURIComponent(qRaw)}` : ""}`} className={statusLinkClass(active)}>
                      <span>{label}</span>
                      <span className={statusCountClass(active)}>{count}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Kunden gesamt" value={totalCustomers} subtext="Alle sichtbaren Kundenprofile" />
                <SummaryCard label="Aktiv 30 Tage" value={activeCustomers30Days} subtext="Mit gekommenem Besuch in den letzten 30 Tagen" />
                <SummaryCard label="Inaktiv 60 Tage" value={inactiveCustomers60Days} subtext="Länger ohne gekommenen Besuch und ohne Folgetermin" />
                <SummaryCard label="Ohne Folgetermin" value={withoutFollowUp} subtext="Bereits gekommen, aber aktuell nichts geplant" />
              </div>
            </div>

          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-0">
            <div className="border-b border-white/8 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-[var(--text)]">{onlyNoFollowUp ? "Kunden ohne Folgetermin" : "Kundenliste"}</div>
                  <div id="customers-results-count" suppressHydrationWarning className="mt-1 text-sm text-[var(--text-muted)]">{filteredRows.length} Ergebnis(se)</div>
                </div>
                <div className="flex items-center gap-2">
                  {onlyNoFollowUp ? <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">Filter aktiv</span> : null}
                  {(qRaw || onlyNoFollowUp) ? <Link href={resetHref}><Button variant="secondary" size="sm">Reset</Button></Link> : null}
                </div>
              </div>
            </div>

            <div className="lg:hidden px-4 py-4">
              {filteredRows.length === 0 ? (
                <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-6 text-sm text-white/55">Keine Kunden gefunden.</div>
              ) : (
                <div id="customers-mobile-list" className="space-y-3">
                  {filteredRows.map((row) => {
                    const person = firstJoin(row.person);
                    const tenant = firstJoin(row.tenant);
                    const tenantLabel = tenant?.display_name || row?.tenant_id || "";
                    const theme = tenantThemeByName(tenantLabel);
                    const analytics = analyticsByCustomerId.get(row.id);
                    const shortCode = getUserShortCode(tenantLabel);
                    return (
                      <div
                        key={row.id}
                        data-customer-entry="mobile"
                        data-search-text={`${person?.full_name ?? ""} ${(person?.phone ?? "")} ${(person?.email ?? "")} ${tenantLabel}`.toLowerCase()}
                        className="relative rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-4 transition hover:bg-white/[0.035]"
                      >
                        {role === "ADMIN" ? (
                          <div className="customers-delete-icon-action absolute right-4 top-4 z-10">
                            <DeleteCustomerButton customerProfileId={row.id} />
                          </div>
                        ) : null}
                        <Link href={`/customers/${row.id}`} className="block pr-14">
                          <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold" style={{ backgroundColor: theme.pillBg, borderColor: theme.border, color: theme.pillText }}>{shortCode}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-semibold text-white">{person?.full_name ?? "—"}</div>
                              <div className="mt-1 whitespace-nowrap text-sm text-white/75">{person?.phone ?? "—"}</div>
                              <div className="mt-1 truncate text-xs text-white/45">{person?.email ?? "—"}</div>
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Besuche</div><div className="mt-1 text-[10px] font-semibold text-white">{analytics?.visitCount ?? 0}</div>{(analytics?.noShowCount ?? 0) > 0 ? <div className="mt-1 text-[11px] text-orange-300">{analytics?.noShowCount} No-Show</div> : null}</div>
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Letzter</div><div className="mt-1 text-[10px] font-medium text-white/75">{formatShortDate(analytics?.lastVisitAt)}</div></div>
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Nächster</div><div className="mt-1 text-[10px] font-medium text-white/75">{formatShortDate(analytics?.nextAppointmentAt)}</div></div>
                          </div>
                          {analytics?.isWithoutFollowUp ? <div className="mt-3 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">Ohne Folgetermin</div> : null}
                          <div className="mt-3 text-xs text-white/40">Erstellt: {formatShortDate(row.created_at)}</div>
                        </Link>
                      </div>
                    );
                  })}
                                  <div id="customers-mobile-empty" className="hidden rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-6 text-sm text-white/55">
                    Keine Kunden gefunden.
                  </div>
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden lg:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  {role === "ADMIN" ? (
                    <>
                      <col className="w-[42%]" />
                      <col className="w-[20%]" />
                      <col className="w-[17%]" />
                      <col className="w-[13%]" />
                      <col className="w-[8%]" />
                    </>
                  ) : (
                    <>
                      <col className="w-[46%]" />
                      <col className="w-[22%]" />
                      <col className="w-[18%]" />
                      <col className="w-[14%]" />
                    </>
                  )}
                </colgroup>
                <thead className="bg-white/[0.03]">
                  <tr className="text-left text-white/60">
                    <th className="px-6 py-3.5 font-semibold">Kunde</th>
                    <th className="px-4 py-3.5 font-semibold">Verlauf</th>
                    <th className="px-4 py-3.5 font-semibold">Nächster Termin</th>
                    <th className="px-4 py-3.5 font-semibold">Erstellt</th>
                    {role === "ADMIN" && <th className="px-5 py-3.5 text-right font-semibold">Aktion</th>}
                  </tr>
                </thead>
                <tbody id="customers-desktop-tbody">
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={role === "ADMIN" ? 5 : 4} className="px-6 py-8 text-sm text-white/55">Keine Kunden gefunden.</td></tr>
                  ) : filteredRows.map((row) => {
                    const person = firstJoin(row.person);
                    const tenant = firstJoin(row.tenant);
                    const tenantLabel = tenant?.display_name || row?.tenant_id || "";
                    const theme = tenantThemeByName(tenantLabel);
                    const analytics = analyticsByCustomerId.get(row.id);
                    const shortCode = getUserShortCode(tenantLabel);
                    const contactLine = [person?.phone, person?.email].filter(Boolean).join(" · ") || "—";
                    return (
                      <tr
                        key={row.id}
                        data-customer-entry="desktop"
                        data-search-text={`${person?.full_name ?? ""} ${(person?.phone ?? "")} ${(person?.email ?? "")} ${tenantLabel}`.toLowerCase()}
                        className="border-t border-white/8 transition hover:bg-white/[0.025]"
                      >
                        <td className="px-6 py-3.5 align-middle">
                          <Link href={`/customers/${row.id}`} className="block min-w-0">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" style={{ backgroundColor: theme.pillBg, borderColor: theme.border, color: theme.pillText }}>{shortCode}</div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-white">{person?.full_name ?? "—"}</div>
                                <div className="mt-0.5 truncate text-xs text-white/50">{contactLine}</div>
                                {analytics?.isWithoutFollowUp ? <div className="mt-1 inline-flex max-w-full rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">Ohne Folgetermin</div> : null}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <Link href={`/customers/${row.id}`} className="block min-w-0">
                            <div className="font-semibold text-white">{analytics?.visitCount ?? 0} Besuche</div>
                            <div className="mt-0.5 truncate text-xs text-white/50">Letzter Besuch: {formatShortDate(analytics?.lastVisitAt)}</div>
                            {(analytics?.noShowCount ?? 0) > 0 ? <div className="mt-0.5 truncate text-[11px] font-medium text-orange-300">{analytics?.noShowCount} No-Show</div> : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-white/75">
                          <Link href={`/customers/${row.id}`} className="block truncate">{formatShortDate(analytics?.nextAppointmentAt)}</Link>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-white/50">
                          <Link href={`/customers/${row.id}`} className="block truncate">{formatShortDate(row.created_at)}</Link>
                        </td>
                        {role === "ADMIN" ? <td className="customers-delete-icon-action px-5 py-3.5 align-middle text-right"><DeleteCustomerButton customerProfileId={row.id} /></td> : null}
                      </tr>
                    );
                  })}
                  <tr id="customers-desktop-empty" className="hidden">
                    <td colSpan={role === "ADMIN" ? 5 : 4} className="px-6 py-8 text-sm text-white/55">Keine Kunden gefunden.</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      </section>

            <Script id="customers-desktop-search-script" strategy="afterInteractive">
        {`
          (() => {
            const init = (tries = 0) => {
              const wrap = document.getElementById("desktop-customers-search-wrap");
              const toggle = document.getElementById("desktop-customers-search-toggle");
              const panel = document.getElementById("desktop-customers-search-panel");
              const desktopForm = document.getElementById("desktop-customers-search-form");
              const desktopInput = document.getElementById("desktop-customers-search-input");
              const desktopClearButton = document.getElementById("desktop-customers-search-clear");

              const mobileForm = document.getElementById("mobile-customers-search-form");
              const mobileInput = document.getElementById("mobile-customers-search-input");
              const mobileClearButton = document.getElementById("mobile-customers-search-clear");

              const resultCount = document.getElementById("customers-results-count");
              const mobileEntries = Array.from(document.querySelectorAll("[data-customer-entry='mobile']"));
              const desktopEntries = Array.from(document.querySelectorAll("[data-customer-entry='desktop']"));
              const mobileEmpty = document.getElementById("customers-mobile-empty");
              const desktopEmpty = document.getElementById("customers-desktop-empty");

              if (!wrap || !toggle || !panel || !desktopForm || !desktopInput || !desktopClearButton || !mobileForm || !mobileInput || !mobileClearButton || !resultCount) {
                if (tries < 40) window.requestAnimationFrame(() => init(tries + 1));
                return;
              }

              const normalize = (value) =>
                String(value ?? "")
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .trim();

              const getTokens = (value) =>
                normalize(value)
                  .split(/\s+/)
                  .map((token) => token.trim())
                  .filter(Boolean);

              const desktopMedia = window.matchMedia("(min-width: 1024px)");
              const getVisibleEntries = () => (desktopMedia.matches ? desktopEntries : mobileEntries);

              const setOpen = (nextOpen) => {
                if (nextOpen) wrap.setAttribute("open", "");
                else wrap.removeAttribute("open");
              };

              const syncInputs = (value) => {
                if (desktopInput.value !== value) desktopInput.value = value;
                if (mobileInput.value !== value) mobileInput.value = value;
              };

              const updateClearButtons = () => {
                const hasValue = String(desktopInput.value || mobileInput.value || "").trim().length > 0;
                [desktopClearButton, mobileClearButton].forEach((button) => {
                  button.style.opacity = hasValue ? "1" : "0";
                  button.style.pointerEvents = hasValue ? "auto" : "none";
                });
              };

              const applyFilter = () => {
                const tokens = getTokens(desktopInput.value || mobileInput.value || "");

                const applyTo = (entries) => {
                  entries.forEach((entry) => {
                    const haystack = normalize(entry.getAttribute("data-search-text"));
                    const matches = tokens.length === 0 ? true : tokens.every((token) => haystack.includes(token));
                    entry.style.display = matches ? "" : "none";
                  });
                };

                applyTo(mobileEntries);
                applyTo(desktopEntries);

                const visible = getVisibleEntries().filter((entry) => entry.style.display !== "none").length;
                resultCount.textContent = visible + " Ergebnis(se)";

                if (mobileEmpty) {
                  mobileEmpty.classList.toggle("hidden", desktopMedia.matches || visible !== 0);
                }
                if (desktopEmpty) {
                  desktopEmpty.classList.toggle("hidden", !desktopMedia.matches || visible !== 0);
                }
              };

              const writeUrl = (value) => {
                const url = new URL(window.location.href);
                if (String(value || "").trim()) url.searchParams.set("q", String(value).trim());
                else url.searchParams.delete("q");
                window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : ""));
              };

              const emitQuery = (value) => {
                syncInputs(value);
                updateClearButtons();
                writeUrl(value);
                applyFilter();
              };

              const focusDesktopInputToEnd = () => {
                desktopInput.focus();
                const len = desktopInput.value.length;
                try { desktopInput.setSelectionRange(len, len); } catch (_) {}
              };

              toggle.addEventListener("click", (event) => {
                event.preventDefault();
                const nextOpen = !wrap.hasAttribute("open");
                setOpen(nextOpen);
                if (nextOpen) window.requestAnimationFrame(focusDesktopInputToEnd);
              });

              const handleInput = (event) => {
                const value = event.target.value;
                if (event.target === desktopInput && !wrap.hasAttribute("open")) setOpen(true);
                emitQuery(value);
              };

              desktopInput.addEventListener("input", handleInput);
              mobileInput.addEventListener("input", handleInput);

              desktopInput.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  toggle.focus();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  emitQuery(desktopInput.value);
                }
              });

              mobileInput.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  mobileInput.blur();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  emitQuery(mobileInput.value);
                }
              });

              desktopForm.addEventListener("submit", (event) => {
                event.preventDefault();
                emitQuery(desktopInput.value);
              });

              mobileForm.addEventListener("submit", (event) => {
                event.preventDefault();
                emitQuery(mobileInput.value);
              });

              const clearQuery = (target) => {
                target.addEventListener("click", (event) => {
                  event.preventDefault();
                  emitQuery("");
                  if (target === desktopClearButton) {
                    focusDesktopInputToEnd();
                  } else {
                    mobileInput.focus();
                  }
                });
              };

              clearQuery(desktopClearButton);
              clearQuery(mobileClearButton);

              document.addEventListener("mousedown", (event) => {
                const target = event.target;
                if (!wrap.hasAttribute("open")) return;
                if (wrap.contains(target)) return;
                setOpen(false);
              });

              desktopMedia.addEventListener?.("change", applyFilter);
              window.addEventListener("resize", applyFilter);

              updateClearButtons();
              applyFilter();

              if (desktopInput.value.trim()) {
                setOpen(true);
              }
            };

            init();
          })();
        `}
      </Script>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 768px) {
          #desktop-customers-avatar-strip { display: block; }
          #desktop-customers-avatar-compact { display: none; }
        }
        @media (min-width: 768px) and (max-width: 1120px) {
          #desktop-customers-avatar-strip { display: none; }
          #desktop-customers-avatar-compact { display: block; }
        }

        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }

        #desktop-customers-search-wrap > #desktop-customers-search-stack {
          display: none;
        }
        #desktop-customers-search-wrap[open] > #desktop-customers-search-stack {
          display: block;
        }

        .customers-delete-icon-action button,
        .customers-delete-icon-action [role="button"] {
          position: relative;
          display: inline-flex;
          width: 38px;
          height: 38px;
          min-width: 38px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(248,113,113,0.24) !important;
          background: rgba(127,29,29,0.16) !important;
          color: #fecaca !important;
          font-size: 0 !important;
          line-height: 0 !important;
          padding: 0 !important;
          transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
        }
        .customers-delete-icon-action button:hover,
        .customers-delete-icon-action [role="button"]:hover {
          border-color: rgba(248,113,113,0.42) !important;
          background: rgba(127,29,29,0.28) !important;
          transform: translateY(-1px);
        }
        .customers-delete-icon-action button::before,
        .customers-delete-icon-action [role="button"]::before {
          content: "";
          width: 17px;
          height: 17px;
          background: currentColor;
          -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h18'/%3E%3Cpath d='M8 6V4h8v2'/%3E%3Cpath d='M19 6l-1 14H6L5 6'/%3E%3Cpath d='M10 11v5'/%3E%3Cpath d='M14 11v5'/%3E%3C/svg%3E") center / contain no-repeat;
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h18'/%3E%3Cpath d='M8 6V4h8v2'/%3E%3Cpath d='M19 6l-1 14H6L5 6'/%3E%3Cpath d='M10 11v5'/%3E%3Cpath d='M14 11v5'/%3E%3C/svg%3E") center / contain no-repeat;
        }

      ` }} />

    </main>
  );
}
