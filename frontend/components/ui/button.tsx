import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full bg-[#216c37] px-4 text-sm font-semibold text-white transition hover:bg-[#1a5e2e] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
