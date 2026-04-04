import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-panel/85 p-5 shadow-glow backdrop-blur-sm transition duration-200 hover:border-white/20",
        className,
      )}
      {...props}
    />
  );
}
