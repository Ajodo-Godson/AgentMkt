import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb, schema } from "@agentmkt/db";
import { ListWorkerRequestSchema } from "@agentmkt/contracts";
import {
  probeAgentEndpoint,
  probeTelegramChat,
} from "../health-check.js";
import { log } from "../log.js";

export const workersRoutes = new Hono();

const NEUTRAL_EWMA = 3.5;

workersRoutes.post("/workers", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ListWorkerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation", detail: parsed.error.flatten() },
      400,
    );
  }
  const req = parsed.data;

  const health =
    req.type === "agent"
      ? await probeAgentEndpoint(req.endpoint_url!)
      : await probeTelegramChat(req.telegram_chat_id!);

  if (!health.ok) {
    log.warn({ req, reason: health.reason }, "endpoint_unhealthy");
    return c.json(
      { error: "endpoint_unhealthy", detail: health.reason },
      400,
    );
  }

  const db = getDb();
  const id = `worker_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  // Dev-friendly: auto-upsert the owner user so any owner_user_id "just works"
  // without requiring a separate signup flow. In production we'd front this
  // with proper auth + a real /users endpoint.
  await db
    .insert(schema.users)
    .values({ id: req.owner_user_id })
    .onConflictDoNothing();

  const inserted = await db
    .insert(schema.workers)
    .values({
      id,
      type: req.type,
      endpoint_url: req.endpoint_url ?? null,
      telegram_chat_id: req.telegram_chat_id ?? null,
      owner_user_id: req.owner_user_id,
      display_name: req.display_name,
      capability_tags: req.capability_tags,
      base_price_sats: req.base_price_sats,
      stake_sats: req.stake_sats,
      source: "internal",
      status: "active",
    })
    .returning();
  const worker = inserted[0];
  if (!worker) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await db
    .insert(schema.reputation_snapshots)
    .values(
      req.capability_tags.map((tag) => ({
        worker_id: id,
        capability_tag: tag,
        ewma: NEUTRAL_EWMA,
        total_jobs: 0,
        successful_jobs: 0,
      })),
    )
    .onConflictDoNothing();

  log.info({ worker_id: id, type: req.type }, "worker registered");

  return c.json(
    {
      worker: {
        ...worker,
        listed_at: worker.listed_at.toISOString(),
      },
    },
    201,
  );
});

workersRoutes.get("/workers/:worker_id", async (c) => {
  const worker_id = c.req.param("worker_id");
  const db = getDb();

  const [worker] = await db
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.id, worker_id));

  if (!worker) {
    return c.json({ error: "not_found" }, 404);
  }

  const reputation = await db
    .select()
    .from(schema.reputation_snapshots)
    .where(eq(schema.reputation_snapshots.worker_id, worker_id));

  return c.json({
    worker: { ...worker, listed_at: worker.listed_at.toISOString() },
    reputation: reputation.map((r) => ({
      ...r,
      last_updated: r.last_updated.toISOString(),
    })),
  });
});
