"use client";

import { useEffect, useMemo, useState } from "react";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatClock(date: Date, showSeconds: boolean) {
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());

  if (!showSeconds) {
    return `${hh}:${mm}`;
  }

  const ss = pad2(date.getSeconds());
  return `${hh}:${mm}:${ss}`;
}

export default function LiveClockCard({
  showSeconds = false,
}: {
  showSeconds?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const tick = () => {
      setNow((prev) => {
        const next = new Date();
        const changed = showSeconds
          ? next.getSeconds() !== prev.getSeconds()
          : next.getMinutes() !== prev.getMinutes();

        if (changed) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 260);
        }

        return next;
      });
    };

    tick();

    const intervalMs = showSeconds ? 1000 : 1000;
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [showSeconds]);

  const timeLabel = useMemo(() => formatClock(now, showSeconds), [now, showSeconds]);

  return (
    <div className="flex flex-col items-end justify-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
        Live Uhr
      </div>
      <div
        className={[
          "mt-1 inline-flex items-center rounded-2xl border px-4 py-2",
          "border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
          "transition-all duration-300",
          flash ? "scale-[1.03] border-white/20 bg-white/[0.06]" : "",
        ].join(" ")}
      >
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
        <span className="text-[24px] font-semibold leading-none tracking-[0.03em] text-white/92 md:text-[26px]">
          {timeLabel}
        </span>
      </div>
    </div>
  );
}
