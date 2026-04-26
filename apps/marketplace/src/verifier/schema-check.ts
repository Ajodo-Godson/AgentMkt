import type { CapabilityTag, StepResult } from "@agentmkt/contracts";

export type SchemaCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Per-capability shape validation. Cheap, deterministic, runs first.
 */
export function checkSchema(
  capability_tag: CapabilityTag,
  result: StepResult,
): SchemaCheckResult {
  switch (capability_tag) {
    case "summarization":
      return expectJsonField(result, "summary");
    case "translation_es":
    case "translation_fr":
    case "translation_de":
      return expectJsonField(result, "translated_text");
    case "tts_en":
    case "tts_fr":
      return expectJsonField(result, "audio_url", isHttpUrl);
    case "image_generation":
      if (result.kind === "file") return { ok: true };
      return expectJsonField(result, "image_url", isHttpUrl);
    case "code_review":
      if (result.kind === "text" && result.text.trim().length > 0)
        return { ok: true };
      return expectJsonField(result, "review");
    case "fact_check":
      return expectJsonField(result, "verdict");
    case "voiceover_human":
      if (result.kind === "file" && result.mime_type.startsWith("audio/"))
        return { ok: true };
      return {
        ok: false,
        reason: "voiceover_human expects file with mime_type=audio/*",
      };
    case "creative_writing_human":
      if (result.kind === "text" && result.text.trim().length > 0)
        return { ok: true };
      return {
        ok: false,
        reason: "creative_writing_human expects non-empty text",
      };
  }
}

function expectJsonField(
  result: StepResult,
  field: string,
  validate: (v: unknown) => boolean = isNonEmptyString,
): SchemaCheckResult {
  if (result.kind !== "json") {
    return { ok: false, reason: `expected kind=json, got kind=${result.kind}` };
  }
  const data = result.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "result.data is not an object" };
  }
  if (!validate(data[field])) {
    return { ok: false, reason: `result.data.${field} failed validation` };
  }
  return { ok: true };
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isHttpUrl(v: unknown): boolean {
  return (
    typeof v === "string" &&
    (v.startsWith("http://") || v.startsWith("https://"))
  );
}
