"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center font-medium transition-all duration-150 " +
  "focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] " +
    "hover:opacity-90 active:scale-[0.98] " +
    "shadow-[0_4px_20px_rgba(214,195,163,0.25)]",

  secondary:
    "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] " +
    "hover:bg-white/10 active:bg-white/15",

  ghost:
    "bg-transparent text-[var(--text)] " +
    "hover:bg-white/10 active:bg-white/15",

  danger:
    "bg-red-600 text-white hover:bg-red-600/90 active:bg-red-600/80",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-[14px]",
  md: "h-10 px-4 text-sm rounded-[16px]",
  lg: "h-11 px-5 text-base rounded-[18px]",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";