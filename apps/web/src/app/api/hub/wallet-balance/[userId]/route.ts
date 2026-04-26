import { forwardJson, serviceUrls } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return forwardJson(serviceUrls.hub, `/wallet/${encodeURIComponent(userId)}/balance`);
}
