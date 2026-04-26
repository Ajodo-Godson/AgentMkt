import { forwardJson, serviceUrls } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardJson(serviceUrls.orchestrator, `/jobs/${encodeURIComponent(id)}`);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardJson(serviceUrls.orchestrator, `/jobs/${encodeURIComponent(id)}/start`, {
    method: "POST",
  });
}
