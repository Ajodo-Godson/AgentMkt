import { capabilityLabels } from "./demo-data";
import type { CapabilityTag, MarketplaceWorker } from "./types";

export const USER_WORKERS_STORAGE_KEY = "agentmkt.userWorkers.v1";

export const workerCapabilityOptions: { value: CapabilityTag; label: string }[] = [
  { value: "summarization", label: capabilityLabels.summarization },
  { value: "translation_es", label: capabilityLabels.translation_es },
  { value: "translation_fr", label: capabilityLabels.translation_fr },
  { value: "translation_de", label: capabilityLabels.translation_de },
  { value: "tts_en", label: capabilityLabels.tts_en },
  { value: "tts_fr", label: capabilityLabels.tts_fr },
  { value: "image_generation", label: capabilityLabels.image_generation },
  { value: "code_review", label: capabilityLabels.code_review },
  { value: "fact_check", label: capabilityLabels.fact_check },
  { value: "voiceover_human", label: capabilityLabels.voiceover_human },
  { value: "creative_writing_human", label: capabilityLabels.creative_writing_human }
];

export const seededMarketplaceWorkers: MarketplaceWorker[] = [
  {
    id: "worker_agent_summarizer",
    displayName: "Atlas Summarizer",
    type: "agent",
    capabilities: ["summarization", "fact_check"],
    basePriceSats: 200,
    rating: 4.8,
    successRate: 98,
    completedJobs: 324,
    latencyMs: 840,
    source: "internal",
    status: "active",
    description: "High-signal article, transcript, and report summaries with verifier-friendly structure.",
    contact: "https://suppliers.agentmkt.local/summarizer",
    listedAt: "2026-04-18T16:00:00.000Z",
    reason: "Highest reputation at the 200 sat tier."
  },
  {
    id: "worker_agent_translator_fr",
    displayName: "Babel Relay",
    type: "agent",
    capabilities: ["translation_fr", "translation_es", "translation_de"],
    basePriceSats: 200,
    rating: 4.7,
    successRate: 97,
    completedJobs: 281,
    latencyMs: 930,
    source: "internal",
    status: "active",
    description: "Fast translation worker tuned for short business copy and product-facing text.",
    contact: "https://suppliers.agentmkt.local/translator",
    listedAt: "2026-04-18T16:05:00.000Z",
    reason: "Best balance of rating, price, and French accuracy."
  },
  {
    id: "worker_human_claire",
    displayName: "Claire Martin",
    type: "human",
    capabilities: ["voiceover_human", "translation_fr"],
    basePriceSats: 800,
    rating: 4.9,
    successRate: 96,
    completedJobs: 74,
    latencyMs: null,
    source: "internal",
    status: "active",
    description: "Native French voiceover for short narration, demos, and launch videos.",
    contact: "telegram:@claire_voice",
    listedAt: "2026-04-19T09:20:00.000Z",
    reason: "Native speaker with the strongest completion rate."
  },
  {
    id: "worker_agent_notesmith",
    displayName: "Notesmith",
    type: "agent",
    capabilities: ["summarization", "creative_writing_human"],
    basePriceSats: 260,
    rating: 4.6,
    successRate: 96,
    completedJobs: 193,
    latencyMs: 650,
    source: "internal",
    status: "active",
    description: "Low-latency briefs, bullet summaries, and rewrite passes for operator workflows.",
    contact: "https://suppliers.agentmkt.local/notesmith",
    listedAt: "2026-04-20T11:10:00.000Z",
    reason: "Fastest summarization candidate in the current pool."
  },
  {
    id: "worker_402index_lingua",
    displayName: "Lingua402",
    type: "agent",
    capabilities: ["translation_fr", "translation_es"],
    basePriceSats: 180,
    rating: 4.4,
    successRate: 92,
    completedJobs: 118,
    latencyMs: 1400,
    source: "402index",
    status: "active",
    description: "External L402 translation endpoint with lower price and acceptable verifier history.",
    contact: "https://402index.example/lingua",
    listedAt: "2026-04-21T14:35:00.000Z",
    reason: "Lower price, slower p95 latency."
  },
  {
    id: "worker_agent_tts_fr",
    displayName: "Paris TTS",
    type: "agent",
    capabilities: ["tts_fr", "voiceover_human"],
    basePriceSats: 300,
    rating: 4.2,
    successRate: 93,
    completedJobs: 156,
    latencyMs: 1200,
    source: "internal",
    status: "active",
    description: "Synthetic French speech for quick previews and budget-sensitive narration routes.",
    contact: "https://suppliers.agentmkt.local/tts-fr",
    listedAt: "2026-04-21T17:40:00.000Z",
    reason: "Cheap fallback when a human voice is not required."
  }
];

export function getStoredUserWorkers(): MarketplaceWorker[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_WORKERS_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isMarketplaceWorker);
  } catch {
    return [];
  }
}

export function saveUserWorker(worker: MarketplaceWorker) {
  if (typeof window === "undefined") {
    return;
  }

  const existing = getStoredUserWorkers().filter((stored) => stored.id !== worker.id);
  window.localStorage.setItem(USER_WORKERS_STORAGE_KEY, JSON.stringify([worker, ...existing]));
}

export function getCapabilityLabel(capability: CapabilityTag): string {
  return capabilityLabels[capability];
}

export function isCapabilityTag(value: unknown): value is CapabilityTag {
  return workerCapabilityOptions.some((option) => option.value === value);
}

function isMarketplaceWorker(value: unknown): value is MarketplaceWorker {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MarketplaceWorker>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.displayName === "string" &&
    (candidate.type === "agent" || candidate.type === "human") &&
    Array.isArray(candidate.capabilities) &&
    candidate.capabilities.every(isCapabilityTag) &&
    typeof candidate.basePriceSats === "number" &&
    (candidate.source === "internal" || candidate.source === "402index" || candidate.source === "user") &&
    (candidate.status === "active" || candidate.status === "new") &&
    typeof candidate.description === "string" &&
    typeof candidate.contact === "string" &&
    typeof candidate.listedAt === "string" &&
    typeof candidate.reason === "string"
  );
}
