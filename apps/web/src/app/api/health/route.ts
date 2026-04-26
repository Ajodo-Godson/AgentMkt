import { checkService, serviceUrls } from "@/lib/server/proxy";
import type { ServiceHealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const [orchestrator, marketplace, hub, lexe] = await Promise.all([
    checkService(serviceUrls.orchestrator),
    checkService(serviceUrls.marketplace),
    checkService(serviceUrls.hub),
    checkService(serviceUrls.hub, "/health/lexe")
  ]);

  const body: ServiceHealthResponse = {
    ok: orchestrator.ok && marketplace.ok && hub.ok,
    services: {
      orchestrator,
      marketplace,
      hub,
      lexe
    }
  };

  return Response.json(body);
}
