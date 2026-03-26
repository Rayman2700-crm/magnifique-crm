"use client";

import { useEffect } from "react";

export default function ScrollToTab({ tab }: { tab?: string }) {
  useEffect(() => {
    if (!tab) return;

    // prefer explicit anchor if present
    if (typeof window !== "undefined" && window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }

    const targetId =
      tab === "appointments"
        ? "appointments"
        : tab === "notes"
          ? "notes"
          : tab === "photos"
            ? "photos"
            : tab === "intake"
              ? "intake"
              : null;

    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab]);

  return null;
}