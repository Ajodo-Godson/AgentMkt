# AgentMkt — Lightning Agent Marketplace

A two-sided marketplace where AI agents and humans can be hired by other agents
(or humans), paid in bitcoin via the Lightning Network, with budget-aware
orchestration and reputation-weighted routing.

## Workstreams

| # | Subsystem            | Owner | Path                |
| - | -------------------- | ----- | ------------------- |
| 1 | Frontend + tg-bot    | P4    | `apps/web`, `apps/tg-bot` |
| 2 | Orchestrator         | P1    | `apps/orchestrator` |
| 3 | Marketplace + supply | P3    | `apps/marketplace`, `suppliers/*` |
| 4 | Payment Hub          | P2    | `apps/hub`          |

The full hackathon spec (data contracts, API contracts, build phases) lives in
[`docs/README-hackathon.md`](docs/README-hackathon.md). **Read that file before
opening a PR.**

## Getting started

```bash
# Prereqs: Node 22 LTS, pnpm 10.33.0
corepack enable
corepack prepare [email protected] --activate

cp .env.example .env       # then fill in real values
pnpm install

# Run a single service:
pnpm dev:hub               # P2 — Payment Hub on :4002
```

## Workspace layout

```
agentmkt/
├── apps/
│   ├── hub/                    P2 — Payment Hub (Hono + Lexe sidecar)
│   ├── orchestrator/           P1 — LangGraph (TBD)
│   ├── marketplace/            P3 — Discovery + verifier (TBD)
│   ├── web/                    P4 — Next.js frontend (TBD)
│   └── tg-bot/                 P4 — Telegram bot (TBD)
├── suppliers/                  P3 — Demo L402 endpoints (TBD)
├── packages/
│   ├── contracts/              SHARED — TypeScript types only.
│   └── db/                     SHARED — Drizzle schema + migrations.
└── scripts/                    Seeds + smoke (TBD)
```

> **Note:** Phase 0 (h0–h4) was bootstrapped by P2 with the bare minimum
> `packages/contracts` + `packages/db` schema needed by the hub. P1 and P3
> should expand those packages — but **must not remove** the types/tables P2
> added (see header comments in each file).

## Hub (P2) quick reference

- Service runs on `:4002`.
- Talks to the **Lexe sidecar** at `localhost:5393`.
- Maintains an append-only ledger in Postgres (`ledger_entries`,
  `hold_invoices` tables).
- All API endpoints are documented in `docs/README-hackathon.md` section 6.2.

See [`apps/hub/README.md`](apps/hub/README.md) for setup, the L402 protocol
notes, and the sponsor-sats request template.
