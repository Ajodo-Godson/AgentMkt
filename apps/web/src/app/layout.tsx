import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentMkt Mission Control",
  description: "Lightning-native agent marketplace dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
