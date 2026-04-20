import { cn } from "@/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "clientique-card rounded-[28px] border border-[rgba(214,195,163,0.14)]",
        "bg-[linear-gradient(180deg,rgba(255,250,244,0.06)_0%,rgba(255,248,240,0.024)_100%)] shadow-[0_26px_84px_rgba(0,0,0,0.34)] backdrop-blur-[18px]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-5 pt-5 pb-2 text-sm text-[var(--text-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3.5 pb-3.5",
        className
      )}
      {...props}
    />
  );
}
