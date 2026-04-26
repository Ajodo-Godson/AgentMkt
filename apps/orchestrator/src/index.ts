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
import { graph } from "./graph.js";
import { jobStore, planStore } from "./store.js";
import { logger } from "./logger.js";

const app = new Hono();
const PORT = Number(process.env.PORT_ORCHESTRATOR ?? 4001);

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

  const { user_id, prompt, budget_sats } = parsed.data;
  const job_id = buildJobId();
  const now = new Date().toISOString();

  const job: Job = {
    id: job_id,
    user_id,
    prompt,
    budget_sats,
    locked_sats: 0,
    spent_sats: 0,
    status: "intake",
    created_at: now,
    updated_at: now,
  };

  jobStore.set(job_id, job);

  const config = { configurable: { thread_id: job_id } };

  // Run graph asynchronously — caller polls GET /jobs/:id for status
  (async () => {
    try {
      logger.info({ job_id }, "Graph execution started");
      await graph.invoke({ job }, config);
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

  return c.json({ job_id });
});

// ─── GET /jobs/:job_id ────────────────────────────────────────────────────────
app.get("/jobs/:job_id", async (c) => {
  const job_id = c.req.param("job_id");
  const job = jobStore.get(job_id);

  if (!job) {
    return c.json({ error: "not_found" }, 404);
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
  try {
    const config = { configurable: { thread_id: job_id } };
    const graphState = await graph.getState(config);
    if (graphState?.values) {
      const vals = graphState.values as Record<string, unknown>;
      final_output = (vals.final_output as string | null) ?? null;
      hub_bolt11 = (vals.hub_bolt11 as string | null) ?? null;
    }
  } catch {
    // State not yet available (graph not started or no checkpointer snapshot)
  }

  return c.json({ job, plan, steps_progress, final_output, hub_bolt11 });
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
