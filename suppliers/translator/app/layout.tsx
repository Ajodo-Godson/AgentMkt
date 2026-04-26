export const metadata = {
  title: "AgentMkt — Translator (L402)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#0f1117",
          color: "#c9cdd6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
