"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "accent";

type Size = "sm" | "md" | "lg" | "icon" | "pill";

const base =
  "inline-flex items-center justify-center font-medium transition-all duration-150 " +
  "focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none " +
  "whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] border border-[var(--primary)] " +
    "hover:opacity-90 active:scale-[0.98] " +
    "shadow-[0_4px_20px_rgba(214,195,163,0.25)]",

  secondary:
    "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] " +
    "hover:bg-white/10 active:bg-white/15",

  ghost:
    "bg-white/5 text-[var(--text)] border border-white/15 " +
    "hover:bg-white/10 active:bg-white/15",

  danger:
    "bg-red-500/12 text-red-200 border border-red-400/25 " +
    "hover:bg-red-500/18 active:bg-red-500/22",

  success:
    "bg-emerald-600/80 text-white border border-emerald-500/30 " +
    "hover:bg-emerald-600 active:bg-emerald-700/90",

  accent:
    "bg-fuchsia-400/10 text-fuchsia-100 border border-fuchsia-400/20 " +
    "hover:bg-fuchsia-400/15 active:bg-fuchsia-400/20",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-[14px]",
  md: "h-10 px-4 text-sm rounded-[16px]",
  lg: "h-11 px-5 text-base rounded-[18px]",
  icon: "h-9 w-9 rounded-[16px] p-0",
  pill: "h-8 px-3 text-xs rounded-full",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      type = "button",
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          base,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
