export default function Page() {
  return (
    <main style={{ padding: "48px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>AgentMkt — Translator</h1>
      <p style={{ color: "#6b7080", marginTop: 0 }}>
        L402-paywalled translation endpoint. 200 sats per call. ES / FR / DE.
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

{ "text": "...", "target_lang": "fr" }   // es | fr | de

Unauthenticated → 402 + L402 challenge
Authenticated   → 200 { kind: "json", data: { translated_text } }`}
      </pre>

      <p style={{ color: "#4b5060", fontSize: 12, marginTop: 48 }}>
        Powered by NVIDIA NIM (Llama 3.3 70B Instruct). Paywall by MoneyDevKit.
      </p>
    </main>
  );
}
