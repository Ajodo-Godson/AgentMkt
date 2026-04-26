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

export async function summarize(
  text: string,
  max_length: number,
): Promise<string> {
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
  const resp = await client().chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a concise summarizer. Produce a faithful summary of the user's text. Return only the summary text — no preamble, no markdown headers, no bullet lists unless the input strongly calls for them.",
      },
      {
        role: "user",
        content: `Summarize the following text in approximately ${max_length} words.\n\n---\n${text}\n---`,
      },
    ],
    temperature: 0.3,
    max_tokens: Math.max(64, max_length * 4),
  });
  return resp.choices[0]?.message?.content?.trim() ?? "";
}
