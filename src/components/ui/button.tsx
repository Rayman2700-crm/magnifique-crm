"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center rounded-lg font-medium transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-white text-black hover:bg-white/90 active:bg-white/85 shadow-sm",
  secondary:
    "bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border)] hover:bg-white/10 active:bg-white/15",
  ghost: "bg-transparent text-[var(--foreground)] hover:bg-white/10 active:bg-white/15",
  danger: "bg-red-600 text-white hover:bg-red-600/90 active:bg-red-600/85 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
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