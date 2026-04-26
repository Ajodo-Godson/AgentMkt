// In-memory store for Phase 1. Phase 3: replace with Postgres via @agentmkt/db.
import type { Job, Plan } from "@agentmkt/contracts";

export const jobStore = new Map<string, Job>();
export const planStore = new Map<string, Plan>();
