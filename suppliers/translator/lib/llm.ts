import OpenAI from "openai";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === "nvapi-xxxxx") {
    throw new Error(
      "NVIDIA_API_KEY is not set in the repo-root .env. Get one at build.nvidia.com.",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });
  return _client;
}

const LANG_NAME: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
};

export async function translate(
  text: string,
  target_lang: "es" | "fr" | "de",
): Promise<string> {
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
  const targetName = LANG_NAME[target_lang] ?? target_lang;
  const resp = await client().chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are a faithful translator. Translate the user's text into ${targetName}. Preserve meaning, register, and proper nouns. Return ONLY the translated text — no preamble, no quotes, no commentary.`,
      },
      {
        role: "user",
        content: text,
      },
    ],
    temperature: 0.2,
    max_tokens: 2048,
  });
  return resp.choices[0]?.message?.content?.trim() ?? "";
}
