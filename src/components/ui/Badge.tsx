import { cn } from "@/lib/cn";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-1 text-xs font-medium rounded-full",
        "bg-[var(--accent-soft)] text-[var(--primary)]",
        className
      )}
    >
      {children}
    </span>
  );
}