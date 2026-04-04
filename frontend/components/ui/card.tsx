import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#4a4a46] bg-panel p-5 shadow-glow transition duration-200",
        className,
      )}
      {...props}
    />
  );
}
