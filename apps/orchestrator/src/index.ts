import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
// Load root .env (monorepo): src/ → orchestrator/ → apps/ → root
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Command } from "@langchain/langgraph";
import * as z from "zod";
import { CreateJobRequestSchema, ClarifyRequestSchema, ConfirmRequestSchema } from "@agentmkt/contracts";
import type { Job } from "@agentmkt/contracts";
import { db, schema } from "@agentmkt/db";
import { eq } from "drizzle-orm";
import { graph } from "./graph.js";
import { jobStore, planStore } from "./store.js";
import { logger } from "./logger.js";
import { hub } from "./clients/hub.js";

const app = new Hono();
const PORT = Number(process.env.PORT_ORCHESTRATOR ?? 4001);

// CORS — manual middleware; open to all origins (no credentials used).
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

function buildJobId(): string {
  return "job_" + Math.random().toString(36).slice(2, 10);
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ ok: true, service: "orchestrator", ts: new Date().toISOString() })
);

// ─── POST /jobs ───────────────────────────────────────────────────────────────
app.post("/jobs", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "validation", details: "Invalid JSON body" }, 400);
  }

  const parsed = CreateJobRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", details: parsed.error.issues }, 400);
  }

  const { user_id, prompt } = parsed.data;
  const job_id = buildJobId();
  const now = new Date().toISOString();

  const job: Job = {
    id: job_id,
    user_id,
    prompt,
    locked_sats: 0,
    spent_sats: 0,
    status: "awaiting_funds",
    created_at: now,
    updated_at: now,
  };

  jobStore.set(job_id, job);

  try {
    await db.insert(schema.users).values({ id: user_id }).onConflictDoNothing();
    await db
      .insert(schema.jobs)
      .values({
        id: job_id,
        user_id,
        prompt,
        budget_sats: 0,
        locked_sats: 0,
        spent_sats: 0,
        status: "intake",
        created_at: new Date(now),
        updated_at: new Date(now),
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.error({ job_id, user_id, err }, "Failed to persist job to database");
    jobStore.delete(job_id);
    return c.json({ error: "persistence_failed", details: "Unable to create job record" }, 500);
  }

  return c.json({ job_id });
});

app.post("/jobs/:job_id/start", async (c) => {
  const job_id = c.req.param("job_id");
  const job = jobStore.get(job_id);

  if (!job) {
    return c.json({ error: "not_found" }, 404);
  }

  if (job.status !== "awaiting_funds") {
    return c.json({ error: "validation", details: "Job is not awaiting funding" }, 400);
  }

  try {
    const balance = await hub.jobBalance(job_id);
    if (balance.available_sats <= 0) {
      return c.json(
        { error: "insufficient_funds", details: "Job has not been funded yet" },
        402
      );
    }
  } catch (err) {
    return c.json(
      { error: "hub_unavailable", details: err instanceof Error ? err.message : String(err) },
      503
    );
  }

  const config = { configurable: { thread_id: job_id } };
  const updatedJob: Job = {
    ...job,
    status: "intake",
    updated_at: new Date().toISOString(),
  };
  jobStore.set(job_id, updatedJob);

  (async () => {
    try {
      logger.info({ job_id }, "Graph execution started");
      await graph.invoke({ job: updatedJob }, config);
      logger.info({ job_id }, "Graph execution completed");
    } catch (err) {
      logger.error({ job_id, err }, "Graph execution error");
      const current = jobStore.get(job_id);
      if (current && current.status !== "completed" && current.status !== "cancelled") {
        jobStore.set(job_id, {
          ...current,
          status: "failed",
          updated_at: new Date().toISOString(),
        });
      }
    }
  })();

  return c.json({ ok: true });
});

// ─── GET /jobs/:job_id ────────────────────────────────────────────────────────
app.get("/jobs/:job_id", async (c) => {
  const job_id = c.req.param("job_id");
  const job = jobStore.get(job_id);

  if (!job) {
    // Orchestrator may have restarted — reconstitute from DB so the frontend
    // sees a terminal status instead of polling forever on 404.
    const [dbJob] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job_id))
      .limit(1);
    if (!dbJob) return c.json({ error: "not_found" }, 404);
    const reconstituted: Job = {
      id: dbJob.id,
      user_id: dbJob.user_id ?? "unknown",
      prompt: dbJob.prompt ?? "",
      status: (dbJob.status as Job["status"]) ?? "failed",
      locked_sats: 0,
      spent_sats: 0,
      created_at: dbJob.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: dbJob.updated_at?.toISOString() ?? new Date().toISOString(),
    };
    return c.json({ job: reconstituted, plan: null, steps_progress: [], final_output: null, hub_bolt11: null, debug: null });
  }

  // Find the latest non-superseded plan
  const plan =
    Array.from(planStore.values())
      .filter((p) => p.job_id === job_id && p.status !== "superseded")
      .sort((a, b) => b.version - a.version)[0] ?? null;

  const steps_progress = plan?.steps ?? [];

  // Read final_output from LangGraph checkpointer state if job completed
  let final_output: string | null = null;
  let hub_bolt11: string | null = null;
  let debug: Record<string, unknown> | null = null;
  try {
    const config = { configurable: { thread_id: job_id } };
    const graphState = await graph.getState(config);
    if (graphState?.values) {
      const vals = graphState.values as Record<string, unknown>;
      final_output = (vals.final_output as string | null) ?? null;
      hub_bolt11 = (vals.hub_bolt11 as string | null) ?? null;
      debug = {
        wallet_balance_sats: vals.wallet_balance_sats ?? null,
        error: vals.error ?? null,
        plan_iterations: vals.plan_iterations ?? null,
        cfo_verdict: vals.cfo_verdict ?? null,
      };
    }
  } catch {
    // State not yet available
  }

  return c.json({ job, plan, steps_progress, final_output, hub_bolt11, debug });
});

// ─── POST /jobs/:job_id/clarify ───────────────────────────────────────────────
app.post("/jobs/:job_id/clarify", async (c) => {
  const job_id = c.req.param("job_id");
  const job = jobStore.get(job_id);

  if (!job) return c.json({ error: "not_found" }, 404);
  if (job.status !== "awaiting_user") {
    return c.json({ error: "validation", details: "Job is not awaiting user input" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "validation", details: "Invalid JSON body" }, 400);
  }

  const parsed = ClarifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", details: parsed.error.issues }, 400);
  }

  const config = { configurable: { thread_id: job_id } };

  // Resume graph with the user's answer
  (async () => {
    try {
      await graph.invoke(new Command({ resume: parsed.data.answer }), config);
    } catch (err) {
      logger.error({ job_id, err }, "Graph resume (clarify) error");
    }
  })();

  return c.json({ ok: true });
});

// ─── POST /jobs/:job_id/confirm ───────────────────────────────────────────────
app.post("/jobs/:job_id/confirm", async (c) => {
  const job_id = c.req.param("job_id");
  const job = jobStore.get(job_id);

  if (!job) return c.json({ error: "not_found" }, 404);
  if (job.status !== "awaiting_user") {
    return c.json({ error: "validation", details: "Job is not awaiting user confirmation" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "validation", details: "Invalid JSON body" }, 400);
  }

  const parsed = ConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", details: parsed.error.issues }, 400);
  }

  const config = { configurable: { thread_id: job_id } };

  // Resume graph with the user's confirm/deny decision
  (async () => {
    try {
      await graph.invoke(new Command({ resume: parsed.data.confirmed }), config);
    } catch (err) {
      logger.error({ job_id, err }, "Graph resume (confirm) error");
    }
  })();

  return c.json({ ok: true });
});

// ─── Start server ─────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  logger.info(`Orchestrator listening on :${PORT}`);
  logger.info(`USE_MOCKS=${process.env.USE_MOCKS ?? "true"}`);
});
