import { withPayment } from "@moneydevkit/nextjs/server";
import { translate } from "@/lib/llm";

const PRICE_SATS = 200;

type Body = { text?: unknown; target_lang?: unknown };

const SUPPORTED = new Set(["es", "fr", "de"] as const);
type Lang = "es" | "fr" | "de";

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
  if (typeof body.target_lang !== "string" || !SUPPORTED.has(body.target_lang as Lang)) {
    return Response.json(
      {
        error: "invalid_field",
        detail: "`target_lang` must be one of: es, fr, de",
      },
      { status: 400 },
    );
  }

  try {
    const translated_text = await translate(body.text, body.target_lang as Lang);
    return Response.json({
      kind: "json",
      data: {
        translated_text,
        target_lang: body.target_lang,
        model: process.env.NVIDIA_MODEL ?? null,
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: "llm_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};

export const POST = withPayment(
  { amount: PRICE_SATS, currency: "SAT" },
  handler,
);
