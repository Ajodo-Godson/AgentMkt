import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Job, JobSnapshot, Plan, Step } from "../src/lib/types";

interface StoredJob {
  job: Job;
  createdAtMs: number;
  confirmedAtMs: number | null;
  cancelled: boolean;
  routeKind: "standard" | "expensive";
}

const app = new Hono();
const jobs = new Map<string, StoredJob>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"]
  })
);

app.get("/health", (context) => context.json({ ok: true }));

app.post("/jobs", async (context) => {
  const body = (await context.req.json()) as { user_id: string; prompt: string };
  if (!body.prompt?.trim()) {
    return context.json({ error: "validation", details: "prompt is required" }, 400);
  }

  const now = new Date().toISOString();
  const id = `job_demo_${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(id, {
    createdAtMs: Date.now(),
    confirmedAtMs: null,
    cancelled: false,
    routeKind: /expensive|premium|enterprise|legal|board/i.test(body.prompt) ? "expensive" : "standard",
    job: {
      id,
      user_id: body.user_id,
      prompt: body.prompt,
      locked_sats: 1500,
      spent_sats: 0,
      status: "planning",
      created_at: now,
      updated_at: now
    }
  });

  return context.json({ job_id: id });
});

app.get("/jobs/:jobId", (context) => {
  const stored = jobs.get(context.req.param("jobId"));
  if (!stored) {
    return context.json({ error: "not_found" }, 404);
  }

  return context.json(materializeSnapshot(stored));
});

app.post("/jobs/:jobId/clarify", (context) => {
  const stored = jobs.get(context.req.param("jobId"));
  if (!stored) {
    return context.json({ error: "not_found" }, 404);
  }

  return context.json({ ok: true });
});

app.post("/jobs/:jobId/confirm", async (context) => {
  const stored = jobs.get(context.req.param("jobId"));
  if (!stored) {
    return context.json({ error: "not_found" }, 404);
  }

  const body = (await context.req.json()) as { confirmed: boolean };
  if (body.confirmed) {
    stored.confirmedAtMs = Date.now();
    stored.cancelled = false;
  } else {
    stored.cancelled = true;
  }

  return context.json({ ok: true });
});

const port = Number(process.env.PORT_ORCHESTRATOR ?? 4001);

serve(
  {
    fetch: app.fetch,
    port
  },
  (info) => {
    console.log(`Mock orchestrator listening on http://localhost:${info.port}`);
  }
);

function materializeSnapshot(stored: StoredJob): JobSnapshot {
  const elapsed = Date.now() - stored.createdAtMs;
  const planVisible = elapsed >= 1100;
  const now = new Date().toISOString();
  const plan = planVisible ? buildPlan(stored.job.id, stored.job.created_at, stored.routeKind) : null;
  const steps = plan ? buildSteps(plan.id, stored.confirmedAtMs, stored.routeKind) : [];
  const allDone = steps.length > 0 && steps.every((step) => step.status === "succeeded");

  let status: Job["status"] = "planning";
  let spent = 0;
  let locked = stored.job.locked_sats;

  if (stored.cancelled) {
    status = "cancelled";
    locked = 0;
  } else if (!planVisible) {
    status = "planning";
  } else if (!stored.confirmedAtMs && elapsed >= 3200) {
    status = "awaiting_user";
  } else if (stored.confirmedAtMs && allDone) {
    status = "completed";
    spent = stored.routeKind === "expensive" ? 3200 : 1240;
    locked = 0;
  } else if (stored.confirmedAtMs) {
    status = "executing";
    spent = steps.filter((step) => step.status === "succeeded").reduce((sum, step) => sum + step.estimate_sats, 0);
    locked = Math.max(0, stored.job.locked_sats - spent);
  }

  return {
    job: {
      ...stored.job,
      status,
      spent_sats: spent,
      locked_sats: locked,
      updated_at: now
    },
    plan: plan
      ? {
          ...plan,
          status: stored.confirmedAtMs ? "approved" : "draft"
        }
      : null,
    steps_progress: steps
  };
}

function buildPlan(jobId: string, createdAt: string, routeKind: StoredJob["routeKind"]): Plan {
  const planId = `plan_${jobId.slice(-6)}`;
  const expensive = routeKind === "expensive";
  return {
    id: planId,
    job_id: jobId,
    version: 1,
    steps: buildSteps(planId, null, routeKind),
    total_estimate_sats: expensive ? 3200 : 1240,
    assumptions: expensive
      ? ["Premium suppliers selected for high-stakes work.", "CFO interrupt required because route spend is unusual."]
      : ["Human voiceover has a 5 minute SLA.", "Fallback TTS can be used if the human declines."],
    status: "draft",
    created_at: createdAt
  };
}

function buildSteps(planId: string, confirmedAtMs: number | null, routeKind: StoredJob["routeKind"]): Step[] {
  const elapsed = confirmedAtMs ? Date.now() - confirmedAtMs : 0;
  const expensive = routeKind === "expensive";
  const statuses: Step["status"][] = confirmedAtMs
    ? [
        elapsed < 1800 ? "running" : "succeeded",
        elapsed < 1800 ? "pending" : elapsed < 3600 ? "running" : "succeeded",
        elapsed < 3600 ? "pending" : elapsed < 6500 ? "running" : "succeeded"
      ]
    : ["pending", "pending", "pending"];

  return [
    {
      id: "step_summarize",
      plan_id: planId,
      dag_node: "summarize_article",
      capability_tag: "summarization",
      primary_worker_id: "worker_agent_summarizer",
      fallback_ids: ["worker_402index_briefly", "worker_agent_notesmith"],
      estimate_sats: expensive ? 700 : 200,
      ceiling_sats: expensive ? 770 : 220,
      depends_on: [],
      human_required: false,
      optional: false,
      status: statuses[0],
      retries_left: 2,
      result: statuses[0] === "succeeded" ? { kind: "json", data: { summary: "A concise article brief." } } : undefined
    },
    {
      id: "step_translate",
      plan_id: planId,
      dag_node: "translate_summary_fr",
      capability_tag: "translation_fr",
      primary_worker_id: "worker_agent_translator_fr",
      fallback_ids: ["worker_402index_lingua", "worker_agent_polyglot"],
      estimate_sats: expensive ? 900 : 200,
      ceiling_sats: expensive ? 990 : 220,
      depends_on: ["step_summarize"],
      human_required: false,
      optional: false,
      status: statuses[1],
      retries_left: 2,
      result: statuses[1] === "succeeded" ? { kind: "json", data: { translated_text: "Un bref resume en francais." } } : undefined
    },
    {
      id: "step_voiceover",
      plan_id: planId,
      dag_node: "record_native_voiceover",
      capability_tag: "voiceover_human",
      primary_worker_id: "worker_human_claire",
      fallback_ids: ["worker_human_luc", "worker_agent_tts_fr"],
      estimate_sats: expensive ? 1600 : 800,
      ceiling_sats: expensive ? 1760 : 880,
      depends_on: ["step_translate"],
      human_required: true,
      optional: false,
      status: statuses[2],
      retries_left: 2,
      result:
        statuses[2] === "succeeded"
          ? { kind: "file", mime_type: "audio/mpeg", storage_url: "https://example.com/demo-voiceover.mp3" }
          : undefined
    }
  ];
}
