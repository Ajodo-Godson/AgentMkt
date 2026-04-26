AgentMkt — Lightning Agent Marketplace
A two-sided marketplace where AI agents and humans can be hired by other agents (or humans), paid in bitcoin via the Lightning Network, with budget-aware orchestration and reputation-weighted routing.

0. For AI coding agents — read this first
This document is the source of truth for a 4-person hackathon team in which each person uses their own AI coding agent session. Multiple agents will read this doc concurrently. Follow these rules:
Read sections 1–6 fully. They define the product, stack, and shared types every workstream depends on.
Find your workstream in section 7. You are P1, P2, P3, or P4 — the human running you knows which. Read only your subsection in detail.
Do not modify files outside your workstream. Section 7 explicitly lists "files you own" and "files you must not touch."
Use the data contracts in section 5 verbatim. Do not add fields. Do not rename. Do not "improve" them. If a field is missing for your needs, add a TODO comment and ask the human; do not invent.
Use the API contracts in section 6 verbatim. Do not invent endpoint paths, methods, or request shapes.
For dependencies on other workstreams, use the mocks in your workstream section. Do not reach into another workstream's code. Mock now, integrate at phase 3.
When in doubt, leave a TODO(P{n}): comment. Do not guess. A clear TODO is better than wrong code.
Do not add new dependencies to package.json without checking section 2 first. The stack is pinned for a reason.
Do not change packages/contracts/ or packages/db/ schema unless explicitly asked. These are shared and changes break other workstreams.
Section 11 lists the common hallucinations. Read it before coding.
If this document contradicts itself or contradicts the human's instructions, the human's latest instruction wins, then this document, then your training intuitions last.

1. What we're building
A user (the buyer) sends a prompt and a budget in sats. An orchestration core plans the work as a DAG of subtasks, picks workers from a marketplace of L402-paywalled agent endpoints and registered humans, runs each step through a payment hub that holds funds in HTLC escrow until verification passes, then synthesizes the results back to the buyer. Workers earn sats; the marketplace takes a small fee per settled step. Reputation is rated by buyers and verifiers and feeds back into routing.
The Lightning Network is load-bearing here, not decorative. Hold-invoices give us atomic escrow without writing custody contracts, and sub-cent fees make tasks profitable at sat-level granularity. Stablecoin rails would not work for this product.
The five subsystems:
#
Subsystem
Owner
One-line role
1
Frontend
P4
Chat UI + Telegram bot
2
Orchestration core
P1
LangGraph state machine: plan, gate, execute, synthesize
3
Marketplace
P3
Worker registry, reputation, discovery, verifier
4
Payment hub
P2
Lightning proxy with HTLC escrow and ledger
5
Supply side
P3
Demo L402 endpoints + 402index MCP integration


2. Tech stack (pinned)
Versions verified April 25, 2026. Use exactly these unless an update is explicitly approved by the team.
Concern
Package / version
Notes
Language
TypeScript ^5.6
Everywhere. No Python services.
Runtime
Node.js 22 LTS (or 24 LTS)
Node 20 LTS reaches EOL April 30, 2026 — do not use it.
Package manager
pnpm 10.33.0
Set via "packageManager": "[email protected]" in root package.json. pnpm 11 is still RC; do not use.
Frontend framework
next@^16.2.4 (App Router, Turbopack default)
Run pnpm create next-app@latest --yes for new apps. Includes AGENTS.md template for AI-assisted development.
Orchestration
@langchain/langgraph@^1.2.9 + @langchain/core@^1.x
The state machine.
LLM (primary)
NVIDIA NIM, model meta/llama-3.3-70b-instruct
Free, ~40 RPM/model. OpenAI-compatible.
LLM client
openai@^4.x (with baseURL pointed at NIM)
Same SDK works for NIM and OpenAI.
LLM (fallback)
@anthropic-ai/sdk@^0.90.0, model claude-haiku-4-5
Cheap fallback ($1/$5 per Mtok) if NIM degraded. Use claude-sonnet-4-6 if quality matters. Older claude-3-5-* IDs are retired — do not use.
Database
PostgreSQL 16
Single shared instance.
ORM
drizzle-orm@^0.45.2 + drizzle-kit@^0.x
Use stable, not the 1.0.0-beta line.
Validation
zod@^4.3.6
All API boundaries. Use import * as z from "zod".
Lightning (hub wallet)
Lexe Sidecar SDK
Run the Lexe sidecar binary; hub speaks to it via REST at localhost:5393. Do not use MDK for the hub — see workstream P2 for why.
L402 client
Custom (~50 LOC) over Lexe sidecar's pay_invoice endpoint
The L402 protocol is HTTP 402 + macaroon retry; the Lightning side is one invoice payment.
L402 paywalls (demo suppliers)
@moneydevkit/nextjs@^0.13.0 (withPayment HOC)
Each supplier is a tiny Next.js app with one paywalled route. MDK is Next.js-only, which is fine for suppliers because they're Next.js apps.
External marketplace
402index.io MCP server
For supply-side discovery.
Telegram
node-telegram-bot-api@^0.67.0 + @types/node-telegram-bot-api@^0.64.14
One bot, one chat per registered human. Long-polling, no webhooks.
HTTP framework (services)
hono@^4.x
Lightweight, runs anywhere. Use across orchestrator, hub, marketplace, tg-bot.
Hosting (frontend)
Vercel
Push to deploy.
Hosting (services + Lexe sidecar)
Railway (or Fly)
One Node process per service. The Lexe sidecar runs in the same container as the hub.
Hosting (Postgres)
Railway managed Postgres or Neon
One shared instance.

Do not add other dependencies without consensus. No alternative wallets, no alternative ORMs, no Python sidecars, no Docker (Lexe sidecar binary excepted).

3. Repository layout
agentmkt/
├── apps/
│   ├── web/                     # P4 — Next.js frontend
│   ├── orchestrator/            # P1 — LangGraph service (Node HTTP server)
│   ├── hub/                     # P2 — Payment Hub service
│   ├── marketplace/             # P3 — Discovery + Registry + Verifier
│   └── tg-bot/                  # P4 — Telegram bot service
├── suppliers/                   # P3 — Demo L402 endpoints
│   ├── summarizer/              # MDK-paywalled summarizer
│   ├── translator/              # MDK-paywalled translator
│   └── tts/                     # MDK-paywalled TTS
├── packages/
│   ├── contracts/               # SHARED — TypeScript types only. NO logic.
│   ├── db/                      # SHARED — Drizzle schema + migrations.
│   └── llm/                     # SHARED — LLM client wrapper (NIM + Anthropic).
├── scripts/
│   ├── seed.ts                  # Seed demo workers, ratings, etc.
│   └── smoke.ts                 # End-to-end smoke test.
├── .env.example
├── pnpm-workspace.yaml
├── package.json
└── README.md                    # This file.

Ownership rules:
apps/{owned}/ — only that workstream's owner modifies.
suppliers/*/ — P3 owns; P1/P2 may run them locally as test fixtures.
packages/contracts/ — read by everyone, modified by no one without team-wide ack. P1 is the steward.
packages/db/ — P3 is the steward. Schema changes require P1 + P2 ack.
packages/llm/ — P1 is the steward. Anyone may import.
scripts/ — P3 owns seed.ts, P4 owns smoke.ts.

4. Environment variables
Single .env file at repo root. Every service reads from it. Never commit .env; only .env.example.
# --- Database ---
DATABASE_URL=postgres://user:pass@host:5432/agentmkt

# --- LLM ---
NVIDIA_API_KEY=nvapi-xxxxx
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
ANTHROPIC_API_KEY=sk-ant-xxxxx           # Fallback only.
LLM_FALLBACK_TO_ANTHROPIC=false           # Flip to true if NIM degraded.

# --- Lightning (hub) ---
# Hub talks to a Lexe sidecar binary running locally. The sidecar holds the
# wallet seed and exposes a REST API on localhost:5393 by default.
LEXE_SIDECAR_URL=http://localhost:5393
LEXE_NETWORK=mainnet                       # or "testnet" for dev. Use real mainnet sats for the demo.
HUB_BASE_URL=http://localhost:4002         # Hub service URL (used by P1).

# --- Lightning (suppliers, only Next.js demo suppliers) ---
# Each supplier in suppliers/* uses MDK and has its own credentials.
MDK_ACCESS_TOKEN_SUMMARIZER=mdk_xxxxx
MDK_MNEMONIC_SUMMARIZER=word1 word2 ...
MDK_ACCESS_TOKEN_TRANSLATOR=mdk_xxxxx
MDK_MNEMONIC_TRANSLATOR=word1 word2 ...
MDK_ACCESS_TOKEN_TTS=mdk_xxxxx
MDK_MNEMONIC_TTS=word1 word2 ...

# --- Marketplace ---
MARKETPLACE_BASE_URL=http://localhost:4003 # Used by P1.
INDEX_402_MCP_URL=https://mcp.402index.io # External feed.

# --- Telegram ---
TELEGRAM_BOT_TOKEN=xxxxx
TELEGRAM_BOT_USERNAME=AgentMktBot

# --- Frontend ---
NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:4001

# --- Service ports (local dev) ---
PORT_WEB=3000
PORT_ORCHESTRATOR=4001
PORT_HUB=4002
PORT_MARKETPLACE=4003
PORT_TG_BOT=4004
PORT_SUPPLIER_SUMMARIZER=5001
PORT_SUPPLIER_TRANSLATOR=5002
PORT_SUPPLIER_TTS=5003

# --- Demo seeding ---
DEMO_BUYER_USER_ID=user_demo_buyer
DEMO_HUMAN_WORKER_TG_CHAT_ID=000000000    # Fill with a real Telegram chat for live demo.


5. Data contracts (THE single source of truth)
All types below live in packages/contracts/src/index.ts. Every service imports from @agentmkt/contracts.
Rules:
Do not add fields without team-wide ack.
Do not rename fields.
Do not change semantics (e.g., never make sats a float).
All money values are number representing whole sats. No floats, no msats, no BTC.
All timestamps are ISO 8601 strings or Date objects — never Unix epochs.
// =========================================================================
// IDs (all strings, prefix-tagged for grep-ability)
// =========================================================================
export type JobId      = string; // "job_..."
export type PlanId     = string; // "plan_..."
export type StepId     = string; // "step_..."
export type WorkerId   = string; // "worker_..."
export type UserId     = string; // "user_..."
export type RatingId   = string; // "rating_..."
export type LedgerId   = string; // "ledger_..."

// =========================================================================
// Capability tags (closed enum — extend only via PR with team ack)
// =========================================================================
export type CapabilityTag =
  | "summarization"
  | "translation_es"
  | "translation_fr"
  | "translation_de"
  | "tts_en"
  | "tts_fr"
  | "image_generation"
  | "code_review"
  | "fact_check"
  | "voiceover_human"
  | "creative_writing_human";

// =========================================================================
// Job lifecycle
// =========================================================================
export interface Job {
  id: JobId;
  user_id: UserId;
  prompt: string;
  budget_sats: number;
  locked_sats: number;        // Held in hub for this job.
  spent_sats: number;         // Already settled to suppliers + fees.
  status: "intake" | "planning" | "awaiting_user" | "executing" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
}

// =========================================================================
// Plan + Steps
// =========================================================================
export interface Plan {
  id: PlanId;
  job_id: JobId;
  version: number;            // Increments on each replan.
  steps: Step[];
  total_estimate_sats: number;
  assumptions: string[];      // Surface to user at confirm gate.
  status: "draft" | "approved" | "rejected" | "superseded";
  created_at: string;
}

export interface Step {
  id: StepId;
  plan_id: PlanId;
  dag_node: string;           // Node id within the plan, e.g. "summarize_doc".
  capability_tag: CapabilityTag;
  primary_worker_id: WorkerId;
  fallback_ids: WorkerId[];   // Ordered, used in sequence on retry.
  estimate_sats: number;
  ceiling_sats: number;       // Max we'll pay (= estimate * 1.1).
  depends_on: StepId[];       // Other step ids that must complete first.
  human_required: boolean;
  optional: boolean;          // If true, executor may skip on failure.
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  retries_left: number;       // Starts at 2.
  result?: StepResult;
  error?: string;
}

export type StepResult =
  | { kind: "json"; data: unknown }
  | { kind: "text"; text: string }
  | { kind: "file"; mime_type: string; storage_url: string };

// =========================================================================
// CFO verdicts
// =========================================================================
export type CfoVerdict =
  | { kind: "APPROVED" }
  | { kind: "REVISE"; reason: "over_budget" | "step_too_large" | "untrusted_worker"; detail: string }
  | { kind: "USER_CONFIRM"; summary: string };

// =========================================================================
// Workers
// =========================================================================
export interface Worker {
  id: WorkerId;
  type: "agent" | "human";
  endpoint_url: string | null;        // For agents: L402 URL. For humans: null.
  telegram_chat_id: string | null;    // For humans only.
  owner_user_id: UserId;
  display_name: string;
  capability_tags: CapabilityTag[];
  base_price_sats: number;
  stake_sats: number;
  source: "internal" | "402index";    // 402index workers are external/discovered.
  status: "pending" | "active" | "suspended";
  listed_at: string;
}

// =========================================================================
// Reputation
// =========================================================================
export interface Rating {
  id: RatingId;
  worker_id: WorkerId;
  capability_tag: CapabilityTag;
  job_id: JobId;
  step_id: StepId;
  source: "user" | "verifier" | "system";
  score: number;              // 1..5 for user, -1..1 for verifier/system.
  reason?: string;
  created_at: string;
}

export interface ReputationSnapshot {
  worker_id: WorkerId;
  capability_tag: CapabilityTag;
  ewma: number;               // Smoothed score, 0..5 scale.
  total_jobs: number;
  successful_jobs: number;
  last_updated: string;
}

// =========================================================================
// Verification
// =========================================================================
export type VerifierVerdict =
  | { kind: "PASS"; confidence: number; reason?: string }
  | { kind: "FAIL_RETRYABLE"; reason: string }
  | { kind: "FAIL_FATAL"; reason: string };

// =========================================================================
// Hub / Ledger
// =========================================================================
export interface LedgerEntry {
  id: LedgerId;
  job_id: JobId;
  step_id: StepId | null;
  type: "topup" | "hold" | "settle" | "refund" | "fee" | "payout";
  amount_sats: number;        // Always positive; type indicates direction.
  bolt11?: string;            // Invoice if applicable.
  preimage?: string;          // Settled HTLCs only.
  created_at: string;
}

export interface HoldInvoice {
  id: string;                 // Hub-generated.
  job_id: JobId;
  step_id: StepId;
  amount_sats: number;
  bolt11: string;
  status: "pending" | "held" | "settled" | "cancelled" | "expired";
  created_at: string;
  expires_at: string;
}


6. API contracts (cross-service endpoints)
All services speak HTTP/JSON. All requests/responses validated with Zod schemas exported from packages/contracts. Never invent endpoints not listed here.
6.1 Orchestrator (P1) — base :4001
POST /jobs
  body: { user_id: UserId, prompt: string, budget_sats: number }
  → 200 { job_id: JobId }                    // Async; fetch status separately.
  → 400 { error: "validation"; details }

GET /jobs/:job_id
  → 200 { job: Job, plan: Plan | null, steps_progress: Step[] }
  → 404 { error: "not_found" }

POST /jobs/:job_id/clarify
  body: { answer: string }
  → 200 { ok: true }                         // Resumes the planning loop.

POST /jobs/:job_id/confirm
  body: { confirmed: boolean }
  → 200 { ok: true }                         // Resumes after CFO USER_CONFIRM.

6.2 Hub (P2) — base :4002
POST /hub/topup
  body: { job_id: JobId, amount_sats: number }
  → 200 { bolt11: string, expires_at: string }
  // Buyer pays this invoice to fund their job-account in the Hub ledger.

POST /hub/topup/status
  body: { bolt11: string }
  → 200 { paid: boolean, amount_sats: number }

POST /hub/hold
  body: { job_id: JobId, step_id: StepId, ceiling_sats: number }
  → 200 { hold_invoice_id: string, bolt11: string }
  → 402 { error: "insufficient_funds" }
  // Hub creates a hold-invoice from job-account funds. Caller (orchestrator)
  // does NOT pay this invoice; the funds are already in the job-account.
  // The hold is a logical reservation in the ledger.

POST /hub/forward
  body: { hold_invoice_id: string, supplier_endpoint: string, supplier_payload: unknown }
  → 200 { result: unknown, paid_to_supplier_sats: number, fee_sats: number }
  → 402 { error: "supplier_paywall_failed", detail: string }
  → 504 { error: "supplier_timeout" }
  // Hub does L402 handshake with supplier, pays from held funds (price - fee),
  // returns the supplier's response. HTLC remains held until /settle.

POST /hub/settle
  body: { hold_invoice_id: string }
  → 200 { settled_sats: number, fee_sats: number }
  // Releases sats to supplier (already paid in /forward — this confirms).
  // For human workers, this is when the human's wallet is credited.

POST /hub/cancel
  body: { hold_invoice_id: string, reason: string }
  → 200 { refunded_sats: number }
  // Cancels HTLC; sats return to job-account.

POST /hub/notify-human
  body: { hold_invoice_id: string, telegram_chat_id: string, brief: string, payout_sats: number }
  → 200 { notified: true }
  // Used for human-required steps. Hub holds funds; tg-bot delivers brief.

POST /hub/human-submit
  body: { hold_invoice_id: string, result: StepResult }
  → 200 { ok: true }
  // Called by tg-bot when human submits. Hub holds until orchestrator calls /settle or /cancel.

GET /hub/job-balance/:job_id
  → 200 { topped_up_sats: number, held_sats: number, settled_sats: number, fees_sats: number, available_sats: number }

6.3 Marketplace (P3) — base :4003
POST /discover
  body: {
    capability_tags: CapabilityTag[],
    max_price_sats?: number,
    min_rating?: number,
    include_external?: boolean,    // default true; queries 402index.
    limit?: number                  // default 5.
  }
  → 200 { candidates: WorkerCandidate[] }

POST /workers
  body: {
    type: "agent" | "human",
    endpoint_url?: string,
    telegram_chat_id?: string,
    owner_user_id: UserId,
    display_name: string,
    capability_tags: CapabilityTag[],
    base_price_sats: number,
    stake_sats?: number
  }
  → 201 { worker: Worker }
  → 400 { error: "validation" | "endpoint_unhealthy" }

GET /workers/:worker_id
  → 200 { worker: Worker, reputation: ReputationSnapshot[] }

POST /ratings
  body: {
    worker_id: WorkerId,
    capability_tag: CapabilityTag,
    job_id: JobId,
    step_id: StepId,
    source: "user" | "verifier" | "system",
    score: number,
    reason?: string
  }
  → 201 { rating_id: RatingId, new_ewma: number }

POST /verify
  body: {
    capability_tag: CapabilityTag,
    spec: string,                   // Original step spec.
    result: StepResult
  }
  → 200 { verdict: VerifierVerdict }

6.4 Frontend (P4) — base :3000
The UI calls only the orchestrator. It does not call hub/marketplace directly.
6.5 Telegram bot (P4) — base :4004
The bot is a long-running process. It exposes one internal endpoint for the hub to push notifications:
POST /tg/notify
  body: { hold_invoice_id: string, telegram_chat_id: string, brief: string, payout_sats: number }
  → 200 { delivered: true }
  // Hub calls this, bot sends the Telegram message with accept/decline buttons.

When a human submits via the bot, the bot calls POST /hub/human-submit directly.
6.6 Suppliers (P3 owns demo ones) — base :5001-5003
Each supplier exposes a single L402-paywalled endpoint:
POST /service
  // No body initially — first request returns 402 with L402 challenge.
  → 402 { /* L402 WWW-Authenticate header */ }
  // After payment + auth header retry:
  body: { /* capability-specific shape, see suppliers/{name}/README.md */ }
  → 200 { result: StepResult }

The hub's /forward handles the L402 handshake transparently; orchestrator never sees 402 directly.

7. Workstreams
7.1 Workstream P1 — Orchestration core (LangGraph)
Owner: P1 Goal: A LangGraph state machine exposed via HTTP that takes a prompt+budget and runs the full plan-gate-execute-synthesize loop, calling Hub and Marketplace for the actions it cannot do itself.
Files you OWN (free to modify)
apps/orchestrator/
├── src/
│   ├── index.ts              # HTTP server (Hono or Express)
│   ├── graph.ts              # LangGraph definition
│   ├── state.ts              # Graph state shape
│   ├── nodes/
│   │   ├── ceo-intake.ts
│   │   ├── coo-planner.ts
│   │   ├── cfo-gate.ts       # Pure function. NO LLM.
│   │   ├── dag-executor.ts
│   │   └── synthesizer.ts
│   ├── prompts/
│   │   ├── coo-system.txt
│   │   └── synthesizer-system.txt
│   └── clients/
│       ├── hub.ts            # Calls P2's API
│       └── marketplace.ts    # Calls P3's API
├── package.json
└── tsconfig.json

You also steward packages/llm/ (LLM client wrapper) and packages/contracts/ (types). Changes to either require team ack.
Files you READ but DO NOT MODIFY
packages/contracts/src/index.ts — only edit with full team ack.
packages/db/src/schema.ts — read only; P3 owns it.
Files you MUST NOT TOUCH
apps/hub/**, apps/marketplace/**, apps/web/**, apps/tg-bot/**, suppliers/**.
Dependencies on other workstreams
Hub (P2): call POST /hub/topup, /hold, /forward, /settle, /cancel, /notify-human. Use clients/hub.ts to wrap; never inline fetch.
Marketplace (P3): call POST /discover, /ratings, /verify. Use clients/marketplace.ts.
Mocks for parallel development
While P2/P3 are not done, run against a mock. Create apps/orchestrator/src/clients/mock.ts:
export const mockHub = {
  topup: async () => ({ bolt11: "lnbc_mock", expires_at: new Date(Date.now() + 600000).toISOString() }),
  topupStatus: async () => ({ paid: true, amount_sats: 1000 }),
  hold: async (req) => ({ hold_invoice_id: "hold_" + Math.random().toString(36).slice(2), bolt11: "lnbc_mock" }),
  forward: async (req) => ({ result: { kind: "json", data: { mock: true } }, paid_to_supplier_sats: 200, fee_sats: 10 }),
  settle: async () => ({ settled_sats: 200, fee_sats: 10 }),
  cancel: async () => ({ refunded_sats: 220 }),
};

export const mockMarketplace = {
  discover: async (req) => ({ candidates: [
    { worker_id: "worker_mock_alice", display_name: "Alice Summarizer", capability_tags: ["summarization"], base_price_sats: 200, ewma: 4.5, total_jobs: 12 },
    { worker_id: "worker_mock_bob", display_name: "Bob Fast Summarizer", capability_tags: ["summarization"], base_price_sats: 100, ewma: 4.1, total_jobs: 30 },
  ]}),
  rate: async () => ({ rating_id: "rating_mock", new_ewma: 4.5 }),
  verify: async () => ({ verdict: { kind: "PASS", confidence: 0.9 } }),
};

Use a USE_MOCKS=true env var to switch between mock and real clients. Default to mocks until phase 3.
Tasks in order
Scaffold the service. Hono server on port 4001, POST /jobs returns a job_id. Postgres connection via packages/db. Health check at GET /health.
Implement state.ts. The LangGraph state is the union of Job + Plan + Step[] plus message history. Use Zod for runtime validation.
Implement ceo-intake. LLM call to classify intent + extract constraints. Persists Job row. If budget < 100 sats, reject. Calls POST /hub/topup, returns bolt11 to UI for the buyer to pay.
Implement coo-planner. LLM call with system prompt at prompts/coo-system.txt. Receives intent + marketplace candidates (from /discover), emits a Plan as structured JSON. Validate output with Zod; on parse failure, retry once with the validation error fed back. Iteration limit 3.
Implement cfo-gate. Pure function. The exact rules:
total_estimate * 1.2 > budget → REVISE("over_budget").
any step.estimate_sats > 0.4 * budget → REVISE("step_too_large").
any worker.total_jobs < 5 && worker.stake_sats < 2 * step.estimate_sats → REVISE("untrusted_worker").
total_estimate * 1.2 > 0.5 * budget OR any step has human_required → USER_CONFIRM.
else → APPROVED.
Implement dag-executor. Walks the DAG, runs independent steps in parallel via LangGraph Send. For each step: /hub/hold → /hub/forward → /marketplace/verify → /hub/settle or /hub/cancel. Retry budget 2 per step. On exhaustion, fall back to the next worker; if no fallback, replan or fail.
Implement synthesizer. LLM call combining all step outputs into the final response. Fires rating prompts via /marketplace/ratings from the verifier signal. Calls /hub/cancel on any unspent topup balance to refund.
Wire up the graph. Edges, conditional edges, interrupt nodes for clarify and confirm.
Integration. Flip USE_MOCKS=false, point at real Hub and Marketplace URLs.
Definition of done
Phase 1 (h4–18): mocks-only; the full graph runs end-to-end against mock hub/marketplace; CFO gate works; clarify and confirm interrupts work via API.
Phase 3 (h22–34): real services; one job runs end-to-end with real sats moving.
Common pitfalls (anti-hallucination)
The CFO gate is not an LLM call. Do not "improve" it by adding LLM judgment.
The COO planner emits structured JSON only. Do not let the LLM emit prose that needs parsing.
Do not add new endpoints to the Hub or Marketplace API. If you need data, look in section 6 first; if it's not there, ask a human.
Money values are integer sats. Do not introduce floats anywhere in the orchestrator.
Do not call supplier endpoints directly. The Hub does the L402 handshake; you only call /hub/forward.

7.2 Workstream P2 — Payment hub (Lightning proxy)
Owner: P2 Goal: A Lightning-aware HTTP service that holds funds in a per-job ledger, generates hold-invoices, does L402 handshakes with supplier endpoints, and settles or cancels HTLCs based on signals from the orchestrator.
Files you OWN (free to modify)
apps/hub/
├── src/
│   ├── index.ts              # HTTP server (Hono on :4002)
│   ├── routes/
│   │   ├── topup.ts
│   │   ├── hold.ts
│   │   ├── forward.ts
│   │   ├── settle.ts
│   │   ├── cancel.ts
│   │   ├── notify-human.ts
│   │   ├── human-submit.ts
│   │   └── balance.ts
│   ├── lightning/
│   │   ├── lexe-client.ts    # Wraps REST calls to localhost:5393
│   │   └── l402-client.ts    # Custom L402 handshake using lexe-client
│   ├── ledger/
│   │   ├── postings.ts       # All ledger writes go through here
│   │   └── balance.ts        # Balance computation (sum of postings)
│   └── policy/
│       └── fee.ts            # Marketplace fee policy. Currently flat 5%.
├── bin/
│   └── lexe-sidecar          # The Lexe sidecar binary (downloaded at setup time, gitignored)
├── package.json
└── tsconfig.json

Files you READ but DO NOT MODIFY
packages/contracts/src/index.ts
packages/db/src/schema.ts (the ledger_entries and hold_invoices tables — defined by P3, read by you)
Files you MUST NOT TOUCH
Everything outside apps/hub/.
Dependencies on other workstreams
Marketplace (P3): the tg-bot (P4) calls you when a human submits — you don't call them. You don't depend on Marketplace for normal flow.
Telegram bot (P4): you call POST /tg/notify to push briefs. Use clients/tg-bot.ts (you create this).
Mocks for parallel development
You can develop entirely against your own demo L402 endpoints. Spin up suppliers/summarizer locally and wire forward to it. For Telegram notifications, mock with a console log until P4's bot is running.
// apps/hub/src/clients/tg-bot.ts
export const tgBot = {
  notify: async (req) => {
    if (process.env.USE_MOCKS === "true") {
      console.log("[MOCK TG] notify:", req);
      return { delivered: true };
    }
    const r = await fetch(`${process.env.TG_BOT_URL}/tg/notify`, { method: "POST", body: JSON.stringify(req) });
    return r.json();
  }
};

Tasks in order
Set up the Lexe sidecar. Follow https://github.com/lexe-app/lexe-sidecar-sdk. Download the sidecar binary into apps/hub/bin/, run it as a child process from apps/hub/src/index.ts, confirm it listens on localhost:5393. Endpoints you'll use: GET /v2/health, GET /v2/node/node_info, POST /v2/node/create_invoice, POST /v2/node/pay_invoice, GET /v2/node/payment?index=.... Send 1 sat from your personal wallet to the hub's Lexe sidecar wallet as a smoke test by calling create_invoice and paying the bolt11. This is the most important milestone of phase 0 — if Lightning isn't working by hour 4, escalate immediately. Why Lexe instead of MDK: MDK only ships as @moneydevkit/nextjs and is bound to the Next.js request lifecycle; the hub is a standalone long-running Node service that needs to make outbound payments and hold state across requests, which MDK doesn't model. Lexe's sidecar is purpose-built for this — a real Lightning node controlled by REST.


Implement lightning/lexe-client.ts. Thin TS wrapper over fetch calling LEXE_SIDECAR_URL. Functions: createInvoice(sats, memo), payInvoice(bolt11, maxFeeSats), getPayment(index), nodeInfo(). All amounts pass as integer-sat strings (Lexe uses fixed-precision decimals serialized as strings).


Implement ledger/postings.ts. Every state change (topup, hold, settle, refund, fee, payout) writes a LedgerEntry. Append-only. No updates, ever.


Implement ledger/balance.ts. A job's available balance is sum(topup) - sum(hold) - sum(fee_committed). Held funds are sum(hold) - sum(settle) - sum(refund).


Implement /topup. Call lexeClient.createInvoice(amount, "Topup for job_xxx"), return the bolt11. Poll Lexe's getPayment (or use webhook if Lexe sidecar supports it; see SDK docs) for payment confirmation. On confirmed receipt, write a topup ledger entry.


Implement /hold. Pure ledger operation: check available balance, write a hold ledger entry, return a synthesized hold_invoice_id. No actual Lightning invoice is created at this step — it's a logical reservation against the buyer's job-account in the hub's books.


Implement /forward for L402 agents in lightning/l402-client.ts. Steps:


Look up the hold by hold_invoice_id.
HTTP POST to supplier_endpoint with supplier_payload.
Server returns 402 with WWW-Authenticate: L402 macaroon="...", invoice="lnbc...".
Parse the WWW-Authenticate header to extract the macaroon and invoice.
Call lexeClient.payInvoice(invoice, maxFeeSats). Lexe returns a payment index; poll getPayment(index) until status is succeeded and you have the preimage.
Retry the HTTP POST with Authorization: L402 <macaroon>:<preimage> header. Get the 200 response with the result.
Compute: paid_to_supplier_sats = invoice_amount, fee_sats = computeFee(paid_to_supplier_sats).
Write payout and fee ledger entries.
Return result, paid amount, fee.
Implement /settle. Marks the hold as settled in the ledger. The actual sats already moved to the supplier in step 7 (since L402 requires upfront payment) — settle is a bookkeeping confirmation. For human workers, this is when payout actually happens (see step 10).


Implement /cancel. Marks the hold as cancelled. For agent steps where /forward already paid the supplier, we can't unpay them — write a cancel_after_paid ledger entry and the buyer eats the loss for that step. For human steps where no payment has happened yet, the hold is simply released back to job-account.


Implement /notify-human and /human-submit. For human-required steps:


/hold is called as usual (logical reservation).
/notify-human is called by orchestrator → calls tg-bot → tg-bot delivers Telegram message.
When human submits via Telegram, tg-bot calls /human-submit with the result.
Hub stores the result, marks the hold as human_submitted.
Orchestrator polls or is notified, runs verifier.
If pass: orchestrator calls /settle. Hub then actually pays the human by calling lexeClient.payInvoice against a Lightning address or BOLT11 the human provided at registration. Write payout + fee entries.
If fail: orchestrator calls /cancel. Hub releases hold. Human is not paid.
Implement /balance for the orchestrator to query.


Implement fee policy in policy/fee.ts. Hackathon spec: flat 5% of paid_to_supplier_sats, rounded down to nearest sat. Function signature:

 export function computeFee(paid_to_supplier_sats: number): number;


Definition of done
Phase 0 (h0–4): Lexe sidecar binary running, REST endpoints respond, 1 sat moves into the hub's Lexe wallet from a personal wallet via a create_invoice + paid bolt11. Documented in a #happy-path channel post with the payment index and preimage.
Phase 1 (h4–18): All endpoints in section 6.2 implemented and working against suppliers/summarizer. Smoke: orchestrator's mock can call hub for a full happy-path step.
Phase 3 (h22–34): Real integration with orchestrator. Human-submit flow working end-to-end with P4's bot.
Common pitfalls (anti-hallucination)
L402 paymentr requires payment up front to get the result. /forward cannot be "preview the result, then decide to settle." The settle is essentially a no-op for agents because the supplier was already paid during the L402 handshake. The hold-invoice atomicity here is for the orchestrator's accounting, not Lightning's wire-level escrow. For human workers, the hold is real and the payment is deferred until /settle.
Do not use floats for any sat amount. Use Math.floor for fee rounding.
The hub does not know about workers, ratings, or marketplace logic. Do not add a workers table to the hub. The orchestrator passes you supplier_endpoint strings; that's all you need.
Do not call the orchestrator. The orchestrator is the orchestrator; you are a service it consumes.

7.3 Workstream P3 — Marketplace + supply side
Owner: P3 Goal: A registry of workers (agents and humans), a discovery API ranking candidates by reputation, a verifier sub-service, three demo L402 supplier endpoints, and integration with 402index.io's MCP server.
Files you OWN (free to modify)
apps/marketplace/
├── src/
│   ├── index.ts                # HTTP server
│   ├── routes/
│   │   ├── discover.ts
│   │   ├── workers.ts
│   │   ├── ratings.ts
│   │   └── verify.ts
│   ├── discovery/
│   │   ├── internal.ts         # Postgres-backed
│   │   ├── external-402index.ts # 402index MCP client
│   │   └── ranker.ts           # Scoring function
│   ├── reputation/
│   │   └── ewma.ts
│   └── verifier/
│       ├── schema-check.ts     # Per-capability schema validation
│       ├── sanity-check.ts     # Per-capability heuristics
│       └── llm-judge.ts        # LLM-based content quality check
├── package.json
└── tsconfig.json

suppliers/
├── summarizer/
│   ├── src/
│   │   ├── index.ts            # MDK-paywalled Next.js or Hono endpoint
│   │   └── summarize.ts
│   └── package.json
├── translator/                 # Same structure
└── tts/                        # Same structure (returns audio file URL)

packages/db/                    # YOU steward this.
└── src/
    ├── schema.ts
    ├── migrations/
    └── seed.ts                 # Demo workers + initial ratings

scripts/seed.ts                 # Calls packages/db/seed.ts

Files you READ but DO NOT MODIFY
packages/contracts/src/index.ts
Files you MUST NOT TOUCH
apps/orchestrator/, apps/hub/, apps/web/, apps/tg-bot/.
Dependencies on other workstreams
None for marketplace itself. You are called by P1 (orchestrator) for /discover, /ratings, /verify. Demo suppliers are called transparently by P2 (hub) via L402 — you don't even know about it from your side.
Mocks for parallel development
You don't need mocks; you have no upstream callers. Develop independently. Use scripts/seed.ts to insert test workers and run /discover queries with curl or HTTPie.
Tasks in order
Define the database schema in packages/db/src/schema.ts. Tables: users, workers, jobs, plans, steps, ratings, reputation_snapshots, ledger_entries, hold_invoices. Mirror the types in section 5. Run migrations.


Seed script. scripts/seed.ts inserts:


1 buyer user (id user_demo_buyer).
5 agent workers (3 internal pointing at suppliers/*, 2 external from 402index).
2 human workers with their Telegram chat IDs.
~20 historical ratings to give the workers non-trivial reputations.
Build the demo suppliers in suppliers/. Each is a tiny Next.js 16 app with one MDK-paywalled API route using withPayment from @moneydevkit/nextjs/server:

 // suppliers/summarizer/app/service/route.ts
import { withPayment } from "@moneydevkit/nextjs/server";
const handler = async (req: Request) => {
  const { text, max_length } = await req.json();
  const summary = await runNimSummarizer(text, max_length);
  return Response.json({ kind: "json", data: { summary } });
};
export const POST = withPayment({ amount: 200, currency: "SAT" }, handler);


summarizer: input { text: string, max_length: number } → output { summary: string }. 200 sats.
translator: input { text: string, target_lang: "es" | "fr" | "de" } → output { translated_text: string }. 200 sats.
tts: input { text: string, voice: "en" | "fr" } → output { audio_url: string }. 300 sats.
Use NIM Llama 3.3 70B for the actual work inside each supplier (eat your own dog food on the LLM choice).
Each supplier needs its own MDK credentials — create one MDK account per supplier via npx @moneydevkit/create and store the access token + mnemonic in env vars.
Implement /workers (POST) — list a worker. For agent workers, do a health check (probe their L402 endpoint, confirm 402 response). For humans, confirm Telegram chat ID is reachable.


Implement /discover. Scoring formula (start here, tune later):

 score = 0.4 * (ewma / 5)
      + 0.2 * (1 / Math.max(1, base_price_sats / 100))
      + 0.3 * (successful_jobs / Math.max(1, total_jobs))
      - 0.1 * normalized_p95_latency;  // 0 if unknown
 Sources to merge:


Internal Postgres workers matching the capability tags.
402index MCP results (for include_external: true). Mark source: "402index".
Return top N (default 5) by score, including reputation summary.


Implement /ratings. Insert the rating, recompute the EWMA: ewma_new = 0.7 * ewma_old + 0.3 * normalized_event_score. Update reputation_snapshots.


Implement /verify. Three-layer pipeline:


Schema check (fast, deterministic): does result match the expected shape for capability_tag? E.g., translation requires result.kind === "json" with data.translated_text string non-empty.
Sanity check (per capability): for translation, run langdetect on the output; for summarization, check len(summary) < len(input) / 2.
LLM judge (only if first two pass): prompt the LLM with the spec + result, ask { valid: bool, confidence: 0..1, reason: string }. Pass if valid && confidence >= 0.7.
Return PASS, FAIL_RETRYABLE (e.g., empty output, possibly transient), or FAIL_FATAL (e.g., wrong language).
Implement 402index MCP client. Read https://mcp.402index.io docs, query the search_services tool, map results into WorkerCandidate shape with source: "402index".


Definition of done
Phase 1 (h4–18): Schema + seed + demo suppliers working. /discover returns ranked candidates. /verify returns verdicts.
Phase 3 (h22–34): Real integration with orchestrator and hub. End-to-end demo job calls a real supplier through the hub.
Common pitfalls (anti-hallucination)
The verifier is inside marketplace, not a separate service. Do not stand up a apps/verifier/.
Do not invent capability tags. Use only those in section 5.
402index MCP results don't have reputation data in your system. Treat them as total_jobs: 0, ewma: 3.5 (neutral) for first-time discovery; build local reputation as jobs complete.
The supplier endpoints are public services (MDK-paywalled). Do not invent auth headers or API keys for them. The Hub handles L402 entirely.
Demo suppliers need to actually work — judges will trigger live runs. Keep their LLM calls to a single NIM call each, no chaining.

7.4 Workstream P4 — Frontend + Telegram
Owner: P4 Goal: A chat UI where the buyer enters a prompt, sets a budget, watches the plan being built, approves/declines via the CFO gate, sees real-time spend, and rates workers at the end. Plus a Telegram bot that delivers human-required tasks and accepts submissions.
Files you OWN (free to modify)
apps/web/                       # Next.js 15 App Router
├── src/
│   ├── app/
│   │   ├── page.tsx            # Landing
│   │   ├── jobs/[id]/page.tsx  # Job runner UI
│   │   ├── workers/page.tsx    # Browse marketplace
│   │   └── workers/new/page.tsx # List your own worker
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── BudgetGauge.tsx     # Live spend tracker
│   │   ├── PlanPreview.tsx     # CFO confirm UI
│   │   ├── RatingPrompt.tsx
│   │   └── PlanTrace.tsx       # Shows COO's worker selection reasoning
│   └── lib/
│       └── orchestrator.ts     # API client (only calls orchestrator)
├── package.json
└── next.config.mjs

apps/tg-bot/
├── src/
│   ├── index.ts                # Bot bootstrap + webhook server (port 4004)
│   ├── handlers/
│   │   ├── notify.ts           # POST /tg/notify endpoint
│   │   ├── accept.ts           # User taps "Accept" in TG
│   │   ├── submit.ts           # User submits result
│   │   └── decline.ts
│   └── clients/
│       └── hub.ts              # Calls hub's /human-submit
├── package.json
└── tsconfig.json

scripts/smoke.ts                # End-to-end smoke test (yours)

Files you READ but DO NOT MODIFY
packages/contracts/src/index.ts
Files you MUST NOT TOUCH
apps/orchestrator/, apps/hub/, apps/marketplace/, suppliers/, packages/db/.
Dependencies on other workstreams
Frontend: calls only the orchestrator (POST /jobs, GET /jobs/:id, POST /jobs/:id/clarify, POST /jobs/:id/confirm).
Telegram bot: receives POST /tg/notify from hub; calls hub's POST /hub/human-submit.
Mocks for parallel development
For the frontend, point NEXT_PUBLIC_ORCHESTRATOR_URL at a local mock server until P1's orchestrator is up. Create apps/web/mocks/orchestrator.ts:
// Run as a separate Hono server during dev: tsx apps/web/mocks/orchestrator.ts
// Returns a fake but well-shaped Job + Plan with 3 steps over 4 seconds (simulated streaming).

For the bot, run against the real Telegram API immediately (it's free, just register a bot via @BotFather). For the hub callback, log to console until P2's hub is up.
Tasks in order
Frontend (Next.js):
Scaffold. pnpm create next-app with App Router + TypeScript + Tailwind. Single page at /.
Chat panel. Streaming chat UI. On submit, call POST /jobs, then poll GET /jobs/:id every 1 second. Display:
Current status (intake, planning, executing, etc.).
The plan when available (with worker names + costs per step).
Live spend counter (queries hub balance via orchestrator's job endpoint).
CFO confirm modal. When job status is awaiting_user, show a modal with the plan summary + cost. Buttons: "approve" (calls POST /jobs/:id/confirm with confirmed: true) and "cancel" (with false).
Plan trace component. Show the COO's reasoning: "picked Alice because rating 4.7 and within budget vs Bob at rating 4.2." Pull this from the orchestrator's response (P1 will include a reasoning field on each plan step — coordinate with P1 to add this to the contract).
Worker browse + list pages. Calls marketplace /discover (read-only). The "list your worker" page calls POST /workers directly via a server action.
Rating prompt. When job completes, show 1–5 star rating per worker that participated. Submits via orchestrator (which forwards to marketplace). Optional tags like "fast", "high quality", etc.
Telegram bot:
Set up bot. Register via @BotFather, get token. node-telegram-bot-api long-polling mode (no webhooks for hackathon — webhooks need HTTPS + DNS).
Implement /tg/notify. HTTP endpoint on port 4004. Receives { hold_invoice_id, telegram_chat_id, brief, payout_sats }, sends a Telegram message with inline buttons "Accept" and "Decline." Include the brief and payout amount.
Implement accept handler. When human taps "Accept," reply with "Submit your work as a reply to this message." Track state per hold_invoice_id.
Implement submit handler. When human replies (text, audio, file), construct a StepResult and call POST /hub/human-submit. Send confirmation back.
Decline / timeout. If declined or no submit within SLA (default 5 min), the hub will eventually timeout-cancel the hold; bot just logs.
Smoke script:
scripts/smoke.ts — runs the full happy path end-to-end. Hits POST /jobs with a known prompt+budget, waits for completion, asserts the Job ends in completed status with non-zero spent_sats. Run this once per hour from h24 onward; if it fails, the team stops feature work and fixes regressions.
Definition of done
Phase 1 (h4–18): Frontend renders against mock orchestrator, all UI states (planning, confirm modal, executing, rating) reachable. Bot can send and receive a test message.
Phase 3 (h22–34): Real integration. End-to-end smoke test passes. Live demo of human-in-loop scenario works.
Common pitfalls (anti-hallucination)
The frontend calls only the orchestrator. Do not call hub or marketplace directly from the browser. Routing through orchestrator keeps the contract surface minimal and lets us add auth later in one place.
Do not introduce a state management library. React state + polling is fine for a 48hr build. No Redux, no Zustand, no Jotai.
Do not "improve" the contract by adding fields to Job or Plan for UI convenience. If you need a new field, ask P1 to add it via packages/contracts/.
Bot uses long-polling, not webhooks. Webhooks need HTTPS, DNS, and pain we don't have time for.
Do not store credentials or sats in browser localStorage. The frontend never sees a wallet.

8. Build phases & timing
Phase
Hours
Activity
Owner emphasis
0 — Scaffolding
0–4
All four agents set up their lanes in parallel. P2's milestone is critical: 1 sat must move by hour 4.
Everyone parallel
1 — Vertical slices
4–18
Each workstream builds against mocks. Each ends Phase 1 with an independently demoable subsystem.
Everyone parallel
2 — Sleep
18–22
Stagger if needed; do not skip.
Everyone
3 — Integration
22–34
Replace mocks with real services. Pairs: P1+P2 wire executor↔hub; P3+P4 wire marketplace↔frontend and bot↔hub. End of phase: full happy path runs end-to-end with real sats.
P4 leads, all in
4 — Wow features
34–42
Live spend dashboard, human-in-loop demo with teammate, side-by-side budget comparison.
P4 leads
5 — Lockdown
42–48
Bug-fix only. Rehearse demo 3+ times with real sats. Record backup video.
All

Phase 0 single critical milestone: P2 confirms a sat has moved from a personal wallet to the hub wallet, and posts the preimage in #happy-path. If this is not done by hour 4, escalate immediately — Lightning issues at hour 30 are unrecoverable.

9. Integration smoke tests (run during phase 3)
A passing run of all four asserts the team is on track.
9.1 Orchestrator ↔ Hub
# 1. Topup
curl -X POST localhost:4002/hub/topup -d '{"job_id":"job_test","amount_sats":1000}'
# → returns bolt11

# 2. Pay the bolt11 from a personal wallet (or Hub testing endpoint)

# 3. Hold
curl -X POST localhost:4002/hub/hold -d '{"job_id":"job_test","step_id":"step_test","ceiling_sats":250}'
# → returns hold_invoice_id

# 4. Forward
curl -X POST localhost:4002/hub/forward -d '{"hold_invoice_id":"...", "supplier_endpoint":"http://localhost:5001/service", "supplier_payload":{"text":"...","max_length":50}}'
# → returns the summary, paid_sats, fee_sats

# 5. Settle
curl -X POST localhost:4002/hub/settle -d '{"hold_invoice_id":"..."}'
# → returns settled_sats

9.2 Orchestrator ↔ Marketplace
curl -X POST localhost:4003/discover -d '{"capability_tags":["summarization"],"limit":3}'
# → returns 3 candidates with EWMA, total_jobs

curl -X POST localhost:4003/verify -d '{"capability_tag":"summarization","spec":"summarize this text in <50 words","result":{"kind":"json","data":{"summary":"a short summary"}}}'
# → returns verdict { kind: "PASS", confidence: 0.x }

9.3 Frontend ↔ Orchestrator
Open localhost:3000, type "summarize this paragraph: [text]" with budget 500 sats. Pay the topup. Watch the plan render. Approve. Watch steps execute. Rate the worker.
9.4 Hub ↔ Telegram bot ↔ Hub
curl -X POST localhost:4002/hub/notify-human -d '{"hold_invoice_id":"...","telegram_chat_id":"...","brief":"Record French voiceover","payout_sats":800}'
# → bot delivers a Telegram message; tap accept; reply with text; bot calls back to /hub/human-submit

9.5 Full end-to-end
pnpm tsx scripts/smoke.ts — exits 0 on success, non-zero on any regression. Run hourly from h24.

10. Common rules
Validation at every API boundary. Use Zod schemas exported from packages/contracts.
Errors are JSON. All non-2xx responses return { error: string, detail?: string }. No HTML.
Logging. Use pino with structured fields. Always log job_id and step_id when relevant.
No silent failures. If a step fails for a reason you didn't expect, throw and let it bubble — better to fail loudly during a hackathon than to silently degrade.
No floats for money. Ever. Sats are integers.
No new dependencies without checking section 2 first.
Read your section, not all sections. This README is long; trust your workstream.

11. Anti-hallucination guide
These are mistakes AI agents make that have been pre-empted in this doc. If you catch yourself doing any of these, stop and re-read the relevant section.
Hallucination
Reality
"The CFO needs an LLM call to make smart decisions."
The CFO is a pure function. See section 7.1, task 5.
"I'll add a priority field to Step."
Do not modify packages/contracts/.
"I need a new endpoint /hub/quick-pay."
Use the endpoints in section 6 verbatim. If a need is real, ask P2 first.
"I'll proxy supplier calls through the orchestrator."
The hub does L402; the orchestrator never sees 402.
"Let me use Drizzle to query the workers table from the orchestrator."
Marketplace owns workers data. Call POST /discover.
"I'll use webhooks for the Telegram bot."
Long-polling. Webhooks need HTTPS infrastructure we don't have.
"Stablecoins would be simpler than Lightning here."
The whole pitch is Lightning-native escrow. Do not pivot the architecture.
"I'll add a Redis cache for discovery."
No new infra. Postgres + in-memory is fine for 48hr.
"Money values should be bigint for safety."
Sat amounts fit in number. Use integers.
"The frontend should call hub directly to show live balance."
Frontend calls only orchestrator. The orchestrator surfaces hub balance.
"Let me set up Docker for consistent local dev."
No Docker. pnpm dev per app.
"I'll add tests for everything."
Write a smoke test that runs the happy path. Skip unit tests until after the hackathon.
"Verifier should be its own service for scalability."
Verifier is inside marketplace. Section 7.3.
"I'll regenerate packages/contracts/ types from a JSON schema."
Hand-write them. They're already in section 5.


12. Demo script (final 6 hours of work; rehearse 3+ times)
Setup (before going on stage):
Hub wallet has at least 5,000 sats.
2 demo agents and 1 demo human worker registered, with seeded reputations.
The human worker is a teammate sitting in the audience with Telegram open.
One spare laptop with the backup video queued up.
Live demo (target 3 minutes):
Open the chat UI. Type: "Summarize this article and have a French native speaker record a 30-second voiceover of the summary." Set budget: 1500 sats.
Click submit → Hub topup invoice appears. Pay it from a real wallet on stage. (10 seconds.)
UI shows the COO planning. Plan appears: Step 1 = summarize (200 sats, agent X), Step 2 = translate to French (200 sats, agent Y), Step 3 = voiceover (800 sats, human Z, human-required).
CFO interrupt fires because of the human step. Approval modal: "This plan needs a human (~5 min wait). Total cost 1240 sats incl. fees. Approve?" Click approve.
Steps 1 and 2 run live. UI shows live spend incrementing. Each step's worker name + price appears.
Step 3 fires Telegram notification. Audience teammate's phone buzzes; they accept and submit a recorded mp3 (have one pre-recorded; they paste/upload through the bot). 30 seconds of theater.
Verifier passes. Settle. Final synthesized output appears in chat with a link to the audio.
UI prompts ratings. Rate all 3 workers 5 stars.
Show the spend dashboard: "1240 sats spent, 60 sats marketplace fee captured, 260 sats refunded." Pull up the 402index page and point: "this same orchestrator could have routed to any of these 1100 L402 endpoints — we just happened to route to ours because they had the best price/reputation match."
Backup plan if live demo fails: play the recorded video. Apologize once, briefly, then pivot to architecture explanation using the diagram in docs/architecture.svg.

13. Cut list (in order, if behind at h36)
Drop the LLM judge in the verifier; keep schema check + sanity check only.
Drop the self-service "list your worker" UI. Suppliers are inserted via pnpm seed.
Stop EWMA updates during demo; show static seeded ratings.
Drop the human-in-loop scenario from live demo; play it as a recorded clip.
Drop fallback workers; primary only, one retry.
Drop the side-by-side budget comparison demo.
Never cut: real sats moving from buyer wallet → hub → L402 endpoint → settle. If that's not working live, you don't have a demo.

14. Glossary
L402 — HTTP 402 + macaroon-based payment protocol over Lightning. Endpoints return 402 with a Lightning invoice, caller pays, retries with proof of payment.
HTLC — Hashed Time-Locked Contract. Lightning's primitive for conditional, time-bound payment.
Hold-invoice — A Lightning invoice that, when paid, parks the HTLC at the receiving node without finalizing. The receiver can later settle (release preimage; sender's funds go through) or cancel (let the HTLC expire; sender's funds return automatically).
EWMA — Exponentially Weighted Moving Average. How we smooth ratings over time.
MDK — MoneyDevKit, the Lightning SDK we're using.
NIM — NVIDIA Inference Microservices. Free LLM inference at 40 RPM.
Sat — Satoshi. 1 BTC = 100,000,000 sats. All money values in this project are integer sats.

End of README. If you reached here as an agent, scroll back to your workstream in section 7 and start there.


