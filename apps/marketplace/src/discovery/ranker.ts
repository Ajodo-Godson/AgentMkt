import type { WorkerCandidate } from "@agentmkt/contracts";

/**
 * Scoring formula from README §7.3 task 5.
 *
 *   score = 0.4 * (ewma / 5)
 *         + 0.2 * (1 / max(1, base_price_sats / 100))
 *         + 0.3 * (successful_jobs / max(1, total_jobs))
 *         - 0.1 * normalized_p95_latency
 *
 * Latency is unknown today, so the latency term is 0. Successful_jobs is not
 * surfaced on WorkerCandidate, so we approximate with `total_jobs > 0 ?
 * (ewma >= 4 ? 1 : 0.5) : 0` — coarse but stable. Replace with a real
 * successful-jobs count when reputation_snapshots starts publishing it.
 */
export function rank(candidates: WorkerCandidate[], limit: number): WorkerCandidate[] {
  return [...candidates]
    .map((c) => ({ c, s: scoreCandidate(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c);
}

export function scoreCandidate(c: WorkerCandidate): number {
  const ewmaTerm = 0.4 * (c.ewma / 5);
  const priceTerm = 0.2 * (1 / Math.max(1, c.base_price_sats / 100));

  const successRate =
    c.total_jobs > 0 ? (c.ewma >= 4 ? 1 : c.ewma >= 3 ? 0.5 : 0.2) : 0;
  const successTerm = 0.3 * successRate;

  const latencyTerm = 0;
  return ewmaTerm + priceTerm + successTerm - latencyTerm;
}
