import { summarize } from "@/lib/llm";

type Body = { text?: unknown; spec?: unknown; task?: unknown; max_length?: unknown };

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Accept explicit text, or derive a prompt from spec/task sent by the orchestrator
  const rawText =
    (typeof body.text === "string" && body.text.trim() ? body.text : null) ??
    (typeof body.task === "string" && body.task.trim() ? body.task : null) ??
    (typeof body.spec === "string" && body.spec.trim()
      ? body.spec.replace(/_/g, " ")
      : null);

  if (!rawText) {
    return Response.json(
      { error: "missing_field", detail: "`text`, `task`, or `spec` required" },
      { status: 400 },
    );
  }

  const max_length =
    typeof body.max_length === "number" && body.max_length > 0
      ? Math.min(500, Math.floor(body.max_length))
      : 120;

  try {
    const summary = await summarize(rawText, max_length);
    return Response.json({
      kind: "json",
      data: { summary, model: process.env.NVIDIA_MODEL ?? null },
    });
  } catch (err) {
    return Response.json(
      { error: "llm_error", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
