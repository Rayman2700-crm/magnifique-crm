"use client";

import { setActiveServiceTenant } from "./actions";

type TenantOption = {
  id: string;
  display_name: string | null;
  shortLabel?: string;
  ringClassName?: string;
};

function chipClassName(isActive: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
    isActive
      ? "border-white bg-white text-black"
      : "border-white/10 bg-black/20 text-white hover:bg-white/10",
  ].join(" ");
}

function avatarClassName(ringClassName?: string, isAll?: boolean) {
  if (isAll) {
    return "flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white text-sm font-bold text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]";
  }

  return [
    "flex h-11 w-11 items-center justify-center rounded-full border-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
    ringClassName ?? "border-white/20",
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
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="submit"
          name="tenant"
          value="all"
          className="flex flex-col items-center gap-2"
        >
          <span className={avatarClassName(undefined, true)}>
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
              className="flex flex-col items-center gap-2"
            >
              <span className={avatarClassName(tenant.ringClassName)}>
                {tenant.shortLabel ?? (tenant.display_name ?? tenant.id).slice(0, 2).toUpperCase()}
              </span>
              <span className={chipClassName(isActive)}>
                {tenant.display_name ?? tenant.id}
              </span>
            </button>
          );
        })}
      </div>
    </form>
  );
}
