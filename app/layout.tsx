import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "rpowMarket — BTC Up/Down",
  description: "5-minute Bitcoin up/down on rpow2. Tribute to Hal Finney.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
