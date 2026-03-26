"use client";

import { useEffect, useMemo, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

type Props = {
  compact?: boolean;
};

export default function PushSetupClient({ compact }: Props) {
  const vapidPublicKey = useMemo(
    () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    []
  );

  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncSubscriptionToServer(subscription: PushSubscription) {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscription),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Push-Synchronisierung fehlgeschlagen");
    }
  }

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setSupported(ok);
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
  }, []);

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();

        if (cancelled) return;

        if (sub && Notification.permission === "granted") {
          await syncSubscriptionToServer(sub);
          setEnabled(true);
        } else {
          setEnabled(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Push-Status konnte nicht geprüft werden");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enablePush() {
    setError(null);

    if (!supported) return;

    if (!vapidPublicKey) {
      setError("VAPID Public Key fehlt (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      return;
    }

    setBusy(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setEnabled(false);
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");

      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      await syncSubscriptionToServer(subscription);
      setEnabled(true);
    } catch (e: any) {
      setError(e?.message ?? "Push konnte nicht aktiviert werden");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  if (compact) {
    const blocked = permission === "denied";

    const label = enabled
      ? "Push aktiv"
      : blocked
        ? "Push blockiert"
        : busy
          ? "Aktiviere…"
          : "Push aktivieren";

    const background = enabled
      ? "#15803d"
      : blocked
        ? "#991b1b"
        : "#171717";

    const border = enabled
      ? "1px solid rgba(34,197,94,0.35)"
      : blocked
        ? "1px solid rgba(248,113,113,0.30)"
        : "1px solid rgba(255,255,255,0.12)";

    const color = "#ffffff";

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={enablePush}
          disabled={busy || enabled || blocked}
          title={
            enabled
              ? "Push-Benachrichtigungen sind aktiv"
              : blocked
                ? "Benachrichtigungen sind im Browser blockiert"
                : "Push-Benachrichtigungen aktivieren"
          }
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 999,
            background,
            border,
            color,
            fontSize: 13,
            fontWeight: 700,
            opacity: busy ? 0.8 : 1,
            cursor: busy || enabled || blocked ? "default" : "pointer",
            transition: "all 160ms ease",
            boxShadow: enabled ? "0 0 18px rgba(34,197,94,0.18)" : "none",
          }}
        >
          {label}
        </button>

        {error ? (
          <div className="max-w-[220px] text-xs text-red-300">{error}</div>
        ) : null}
      </div>
    );
  }

  const showHintIOS =
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !(window as any).navigator?.standalone;

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Push-Benachrichtigungen</div>
          <div className="text-xs text-white/70">
            {enabled
              ? "Aktiv – du bekommst jetzt bei jeder Team-Nachricht eine Benachrichtigung."
              : permission === "denied"
                ? "In deinem Browser sind Benachrichtigungen blockiert."
                : "Aktiviere Push, damit du jede neue Team-Nachricht sofort siehst."}
          </div>

          {showHintIOS ? (
            <div className="mt-1 text-xs text-white/60">
              iPhone Tipp: Safari → Teilen → Zum Home-Bildschirm hinzufügen.
            </div>
          ) : null}

          {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
        </div>

        <button
          type="button"
          onClick={enablePush}
          disabled={busy || permission === "denied"}
          className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50 sm:mt-0"
        >
          {enabled ? "Aktiv" : busy ? "Aktiviere…" : "Push aktivieren"}
        </button>
      </div>
    </div>
  );
}