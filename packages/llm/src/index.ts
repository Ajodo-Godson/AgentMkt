import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: "nim" | "anthropic";
}

let nimClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getNimClient(): OpenAI {
  if (!nimClient) {
    nimClient = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY ?? "",
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }
  return nimClient;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    });
  }
  return anthropicClient;
}

const NIM_MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_QUALITY_MODEL = "claude-sonnet-4-6";

async function callNim(
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const nim = getNimClient();
  const response = await nim.chat.completions.create({
    model: NIM_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
    response_format: opts.jsonMode ? { type: "json_object" } : undefined,
  });
  return {
    content: response.choices[0]?.message?.content ?? "",
    model: NIM_MODEL,
    provider: "nim",
  };
}

async function callAnthropic(
  messages: ChatMessage[],
  opts: CompletionOptions,
  quality = false
): Promise<CompletionResult> {
  const client = getAnthropicClient();
  const model = quality ? ANTHROPIC_QUALITY_MODEL : ANTHROPIC_MODEL;

  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: system
      ? [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }]
      : undefined,
    messages: userMessages,
    temperature: opts.temperature ?? 0.2,
  });

  const content = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return { content, model, provider: "anthropic" };
}

/**
 * Primary entry point. Uses NIM unless LLM_FALLBACK_TO_ANTHROPIC=true.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: CompletionOptions = {}
): Promise<CompletionResult> {
  const useFallback = process.env.LLM_FALLBACK_TO_ANTHROPIC === "true";

  if (useFallback) {
    return callAnthropic(messages, opts);
  }

  try {
    return await callNim(messages, opts);
  } catch (err) {
    console.error("[llm] NIM call failed, falling back to Anthropic:", err);
    return callAnthropic(messages, opts);
  }
}

/**
 * Quality-focused completion — uses Anthropic Sonnet when fallback is active,
 * otherwise still uses NIM (which is already the 70B model).
 */
export async function chatCompletionQuality(
  messages: ChatMessage[],
  opts: CompletionOptions = {}
): Promise<CompletionResult> {
  const useFallback = process.env.LLM_FALLBACK_TO_ANTHROPIC === "true";

  if (useFallback) {
    return callAnthropic(messages, opts, true);
  }

  try {
    return await callNim(messages, opts);
  } catch (err) {
    console.error("[llm] NIM call failed, falling back to Anthropic Sonnet:", err);
    return callAnthropic(messages, opts, true);
  }
}
