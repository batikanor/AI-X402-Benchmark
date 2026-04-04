import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "x402Bench Control Room",
  description: "Operations dashboard for x402Bench agentic payments benchmark.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
