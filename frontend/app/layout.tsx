import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "x402Bench Control Room",
  description: "Integrated dashboard for x402Bench LLM readiness: decision quality plus real payment workflow execution.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
