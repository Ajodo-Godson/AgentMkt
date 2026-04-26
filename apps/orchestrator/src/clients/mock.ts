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

  jobBalance: async (_job_id: string) => ({
    topped_up_sats: 0,
    held_sats: 0,
    settled_sats: 0,
    fees_sats: 0,
    available_sats: 0,
  }),

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
      {
        worker_id: "worker_mock_claire",
        display_name: "Claire French Translator",
        capability_tags: ["translation_fr"],
        base_price_sats: 200,
        ewma: 4.7,
        total_jobs: 20,
        source: "internal" as const,
        endpoint_url: "http://localhost:5002/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_dieter",
        display_name: "Dieter German Translator",
        capability_tags: ["translation_de"],
        base_price_sats: 200,
        ewma: 4.6,
        total_jobs: 18,
        source: "internal" as const,
        endpoint_url: "http://localhost:5002/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_elena",
        display_name: "Elena Spanish Translator",
        capability_tags: ["translation_es"],
        base_price_sats: 200,
        ewma: 4.6,
        total_jobs: 19,
        source: "internal" as const,
        endpoint_url: "http://localhost:5002/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_fiona",
        display_name: "Fiona French TTS",
        capability_tags: ["tts_fr"],
        base_price_sats: 300,
        ewma: 4.5,
        total_jobs: 14,
        source: "internal" as const,
        endpoint_url: "http://localhost:5003/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_eli",
        display_name: "Eli English TTS",
        capability_tags: ["tts_en"],
        base_price_sats: 300,
        ewma: 4.4,
        total_jobs: 16,
        source: "internal" as const,
        endpoint_url: "http://localhost:5003/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_hugo",
        display_name: "Hugo Native French Voiceover",
        capability_tags: ["voiceover_human"],
        base_price_sats: 800,
        ewma: 4.8,
        total_jobs: 11,
        source: "internal" as const,
        endpoint_url: null,
        type: "human" as const,
      },
      {
        worker_id: "worker_mock_grace",
        display_name: "Grace Creative Writer",
        capability_tags: ["creative_writing_human"],
        base_price_sats: 500,
        ewma: 4.7,
        total_jobs: 22,
        source: "internal" as const,
        endpoint_url: null,
        type: "human" as const,
      },
      {
        worker_id: "worker_mock_ivan",
        display_name: "Ivan Image Generator",
        capability_tags: ["image_generation"],
        base_price_sats: 400,
        ewma: 4.4,
        total_jobs: 35,
        source: "internal" as const,
        endpoint_url: "http://localhost:5004/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_jane",
        display_name: "Jane Fact Checker",
        capability_tags: ["fact_check"],
        base_price_sats: 250,
        ewma: 4.6,
        total_jobs: 28,
        source: "internal" as const,
        endpoint_url: "http://localhost:5005/service",
        type: "agent" as const,
      },
      {
        worker_id: "worker_mock_kai",
        display_name: "Kai Code Reviewer",
        capability_tags: ["code_review"],
        base_price_sats: 350,
        ewma: 4.5,
        total_jobs: 17,
        source: "internal" as const,
        endpoint_url: "http://localhost:5006/service",
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
