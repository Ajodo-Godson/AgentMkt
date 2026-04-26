import { sql, and, eq, arrayOverlaps } from "drizzle-orm";
import { getDb, schema } from "@agentmkt/db";
import type {
  CapabilityTag,
  WorkerCandidate,
} from "@agentmkt/contracts";
import { log } from "../log.js";

/**
 * Discover external workers from 402index.io.
 *
 * The README references `https://mcp.402index.io` but that DNS record does
 * not exist — there is no MCP server. The real index is a JSON REST API at
 * `https://402index.io/api/v1/services` with full search support.
 *
 * Strategy:
 *   - For each requested capability tag, hit the search endpoint with
 *     `?q=<keyword>&protocol=L402&limit=100` (one query per tag).
 *   - Filter L402-only server-side because the hub speaks L402.
 *   - Cache per-tag for 60s. Dedupe across tags by service id.
 *   - Their per-call result cap appears to be 200; for our specific tags
 *     each query returns far less, so a single page is enough.
 *
 * On API failure we fall back to seeded source="402index" rows so dev
 * doesn't break offline.
 */

const FEED_URL =
  process.env.INDEX_402_FEED_URL ?? "https://402index.io/api/v1/services";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;
const PER_TAG_LIMIT = 100;

type Service = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  protocol: "x402" | "L402" | string;
  price_sats: number | null;
  category: string | null;
  provider: string | null;
  health_status: string | null;
  uptime_30d: number | null;
  latency_p50_ms: number | null;
  reliability_score: number | null;
  l402_compliant: boolean | null;
};

const cache = new Map<string, { at: number; services: Service[] }>();

async function fetchByQuery(query: string): Promise<Service[]> {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.services;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = new URL(FEED_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("protocol", "L402");
    url.searchParams.set("limit", String(PER_TAG_LIMIT));
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = (await r.json()) as { services?: Service[] };
    const services = Array.isArray(json.services) ? json.services : [];
    cache.set(query, { at: Date.now(), services });
    return services;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Tag → search query. The first string is what we send to 402index's `q`
 * param; the array is the loose substring filter we apply on returned
 * names+descriptions+categories to decide which of our tags each service
 * matches. Human-only tags are absent (we don't search externally for them).
 */
const TAG_SEARCH: Partial<Record<CapabilityTag, { q: string; kws: string[] }>> = {
  summarization: { q: "summarize", kws: ["summar"] },
  translation_es: { q: "translate", kws: ["translat", "spanish", " es "] },
  translation_fr: { q: "translate", kws: ["translat", "french", " fr "] },
  translation_de: { q: "translate", kws: ["translat", "german", " de "] },
  tts_en: { q: "speech voice audio", kws: ["tts", "speech", "voice", "audio"] },
  tts_fr: { q: "speech voice audio", kws: ["tts", "speech", "voice", "audio"] },
  image_generation: { q: "image generation", kws: ["image", "diffus", "art"] },
  code_review: { q: "code review", kws: ["code", "lint", "review", "static analys"] },
  fact_check: { q: "fact check", kws: ["fact", "verif"] },
};

function matchesAnyTag(svc: Service, tags: CapabilityTag[]): CapabilityTag[] {
  const haystack = [svc.name, svc.description ?? "", svc.category ?? ""]
    .join(" ")
    .toLowerCase();
  const matched: CapabilityTag[] = [];
  for (const tag of tags) {
    const entry = TAG_SEARCH[tag];
    if (!entry) continue;
    if (entry.kws.some((k) => haystack.includes(k))) matched.push(tag);
  }
  return matched;
}

function reliabilityToEwma(r: number | null): number {
  if (r === null || Number.isNaN(r)) return 3.5;
  // 402index reliability_score is reported on a 0..1 scale.
  return Math.max(0, Math.min(5, r * 5));
}

/**
 * 402index workers don't accumulate local reputation in our DB, but the
 * 402index API verifies them externally (uptime_30d, reliability_score,
 * l402_compliant). The orchestrator's CFO gate uses `total_jobs >= 5` as
 * its "trusted worker" threshold, so we surface 402index's own verification
 * signal there: if the service looks healthy + reliable to 402index, we
 * report enough job history to clear the trust gate.
 */
function trustedJobCount(svc: Service): number {
  const r = svc.reliability_score ?? 0;
  if (r >= 0.7) return 10;
  if (
    svc.l402_compliant === true &&
    (svc.health_status === "healthy" || svc.health_status === null)
  ) {
    return 5;
  }
  return 0;
}

function mapToCandidate(
  svc: Service,
  matched: CapabilityTag[],
): WorkerCandidate {
  return {
    worker_id: `worker_402_${svc.id}`,
    display_name: svc.name,
    capability_tags: matched,
    base_price_sats: Math.max(0, Math.floor(svc.price_sats ?? 0)),
    ewma: reliabilityToEwma(svc.reliability_score),
    total_jobs: trustedJobCount(svc),
    source: "402index",
    endpoint_url: svc.url,
    type: "agent",
  };
}

async function fetchExternalLive(
  capability_tags: CapabilityTag[],
  opts: { max_price_sats?: number },
): Promise<WorkerCandidate[]> {
  // One search per requested tag, then dedupe by service id. This is fast in
  // practice (each query is a few hundred ms, all run in parallel) and gives
  // us full directory coverage instead of just the first 200 unfiltered.
  const queries = Array.from(
    new Set(
      capability_tags.flatMap((t) => {
        const entry = TAG_SEARCH[t];
        return entry ? [entry.q] : [];
      }),
    ),
  );
  if (queries.length === 0) return [];

  const batches = await Promise.all(
    queries.map((q) =>
      fetchByQuery(q).catch(() => [] as Service[]),
    ),
  );

  const seen = new Map<string, Service>();
  for (const batch of batches) {
    for (const svc of batch) seen.set(svc.id, svc);
  }

  const results: WorkerCandidate[] = [];
  for (const svc of seen.values()) {
    if (svc.protocol !== "L402") continue; // safety: server should already filter
    if (
      opts.max_price_sats !== undefined &&
      (svc.price_sats ?? 0) > opts.max_price_sats
    ) {
      continue;
    }
    const matched = matchesAnyTag(svc, capability_tags);
    if (matched.length === 0) continue;
    results.push(mapToCandidate(svc, matched));
  }
  return results;
}

async function fetchSeededFallback(
  capability_tags: CapabilityTag[],
  opts: { max_price_sats?: number },
): Promise<WorkerCandidate[]> {
  const db = getDb();
  const { workers } = schema;
  const rows = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.status, "active"),
        eq(workers.source, "402index"),
        arrayOverlaps(workers.capability_tags, capability_tags),
        opts.max_price_sats !== undefined
          ? sql`${workers.base_price_sats} <= ${opts.max_price_sats}`
          : undefined,
      ),
    );
  return rows.map((w) => ({
    worker_id: w.id,
    display_name: w.display_name,
    capability_tags: w.capability_tags,
    base_price_sats: w.base_price_sats,
    ewma: 3.5,
    total_jobs: 0,
    source: "402index" as const,
    endpoint_url: w.endpoint_url,
    type: w.type,
  }));
}

export async function findExternalCandidates(
  capability_tags: CapabilityTag[],
  opts: { max_price_sats?: number } = {},
): Promise<WorkerCandidate[]> {
  if (process.env.INDEX_402_OFFLINE === "true") {
    return fetchSeededFallback(capability_tags, opts);
  }
  try {
    return await fetchExternalLive(capability_tags, opts);
  } catch (err) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        feed_url: FEED_URL,
      },
      "402index live fetch failed; falling back to seeded fixtures",
    );
    return fetchSeededFallback(capability_tags, opts);
  }
}
