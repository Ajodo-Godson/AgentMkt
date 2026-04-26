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
 * `https://402index.io/api/v1/services`. We hit it directly.
 *
 * Reality check:
 *   - The directory has ~50 services, not 1100. Mostly crypto/data feeds.
 *   - Only ~9 are L402 (the rest are x402). We filter L402-only because the
 *     hub speaks L402.
 *   - Their categories ("crypto", "ai/ml", "uncategorized", ...) don't map
 *     onto our closed enum, so we keyword-match on name + description for
 *     each requested tag.
 *
 * On API failure we fall back to seeded source="402index" rows so dev
 * doesn't break offline.
 */

const FEED_URL =
  process.env.INDEX_402_FEED_URL ?? "https://402index.io/api/v1/services";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

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

let cache: { at: number; services: Service[] } | null = null;

async function fetchFeed(): Promise<Service[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.services;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(FEED_URL, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = (await r.json()) as { services?: Service[] };
    const services = Array.isArray(json.services) ? json.services : [];
    cache = { at: Date.now(), services };
    return services;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Tag → keyword sniffer. Loose substring match over name+description+category.
 * Tags absent from this map (the human-only tags) skip external entirely.
 */
const TAG_KEYWORDS: Partial<Record<CapabilityTag, string[]>> = {
  summarization: ["summar"],
  translation_es: ["translat", "spanish", " es "],
  translation_fr: ["translat", "french", " fr "],
  translation_de: ["translat", "german", " de "],
  tts_en: ["tts", "speech", "voice", "audio"],
  tts_fr: ["tts", "speech", "voice", "audio"],
  image_generation: ["image", "diffus", "art"],
  code_review: ["code", "lint", "review", "static analys"],
  fact_check: ["fact", "verif"],
};

function matchesAnyTag(svc: Service, tags: CapabilityTag[]): CapabilityTag[] {
  const haystack = [svc.name, svc.description ?? "", svc.category ?? ""]
    .join(" ")
    .toLowerCase();
  const matched: CapabilityTag[] = [];
  for (const tag of tags) {
    const kws = TAG_KEYWORDS[tag];
    if (!kws) continue;
    if (kws.some((k) => haystack.includes(k))) matched.push(tag);
  }
  return matched;
}

function reliabilityToEwma(r: number | null): number {
  if (r === null || Number.isNaN(r)) return 3.5;
  // 402index reliability_score is reported on a 0..1 scale.
  return Math.max(0, Math.min(5, r * 5));
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
    total_jobs: 0,
    source: "402index",
    endpoint_url: svc.url,
    type: "agent",
  };
}

async function fetchExternalLive(
  capability_tags: CapabilityTag[],
  opts: { max_price_sats?: number },
): Promise<WorkerCandidate[]> {
  const services = await fetchFeed();
  const results: WorkerCandidate[] = [];
  for (const svc of services) {
    if (svc.protocol !== "L402") continue; // hub only speaks L402
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
