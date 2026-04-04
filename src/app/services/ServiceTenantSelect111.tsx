'use client';

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
    <form action={setActiveServiceTenant}>
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
  );
}
