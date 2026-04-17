"use client";

import { useMemo, useState } from "react";

type LegendUser = {
  tenantId: string;
  filterTenantId: string;
  userId: string;
  fullName: string | null;
  tenantDisplayName: string;
  avatarUrl?: string | null;
  avatarRingColor?: string | null;
};

function tenantTheme(label: string) {
  const n = (label || "").toLowerCase();

  let color = "rgba(255,255,255,0.55)";

  if (n.includes("radu")) color = "#6366F1";
  else if (n.includes("raluca")) color = "#7B1FA2";
  else if (n.includes("alexandra")) color = "#0A8F08";
  else if (n.includes("barbara")) color = "#F57C00";

  return { color };
}

function firstName(full: string | null, fallback: string) {
  const base = (full ?? "").trim() || fallback.trim() || "Behandler";
  return base.split(/\s+/)[0] ?? base;
}

function initials(full: string | null, fallback: string) {
  const base = (full ?? "").trim() || fallback.trim() || "Behandler";
  const parts = base.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

export default function TenantLegendClient({
  users,
  activeTenantId,
  onSelect,
}: {
  users: LegendUser[];
  activeTenantId?: string | null;
  onSelect: (tenantId: string | null) => void;
}) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const items = useMemo(() => {
    const mapped = (users ?? []).map((u) => {
      const label = u.fullName || u.tenantDisplayName || "Behandler";
      const theme = u.avatarRingColor && /^#([0-9a-fA-F]{6})$/.test(u.avatarRingColor)
        ? { color: u.avatarRingColor }
        : tenantTheme(label);

      return {
        ...u,
        label,
        color: theme.color,
        name: firstName(u.fullName, u.tenantDisplayName),
        initials: initials(u.fullName, u.tenantDisplayName),
        imgSrc: (u.avatarUrl && u.avatarUrl.trim()) || `/users/${u.userId}.png`,
        fallbackSrc: `/users/${u.userId}.png`,
      };
    });

    const order = ["radu", "raluca", "alexandra", "barbara"];
    mapped.sort((a, b) => {
      const ai = order.findIndex((k) => a.label.toLowerCase().includes(k));
      const bi = order.findIndex((k) => b.label.toLowerCase().includes(k));
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.label.localeCompare(b.label);
    });

    return mapped;
  }, [users]);

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(null);
        }}
        className="flex flex-col items-center gap-2 transition-opacity opacity-100 hover:opacity-100"
        title="Alle Termine anzeigen"
      >
        <div
          className="relative overflow-hidden rounded-full flex items-center justify-center text-sm font-extrabold"
          style={{
            width: 56,
            height: 56,
            border: "4px solid rgba(255,255,255,0.55)",
            boxShadow: "0 12px 26px rgba(0,0,0,0.32)",
            background: "rgba(255,255,255,0.96)",
            color: "#000",
          }}
        >
          Alle
        </div>

        <div
          className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
            !activeTenantId
              ? "border border-white bg-white text-black"
              : "border border-white/10 bg-black/25 text-white/90"
          }`}
          style={{ backdropFilter: "blur(8px)", lineHeight: 1 }}
        >
          Alle
        </div>
      </button>

      {items.map((it) => {
        const isActive = activeTenantId === it.filterTenantId;

        return (
          <button
            type="button"
            key={it.userId}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(it.filterTenantId);
            }}
            className="flex flex-col items-center gap-2 transition-opacity opacity-100 hover:opacity-100"
            title={`${it.name} anzeigen`}
          >
            <div
              className="relative overflow-hidden rounded-full"
              style={{
                width: 56,
                height: 56,
                border: `4px solid ${it.color}`,
                boxShadow: "0 12px 26px rgba(0,0,0,0.32)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              {broken[it.userId] ? (
                <div className="h-full w-full flex items-center justify-center text-[13px] font-extrabold text-white/90">
                  {it.initials}
                </div>
              ) : (
                <img
                  src={it.imgSrc}
                  alt={it.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    const fallback = it.fallbackSrc;
                    if (img.dataset.fallbackApplied === "1") {
                      setBroken((p) => ({ ...p, [it.userId]: true }));
                      return;
                    }
                    if (img.getAttribute("src") !== fallback) {
                      img.dataset.fallbackApplied = "1";
                      img.src = fallback;
                      return;
                    }
                    setBroken((p) => ({ ...p, [it.userId]: true }));
                  }}
                />
              )}

              <div
                style={{
                  position: "absolute",
                  right: 3,
                  bottom: 3,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: it.color,
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.65)",
                }}
              />
            </div>

            <div
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                isActive
                  ? "border border-white bg-white text-black"
                  : "border border-white/10 bg-black/25 text-white/90"
              }`}
              style={{ backdropFilter: "blur(8px)", lineHeight: 1 }}
              title={it.label}
            >
              {it.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}