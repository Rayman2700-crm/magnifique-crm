"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-10 px-3 text-sm",
          "rounded-[16px]",
          "bg-[rgba(255,248,240,0.055)] backdrop-blur-md",
          "border border-white/12",
          "text-[var(--text)] placeholder:text-[var(--text-muted)]",
          "outline-none transition",
          "focus:border-[var(--primary)] focus:ring-1 focus:ring-[rgba(216,193,160,0.55)] focus:bg-white/[0.075]",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
