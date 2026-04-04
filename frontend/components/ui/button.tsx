import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-accent to-accent2 px-4 text-sm font-semibold text-[#041016] shadow-[0_10px_30px_rgba(43,212,189,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
