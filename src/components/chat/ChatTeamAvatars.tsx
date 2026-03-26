"use client";

import { useEffect, useMemo, useState } from "react";

type ChatUser = {
  userId: string;
  fullName: string;
};

function tenantTheme(label: string) {
  const n = (label || "").toLowerCase();

  let color = "rgba(255,255,255,0.55)";

  if (n.includes("radu")) color = "#6366F1";
  else if (n.includes("raluca")) color = "#6F2DA8";
  else if (n.includes("alexandra")) color = "#008000";
  else if (n.includes("barbara")) color = "#F37A48";

  return { color };
}

function firstName(full: string) {
  const base = (full ?? "").trim() || "Behandler";
  return base.split(/\s+/)[0] ?? base;
}

function initials(full: string) {
  const base = (full ?? "").trim() || "Behandler";
  const parts = base.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

export default function ChatTeamAvatars() {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const res = await fetch("/api/chat/users", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const rows = Array.isArray(json?.users) ? json.users : [];

        const mapped: ChatUser[] = rows
          .filter((row: any) => row?.userId && row?.fullName)
          .map((row: any) => ({
            userId: String(row.userId),
            fullName: String(row.fullName),
          }));

        const order = ["radu", "raluca", "alexandra", "barbara"];
        mapped.sort((a, b) => {
          const ai = order.findIndex((k) => a.fullName.toLowerCase().includes(k));
          const bi = order.findIndex((k) => b.fullName.toLowerCase().includes(k));
          if (ai !== -1 || bi !== -1) {
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          }
          return a.fullName.localeCompare(b.fullName, "de");
        });

        if (!cancelled) {
          setUsers(mapped);
        }
      } catch (error) {
        console.error("[chat-team-avatars] load failed", error);
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    return users.map((u) => {
      const theme = tenantTheme(u.fullName);

      return {
        ...u,
        color: theme.color,
        name: firstName(u.fullName),
        initials: initials(u.fullName),
        imgSrc: `/users/${u.userId}.png`,
      };
    });
  }, [users]);

  function handleMention(user: ChatUser) {
    window.dispatchEvent(
      new CustomEvent("chat:mention-user", {
        detail: {
          userId: user.userId,
          fullName: user.fullName,
        },
      })
    );
  }

  if (!items.length) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {items.map((it) => {
        return (
          <button
            key={it.userId}
            type="button"
            onClick={() => handleMention(it)}
            title={`${it.fullName} erwähnen`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 36,
                height: 36,
                borderRadius: "999px",
                overflow: "hidden",
                border: `3px solid ${it.color}`,
                boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
                background: "rgba(255,255,255,0.04)",
                transition: "transform 140ms ease, box-shadow 140ms ease",
              }}
            >
              {broken[it.userId] ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  {it.initials}
                </div>
              ) : (
                <img
                  src={it.imgSrc}
                  alt={it.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={() =>
                    setBroken((prev) => ({ ...prev, [it.userId]: true }))
                  }
                />
              )}

              <div
                style={{
                  position: "absolute",
                  right: 2,
                  bottom: 2,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: it.color,
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.7)",
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}