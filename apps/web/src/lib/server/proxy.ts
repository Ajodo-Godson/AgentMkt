const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001";
const MARKETPLACE_URL = process.env.MARKETPLACE_BASE_URL ?? "http://localhost:4003";
const HUB_URL = process.env.HUB_BASE_URL ?? "http://localhost:4002";
const REQUEST_TIMEOUT_MS = 8_000;

export const serviceUrls = {
  orchestrator: ORCHESTRATOR_URL,
  marketplace: MARKETPLACE_URL,
  hub: HUB_URL
};

export async function forwardJson(baseUrl: string, path: string, init: RequestInit = {}) {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      },
      cache: "no-store"
    });
    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.text();

    return new Response(body || "{}", {
      status: response.status,
      headers: {
        "content-type": contentType
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "service_unavailable",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 503 }
    );
  }
}

export async function readRequestBody(request: Request) {
  return request.text();
}

export async function checkService(baseUrl: string, path = "/health") {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
      cache: "no-store"
    });
    let detail: unknown = response.statusText;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => response.statusText);
    }

    return {
      ok: response.ok,
      status: response.status,
      detail
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
