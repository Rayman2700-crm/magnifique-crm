'use client';

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { setActiveServiceTenant } from "./actions";

type TenantOption = {
  id: string;
  display_name: string | null;
  shortLabel?: string;
  ringColor?: string;
  displayLabel?: string;
  user_id?: string | null;
};

function chipClassName(isActive: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition whitespace-nowrap",
    isActive
      ? "border-white bg-white text-black"
      : "border-white/10 bg-black/20 text-white hover:bg-white/10",
  ].join(" ");
}

function getLegendInitials(name: string | null | undefined, fallback = "?") {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function MobileTenantPicker({
  tenantOptions,
  selectedTenantId,
}: {
  tenantOptions: TenantOption[];
  selectedTenantId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [panelRight, setPanelRight] = useState(12);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelTop(Math.round(rect.bottom + 12));
      setPanelRight(Math.max(12, Math.round(window.innerWidth - rect.right)));
    };

    updatePosition();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.body.style.overflow = "";
    };
  }, [open]);

  const activeUser =
    selectedTenantId === null
      ? null
      : tenantOptions.find((tenant) => tenant.id === selectedTenantId) ?? null;

  const ringColors = [
    "#d6c3a3",
    ...tenantOptions.map((tenant) => tenant.ringColor ?? "rgba(255,255,255,0.35)"),
  ];

  const ringBackground = useMemo(() => {
    const step = 100 / ringColors.length;
    return `conic-gradient(${ringColors
      .map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`)
      .join(", ")})`;
  }, [ringColors]);

  const avatarLabel = activeUser
    ? getLegendInitials(activeUser.displayLabel ?? activeUser.display_name, activeUser.shortLabel ?? "TC")
    : "TC";

  const totalCount = tenantOptions.length + 1;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full md:hidden"
        aria-label="Behandler auswählen"
        aria-expanded={open}
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-[#111216] bg-[#0f1013] text-[12px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {avatarLabel}
        </span>

        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeUser ? "1" : totalCount}
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Behandler-Auswahl schließen"
                className="fixed inset-0 z-[120] bg-[rgba(0,0,0,0.45)] backdrop-blur-[2px] md:hidden"
                onClick={() => setOpen(false)}
              />

              <div
                className="fixed z-[121] w-[min(320px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl md:hidden"
                style={{ top: panelTop, right: panelRight, maxHeight: "min(70vh, 520px)" }}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Behandler wählen</div>
                    <div className="mt-0.5 text-xs text-white/45">Dienstleistungen filtern</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/70"
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                </div>

                <form action={setActiveServiceTenant} className="grid max-h-[calc(min(70vh,520px)-56px)] gap-2 overflow-y-auto pr-1">
                  <button
                    type="submit"
                    name="tenant"
                    value="all"
                    className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                    style={{
                      borderColor: selectedTenantId === null ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                      backgroundColor: selectedTenantId === null ? "rgba(214,195,163,0.14)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-black">
                        Alle
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">Alle</div>
                        <div className="truncate text-xs text-white/50">Alle Behandler</div>
                      </div>
                    </div>
                    {selectedTenantId === null ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                  </button>

                  {tenantOptions.map((tenant) => {
                    const selected = selectedTenantId === tenant.id;
                    const ring = tenant.ringColor ?? "rgba(255,255,255,0.35)";
                    return (
                      <button
                        key={tenant.id}
                        type="submit"
                        name="tenant"
                        value={tenant.id}
                        className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                        style={{
                          borderColor: selected ? `${ring}66` : "rgba(255,255,255,0.10)",
                          backgroundColor: selected ? `${ring}22` : "rgba(255,255,255,0.04)",
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white"
                            style={{ borderColor: ring }}
                          >
                            {tenant.user_id ? (
                              <img
                                src={`/users/${tenant.user_id}.png`}
                                alt={tenant.displayLabel ?? tenant.display_name ?? tenant.id}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              tenant.shortLabel ?? getLegendInitials(tenant.displayLabel ?? tenant.display_name, "?")
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {tenant.displayLabel ?? tenant.display_name ?? tenant.id}
                            </div>
                            <div className="truncate text-xs text-white/50">{tenant.display_name ?? tenant.id}</div>
                          </div>
                        </div>
                        {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                      </button>
                    );
                  })}
                </form>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}

export default function ServiceTenantSelect({
  tenantOptions,
  selectedTenantId,
  isAdmin,
  fallbackLabel,
}: {
  tenantOptions: TenantOption[];
  selectedTenantId: string | null;
  isAdmin: boolean;
  fallbackLabel: string;
}) {
  if (!isAdmin) {
    return <div className="text-base font-semibold text-[var(--text)]">{fallbackLabel}</div>;
  }

  return (
    <>
      <div className="md:hidden">
        <MobileTenantPicker tenantOptions={tenantOptions} selectedTenantId={selectedTenantId} />
      </div>

      <form action={setActiveServiceTenant} className="hidden md:block">
        <div className="flex flex-nowrap items-start gap-4">
          <button
            type="submit"
            name="tenant"
            value="all"
            className="inline-flex flex-col items-center gap-2 shrink-0"
          >
            <span className="relative overflow-hidden rounded-full flex h-11 w-11 items-center justify-center border border-white/10 bg-white text-sm font-extrabold text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              Alle
            </span>
            <span className={chipClassName(!selectedTenantId)}>
              Alle
            </span>
          </button>

          {tenantOptions.map((tenant) => {
            const isActive = selectedTenantId === tenant.id;

            return (
              <button
                key={tenant.id}
                type="submit"
                name="tenant"
                value={tenant.id}
                className="inline-flex flex-col items-center gap-2 shrink-0"
                title={tenant.display_name ?? tenant.id}
              >
                <span
                  className="relative overflow-hidden rounded-full shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    border: `3px solid ${tenant.ringColor ?? "rgba(255,255,255,0.2)"}`,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {tenant.user_id ? (
                    <img
                      src={`/users/${tenant.user_id}.png`}
                      alt={tenant.displayLabel ?? tenant.display_name ?? tenant.id}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                      {tenant.shortLabel ?? (tenant.display_name ?? tenant.id).slice(0, 2).toUpperCase()}
                    </span>
                  )}

                  <span
                    style={{
                      position: "absolute",
                      right: 3,
                      bottom: 3,
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      backgroundColor: tenant.ringColor ?? "#ffffff",
                      boxShadow: "0 0 0 2px rgba(0,0,0,0.65)",
                    }}
                  />
                </span>

                <span className={chipClassName(isActive)}>
                  {tenant.displayLabel ?? tenant.display_name ?? tenant.id}
                </span>
              </button>
            );
          })}
        </div>
      </form>
    </>
  );
}
