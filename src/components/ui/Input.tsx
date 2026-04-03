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
          "bg-[var(--surface-2)]",
          "border border-[var(--border)]",
          "text-[var(--text)] placeholder:text-[var(--text-muted)]",
          "outline-none transition",
          "focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";