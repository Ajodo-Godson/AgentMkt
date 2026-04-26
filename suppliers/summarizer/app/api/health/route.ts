export async function GET() {
  return Response.json({
    ok: true,
    service: "supplier-summarizer",
    capability: "summarization",
    price_sats: 200,
  });
}
