import type { RatingSource } from "@agentmkt/contracts";

const ALPHA = 0.3; // weight on new event; 0.7 on history

/**
 * Map a rating event score onto the 0..5 EWMA scale.
 *
 *   user      → 1..5 directly
 *   verifier  → -1..1 → 0..5 via (score + 1) * 2.5
 *   system    → -1..1 → 0..5 via (score + 1) * 2.5
 *
 * Output is clamped to [0, 5].
 */
export function normalizeScore(score: number, source: RatingSource): number {
  const raw = source === "user" ? score : (score + 1) * 2.5;
  return Math.max(0, Math.min(5, raw));
}

/**
 * EWMA update: ewma_new = (1-α) * ewma_old + α * normalized_event_score.
 * If there is no prior snapshot, the event score *is* the prior.
 */
export function updateEwma(prior: number | null, normalized: number): number {
  if (prior === null) return normalized;
  return (1 - ALPHA) * prior + ALPHA * normalized;
}

export function isSuccess(normalized: number): boolean {
  return normalized >= 4;
}
