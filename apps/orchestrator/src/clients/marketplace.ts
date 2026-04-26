// HTTP client for P3's Marketplace service (base :4003).
// Only calls endpoints defined in section 6.3. Never invent new ones.
import type {
  CapabilityTag,
  WorkerCandidate,
  VerifierVerdict,
  StepResult,
} from "@agentmkt/contracts";
import { mockMarketplace } from "./mock.js";

const BASE = process.env.MARKETPLACE_BASE_URL ?? "http://localhost:4003";
const USE_MOCKS = process.env.USE_MOCKS === "true";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Marketplace ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const marketplace = {
  discover: (req: {
    capability_tags: CapabilityTag[];
    max_price_sats?: number;
    min_rating?: number;
    include_external?: boolean;
    limit?: number;
  }) =>
    USE_MOCKS
      ? mockMarketplace.discover(req)
      : post<{ candidates: WorkerCandidate[] }>("/discover", req),

  rate: (req: {
    worker_id: string;
    capability_tag: CapabilityTag;
    job_id: string;
    step_id: string;
    source: "user" | "verifier" | "system";
    score: number;
    reason?: string;
  }) =>
    USE_MOCKS
      ? mockMarketplace.rate(req)
      : post<{ rating_id: string; new_ewma: number }>("/ratings", req),

  verify: (req: {
    capability_tag: CapabilityTag;
    spec: string;
    result: StepResult;
  }) =>
    USE_MOCKS
      ? mockMarketplace.verify(req)
      : post<{ verdict: VerifierVerdict }>("/verify", req),
};
