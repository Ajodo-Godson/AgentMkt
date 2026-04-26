import { Hono } from "hono";
import {
  VerifyRequestSchema,
  type VerifierVerdict,
} from "@agentmkt/contracts";
import { checkSchema } from "../verifier/schema-check.js";
import { checkSanity } from "../verifier/sanity-check.js";
import { judgeWithLlm } from "../verifier/llm-judge.js";
import { log } from "../log.js";

export const verifyRoutes = new Hono();

verifyRoutes.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation", detail: parsed.error.flatten() },
      400,
    );
  }
  const { capability_tag, spec, result } = parsed.data;

  // Layer 1: schema. A fail here is fatal — wrong shape, can't recover.
  const schema = checkSchema(capability_tag, result);
  if (!schema.ok) {
    const verdict: VerifierVerdict = {
      kind: "FAIL_FATAL",
      reason: `schema: ${schema.reason}`,
    };
    log.info({ capability_tag, verdict }, "/verify");
    return c.json({ verdict });
  }

  // Layer 2: sanity. Retryable vs fatal is decided per-capability.
  const sanity = checkSanity(capability_tag, spec, result);
  if (!sanity.ok) {
    const verdict: VerifierVerdict = sanity.retryable
      ? { kind: "FAIL_RETRYABLE", reason: `sanity: ${sanity.reason}` }
      : { kind: "FAIL_FATAL", reason: `sanity: ${sanity.reason}` };
    log.info({ capability_tag, verdict }, "/verify");
    return c.json({ verdict });
  }

  // Layer 3: LLM judge. Optional — only fires if NVIDIA_API_KEY is set.
  const judged = await judgeWithLlm(capability_tag, spec, result);

  let verdict: VerifierVerdict;
  if (judged === null) {
    // No LLM judge available; two-layer pass is treated as PASS at moderate
    // confidence. This matches the README cut-list fallback.
    verdict = { kind: "PASS", confidence: 0.85, reason: "no llm judge" };
  } else if (judged.ok && judged.confidence >= 0.7) {
    verdict = {
      kind: "PASS",
      confidence: judged.confidence,
      reason: judged.reason,
    };
  } else if (judged.ok) {
    verdict = {
      kind: "FAIL_RETRYABLE",
      reason: `llm low-confidence (${judged.confidence}): ${judged.reason ?? ""}`,
    };
  } else {
    verdict = {
      kind: "FAIL_RETRYABLE",
      reason: `llm: ${judged.reason}`,
    };
  }

  log.info({ capability_tag, verdict }, "/verify");
  return c.json({ verdict });
});
