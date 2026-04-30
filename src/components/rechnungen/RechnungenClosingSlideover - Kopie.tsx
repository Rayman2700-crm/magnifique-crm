"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ClosingSnapshotReceipt = {
  receiptNumber: string | null;
  issuedAt: string | null;
  customerName: string | null;
  paymentMethodLabel: string | null;
  amountCents: number;
  isStorno: boolean;
};

type ClosingGroupSummary = {
  key: string;
  tenantId: string | null;
  cashRegisterId: string | null;
  providerName: string | null;
  receiptCount: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  totalCents: number;
  stornoCount: number;
  stornoCents: number;
  latestIssuedAt: string | null;
  receipts: ClosingSnapshotReceipt[];
};

type ClosingTotals = {
  receiptCount: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  totalCents: number;
  stornoCount: number;
  stornoCents: number;
};

function euroFromCents(value: number | null | undefined, currencyCode?: string | null) {
  if (typeof value !== "number") return "—";
  const abs = Math.abs(value) / 100;
  const formatted = new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode || "EUR",
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

const BUSINESS_TIME_ZONE = "Europe/Vienna";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonthLabel(value: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "—";
  const [, year, month] = match;
  const monthIndex = Number(month) - 1;
  const date = new Date(Number(year), monthIndex, 1);
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(date);
}

function closeQuery(pathname: string, searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("closingPanel");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function panelHref(
  pathname: string,
  searchParams: URLSearchParams,
  nextDate: string
) {
  const next = new URLSearchParams(searchParams.toString());
  if (nextDate) next.set("closingDate", nextDate);
  else next.delete("closingDate");
  next.set("closingPanel", "day");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function ClosingPdfButton({
  periodType,
  mode,
  practitioner,
  closingDate,
  generatedByName,
  generatedAt,
  snapshot,
  label,
  className,
}: {
  periodType: "day" | "month" | "year";
  mode: "all" | "single";
  practitioner: string;
  closingDate: string;
  generatedByName: string;
  generatedAt: string;
  snapshot: Record<string, unknown>;
  label: string;
  className: string;
}) {
  return (
    <form
      action="/api/rechnungen/daily-closing-pdf"
      method="post"
      target="_blank"
      className="w-full"
    >
      <input type="hidden" name="periodType" value={periodType} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="practitioner" value={practitioner} />
      <input type="hidden" name="closingDate" value={closingDate} />
      <input type="hidden" name="generatedByName" value={generatedByName} />
      <input type="hidden" name="generatedAt" value={generatedAt} />
      <input type="hidden" name="snapshot" value={JSON.stringify(snapshot)} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "neutral" | "green" | "amber" | "red" | "blue";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : tone === "amber"
        ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
        : tone === "red"
          ? "border-red-400/25 bg-red-500/10 text-red-200"
          : tone === "blue"
            ? "border-sky-400/25 bg-sky-500/10 text-sky-200"
            : "border-white/10 bg-white/5 text-white/75";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

export default function RechnungenClosingSlideover({
  qRaw,
  currentFilter,
  practitionerFilter,
  closingDate,
  closingMonth,
  closingYear,
  generatedByName,
  generatedAtIso,
  dailyClosingTotals,
  dailyClosingGroups,
  monthlyClosingTotals,
  monthlyClosingGroups,
  yearlyClosingTotals,
  yearlyClosingGroups,
}: {
  qRaw: string;
  currentFilter: string;
  practitionerFilter: string;
  closingDate: string;
  closingMonth: string;
  closingYear: string;
  generatedByName: string;
  generatedAtIso: string;
  dailyClosingTotals: ClosingTotals;
  dailyClosingGroups: ClosingGroupSummary[];
  monthlyClosingTotals: ClosingTotals;
  monthlyClosingGroups: ClosingGroupSummary[];
  yearlyClosingTotals: ClosingTotals;
  yearlyClosingGroups: ClosingGroupSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const panel = useMemo(() => {
    const raw = String(searchParams?.get("closingPanel") ?? "").trim().toLowerCase();
    return raw === "day" || raw === "month" || raw === "year" ? raw : "";
  }, [searchParams]);

  const closeHref = useMemo(
    () => closeQuery(pathname, new URLSearchParams(searchParams?.toString() ?? "")),
    [pathname, searchParams]
  );

  const config = useMemo(() => {
    if (panel === "month") {
      return {
        eyebrow: "Monatsabschluss",
        title: "Monatsübersicht",
        description: "Alle sichtbaren Kassen für den ausgewählten Monat kompakt im Slideover.",
        periodValue: formatMonthLabel(closingMonth),
        periodInputValue: closingMonth,
        periodSubtext: "Automatisch aus Tagesdatum",
        periodLabel: "Monat",
        periodType: "month" as const,
        totals: monthlyClosingTotals,
        groups: monthlyClosingGroups,
        accentBorder: "rgba(56,189,248,0.22)",
        accentBg: "rgba(14,116,144,0.12)",
        accentText: "rgba(224,242,254,0.96)",
        pdfLabel: "Monatsabschluss drucken / PDF",
      };
    }

    if (panel === "year") {
      return {
        eyebrow: "Jahresabschluss",
        title: "Jahresübersicht",
        description: "Gesamtblick auf das laufende Jahr für alle sichtbaren Kassen.",
        periodValue: closingYear,
        periodInputValue: closingYear,
        periodSubtext: "Automatisch aus Tagesdatum",
        periodLabel: "Jahr",
        periodType: "year" as const,
        totals: yearlyClosingTotals,
        groups: yearlyClosingGroups,
        accentBorder: "rgba(168,85,247,0.24)",
        accentBg: "rgba(109,40,217,0.14)",
        accentText: "rgba(243,232,255,0.96)",
        pdfLabel: "Jahresabschluss drucken / PDF",
      };
    }

    return {
      eyebrow: "Kassenabschluss / Tagesabschluss",
      title: "Tagesübersicht",
      description: "Bezahlte Belege, Zahlungsarten und Stornos für den gewählten Business-Tag.",
      periodValue: closingDate,
      periodInputValue: closingDate,
      periodSubtext: "Business-Tag Europe/Vienna",
      periodLabel: "Datum",
      periodType: "day" as const,
      totals: dailyClosingTotals,
      groups: dailyClosingGroups,
      accentBorder: "rgba(245,158,11,0.26)",
      accentBg: "rgba(146,64,14,0.28)",
      accentText: "rgba(255,251,235,0.96)",
      pdfLabel: "Tagesabschluss drucken / PDF",
    };
  }, [
    panel,
    closingDate,
    closingMonth,
    closingYear,
    dailyClosingGroups,
    dailyClosingTotals,
    monthlyClosingGroups,
    monthlyClosingTotals,
    yearlyClosingGroups,
    yearlyClosingTotals,
  ]);

  if (!mounted || !panel || typeof document === "undefined") return null;

  const handleClose = () => {
    router.replace(closeHref, { scroll: false });
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1400 }}>
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.68)",
          backdropFilter: "blur(6px)",
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
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.96), rgba(10,10,10,0.96))",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>{config.eyebrow}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>{config.title}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.46)" }}>
              {config.description}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        <div
          className="hide-scrollbar"
          style={{ padding: 16, overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="space-y-4">
            <div
              className="rounded-[18px] border px-4 py-4"
              style={{
                borderColor: config.accentBorder,
                background: config.accentBg,
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: config.accentText }}>
                {config.eyebrow}
              </div>
              <div className="mt-2 text-xl font-bold text-white">{config.periodValue}</div>
              <div className="mt-2 text-sm text-white/70">
                {config.totals.receiptCount} Belege · {config.totals.stornoCount} Stornos · {config.groups.length} Kassen
              </div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4">
              {panel === "day" ? (
                <>
                  <div className="text-xs uppercase tracking-[0.14em] text-white/45">Datum</div>
                  <input
                    type="date"
                    defaultValue={closingDate}
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                    onChange={(event) => {
                      const href = panelHref(pathname, new URLSearchParams(searchParams?.toString() ?? ""), event.currentTarget.value);
                      router.replace(href, { scroll: false });
                    }}
                  />
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-[0.14em] text-white/45">{config.periodLabel}</div>
                  <div className="mt-2 text-base font-semibold text-white">{config.periodValue}</div>
                  <div className="mt-1 text-sm text-white/55">{config.periodSubtext}</div>
                </>
              )}
            </div>

            {config.groups.length > 0 ? (
              <ClosingPdfButton
                periodType={config.periodType}
                mode="all"
                practitioner={practitionerFilter}
                closingDate={config.periodInputValue}
                generatedByName={generatedByName}
                generatedAt={generatedAtIso}
                snapshot={{
                  summary: {
                    closingDate: config.periodInputValue,
                    receiptCount: config.totals.receiptCount,
                    cashCents: config.totals.cashCents,
                    cardCents: config.totals.cardCents,
                    transferCents: config.totals.transferCents,
                    totalCents: config.totals.totalCents,
                    stornoCount: config.totals.stornoCount,
                    stornoCents: config.totals.stornoCents,
                  },
                  groups: config.groups,
                }}
                label={config.pdfLabel}
                className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-emerald-500/30 bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-white/45">Bezahlt gesamt</div>
                <div className="mt-2 text-xl font-bold text-white">{euroFromCents(config.totals.totalCents, "EUR")}</div>
                <div className="mt-1 text-sm text-white/55">{config.totals.receiptCount} Belege</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-white/45">Karte / Bar</div>
                <div className="mt-2 text-xl font-bold text-white">
                  {euroFromCents(config.totals.cardCents, "EUR")} · {euroFromCents(config.totals.cashCents, "EUR")}
                </div>
                <div className="mt-1 text-sm text-white/55">Überweisung {euroFromCents(config.totals.transferCents, "EUR")}</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-white/45">Stornos</div>
                <div className="mt-2 text-xl font-bold text-white">{config.totals.stornoCount}</div>
                <div className="mt-1 text-sm text-white/55">{euroFromCents(config.totals.stornoCents, "EUR")} storniertes Volumen</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-white/45">Kassen</div>
                <div className="mt-2 text-xl font-bold text-white">{config.groups.length}</div>
                <div className="mt-1 text-sm text-white/55">Sichtbare Kassen</div>
              </div>
            </div>

            {config.groups.length > 0 ? (
              <div className="space-y-3">
                {config.groups.map((group) => (
                  <div key={`${config.periodType}-${group.key}`} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-white">{group.providerName || "Behandler"}</div>
                        <div className="mt-1 text-xs text-white/50">
                          {group.cashRegisterId ? `Kassa ${shortId(group.cashRegisterId)}` : "Kassa noch nicht zugeordnet"}
                        </div>
                        <div className="mt-1 text-xs text-white/45">Letzte Buchung: {formatDateTime(group.latestIssuedAt)}</div>
                      </div>
                      <Badge tone={group.stornoCount > 0 ? "amber" : "green"}>
                        {group.receiptCount} Belege · {group.stornoCount} Stornos
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/45">Bar</div>
                        <div className="mt-1 text-base font-bold text-white">{euroFromCents(group.cashCents, "EUR")}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/45">Karte</div>
                        <div className="mt-1 text-base font-bold text-white">{euroFromCents(group.cardCents, "EUR")}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/45">Überweisung</div>
                        <div className="mt-1 text-base font-bold text-white">{euroFromCents(group.transferCents, "EUR")}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-emerald-200/70">Gesamt</div>
                        <div className="mt-1 text-base font-bold text-white">{euroFromCents(group.totalCents, "EUR")}</div>
                      </div>
                    </div>

                    {group.stornoCount > 0 ? (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                        Storno-Volumen: {euroFromCents(group.stornoCents, "EUR")}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <ClosingPdfButton
                        periodType={config.periodType}
                        mode="single"
                        practitioner={practitionerFilter}
                        closingDate={config.periodInputValue}
                        generatedByName={generatedByName}
                        generatedAt={generatedAtIso}
                        snapshot={{
                          summary: {
                            closingDate: config.periodInputValue,
                            receiptCount: group.receiptCount,
                            cashCents: group.cashCents,
                            cardCents: group.cardCents,
                            transferCents: group.transferCents,
                            totalCents: group.totalCents,
                            stornoCount: group.stornoCount,
                            stornoCents: group.stornoCents,
                          },
                          groups: [group],
                        }}
                        label="Diesen Abschluss drucken / PDF"
                        className="inline-flex h-11 w-full items-center justify-center rounded-[16px] border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                Für diese Auswahl gibt es aktuell keine bezahlten oder stornierten Fiscal-Belege.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
