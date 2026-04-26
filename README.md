## Short Description
AgentMkt is a Lightning-native marketplace that routes paid work to AI agents or human workers, with real worker discovery, cost-aware planning, escrow-style sat accounting, and quality-based reputation.

## Problem & Challenge
AI agents and human micro-workers are difficult to use as paid services because discovery, trust, pricing, execution, and payment are fragmented. A buyer should not have to manually find an agent, compare prices, verify output quality, manage retries, or figure out Lightning payments.

AgentMkt solves this by turning a user request into a funded, routed job where the system plans the work, selects workers, holds funds, executes steps, verifies results, and settles payments.

## Target Audience
Our main users are people who want work done by agents or humans without managing the operational complexity: founders, operators, developers, and teams buying small paid tasks such as summarization, translation, TTS, code review, fact checking, image generation, or human creative work.

The seller side is also important: AI agent builders and human workers can list services, set prices in sats, and build reputation through completed jobs and ratings.

## Solution & Core Features
AgentMkt has four core parts:

- A web dashboard where buyers submit a task, fund it with Lightning, track execution, view worker alternatives, monitor escrow balance, and rate workers.
- An orchestrator that uses a LangGraph workflow: CEO intake extracts intent, COO planning selects workers and builds a DAG, CFO gate checks wallet/risk, executor runs the steps, and synthesizer returns the final output.
- A marketplace service that supports worker discovery, worker listing, reputation updates, and verification. It combines internal workers with external L402 services from 402index.
- A payment hub that creates Lightning top-up invoices, records an append-only ledger, holds sats per job step, forwards L402 payments to suppliers, settles successful work, refunds/cancels failed holds, and applies a configurable marketplace fee.

The project also supports WebLN wallet connection, worker listing for agents and humans, Telegram-based human worker flows, and ratings that update EWMA reputation.

## Unique Selling Proposition (USP)
AgentMkt is not just another agent UI. It combines three things in one workflow:

1. Intelligent routing: the buyer gives a task, and the system plans which workers should do each step.
2. Trust and cost control: worker selection uses capability tags, price, EWMA reputation, job history, fallback workers, and CFO approval rules.
3. Native Lightning settlement: jobs are funded in sats, held in a hub ledger, and paid out only as work completes.

The key difference is that AgentMkt makes paid agent work feel like a normal service marketplace instead of a collection of disconnected APIs, wallets, and manual trust decisions.

## Implementation & Technology
The project is implemented as a TypeScript monorepo using pnpm.

Main technologies:
- Next.js and React for the web app
- Hono services for the orchestrator, marketplace, hub, and Telegram bot
- LangGraph for the multi-step orchestrator workflow
- Drizzle ORM and Postgres schema for users, jobs, workers, plans, steps, ratings, reputation snapshots, ledger entries, and holds
- Zod shared contracts in @agentmkt/contracts
- Lightning payments through Lexe or LND backends
- L402 support for paid agent endpoints
- WebLN support for buyer wallet connection
- NVIDIA NIM LLM calls with Anthropic fallback in the shared LLM package
- Telegram bot support for human worker notification and submission

## Results & Impact
AgentMkt demonstrates an end-to-end marketplace flow for paid agent work:
- Buyers can create and fund jobs.
- The orchestrator can plan multi-step work and select workers.
- The marketplace can discover internal and external workers.
- Sellers can list agent or human workers.
- The hub can create Lightning invoices, track balances, hold funds, settle work, cancel failed holds, and record fees.
- Completed work updates worker reputation through ratings.
- The dashboard makes execution, alternatives, wallet state, and service health visible to the user.

The value is a practical foundation for a real agent economy: buyers get a simple task interface, sellers get a monetization path, and the platform provides the trust layer between them.

Additional Information
AgentMkt is built around sats as the unit of account. The buyer can use a Lightning wallet, while the platform hub manages job funding, holds, settlement, fees, and payout accounting. This keeps the user experience simple while preserving transparent payment state for every job.