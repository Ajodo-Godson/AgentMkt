import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "pino";

// All non-2xx responses follow `{ error, detail? }` per spec section 10.
export interface JsonError {
  error: string;
  detail?: string;
}

export class HubError extends Error {
  override readonly name = "HubError";
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    public readonly detail?: string,
    public override readonly cause?: unknown,
  ) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
  }

  toJson(): JsonError {
    return this.detail
      ? { error: this.code, detail: this.detail }
      : { error: this.code };
  }
}

export function jsonError(c: Context, err: unknown, log?: Logger) {
  if (err instanceof HubError) {
    log?.warn({ code: err.code, detail: err.detail }, "hub error");
    return c.json(err.toJson(), err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  log?.error({ err }, "unhandled error");
  return c.json({ error: "internal", detail: message } satisfies JsonError, 500);
}
