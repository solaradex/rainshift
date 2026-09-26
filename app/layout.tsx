import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RainShift",
  description: "Weather-driven route recovery for lawn and landscape companies.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
