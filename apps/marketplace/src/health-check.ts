import { log } from "./log.js";

export type HealthCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * For agent workers: probe endpoint_url. A correctly-configured L402 endpoint
 * returns HTTP 402 on an unauthenticated request. We accept 402 as healthy;
 * everything else is unhealthy.
 *
 * 5-second timeout. Network errors are unhealthy.
 */
export async function probeAgentEndpoint(
  endpoint_url: string,
): Promise<HealthCheckResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const resp = await fetch(endpoint_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: ac.signal,
    });
    if (resp.status === 402) return { ok: true };
    return {
      ok: false,
      reason: `expected 402 from L402 endpoint, got ${resp.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * For human workers: confirm the Telegram chat id is reachable by the bot.
 * Requires TELEGRAM_BOT_TOKEN. If the token is missing we assume the worker
 * is still being configured and return ok with a warning — production
 * deployments should always have the token.
 */
export async function probeTelegramChat(
  telegram_chat_id: string,
): Promise<HealthCheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "xxxxx") {
    log.warn(
      { telegram_chat_id },
      "TELEGRAM_BOT_TOKEN not set; skipping live chat health check",
    );
    return { ok: true };
  }
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(telegram_chat_id)}`,
    );
    const json = (await resp.json()) as { ok: boolean; description?: string };
    if (json.ok) return { ok: true };
    return {
      ok: false,
      reason: json.description ?? "telegram getChat returned ok:false",
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
