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
    "bg-[var(--primary)] text-[var(--primary-foreground)] border border-[rgba(216,193,160,0.72)] " +
    "hover:opacity-95 active:scale-[0.98] " +
    "shadow-[0_10px_28px_rgba(216,193,160,0.24)]",

  secondary:
    "bg-[rgba(255,248,240,0.06)] text-[var(--text)] border border-white/12 backdrop-blur-md " +
    "hover:bg-white/10 active:bg-white/14",

  ghost:
    "bg-white/5 text-[var(--text)] border border-white/15 backdrop-blur-md " +
    "hover:bg-white/10 active:bg-white/15",

  danger:
    "bg-red-500/12 text-red-100 border border-red-400/25 backdrop-blur-md " +
    "hover:bg-red-500/18 active:bg-red-500/22",

  success:
    "bg-[rgba(168,146,112,0.8)] text-[#fffaf3] border border-[rgba(226,203,170,0.34)] shadow-[0_10px_24px_rgba(168,146,112,0.18)] " +
    "hover:bg-[rgba(168,146,112,0.9)] active:bg-[rgba(145,123,92,0.92)]",

  accent:
    "bg-[rgba(125,98,74,0.18)] text-[#f3e6d6] border border-[rgba(214,193,160,0.2)] backdrop-blur-md " +
    "hover:bg-[rgba(125,98,74,0.24)] active:bg-[rgba(125,98,74,0.28)]",
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
