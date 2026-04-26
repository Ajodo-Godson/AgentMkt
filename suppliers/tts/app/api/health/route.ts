export async function GET() {
  return Response.json({
    ok: true,
    service: "supplier-tts",
    capabilities: ["tts_en", "tts_fr"],
    price_sats: 300,
  });
}
