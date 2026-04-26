import { withPayment } from "@moneydevkit/nextjs/server";
import { summarize } from "@/lib/llm";

const PRICE_SATS = 200;

type Body = { text?: unknown; max_length?: unknown };

const handler = async (req: Request): Promise<Response> => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return Response.json(
      { error: "missing_field", detail: "`text` must be a non-empty string" },
      { status: 400 },
    );
  }
  const text = body.text;
  const max_length =
    typeof body.max_length === "number" && body.max_length > 0
      ? Math.min(500, Math.floor(body.max_length))
      : 80;

  try {
    const summary = await summarize(text, max_length);
    return Response.json({
      kind: "json",
      data: { summary, model: process.env.NVIDIA_MODEL ?? null },
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
