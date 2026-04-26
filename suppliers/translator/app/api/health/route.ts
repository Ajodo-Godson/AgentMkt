export async function GET() {
  return Response.json({
    ok: true,
    service: "supplier-translator",
    capabilities: ["translation_es", "translation_fr", "translation_de"],
    price_sats: 200,
  });
}
