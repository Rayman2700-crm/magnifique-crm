import type React from "react";

export default function ActionPill({
  children,
  href,
  target,
  rel,
  onClick,
  variant = "dark",
  disabled = false,
}: {
  children: React.ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  variant?: "dark" | "whatsapp";
  disabled?: boolean;
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
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };

  const dark: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
  };

  const wa: React.CSSProperties = {
    backgroundColor: "#25D366",
    color: "#0b0b0c",
    border: "1px solid rgba(0,0,0,0.2)",
  };

  const style = variant === "whatsapp" ? { ...base, ...wa } : { ...base, ...dark };

  if (href && !disabled) {
    return (
      <a href={href} target={target} rel={rel} style={style}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} style={style} disabled={disabled}>
      {children}
    </button>
  );
}