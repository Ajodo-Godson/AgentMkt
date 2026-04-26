import { forwardJson, readRequestBody, serviceUrls } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardJson(serviceUrls.orchestrator, `/jobs/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: await readRequestBody(request)
  });
}
