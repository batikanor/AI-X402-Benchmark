import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#4a4a46] bg-[#2a2a28] px-2.5 py-1 text-xs font-semibold text-stone-100",
        className,
      )}
      {...props}
    />
  );
}
