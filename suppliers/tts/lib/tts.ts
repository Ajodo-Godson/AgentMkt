/**
 * Build a Google Translate TTS URL.
 *
 * Using Google's free `translate_tts` endpoint (the one their browser
 * front-end uses) — returns an mp3 directly, no API key needed. Fine
 * for a hackathon demo. For production we'd swap in ElevenLabs / Azure
 * Speech / OpenAI TTS via an env-gated provider.
 *
 * The endpoint silently truncates above ~200 characters per request,
 * so we cap input length here. For longer texts we'd chunk and stitch,
 * but the demo synthesizes summaries that fit comfortably.
 */
const MAX_CHARS = 200;

export function buildTtsUrl(text: string, voice: "en" | "fr"): string {
  const trimmed = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const params = new URLSearchParams({
    ie: "UTF-8",
    q: trimmed,
    tl: voice,
    client: "tw-ob",
  });
  return `https://translate.google.com/translate_tts?${params.toString()}`;
}
