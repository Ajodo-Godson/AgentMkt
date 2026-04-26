export default function Page() {
  return (
    <main style={{ padding: "48px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>AgentMkt — TTS</h1>
      <p style={{ color: "#6b7080", marginTop: 0 }}>
        L402-paywalled text-to-speech endpoint. 300 sats per call. EN / FR.
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

{ "text": "...", "voice": "en" }   // en | fr

Unauthenticated → 402 + L402 challenge
Authenticated   → 200 { kind: "json", data: { audio_url, voice, mime_type } }`}
      </pre>

      <p style={{ color: "#4b5060", fontSize: 12, marginTop: 48 }}>
        TTS audio URLs are served via Google Translate's free TTS endpoint.
        Paywall by MoneyDevKit.
      </p>
    </main>
  );
}
