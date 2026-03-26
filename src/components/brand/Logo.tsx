import Image from "next/image";
import { cn } from "@/lib/cn";

const sizes = {
  sm: 34,
  md: 44,
  lg: 54,
};

export function Logo({
  className,
  size = "md",
  showText = true,
  priority = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  priority?: boolean;
}) {
  const px = sizes[size];

  return (
    <div
  className={cn(
    "flex items-center gap-2",
    className
  )}
>
  <div
    className="rounded-full overflow-hidden"
    style={{ width: px, height: px }}
  >
    <Image
      src="/brand/logo1.png"
      alt="Magnifique CRM"
      width={px}
      height={px}
      priority={priority}
      className="object-cover w-full h-full"
    />
  </div>

  {showText ? (
    <span className="font-semibold tracking-tight">
      Magnifique CRM
    </span>
  ) : null}
</div>
  );
}