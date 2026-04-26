import { getDb, closeDb } from "./index.js";
import {
  users,
  workers,
  jobs,
  plans,
  steps,
  ratings,
  reputation_snapshots,
} from "./schema.js";
import type { CapabilityTag } from "@agentmkt/contracts";

/**
 * Idempotent demo seed.
 *
 * Inserts:
 *   - 2 users (buyer + demo-supplier-owner)
 *   - 5 agent workers (3 internal pointing at suppliers/*, 2 marked source=402index)
 *   - 2 human workers
 *   - 1 anchor job + plan + per-capability steps so ratings can FK to real rows
 *   - ~20 historical ratings spread across workers
 *   - reputation_snapshots derived from the ratings
 *
 * Re-running should be safe: every insert is .onConflictDoNothing().
 * If you change worker IDs or capability tags here, reset the DB rather than
 * mutating in place — reputation_snapshots primary key is composite.
 */
export async function seed() {
  const db = getDb();

  const BUYER_USER_ID = process.env.DEMO_BUYER_USER_ID ?? "user_demo_buyer";
  const SUPPLIER_OWNER_ID = "user_demo_supplier_owner";
  const HUMAN_TG_CHAT_ID =
    process.env.DEMO_HUMAN_WORKER_TG_CHAT_ID ?? "000000000";

  console.log("[seed] users");
  await db
    .insert(users)
    .values([{ id: BUYER_USER_ID }, { id: SUPPLIER_OWNER_ID }])
    .onConflictDoNothing();

  console.log("[seed] workers");
  const workerRows = [
    {
      id: "worker_internal_summarizer",
      type: "agent" as const,
      endpoint_url: "http://localhost:5001/service",
      telegram_chat_id: null,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Crisp Summarizer",
      capability_tags: ["summarization"] satisfies CapabilityTag[],
      base_price_sats: 200,
      stake_sats: 1000,
      source: "internal" as const,
      status: "active" as const,
    },
    {
      id: "worker_internal_translator",
      type: "agent" as const,
      endpoint_url: "http://localhost:5002/service",
      telegram_chat_id: null,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Polyglot",
      capability_tags: [
        "translation_es",
        "translation_fr",
        "translation_de",
      ] satisfies CapabilityTag[],
      base_price_sats: 200,
      stake_sats: 1000,
      source: "internal" as const,
      status: "active" as const,
    },
    {
      id: "worker_internal_tts",
      type: "agent" as const,
      endpoint_url: "http://localhost:5003/service",
      telegram_chat_id: null,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Voice Forge",
      capability_tags: ["tts_en", "tts_fr"] satisfies CapabilityTag[],
      base_price_sats: 300,
      stake_sats: 1000,
      source: "internal" as const,
      status: "active" as const,
    },
    {
      id: "worker_external_alpha",
      type: "agent" as const,
      endpoint_url: "https://example-402index.test/alpha",
      telegram_chat_id: null,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Alpha Summarizer (402index)",
      capability_tags: [
        "summarization",
        "fact_check",
      ] satisfies CapabilityTag[],
      base_price_sats: 150,
      stake_sats: 0,
      source: "402index" as const,
      status: "active" as const,
    },
    {
      id: "worker_external_beta",
      type: "agent" as const,
      endpoint_url: "https://example-402index.test/beta",
      telegram_chat_id: null,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Beta Code Reviewer (402index)",
      capability_tags: ["code_review"] satisfies CapabilityTag[],
      base_price_sats: 250,
      stake_sats: 0,
      source: "402index" as const,
      status: "active" as const,
    },
    {
      id: "worker_human_marie",
      type: "human" as const,
      endpoint_url: null,
      telegram_chat_id: HUMAN_TG_CHAT_ID,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Marie (FR voiceover)",
      capability_tags: [
        "voiceover_human",
        "tts_fr",
      ] satisfies CapabilityTag[],
      base_price_sats: 800,
      stake_sats: 500,
      source: "internal" as const,
      status: "active" as const,
    },
    {
      id: "worker_human_alex",
      type: "human" as const,
      endpoint_url: null,
      telegram_chat_id: HUMAN_TG_CHAT_ID,
      owner_user_id: SUPPLIER_OWNER_ID,
      display_name: "Alex (creative writer)",
      capability_tags: [
        "creative_writing_human",
      ] satisfies CapabilityTag[],
      base_price_sats: 1200,
      stake_sats: 500,
      source: "internal" as const,
      status: "active" as const,
    },
  ];

  await db.insert(workers).values(workerRows).onConflictDoNothing();

  console.log("[seed] anchor job + plan + steps");
  const anchorJobId = "job_seed_anchor";
  const anchorPlanId = "plan_seed_anchor";
  await db
    .insert(jobs)
    .values({
      id: anchorJobId,
      user_id: BUYER_USER_ID,
      prompt: "[seed] historical anchor job — provides FK targets for seeded ratings.",
      budget_sats: 10000,
      status: "completed",
    })
    .onConflictDoNothing();

  await db
    .insert(plans)
    .values({
      id: anchorPlanId,
      job_id: anchorJobId,
      version: 1,
      total_estimate_sats: 0,
      assumptions: [],
      status: "approved",
    })
    .onConflictDoNothing();

  // Pre-generate one synthetic step per (worker, capability) so ratings have
  // a real step_id to reference. Step IDs are deterministic for idempotency.
  type SyntheticStep = {
    step_id: string;
    worker_id: string;
    capability_tag: CapabilityTag;
  };
  const synthSteps: SyntheticStep[] = [];
  for (const w of workerRows) {
    for (const cap of w.capability_tags) {
      synthSteps.push({
        step_id: `step_seed_${w.id}_${cap}`,
        worker_id: w.id,
        capability_tag: cap,
      });
    }
  }

  await db
    .insert(steps)
    .values(
      synthSteps.map((s) => ({
        id: s.step_id,
        plan_id: anchorPlanId,
        dag_node: `seed_${s.capability_tag}`,
        capability_tag: s.capability_tag,
        primary_worker_id: s.worker_id,
        fallback_ids: [],
        estimate_sats: 0,
        ceiling_sats: 0,
        depends_on: [],
        human_required: false,
        optional: false,
        status: "succeeded" as const,
        retries_left: 0,
      })),
    )
    .onConflictDoNothing();

  console.log("[seed] historical ratings");
  // Per-worker rating profiles. Scores are 1..5 (user-style).
  const profiles: Record<string, number[]> = {
    worker_internal_summarizer: [5, 5, 4, 5, 4],
    worker_internal_translator: [5, 4, 5, 4],
    worker_internal_tts: [4, 4, 5],
    worker_external_alpha: [3, 4, 4],
    worker_external_beta: [4, 5],
    worker_human_marie: [5, 5, 5],
    worker_human_alex: [4, 5],
  };

  const ratingRows: (typeof ratings.$inferInsert)[] = [];
  for (const w of workerRows) {
    const scores = profiles[w.id] ?? [];
    for (const cap of w.capability_tags) {
      const stepId = `step_seed_${w.id}_${cap}`;
      scores.forEach((score, i) => {
        ratingRows.push({
          id: `rating_seed_${w.id}_${cap}_${i}`,
          worker_id: w.id,
          capability_tag: cap,
          job_id: anchorJobId,
          step_id: stepId,
          source: "user",
          score,
          reason: "seeded historical rating",
        });
      });
    }
  }

  await db.insert(ratings).values(ratingRows).onConflictDoNothing();

  console.log(`[seed] ${ratingRows.length} ratings inserted`);

  console.log("[seed] reputation_snapshots");
  // EWMA: ewma_new = 0.7 * ewma_old + 0.3 * normalized_event_score.
  // For seed, we initialize each capability bucket from the rating mean of
  // that worker (cheap, stable starting point — production code in
  // apps/marketplace/src/reputation/ewma.ts will recompute incrementally).
  const snapshotRows: (typeof reputation_snapshots.$inferInsert)[] = [];
  for (const w of workerRows) {
    const scores = profiles[w.id] ?? [];
    const mean =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 3.5;
    for (const cap of w.capability_tags) {
      snapshotRows.push({
        worker_id: w.id,
        capability_tag: cap,
        ewma: mean,
        total_jobs: scores.length,
        successful_jobs: scores.filter((s) => s >= 4).length,
      });
    }
  }
  await db
    .insert(reputation_snapshots)
    .values(snapshotRows)
    .onConflictDoNothing();

  console.log("[seed] done");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => closeDb())
    .catch(async (err) => {
      console.error("[seed] failed:", err);
      await closeDb();
      process.exit(1);
    });
}
