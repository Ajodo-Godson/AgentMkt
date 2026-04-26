export default function Page() {
  return (
    <main style={{ padding: "48px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>AgentMkt — Summarizer</h1>
      <p style={{ color: "#6b7080", marginTop: 0 }}>
        L402-paywalled summarization endpoint. 200 sats per call.
      </p>

      <h2 style={{ marginTop: 32, fontSize: 16 }}>Endpoint</h2>
      <pre
        style={{
          background: "#181a20",
          padding: 16,
          borderRadius: 8,
          fontSize: 13,
          overflow: "auto",
        }}
      >
        {`POST /service
Content-Type: application/json

{ "text": "...", "max_length": 80 }

Unauthenticated → 402 with WWW-Authenticate: L402 macaroon=..., invoice=lnbc...
Authenticated   → 200 { kind: "json", data: { summary } }`}
      </pre>

      <h2 style={{ marginTop: 32, fontSize: 16 }}>Health</h2>
      <p>
        <a
          href="/api/health"
          style={{ color: "#7c8aff", textDecoration: "none" }}
        >
          GET /api/health →
        </a>
      </p>

      <p style={{ color: "#4b5060", fontSize: 12, marginTop: 48 }}>
        Powered by NVIDIA NIM (Llama 3.3 70B Instruct). Paywall by MoneyDevKit.
      </p>
    </main>
  );
}
