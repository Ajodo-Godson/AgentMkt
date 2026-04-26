import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@agentmkt/db";
import { RatingRequestSchema } from "@agentmkt/contracts";
import { isSuccess, normalizeScore, updateEwma } from "../reputation/ewma.js";
import { log } from "../log.js";

export const ratingsRoutes = new Hono();

ratingsRoutes.post("/ratings", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RatingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation", detail: parsed.error.flatten() },
      400,
    );
  }
  const req = parsed.data;
  const db = getDb();

  const [worker] = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(eq(schema.workers.id, req.worker_id));
  if (!worker) {
    return c.json({ error: "worker_not_found" }, 404);
  }

  const rating_id = `rating_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const normalized = normalizeScore(req.score, req.source);
  const success = isSuccess(normalized);

  await db.insert(schema.ratings).values({
    id: rating_id,
    worker_id: req.worker_id,
    capability_tag: req.capability_tag,
    job_id: req.job_id,
    step_id: req.step_id,
    source: req.source,
    score: req.score,
    reason: req.reason,
  });

  const [prior] = await db
    .select()
    .from(schema.reputation_snapshots)
    .where(
      and(
        eq(schema.reputation_snapshots.worker_id, req.worker_id),
        eq(schema.reputation_snapshots.capability_tag, req.capability_tag),
      ),
    );

  const new_ewma = updateEwma(prior?.ewma ?? null, normalized);

  await db
    .insert(schema.reputation_snapshots)
    .values({
      worker_id: req.worker_id,
      capability_tag: req.capability_tag,
      ewma: new_ewma,
      total_jobs: 1,
      successful_jobs: success ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [
        schema.reputation_snapshots.worker_id,
        schema.reputation_snapshots.capability_tag,
      ],
      set: {
        ewma: new_ewma,
        total_jobs: sql`${schema.reputation_snapshots.total_jobs} + 1`,
        successful_jobs: success
          ? sql`${schema.reputation_snapshots.successful_jobs} + 1`
          : schema.reputation_snapshots.successful_jobs,
        last_updated: sql`now()`,
      },
    });

  log.info(
    {
      worker_id: req.worker_id,
      capability_tag: req.capability_tag,
      source: req.source,
      score: req.score,
      normalized,
      new_ewma,
    },
    "rating recorded",
  );

  return c.json({ rating_id, new_ewma }, 201);
});
