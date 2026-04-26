// Mocks for parallel development (Phase 1). Switch via USE_MOCKS=true.
// Verbatim from instructions section 7.1, with TypeScript types added.
import type { VerifierVerdict, WorkerCandidate } from "@agentmkt/contracts";

export const mockHub = {
  topup: async (_req: { job_id: string; amount_sats: number }) => ({
    bolt11: "lnbc_mock",
    expires_at: new Date(Date.now() + 600000).toISOString(),
  }),

  topupStatus: async (_req: { bolt11: string }) => ({
    paid: true,
    amount_sats: 1000,
  }),

  hold: async (_req: { job_id: string; step_id: string; ceiling_sats: number }) => ({
    hold_invoice_id: "hold_" + Math.random().toString(36).slice(2),
    bolt11: "lnbc_mock",
  }),

  forward: async (_req: {
    hold_invoice_id: string;
    supplier_endpoint: string;
    supplier_payload: unknown;
  }) => ({
    result: { kind: "json" as const, data: { mock: true } },
    paid_to_supplier_sats: 200,
    fee_sats: 10,
  }),

  settle: async (_req: { hold_invoice_id: string }) => ({
    settled_sats: 200,
    fee_sats: 10,
  }),

  cancel: async (_req: { hold_invoice_id: string; reason: string }) => ({
    refunded_sats: 220,
  }),

  notifyHuman: async (_req: {
    hold_invoice_id: string;
    telegram_chat_id: string;
    brief: string;
    payout_sats: number;
  }) => ({ notified: true }),

  walletBalance: async (_user_id: string) => ({
    available_sats: 50_000,
  }),
};

export const mockMarketplace = {
  discover: async (_req: {
    capability_tags: string[];
    max_price_sats?: number;
    min_rating?: number;
    include_external?: boolean;
    limit?: number;
  }): Promise<{ candidates: WorkerCandidate[] }> => ({
    candidates: [
      {
        worker_id: "worker_mock_alice",
        display_name: "Alice Summarizer",
        capability_tags: ["summarization"],
        base_price_sats: 200,
        ewma: 4.5,
        total_jobs: 12,
        source: "internal" as const,
        endpoint_url: "http://localhost:5001/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_bob",
        display_name: "Bob Fast Summarizer",
        capability_tags: ["summarization"],
        base_price_sats: 100,
        ewma: 4.1,
        total_jobs: 30,
        source: "internal" as const,
        endpoint_url: "http://localhost:5001/service",
        type: "agent" as const,
      },
    ],
  }),

  rate: async (_req: {
    worker_id: string;
    capability_tag: string;
    job_id: string;
    step_id: string;
    source: string;
    score: number;
    reason?: string;
  }) => ({ rating_id: "rating_mock", new_ewma: 4.5 }),

  verify: async (_req: {
    capability_tag: string;
    spec: string;
    result: unknown;
  }): Promise<{ verdict: VerifierVerdict }> => ({
    verdict: { kind: "PASS", confidence: 0.9 },
  }),
};
