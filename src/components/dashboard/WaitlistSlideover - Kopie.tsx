"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { tenantTheme } from "@/components/calendar/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  addWaitlistEntryQuick,
  updateWaitlistStatusQuick,
} from "@/app/calendar/actions";

type WaitlistItem = {
  id: string;
  customerProfileId: string | null;
  tenantId: string;
  tenantName: string;
  customerName: string;
  phone: string | null;
  serviceTitle: string | null;
  priority: string | null;
  shortNoticeOk: boolean;
  reachableToday: boolean;
  requestedRecentlyAt: string | null;
  createdAt: string;
  profileExists: boolean;
};

type UserProfileAvatarRow = {
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  avatar_path: string | null;
  avatar_ring_color: string | null;
};

type WaitlistTenantOption = {
  tenant_id: string;
  label: string;
  user_id: string;
  avatar_path: string | null;
  avatar_ring_color: string | null;
};

type WaitlistServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  is_active: boolean | null;
};

type WaitlistCustomerOption = {
  id: string;
  tenant_id: string;
  person_id: string | null;
  person: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function recentLabel(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d >= today) return "Heute angefragt";
  if (d >= yesterday) return "Gestern angefragt";
  return "Zuletzt angefragt";
}

function priorityLabel(value: string | null) {
  const v = String(value ?? "").toLowerCase();
  if (v === "high" || v === "urgent") return "Dringend";
  if (v === "low") return "Flexibel";
  return "Normal";
}

function normalizeWhatsAppPhone(phone: string | null) {
  if (!phone) return null;
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p.replace(/\D/g, "") || null;
}

function menuIconButtonClass(active = false, danger = false) {
  if (danger) {
    return "inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-600/90 hover:text-white";
  }

  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.10]`;
}

function passiveMenuButtonClass(active = false) {
  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white cursor-default select-none pointer-events-none`;
}

function cardIconButtonClass(disabled = false) {
  return `inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04] text-white transition-colors ${
    disabled
      ? "cursor-not-allowed opacity-45 pointer-events-none"
      : "hover:bg-white/[0.10]"
  }`;
}

function cardDangerIconButtonClass(disabled = false) {
  return `inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-red-400/20 bg-red-500/[0.07] text-red-200 transition-colors ${
    disabled
      ? "cursor-not-allowed opacity-45 pointer-events-none"
      : "hover:border-red-400/35 hover:bg-red-500/15 hover:text-red-100"
  }`;
}

function normalizeLookupValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferPractitionerUserIdFromWaitlist(item: WaitlistItem) {
  const candidates = [item.tenantName, item.customerName, item.serviceTitle];
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const normalized = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (normalized.includes("radu")) return "radu";
    if (normalized.includes("raluca")) return "raluca";
    if (normalized.includes("alexandra")) return "alexandra";
    if (normalized.includes("barbara")) return "barbara";
    if (normalized.includes("boba")) return "boba";
    const first = normalized
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .split(/\s+/)[0];
    if (first) return first;
  }
  return "user";
}

function findPractitionerProfileForWaitlist(
  item: WaitlistItem,
  profiles: UserProfileAvatarRow[],
) {
  const tenantId = String(item.tenantId ?? "").trim();
  const tenantName = normalizeLookupValue(item.tenantName);
  if (tenantId) {
    const tenantProfiles = profiles.filter(
      (profile) => String(profile.tenant_id ?? "").trim() === tenantId,
    );
    if (tenantProfiles.length === 1) return tenantProfiles[0];
    const byName = tenantProfiles.find(
      (profile) => normalizeLookupValue(profile.full_name) === tenantName,
    );
    if (byName) return byName;
  }
  if (tenantName) {
    const matched = profiles.find(
      (profile) => normalizeLookupValue(profile.full_name) === tenantName,
    );
    if (matched) return matched;
  }
  return null;
}

function resolveAvatarUrl(
  avatarPath: string | null | undefined,
  userId: string,
) {
  const raw = String(avatarPath ?? "").trim();
  if (raw) {
    if (
      /^https?:\/\//i.test(raw) ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:")
    )
      return raw;
    const normalized = raw.replace(/^\/+/, "").replace(/^avatars\//i, "");
    const { data } = supabaseBrowser()
      .storage.from("avatars")
      .getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }
  return `/users/${userId}.png`;
}

function avatarHideOnError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
  const parent = event.currentTarget.parentElement;
  if (parent) parent.dataset.avatarBroken = "1";
}

function findDashboardCalendarTarget() {
  const directTarget =
    document.getElementById("dashboard-calendar-card") ||
    document.getElementById("calendar") ||
    document.getElementById("dashboard-calendar") ||
    document.querySelector('[data-dashboard-calendar="true"]');

  const headingTarget = Array.from(document.querySelectorAll("h1,h2,h3")).find(
    (node) => {
      const text = String(node.textContent ?? "")
        .trim()
        .toLowerCase();
      return text === "kalender";
    },
  );

  const target = directTarget || headingTarget;
  return target instanceof HTMLElement ? target : null;
}

function scrollDashboardCalendarWithRetry() {
  let tries = 0;
  const run = () => {
    tries += 1;
    const target = findDashboardCalendarTarget();
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (tries < 16) {
      window.setTimeout(run, 120);
      return;
    }

    window.scrollTo({ top: 150, behavior: "smooth" });
  };

  window.setTimeout(run, 80);
}

function CardIconLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cardIconButtonClass()}
      aria-label={title}
      title={title}
    >
      {children}
    </Link>
  );
}

type WaitlistAddHeaderState = {
  canSubmit: boolean;
  pending: boolean;
  selectedTenantLabel: string | null;
  selectedTenantAvatarUrl: string | null;
  selectedTenantRingColor: string;
  submit: (() => void) | null;
};

function AddWaitlistCard({
  onDone,
  onCancel,
  onHeaderStateChange,
  initialItem = null,
}: {
  onDone: () => void;
  onCancel: () => void;
  onHeaderStateChange?: (state: WaitlistAddHeaderState | null) => void;
  initialItem?: WaitlistItem | null;
}) {
  const [pending, startTransition] = useTransition();
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [tenantOptions, setTenantOptions] = useState<WaitlistTenantOption[]>(
    [],
  );
  const [serviceOptions, setServiceOptions] = useState<WaitlistServiceOption[]>(
    [],
  );
  const [customerOptions, setCustomerOptions] = useState<
    WaitlistCustomerOption[]
  >([]);
  const [selectedTenantId, setSelectedTenantId] = useState(
    initialItem?.tenantId ?? "",
  );
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState(
    initialItem?.customerProfileId ?? "",
  );
  const [fullName, setFullName] = useState(initialItem?.customerName ?? "");
  const [phone, setPhone] = useState(initialItem?.phone ?? "");
  const [manualServiceTitle, setManualServiceTitle] = useState(
    initialItem?.serviceTitle ?? "",
  );
  const [priority, setPriority] = useState(initialItem?.priority ?? "normal");
  const [shortNoticeOk, setShortNoticeOk] = useState(
    initialItem?.shortNoticeOk ?? true,
  );
  const [reachableToday, setReachableToday] = useState(
    initialItem?.reachableToday ?? true,
  );
  const [requestedRecently, setRequestedRecently] = useState("today");

  const selectedTenant = useMemo(
    () =>
      tenantOptions.find((tenant) => tenant.tenant_id === selectedTenantId) ??
      null,
    [selectedTenantId, tenantOptions],
  );

  const selectedService = useMemo(
    () =>
      serviceOptions.find((service) => service.id === selectedServiceId) ??
      null,
    [selectedServiceId, serviceOptions],
  );

  const selectedTenantAvatarUrl = useMemo(() => {
    if (!selectedTenant?.user_id) return null;
    return resolveAvatarUrl(selectedTenant.avatar_path, selectedTenant.user_id);
  }, [selectedTenant?.avatar_path, selectedTenant?.user_id]);

  const selectedTenantRingColor =
    String(selectedTenant?.avatar_ring_color ?? "").trim() ||
    "rgba(214,196,166,0.95)";

  const serviceTitle = selectedService?.name ?? manualServiceTitle.trim();
  const hasCustomerInput = Boolean(
    selectedCustomerProfileId || fullName.trim() || phone.trim(),
  );
  const canSubmit = Boolean(
    selectedTenantId && hasCustomerInput && serviceTitle.trim(),
  );

  const filteredCustomers = useMemo(() => {
    const q = normalizeLookupValue(fullName || phone);
    const rows = customerOptions;
    if (!q) return rows.slice(0, 60);

    return rows
      .filter((row) => {
        const name = normalizeLookupValue(row.person?.full_name);
        const rowPhone = normalizeLookupValue(row.person?.phone);
        const email = normalizeLookupValue(row.person?.email);
        return name.includes(q) || rowPhone.includes(q) || email.includes(q);
      })
      .slice(0, 60);
  }, [customerOptions, fullName, phone]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenants() {
      setLoadingSetup(true);

      const { data, error } = await supabaseBrowser()
        .from("user_profiles")
        .select(
          "user_id, tenant_id, full_name, avatar_path, avatar_ring_color, is_active",
        )
        .not("tenant_id", "is", null)
        .eq("is_active", true);

      if (cancelled) return;

      if (error) {
        setTenantOptions([]);
        setSelectedTenantId("");
        setLoadingSetup(false);
        return;
      }

      const seen = new Set<string>();
      const options = ((data ?? []) as UserProfileAvatarRow[])
        .map((row) => ({
          tenant_id: String(row.tenant_id ?? "").trim(),
          label: String(row.full_name ?? "").trim() || "Behandler",
          user_id: String(row.user_id ?? "").trim() || "user",
          avatar_path: row.avatar_path ?? null,
          avatar_ring_color: row.avatar_ring_color ?? null,
        }))
        .filter((row) => {
          if (!row.tenant_id || seen.has(row.tenant_id)) return false;
          seen.add(row.tenant_id);
          return true;
        })
        .sort((a, b) => a.label.localeCompare(b.label, "de"));

      setTenantOptions(options);
      setSelectedTenantId((current) => {
        if (
          initialItem?.tenantId &&
          options.some((option) => option.tenant_id === initialItem.tenantId)
        )
          return initialItem.tenantId;
        if (current && options.some((option) => option.tenant_id === current))
          return current;
        return (
          options.find((option) =>
            normalizeLookupValue(option.label).includes("radu"),
          )?.tenant_id ??
          options[0]?.tenant_id ??
          ""
        );
      });
      setLoadingSetup(false);
    }

    void loadTenants();

    return () => {
      cancelled = true;
    };
  }, [initialItem?.tenantId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenantData() {
      setServiceOptions([]);
      setCustomerOptions([]);
      setSelectedServiceId("");
      setSelectedCustomerProfileId(
        initialItem?.tenantId === selectedTenantId
          ? (initialItem?.customerProfileId ?? "")
          : "",
      );

      if (!selectedTenantId) return;

      const [servicesResult, customersResult] = await Promise.all([
        supabaseBrowser()
          .from("services")
          .select("id, tenant_id, name, is_active")
          .eq("tenant_id", selectedTenantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabaseBrowser()
          .from("customer_profiles")
          .select(
            `
              id,
              tenant_id,
              person_id,
              person:persons (
                id,
                full_name,
                phone,
                email
              )
            `,
          )
          .eq("tenant_id", selectedTenantId)
          .order("created_at", { ascending: false })
          .limit(250),
      ]);

      if (cancelled) return;

      const normalizedServices = ((servicesResult.data ?? []) as any[])
        .map((row) => ({
          id: String(row?.id ?? ""),
          tenant_id: String(row?.tenant_id ?? selectedTenantId),
          name: String(row?.name ?? "").trim(),
          is_active: row?.is_active ?? true,
        }))
        .filter((row) => row.id && row.name);

      const normalizedCustomers = ((customersResult.data ?? []) as any[])
        .map((row) => {
          const personRaw = Array.isArray(row?.person)
            ? (row.person[0] ?? null)
            : (row?.person ?? null);
          return {
            id: String(row?.id ?? ""),
            tenant_id: String(row?.tenant_id ?? selectedTenantId),
            person_id: row?.person_id ? String(row.person_id) : null,
            person: personRaw
              ? {
                  id: String(personRaw?.id ?? ""),
                  full_name: personRaw?.full_name ?? null,
                  phone: personRaw?.phone ?? null,
                  email: personRaw?.email ?? null,
                }
              : null,
          } satisfies WaitlistCustomerOption;
        })
        .filter(
          (row) =>
            row.id &&
            (row.person?.full_name || row.person?.phone || row.person?.email),
        );

      setServiceOptions(normalizedServices);
      if (initialItem?.tenantId === selectedTenantId && initialItem?.serviceTitle) {
        const matchedService = normalizedServices.find(
          (service) => normalizeLookupValue(service.name) === normalizeLookupValue(initialItem.serviceTitle),
        );
        if (matchedService?.id) {
          setSelectedServiceId(matchedService.id);
          setManualServiceTitle("");
        } else {
          setSelectedServiceId("");
          setManualServiceTitle(initialItem.serviceTitle);
        }
      } else {
        setSelectedServiceId(normalizedServices[0]?.id ?? "");
      }
      setCustomerOptions(normalizedCustomers);
      if (initialItem?.tenantId === selectedTenantId && initialItem?.customerProfileId) {
        const matchedCustomer = normalizedCustomers.find((row) => row.id === initialItem.customerProfileId);
        if (matchedCustomer) {
          setSelectedCustomerProfileId(matchedCustomer.id);
          setFullName(matchedCustomer.person?.full_name ?? initialItem.customerName ?? "");
          setPhone(matchedCustomer.person?.phone ?? initialItem.phone ?? "");
        }
      }
    }

    void loadTenantData();

    return () => {
      cancelled = true;
    };
  }, [
    selectedTenantId,
    initialItem?.tenantId,
    initialItem?.customerProfileId,
    initialItem?.serviceTitle,
  ]);

  const chooseCustomer = (row: WaitlistCustomerOption) => {
    setSelectedCustomerProfileId(row.id);
    setFullName(row.person?.full_name ?? "");
    setPhone(row.person?.phone ?? "");
  };

  const clearCustomerSelection = () => {
    setSelectedCustomerProfileId("");
  };

  const runSubmit = () => {
    if (!selectedTenantId) {
      window.alert("Bitte zuerst einen Behandler auswählen.");
      return;
    }

    if (!hasCustomerInput) {
      window.alert(
        "Bitte einen Kunden auswählen oder Name/Telefon frei eingeben.",
      );
      return;
    }

    if (!serviceTitle.trim()) {
      window.alert("Bitte eine Dienstleistung auswählen oder frei eingeben.");
      return;
    }

    startTransition(async () => {
      const result = await addWaitlistEntryQuick({
        tenantId: selectedTenantId,
        customerProfileId: selectedCustomerProfileId || null,
        fullName,
        phone,
        serviceTitle,
        priority,
        shortNoticeOk,
        reachableToday,
        requestedRecently,
      });

      if (!result?.ok) {
        window.alert(
          result?.error ?? "Wartelisten-Eintrag konnte nicht erstellt werden.",
        );
        return;
      }

      setSelectedCustomerProfileId("");
      setFullName("");
      setPhone("");
      setManualServiceTitle("");
      setPriority("normal");
      setShortNoticeOk(true);
      setReachableToday(true);
      setRequestedRecently("today");
      onDone();
    });
  };

  useEffect(() => {
    onHeaderStateChange?.({
      canSubmit,
      pending,
      selectedTenantLabel: selectedTenant?.label ?? null,
      selectedTenantAvatarUrl,
      selectedTenantRingColor,
      submit: runSubmit,
    });

    return () => onHeaderStateChange?.(null);
  }, [
    canSubmit,
    pending,
    selectedTenant?.label,
    selectedTenantAvatarUrl,
    selectedTenantRingColor,
    selectedTenantId,
    selectedCustomerProfileId,
    fullName,
    phone,
    serviceTitle,
    priority,
    requestedRecently,
    hasCustomerInput,
  ]);

  return (
    <div className="mb-5 rounded-3xl border border-[#d8c1a0]/18 bg-[#d8c1a0]/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-white">
              {initialItem
                ? "Wartelisten-Eintrag bearbeiten"
                : "Kunde direkt zur Warteliste hinzufügen"}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04] text-white/78 transition hover:bg-white/[0.10] hover:text-white"
            aria-label="Formular schließen"
            title="Formular schließen"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-white/80">Behandler</label>
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white/90">
            {selectedTenant ? (
              <div
                className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.22)]"
                style={{ borderColor: selectedTenantRingColor }}
                title={selectedTenant.label}
              >
                {selectedTenantAvatarUrl ? (
                  <img
                    src={selectedTenantAvatarUrl}
                    alt={selectedTenant.label}
                    className="h-full w-full object-cover"
                    onError={avatarHideOnError}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/88">
                    {selectedTenant.label.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    boxShadow: `inset 0 0 0 2px ${selectedTenantRingColor}`,
                  }}
                />
              </div>
            ) : null}

            <select
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
              disabled={loadingSetup || tenantOptions.length === 0}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none disabled:opacity-60"
            >
              {tenantOptions.length === 0 ? (
                <option value="">Keine Behandler gefunden</option>
              ) : null}
              {tenantOptions.map((option) => (
                <option
                  key={option.tenant_id}
                  value={option.tenant_id}
                  className="bg-neutral-950 text-white"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-white/80">
            Dienstleistung aus Liste
          </label>
          <select
            value={selectedServiceId}
            onChange={(event) => {
              setSelectedServiceId(event.target.value);
              if (event.target.value) setManualServiceTitle("");
            }}
            disabled={!selectedTenantId || serviceOptions.length === 0}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-55"
          >
            {serviceOptions.length === 0 ? (
              <option value="">Keine aktive Dienstleistung vorhanden</option>
            ) : null}
            {serviceOptions.map((service) => (
              <option
                key={service.id}
                value={service.id}
                className="bg-neutral-950 text-white"
              >
                {service.name}
              </option>
            ))}
          </select>

          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-semibold text-white">
              Dienstleistung frei eingeben
            </div>
            <input
              value={manualServiceTitle}
              onChange={(event) => {
                setManualServiceTitle(event.target.value);
                if (selectedServiceId) setSelectedServiceId("");
              }}
              placeholder="z. B. Beratung oder Nachkontrolle"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
            />
            <div className="mt-2 text-xs text-white/45">
              Nur ausfüllen, wenn die Behandlung nicht in der Liste vorhanden
              ist.
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-white/80">
            Kunde auswählen, falls vorhanden
          </label>
          <div className="mt-1 rounded-2xl border border-white/10 bg-black/20 p-3">
            <input
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                if (selectedCustomerProfileId) clearCustomerSelection();
              }}
              placeholder="Kunde suchen oder Name frei eingeben"
              disabled={!selectedTenantId}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-55"
            />
            <input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                if (selectedCustomerProfileId) clearCustomerSelection();
              }}
              placeholder="Telefon, z. B. +43..."
              disabled={!selectedTenantId}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-55"
            />

            {selectedCustomerProfileId ? (
              <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                Bestehender Kunde ausgewählt. Beim Speichern wird kein neues
                Kundenprofil erstellt.
              </div>
            ) : null}

            {filteredCustomers.length > 0 ? (
              <div className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1">
                {filteredCustomers.map((row) => {
                  const active = selectedCustomerProfileId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => chooseCustomer(row)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-[#d8c1a0]/35 bg-[#d8c1a0]/12 text-white"
                          : "border-white/8 bg-white/[0.03] text-white/82 hover:bg-white/[0.08]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {row.person?.full_name || "Kunde"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/45">
                          {row.person?.phone ||
                            row.person?.email ||
                            "Keine Kontaktdaten"}
                        </span>
                      </span>
                      <span className="text-xs text-white/55">
                        {active ? "✓" : "Übernehmen"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : selectedTenantId ? (
              <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-xs text-white/45">
                Kein passender Kunde gefunden. Du kannst Name und Telefon frei
                eingeben.
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-white/80">
              Priorität
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              <option value="low">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="high">Hoch</option>
              <option value="urgent">Dringend</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-white/80">
              Anfragezeitpunkt
            </label>
            <select
              value={requestedRecently}
              onChange={(e) => setRequestedRecently(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              <option value="today">Heute angefragt</option>
              <option value="yesterday">Gestern angefragt</option>
              <option value="none">Kein Zeitbezug</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={pending || !canSubmit}
            onClick={runSubmit}
            className={`inline-flex h-11 items-center justify-center rounded-xl border px-5 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition disabled:cursor-not-allowed disabled:opacity-55 ${
              canSubmit
                ? "border-emerald-400/45 bg-emerald-500/18 text-emerald-50 hover:scale-[1.01] hover:bg-emerald-500/26"
                : "border-white/10 bg-white/[0.04] text-white/48"
            }`}
          >
            {pending ? "Speichert..." : "Zur Warteliste hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitlistRowCard({
  item,
  practitionerProfiles,
  onChanged,
  onEdit,
}: {
  item: WaitlistItem;
  practitionerProfiles: UserProfileAvatarRow[];
  onChanged: () => void;
  onEdit: (item: WaitlistItem) => void;
}) {
  const [pending, startTransition] = useTransition();
  const waPhone = normalizeWhatsAppPhone(item.phone);
  const theme = tenantTheme(item.tenantName ?? "");
  const practitionerProfile = findPractitionerProfileForWaitlist(
    item,
    practitionerProfiles,
  );
  const practitionerUserId =
    String(
      practitionerProfile?.user_id ?? inferPractitionerUserIdFromWaitlist(item),
    ).trim() || "user";
  const practitionerAvatarUrl = practitionerProfile?.avatar_path
    ? resolveAvatarUrl(practitionerProfile.avatar_path, practitionerUserId)
    : resolveAvatarUrl(null, practitionerUserId);
  const practitionerRingColor =
    String(practitionerProfile?.avatar_ring_color ?? "").trim() ||
    theme.bg ||
    "rgba(255,255,255,0.18)";
  const customerHref = item.customerProfileId
    ? `/customers/${item.customerProfileId}?tenantId=${encodeURIComponent(item.tenantId)}`
    : "/customers";

  const runStatusUpdate = (status: "contacted" | "removed") => {
    startTransition(async () => {
      const result = await updateWaitlistStatusQuick({
        waitlistId: item.id,
        tenantId: item.tenantId,
        status,
      });
      if (!result?.ok) {
        window.alert(
          result?.error ?? "Status konnte nicht gespeichert werden.",
        );
        return;
      }
      onChanged();
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
      <div
        className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
        style={{ backgroundColor: theme.bg || "rgba(255,255,255,0.2)" }}
      />
      <div className="p-3.5 pl-5">
        <div className="flex items-start gap-3">
          <div className="w-[82px] flex-shrink-0 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-center">
            <div className="text-[15px] font-extrabold leading-none text-white">
              Liste
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Anfrage
            </div>
            <div className="mt-1 text-[10px] font-semibold text-white/58">
              {priorityLabel(item.priority)}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mt-1 truncate text-[15px] font-extrabold leading-tight text-white">
              {item.customerName || "Kunde"}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-white/88">
              {item.serviceTitle || "Ohne konkrete Behandlung"}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-white/45">
              {item.tenantName || "Behandler"}
            </div>
          </div>

          <div className="ml-auto flex-shrink-0 self-start">
            <div
              className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border bg-black/30 p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
              style={{
                borderColor: practitionerRingColor,
                boxShadow: `0 0 0 2px ${practitionerRingColor}, 0 8px 24px rgba(0,0,0,0.32)`,
              }}
            >
              {practitionerAvatarUrl ? (
                <img
                  src={practitionerAvatarUrl}
                  alt={item.tenantName || item.customerName || "Behandler"}
                  className="h-full w-full rounded-full object-cover"
                  onError={avatarHideOnError}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] text-white/45">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-[0.16em]">
                Telefon
              </div>
              {item.phone ? (
                <a
                  href={`tel:${String(item.phone).replace(/\s+/g, "")}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] transition-colors hover:bg-white/[0.10]"
                  title={`Anrufen: ${item.phone}`}
                  aria-label={`Anrufen: ${item.phone}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
                  </svg>
                </a>
              ) : (
                <div
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04]"
                  title="Keine Telefonnummer"
                  aria-label="Keine Telefonnummer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
              {item.phone || "Nicht hinterlegt"}
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="font-semibold uppercase tracking-[0.16em]">
              Anfrage
            </div>
            <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
              {recentLabel(item.requestedRecentlyAt) ||
                priorityLabel(item.priority)}
            </div>
            <div className="mt-1 text-[11px] font-medium normal-case tracking-normal text-white/55">
              Erstellt: {formatDateTime(item.createdAt)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {waPhone ? (
            <CardIconLink
              href={`https://wa.me/${waPhone}`}
              title="WhatsApp öffnen"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="#34d399"
                aria-hidden="true"
              >
                <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Zm-8.45 18.3h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.66-.24-.38a9.9 9.9 0 0 1-1.52-5.21c0-5.46 4.45-9.91 9.92-9.91 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.92-9.92 9.92Zm5.44-7.42c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.66.15-.2.3-.76.98-.94 1.18-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.91-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.35Z" />
              </svg>
            </CardIconLink>
          ) : (
            <button
              type="button"
              className={cardIconButtonClass(true)}
              disabled
              aria-label="WhatsApp nicht verfügbar"
              title="WhatsApp nicht verfügbar"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="rgba(255,255,255,0.28)"
                aria-hidden="true"
              >
                <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Z" />
              </svg>
            </button>
          )}

          {item.phone ? (
            <CardIconLink href={`tel:${item.phone}`} title="Anrufen">
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
              </svg>
            </CardIconLink>
          ) : null}

          {item.customerProfileId ? (
            <CardIconLink href={customerHref} title="Kunde öffnen">
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </CardIconLink>
          ) : (
            <button
              type="button"
              className={cardIconButtonClass(true)}
              disabled
              aria-label="Kein Kundenprofil"
              title="Kein Kundenprofil"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => onEdit(item)}
            className={cardIconButtonClass(false)}
            aria-label="Wartelisten-Eintrag bearbeiten"
            title="Wartelisten-Eintrag bearbeiten"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => runStatusUpdate("contacted")}
            className={cardIconButtonClass(pending)}
            aria-label="Als kontaktiert markieren"
            title="Als kontaktiert markieren"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => runStatusUpdate("removed")}
            className={`${cardDangerIconButtonClass(pending)} ml-auto`}
            aria-label="Von Warteliste entfernen"
            title="Von Warteliste entfernen"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WaitlistSlideover({
  items: initialItems,
}: {
  items: WaitlistItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<WaitlistItem | null>(null);
  const [practitionerProfiles, setPractitionerProfiles] = useState<
    UserProfileAvatarRow[]
  >([]);
  const [items, setItems] = useState<WaitlistItem[]>(initialItems ?? []);
  const [loadingItems, setLoadingItems] = useState(false);
  const [addHeaderState, setAddHeaderState] =
    useState<WaitlistAddHeaderState | null>(null);

  const open = searchParams?.get("openWaitlist") === "1";
  const openAddForm = searchParams?.get("waitlistAdd") === "1";
  const openCount = items.length;

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openWaitlist");
      params.delete("waitlistAdd");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  const scrollToDashboardCalendar = useMemo(() => {
    return () => {
      try {
        window.sessionStorage.setItem("dashboard-scroll-to-calendar", "1");
        window.localStorage.setItem("dashboard-scroll-to-calendar", "1");
      } catch {
        // sessionStorage kann in privaten/gesperrten Browser-Modi blockiert sein.
      }

      if (pathname === "/dashboard") {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.delete("openWaitlist");
        params.delete("waitlistAdd");
        params.delete("scrollToCalendar");
        const qs = params.toString();
        const targetUrl = qs
          ? `/dashboard?${qs}#dashboard-calendar-card`
          : "/dashboard#dashboard-calendar-card";
        router.replace(targetUrl, { scroll: false });
        window.setTimeout(scrollDashboardCalendarWithRetry, 80);
        window.setTimeout(scrollDashboardCalendarWithRetry, 420);
        return;
      }

      // Von anderen Seiten ist ein echter Seitenwechsel stabiler als router.replace(..., scroll:false),
      // weil der Kalenderbereich erst nach dem Rendern der Dashboard-Seite existiert.
      window.location.href =
        "/dashboard?scrollToCalendar=1#dashboard-calendar-card";
    };
  }, [router, pathname, searchParams]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (pathname !== "/dashboard") return;

    let shouldScroll = searchParams?.get("scrollToCalendar") === "1";

    try {
      if (
        window.sessionStorage.getItem("dashboard-scroll-to-calendar") === "1"
      ) {
        shouldScroll = true;
        window.sessionStorage.removeItem("dashboard-scroll-to-calendar");
      }
    } catch {
      // ignorieren
    }

    if (!shouldScroll) return;

    scrollDashboardCalendarWithRetry();

    if (searchParams?.get("scrollToCalendar") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("scrollToCalendar");
      const qs = params.toString();
      window.setTimeout(() => {
        router.replace(qs ? `/dashboard?${qs}` : "/dashboard", {
          scroll: false,
        });
      }, 350);
    }
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (open) return;
    setItems(initialItems ?? []);
  }, [initialItems, open]);

  async function reloadWaitlistItems() {
    try {
      setLoadingItems(true);
      const response = await fetch("/api/waitlist/count?includeItems=1", {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!response.ok) return;

      const payload = (await response.json()) as {
        items?: WaitlistItem[];
        count?: number;
      };
      if (Array.isArray(payload.items)) {
        setItems(payload.items);
      }
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timeout = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      setShowAdd(false);
      setEditingItem(null);
      setAddHeaderState(null);
      return;
    }
    setShowAdd(openAddForm);
    if (!openAddForm) setEditingItem(null);
  }, [open, openAddForm]);

  useEffect(() => {
    if (!open) return;
    void reloadWaitlistItems();
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const tenantIds = Array.from(
      new Set(
        (items ?? [])
          .map((item) => String(item.tenantId ?? "").trim())
          .filter(Boolean),
      ),
    );

    async function loadPractitionerProfiles() {
      if (tenantIds.length === 0) {
        if (!cancelled) setPractitionerProfiles([]);
        return;
      }

      const { data, error } = await supabaseBrowser()
        .from("user_profiles")
        .select("user_id, tenant_id, full_name, avatar_path, avatar_ring_color")
        .in("tenant_id", tenantIds)
        .eq("is_active", true);

      if (cancelled) return;
      setPractitionerProfiles(
        error ? [] : ((data ?? []) as UserProfileAvatarRow[]),
      );
    }

    void loadPractitionerProfiles();
    return () => {
      cancelled = true;
    };
  }, [items]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1350,
        isolation: "isolate",
      }}
    >
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(16,16,16,0.96) 0%, rgba(10,10,10,0.96) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "white",
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-3">
            <button
              type="button"
              onClick={scrollToDashboardCalendar}
              className={menuIconButtonClass()}
              aria-label="Zum Kalender scrollen"
              title="Zum Kalender scrollen"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!showAdd) {
                  setEditingItem(null);
                  setShowAdd(true);
                  return;
                }
                addHeaderState?.submit?.();
              }}
              disabled={
                showAdd &&
                (!addHeaderState?.canSubmit || addHeaderState?.pending)
              }
              className={
                showAdd
                  ? `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border px-3 text-sm font-semibold transition-colors ${
                      addHeaderState?.canSubmit
                        ? "border-emerald-400/35 bg-emerald-500/16 text-emerald-50 hover:bg-emerald-500/24"
                        : "border-white/10 bg-white/[0.04] text-white/38 cursor-not-allowed"
                    }`
                  : menuIconButtonClass(false)
              }
              aria-label={
                showAdd ? "Zur Warteliste hinzufügen" : "Kunde hinzufügen"
              }
              title={showAdd ? "Zur Warteliste hinzufügen" : "Kunde hinzufügen"}
            >
              {showAdd && addHeaderState?.pending ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
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
              )}
            </button>

            <button type="button" className={passiveMenuButtonClass()} disabled>
              Offene {openCount}
            </button>

            <button
              type="button"
              onClick={close}
              className={menuIconButtonClass(false, true)}
              aria-label="Schließen"
              title="Schließen"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
                  Warteliste
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.95)",
                  }}
                >
                  Aktive Anfragen
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.50)",
                  }}
                >
                  {openCount === 0
                    ? "Aktuell sind keine aktiven Wartelisten-Einträge vorhanden."
                    : `${openCount} aktive Wartelisten-Einträge`}
                </div>
              </div>

              {showAdd && addHeaderState?.selectedTenantLabel ? (
                <div
                  className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_26px_rgba(0,0,0,0.32)]"
                  style={{
                    borderColor: addHeaderState.selectedTenantRingColor,
                  }}
                  title={addHeaderState.selectedTenantLabel}
                >
                  {addHeaderState.selectedTenantAvatarUrl ? (
                    <img
                      src={addHeaderState.selectedTenantAvatarUrl}
                      alt={addHeaderState.selectedTenantLabel}
                      className="h-full w-full object-cover"
                      onError={avatarHideOnError}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/88">
                      {addHeaderState.selectedTenantLabel
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{
                      boxShadow: `inset 0 0 0 2px ${addHeaderState.selectedTenantRingColor}`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="waitlist-slideover-scroll flex-1 overflow-y-auto p-4"
          style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
        >
          {showAdd ? (
            <AddWaitlistCard
              key={editingItem?.id ?? "new"}
              initialItem={editingItem}
              onHeaderStateChange={setAddHeaderState}
              onCancel={() => {
                setShowAdd(false);
                setEditingItem(null);
                setAddHeaderState(null);
              }}
              onDone={() => {
                setShowAdd(false);
                setEditingItem(null);
                setAddHeaderState(null);
                void reloadWaitlistItems();
              }}
            />
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/65">
              {loadingItems
                ? "Warteliste wird geladen..."
                : "Aktuell steht niemand auf der aktiven Warteliste."}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <WaitlistRowCard
                  key={item.id}
                  item={item}
                  practitionerProfiles={practitionerProfiles}
                  onChanged={() => void reloadWaitlistItems()}
                  onEdit={(selectedItem) => {
                    setEditingItem(selectedItem);
                    setShowAdd(true);
                    setAddHeaderState(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
