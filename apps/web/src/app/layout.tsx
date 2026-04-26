import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentMkt Routing Desk",
  description: "Quality-aware marketplace routing for paid agent work"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
