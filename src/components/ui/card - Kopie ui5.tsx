import { cn } from "@/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "clientique-card rounded-[30px] border border-[rgba(214,195,163,0.16)]",
        "bg-[linear-gradient(180deg,rgba(255,250,244,0.065)_0%,rgba(255,248,240,0.026)_100%)] shadow-[0_28px_88px_rgba(0,0,0,0.34)] backdrop-blur-[20px]",
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
        "px-5 pt-5 pb-2.5 text-[12px] text-[var(--text-muted)]",
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
        "px-4 pb-4",
        className
      )}
      {...props}
    />
  );
}
