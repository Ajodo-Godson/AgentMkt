import { CAPABILITY_TAGS } from "@agentmkt/contracts";
import type { CapabilityTag } from "./types";

export const workerCapabilityOptions: { value: CapabilityTag; label: string }[] = [
  { value: "summarization", label: "Summarization" },
  { value: "translation_es", label: "Spanish translation" },
  { value: "translation_fr", label: "French translation" },
  { value: "translation_de", label: "German translation" },
  { value: "tts_en", label: "English TTS" },
  { value: "tts_fr", label: "French TTS" },
  { value: "image_generation", label: "Image generation" },
  { value: "code_review", label: "Code review" },
  { value: "fact_check", label: "Fact check" },
  { value: "voiceover_human", label: "Human voiceover" },
  { value: "creative_writing_human", label: "Human creative writing" }
];

export function getCapabilityLabel(capability: CapabilityTag): string {
  return workerCapabilityOptions.find((option) => option.value === capability)?.label ?? capability;
}

export function isCapabilityTag(value: unknown): value is CapabilityTag {
  return CAPABILITY_TAGS.some((tag) => tag === value);
}

export const allCapabilityTags = [...CAPABILITY_TAGS];

export const DEFAULT_PROMPT =
  "Summarize the key points of the Bitcoin whitepaper and translate the summary into French.";
