import OpenAI from "openai";
import type { CapabilityTag, StepResult } from "@agentmkt/contracts";
import { log } from "../log.js";

export type LlmJudgeResult =
  | { ok: true; confidence: number; reason?: string }
  | { ok: false; confidence: number; reason: string };

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === "nvapi-xxxxx") return null;
  client = new OpenAI({
    apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });
  return client;
}

/**
 * Optional third verifier layer. Only runs if NVIDIA_API_KEY is configured.
 * If the LLM judge is unavailable, the verifier treats two-layer pass as
 * a sufficient PASS at moderate confidence (per README cut list item #1).
 *
 * Returns confidence in [0, 1]. The /verify route maps:
 *   ok:true && confidence >= 0.7 → PASS
 *   ok:false                     → FAIL_RETRYABLE
 */
export async function judgeWithLlm(
  capability_tag: CapabilityTag,
  spec: string,
  result: StepResult,
): Promise<LlmJudgeResult | null> {
  const c = getClient();
  if (!c) return null;

  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
  const resultPreview = JSON.stringify(result).slice(0, 4000);
  const prompt = `You are a strict QA judge for an AI marketplace.

Capability: ${capability_tag}
Original spec: ${spec}
Worker result (truncated): ${resultPreview}

Decide if the result correctly fulfils the spec for the given capability.
Return STRICT JSON only, with this shape:
{"valid": boolean, "confidence": number between 0 and 1, "reason": string}

Do not include any prose before or after the JSON.`;

  try {
    const resp = await c.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 200,
    });
    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(stripCodeFence(text)) as {
      valid: boolean;
      confidence: number;
      reason?: string;
    };
    if (parsed.valid) {
      return { ok: true, confidence: parsed.confidence, reason: parsed.reason };
    }
    return {
      ok: false,
      confidence: parsed.confidence,
      reason: parsed.reason ?? "llm judged invalid",
    };
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "llm judge failed; degrading gracefully",
    );
    return null;
  }
}

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m?.[1]?.trim() ?? s;
}
