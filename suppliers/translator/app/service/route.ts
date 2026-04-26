import { translate } from "@/lib/llm";

const SUPPORTED = new Set(["es", "fr", "de"] as const);
type Lang = "es" | "fr" | "de";

type Body = {
  text?: unknown;
  input_text?: unknown;
  target_lang?: unknown;
  spec?: unknown;
};

function deriveLang(spec: unknown): Lang | null {
  if (typeof spec !== "string") return null;
  const s = spec.toLowerCase();
  if (s.includes("french") || s.includes("_fr")) return "fr";
  if (s.includes("spanish") || s.includes("_es")) return "es";
  if (s.includes("german") || s.includes("_de")) return "de";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Accept text or input_text (input_text = chained output from a prior step)
  const text =
    (typeof body.text === "string" && body.text.trim() ? body.text : null) ??
    (typeof body.input_text === "string" && body.input_text.trim()
      ? body.input_text
      : null);

  if (!text) {
    return Response.json(
      { error: "missing_field", detail: "`text` or `input_text` required" },
      { status: 400 },
    );
  }

  // Accept target_lang directly or derive from capability spec
  const target_lang =
    (typeof body.target_lang === "string" && SUPPORTED.has(body.target_lang as Lang)
      ? (body.target_lang as Lang)
      : null) ?? deriveLang(body.spec);

  if (!target_lang) {
    return Response.json(
      { error: "invalid_field", detail: "`target_lang` must be one of: es, fr, de" },
      { status: 400 },
    );
  }

  try {
    const translated_text = await translate(text, target_lang);
    return Response.json({
      kind: "json",
      data: { translated_text, target_lang, model: process.env.NVIDIA_MODEL ?? null },
    });
  } catch (err) {
    return Response.json(
      { error: "llm_error", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
