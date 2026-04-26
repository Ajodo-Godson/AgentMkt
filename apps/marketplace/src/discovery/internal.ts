import { sql, and, eq, inArray, arrayOverlaps } from "drizzle-orm";
import { getDb, schema } from "@agentmkt/db";
import type {
  CapabilityTag,
  WorkerCandidate,
} from "@agentmkt/contracts";

/**
 * Query our own Postgres for workers matching the requested capability tags.
 * Joins each worker with reputation_snapshots and computes a per-worker score
 * by averaging EWMA across the requested tags that worker actually has.
 *
 * Returns workers from `source: "internal"` only — `source: "402index"` rows
 * (whether seeded or scraped) belong to the external pipeline.
 */
export async function findInternalCandidates(
  capability_tags: CapabilityTag[],
  opts: { max_price_sats?: number; min_rating?: number } = {},
): Promise<WorkerCandidate[]> {
  const db = getDb();
  const { workers, reputation_snapshots } = schema;

  const matchingWorkers = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.status, "active"),
        eq(workers.source, "internal"),
        arrayOverlaps(workers.capability_tags, capability_tags),
        opts.max_price_sats !== undefined
          ? sql`${workers.base_price_sats} <= ${opts.max_price_sats}`
          : undefined,
      ),
    );

  if (matchingWorkers.length === 0) return [];

  const snapshots = await db
    .select()
    .from(reputation_snapshots)
    .where(
      and(
        inArray(
          reputation_snapshots.worker_id,
          matchingWorkers.map((w) => w.id),
        ),
        inArray(reputation_snapshots.capability_tag, capability_tags),
      ),
    );

  const byWorker = new Map<
    string,
    { ewmaSum: number; totalJobs: number; successfulJobs: number; n: number }
  >();
  for (const s of snapshots) {
    const cur = byWorker.get(s.worker_id) ?? {
      ewmaSum: 0,
      totalJobs: 0,
      successfulJobs: 0,
      n: 0,
    };
    cur.ewmaSum += s.ewma;
    cur.totalJobs += s.total_jobs;
    cur.successfulJobs += s.successful_jobs;
    cur.n += 1;
    byWorker.set(s.worker_id, cur);
  }

  const candidates: WorkerCandidate[] = matchingWorkers
    .map((w) => {
      const agg = byWorker.get(w.id);
      const ewma = agg && agg.n > 0 ? agg.ewmaSum / agg.n : 3.5;
      return {
        worker_id: w.id,
        display_name: w.display_name,
        capability_tags: w.capability_tags,
        base_price_sats: w.base_price_sats,
        ewma,
        total_jobs: agg?.totalJobs ?? 0,
        source: w.source,
        endpoint_url: w.endpoint_url,
        type: w.type,
      } satisfies WorkerCandidate;
    })
    .filter((c) =>
      opts.min_rating === undefined ? true : c.ewma >= opts.min_rating,
    );

  return candidates;
}
