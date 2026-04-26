import type { CapabilityTag, StepResult } from "@agentmkt/contracts";

export type SanityCheckResult =
  | { ok: true }
  | { ok: false; reason: string; retryable: boolean };

/**
 * Per-capability heuristic checks. Cheaper than an LLM judge, more
 * forgiving than the schema check. Only runs if the schema check passed.
 *
 * `retryable` distinguishes transient junk (empty output, repeated tokens)
 * from definitively wrong output (output language mismatch, summary longer
 * than input). The verifier maps retryable=true → FAIL_RETRYABLE.
 */
export function checkSanity(
  capability_tag: CapabilityTag,
  spec: string,
  result: StepResult,
): SanityCheckResult {
  switch (capability_tag) {
    case "summarization":
      return summarizationSanity(spec, result);
    case "translation_es":
    case "translation_fr":
    case "translation_de":
      return translationSanity(capability_tag, result);
    case "tts_en":
    case "tts_fr":
    case "image_generation":
    case "code_review":
    case "fact_check":
    case "voiceover_human":
    case "creative_writing_human":
      return { ok: true };
  }
}

function summarizationSanity(
  spec: string,
  result: StepResult,
): SanityCheckResult {
  if (result.kind !== "json") return { ok: true }; // schema already filtered
  const data = result.data as { summary?: string };
  const summary = (data.summary ?? "").trim();
  if (summary.length < 10) {
    return {
      ok: false,
      reason: "summary too short (<10 chars)",
      retryable: true,
    };
  }
  // Soft heuristic: if the spec contains the source text inline (common when
  // the COO inlines small inputs), the summary should be shorter than half.
  // We can't know the source for arbitrary specs, so we only enforce a
  // generous upper bound here.
  if (summary.length > 4000) {
    return {
      ok: false,
      reason: "summary suspiciously long (>4000 chars)",
      retryable: false,
    };
  }
  return { ok: true };
}

function translationSanity(
  capability_tag: "translation_es" | "translation_fr" | "translation_de",
  result: StepResult,
): SanityCheckResult {
  if (result.kind !== "json") return { ok: true };
  const data = result.data as { translated_text?: string };
  const text = (data.translated_text ?? "").trim();
  if (text.length < 2) {
    return {
      ok: false,
      reason: "translated_text too short",
      retryable: true,
    };
  }
  // Heuristic: target language presence via stop-word sniff. Crude but cheap.
  const target = capability_tag.slice("translation_".length);
  if (!hasTargetLanguageHints(text.toLowerCase(), target)) {
    return {
      ok: false,
      reason: `translated_text does not appear to be in ${target}`,
      retryable: false,
    };
  }
  return { ok: true };
}

const STOPWORDS: Record<string, string[]> = {
  es: [" el ", " la ", " los ", " las ", " de ", " que ", " y ", " es ", " en "],
  fr: [
    " le ",
    " la ",
    " les ",
    " de ",
    " que ",
    " et ",
    " est ",
    " un ",
    " une ",
    "ç",
  ],
  de: [
    " der ",
    " die ",
    " das ",
    " und ",
    " ist ",
    " ein ",
    " eine ",
    " nicht ",
    "ß",
    "ü",
  ],
};

function hasTargetLanguageHints(text: string, target: string): boolean {
  const padded = ` ${text} `;
  const hints = STOPWORDS[target] ?? [];
  return hints.some((h) => padded.includes(h));
}
