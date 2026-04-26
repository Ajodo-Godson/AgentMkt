import { forwardJson, serviceUrls } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return forwardJson(serviceUrls.hub, `/hub/job-balance/${encodeURIComponent(jobId)}`);
}
