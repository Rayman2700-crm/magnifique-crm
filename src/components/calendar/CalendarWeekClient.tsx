"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  start_at: string;
  end_at: string;

  // Service / Titel
  title: string;
  note: string;

  // Behandler (Tenant)
  tenantId: string;
  tenantName: string;

  // Kunde
  customerProfileId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
};

function fmtDay(d: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function dayKeyISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function normalizePhoneForTel(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

function normalizePhoneForWhatsApp(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

function buildWhatsAppText(it: Item) {
  const name = it.customerName ?? "";
  const start = new Date(it.start_at);
  const day = new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(start);
  const time = fmtTime(start);
  const service = it.title ? ` (${it.title})` : "";
  return `Hallo ${name}, hier ist Magnifique Beauty Institut. Kurze Erinnerung: Dein Termin am ${day} um ${time}${service}.`;
}

/**
 * Farblogik nach Behandler:
 * Radu = #6366F1
 * Raluca = #6F2DA8
 * Alexandra = #008000
 * Barbara = #F37A48
 */
function tenantTheme(tenantName: string) {
  const n = (tenantName || "").toLowerCase();

  // default fallback
  let bg = "rgba(255,255,255,0.06)";
  let text = "rgba(255,255,255,0.92)";
  let subText = "rgba(255,255,255,0.75)";
  let pillBg = "rgba(255,255,255,0.10)";
  let pillBorder = "rgba(255,255,255,0.15)";

  if (n.includes("radu")) {
    bg = "#E6E6FA";
    text = "#0b0b0c";
    subText = "rgba(11,11,12,0.72)";
    pillBg = "rgba(0,0,0,0.10)";
    pillBorder = "rgba(0,0,0,0.16)";
  } else if (n.includes("raluca")) {
    bg = "#6F2DA8";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    pillBg = "rgba(0,0,0,0.18)";
    pillBorder = "rgba(0,0,0,0.22)";
  } else if (n.includes("alexandra")) {
    bg = "#008000";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
    pillBg = "rgba(0,0,0,0.18)";
    pillBorder = "rgba(0,0,0,0.22)";
  } else if (n.includes("barbara")) {
    bg = "#F37A48";
    text = "#0b0b0c";
    subText = "rgba(11,11,12,0.72)";
    pillBg = "rgba(0,0,0,0.10)";
    pillBorder = "rgba(0,0,0,0.16)";
  }

  return { bg, text, subText, pillBg, pillBorder };
}

function ActionPill({
  children,
  href,
  target,
  rel,
  onClick,
  variant = "dark",
}: {
  children: React.ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  variant?: "dark" | "whatsapp";
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 38,
    padding: "0 14px",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 700,
    userSelect: "none",
    whiteSpace: "nowrap",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  const dark: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
  };

  // WhatsApp grün
  const wa: React.CSSProperties = {
    backgroundColor: "#25D366",
    color: "#0b0b0c",
    border: "1px solid rgba(0,0,0,0.2)",
  };

  const style =
    variant === "whatsapp" ? { ...base, ...wa } : { ...base, ...dark };

  const content = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {children}
    </span>
  );

  if (href) {
    return (
      <a href={href} target={target} rel={rel} style={style}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} style={style}>
      {content}
    </button>
  );
}

type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes?: number | null;
  buffer_minutes?: number | null;
  default_price_cents?: number | null;
  is_active?: boolean | null;
};

export default function CalendarWeekClient({
  weekStartISO,
  items,
  services: _services,
}: {
  weekStartISO: string;
  items: Item[];
  services?: ServiceOption[];
}) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ESC to close
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const { groups, dayKeys, todayKey } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayKey = dayKeyISO(now);

    const groups = new Map<string, Item[]>();
    for (const it of items) {
      const k = it.start_at.slice(0, 10);
      const list = groups.get(k) ?? [];
      list.push(it);
      groups.set(k, list);
    }

    const dayKeys = Array.from(groups.keys()).sort();
    return { groups, dayKeys, todayKey };
  }, [items]);

  const slideOver = selected ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        isolation: "isolate",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={() => setSelected(null)}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Right panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(520px, calc(100vw - 2.5rem))",
          padding: 16,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#0b0b0c",
            opacity: 1,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header: Behandler statt Termin */}
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                Behandler
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.95)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selected.tenantName}
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                Kunde
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.95)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selected.customerName ?? "Unbekannter Kunde"}
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.75)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Service: {selected.title || "—"}
              </div>
            </div>

            <Button variant="secondary" onClick={() => setSelected(null)}>
              Schließen
            </Button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, display: "grid", gap: 14, overflow: "auto" }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.86)", lineHeight: 1.4 }}>
              <div>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Zeit:</span>{" "}
                {fmtTime(new Date(selected.start_at))}–{fmtTime(new Date(selected.end_at))}
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Telefon:</span>{" "}
                {selected.customerPhone ?? "—"}
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>E-Mail:</span>{" "}
                {selected.customerEmail ?? "—"}
              </div>
            </div>

            {selected.note ? (
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.78)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selected.note}
              </div>
            ) : null}

            {/* Actions: oben CRM, unten Kontakt */}
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selected.customerProfileId ? (
                  <Link href={`/customers/${selected.customerProfileId}?tab=appointments#appointments`}>
                    <Button>Zum Kundenprofil</Button>
                  </Link>
                ) : (
                  <Button variant="secondary" disabled>
                    Kundenprofil nicht zugeordnet
                  </Button>
                )}
              </div>

              {/* Kontakt-Reihe: WhatsApp (grün) + Anrufen + E-Mail */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selected.customerPhone ? (
                  <ActionPill
                    variant="whatsapp"
                    href={`https://wa.me/${normalizePhoneForWhatsApp(selected.customerPhone)}?text=${encodeURIComponent(
                      buildWhatsAppText(selected)
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </ActionPill>
                ) : (
                  <ActionPill variant="whatsapp" onClick={() => {}}>
                    WhatsApp
                  </ActionPill>
                )}

                {selected.customerPhone ? (
                  <ActionPill href={`tel:${normalizePhoneForTel(selected.customerPhone)}`}>
                    Anrufen
                  </ActionPill>
                ) : (
                  <ActionPill onClick={() => {}}>Anrufen</ActionPill>
                )}

                {selected.customerEmail ? (
                  <ActionPill href={`mailto:${selected.customerEmail}`}>E-Mail</ActionPill>
                ) : (
                  <ActionPill onClick={() => {}}>E-Mail</ActionPill>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              Tipp: ESC schließt dieses Fenster.
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (items.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="text-white/70">Keine Termine in dieser Woche.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {dayKeys.map((k) => {
          const list = groups.get(k) ?? [];
          const d = new Date(k + "T00:00:00");
          const isToday = k === todayKey;

          return (
            <Card
              key={k}
              className={
                isToday
                  ? "border-white/20 bg-[var(--surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }
            >
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white">{fmtDay(d)}</div>
                    {isToday ? (
                      <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                        HEUTE
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-white/50">{list.length} Termin(e)</div>
                </div>

                <div className="space-y-2">
                  {list.map((it) => {
                    const start = new Date(it.start_at);
                    const end = new Date(it.end_at);
                    const theme = tenantTheme(it.tenantName);

                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setSelected(it)}
                        className="w-full text-left rounded-xl border border-[var(--border)] px-4 py-3 transition"
                        style={{
                          backgroundColor: theme.bg,
                          color: theme.text,
                        }}
                        title="Details öffnen"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm">
                              <span className="font-semibold">
                                {fmtTime(start)}–{fmtTime(end)}
                              </span>
                            </div>

                            <div className="mt-1 text-base font-semibold truncate">
                              {it.title}
                            </div>

                            {it.note ? (
                              <div
                                className="mt-1 text-sm line-clamp-2"
                                style={{ color: theme.subText }}
                              >
                                {it.note}
                              </div>
                            ) : null}
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-xs" style={{ color: theme.subText }}>
                              Behandler
                            </div>
                            <div
                              className="mt-0.5 rounded-full px-2 py-1 text-xs font-semibold"
                              style={{
                                backgroundColor: theme.pillBg,
                                border: `1px solid ${theme.pillBorder}`,
                                color: theme.text,
                              }}
                            >
                              {it.tenantName}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {mounted && typeof document !== "undefined"
        ? createPortal(slideOver, document.body)
        : null}
    </>
  );
}