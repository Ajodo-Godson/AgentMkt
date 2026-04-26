import { withPayment } from "@moneydevkit/nextjs/server";
import { buildTtsUrl } from "@/lib/tts";

const PRICE_SATS = 300;

type Body = { text?: unknown; voice?: unknown };

const SUPPORTED = new Set(["en", "fr"] as const);
type Voice = "en" | "fr";

const handler = async (req: Request): Promise<Response> => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return Response.json(
      { error: "missing_field", detail: "`text` must be a non-empty string" },
      { status: 400 },
    );
  }
  if (typeof body.voice !== "string" || !SUPPORTED.has(body.voice as Voice)) {
    return Response.json(
      { error: "invalid_field", detail: "`voice` must be one of: en, fr" },
      { status: 400 },
    );
  }

  const audio_url = buildTtsUrl(body.text, body.voice as Voice);

  return Response.json({
    kind: "json",
    data: {
      audio_url,
      voice: body.voice,
      mime_type: "audio/mpeg",
    },
  });
};

export const POST = withPayment(
  { amount: PRICE_SATS, currency: "SAT" },
  handler,
);
