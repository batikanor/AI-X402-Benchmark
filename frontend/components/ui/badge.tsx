import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent2 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
