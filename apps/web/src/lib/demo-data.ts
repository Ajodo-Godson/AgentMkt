import type { CapabilityTag, RoutePreference, Step, WorkerCandidate } from "./types";

export const DEFAULT_PROMPT =
  "Summarize this article and have a French native speaker record a 30-second voiceover of the summary.";

export const DEMO_WALLET_AVAILABLE_SATS = 5000;
export const STANDARD_ROUTE_ESTIMATE_SATS = 1240;
export const PREMIUM_ROUTE_COST_SATS = 1840;

export const routePreferenceLabels: Record<RoutePreference, { label: string; detail: string }> = {
  balanced: {
    label: "Balanced",
    detail: "Balances quality, cost, and reliability"
  },
  lowest_cost: {
    label: "Lowest cost",
    detail: "Prefers lower route cost when quality is acceptable"
  },
  highest_quality: {
    label: "Highest quality",
    detail: "Prefers stronger ratings and verifier history"
  },
  fastest: {
    label: "Fastest",
    detail: "Prefers lower latency and availability"
  }
};

export const capabilityLabels: Record<CapabilityTag, string> = {
  summarization: "Summarize",
  translation_es: "Translate ES",
  translation_fr: "Translate FR",
  translation_de: "Translate DE",
  tts_en: "TTS EN",
  tts_fr: "TTS FR",
  image_generation: "Image",
  code_review: "Review",
  fact_check: "Fact check",
  voiceover_human: "Voiceover",
  creative_writing_human: "Creative"
};

export const workerCandidatesByCapability: Partial<Record<CapabilityTag, WorkerCandidate[]>> = {
  summarization: [
    {
      id: "worker_agent_summarizer",
      displayName: "Atlas Summarizer",
      type: "agent",
      rating: 4.8,
      priceSats: 200,
      successRate: 98,
      latencyMs: 840,
      source: "internal",
      reason: "Highest reputation at the 200 sat tier."
    },
    {
      id: "worker_402index_briefly",
      displayName: "Briefly L402",
      type: "agent",
      rating: 4.3,
      priceSats: 160,
      successRate: 91,
      latencyMs: 1210,
      source: "402index",
      reason: "Cheaper, but weaker recent verifier score."
    },
    {
      id: "worker_agent_notesmith",
      displayName: "Notesmith",
      type: "agent",
      rating: 4.6,
      priceSats: 260,
      successRate: 96,
      latencyMs: 650,
      source: "internal",
      reason: "Fastest candidate, over target price."
    }
  ],
  translation_fr: [
    {
      id: "worker_agent_translator_fr",
      displayName: "Babel Relay",
      type: "agent",
      rating: 4.7,
      priceSats: 200,
      successRate: 97,
      latencyMs: 930,
      source: "internal",
      reason: "Best balance of rating, price, and French accuracy."
    },
    {
      id: "worker_402index_lingua",
      displayName: "Lingua402",
      type: "agent",
      rating: 4.4,
      priceSats: 180,
      successRate: 92,
      latencyMs: 1400,
      source: "402index",
      reason: "Lower price, but slower p95 latency."
    },
    {
      id: "worker_agent_polyglot",
      displayName: "Polyglot Prime",
      type: "agent",
      rating: 4.9,
      priceSats: 340,
      successRate: 99,
      latencyMs: 760,
      source: "internal",
      reason: "Best raw quality, but weaker value for this route."
    }
  ],
  voiceover_human: [
    {
      id: "worker_human_claire",
      displayName: "Claire Martin",
      type: "human",
      rating: 4.9,
      priceSats: 800,
      successRate: 96,
      latencyMs: null,
      source: "internal",
      reason: "Native French speaker with best completion rate."
    },
    {
      id: "worker_human_luc",
      displayName: "Luc Bernard",
      type: "human",
      rating: 4.6,
      priceSats: 700,
      successRate: 89,
      latencyMs: null,
      source: "internal",
      reason: "Lower price, lower availability."
    },
    {
      id: "worker_agent_tts_fr",
      displayName: "Paris TTS",
      type: "agent",
      rating: 4.2,
      priceSats: 300,
      successRate: 93,
      latencyMs: 1200,
      source: "internal",
      reason: "Cheap fallback, but not human-native."
    }
  ]
};

export function getCandidatesForStep(step: Step | null): WorkerCandidate[] {
  if (!step) {
    return [];
  }

  const candidates = workerCandidatesByCapability[step.capability_tag] ?? [];
  return candidates.length > 0
    ? candidates
    : [
        {
          id: step.primary_worker_id,
          displayName: step.primary_worker_id,
          type: step.human_required ? "human" : "agent",
          rating: 3.5,
          priceSats: step.estimate_sats,
          successRate: 0,
          latencyMs: null,
          source: "internal",
          reason: "Awaiting worker metadata from orchestrator."
        }
      ];
}

export function getWorkerName(workerId: string): string {
  for (const candidates of Object.values(workerCandidatesByCapability)) {
    const match = candidates?.find((candidate) => candidate.id === workerId);
    if (match) {
      return match.displayName;
    }
  }

  return workerId;
}

export function getQualityScore(candidate: WorkerCandidate): number {
  return Math.round(candidate.rating * 14 + candidate.successRate * 0.3);
}

export function getCostEfficiency(candidate: WorkerCandidate): number {
  const normalizedCost = candidate.type === "human" ? candidate.priceSats / 12 : candidate.priceSats / 4;
  return Math.max(8, Math.min(98, Math.round(112 - normalizedCost)));
}

export function getValueScore(candidate: WorkerCandidate): number {
  return Math.round(getQualityScore(candidate) * 0.62 + getCostEfficiency(candidate) * 0.38);
}
