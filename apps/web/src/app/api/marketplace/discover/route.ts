import { forwardJson, readRequestBody, serviceUrls } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return forwardJson(serviceUrls.marketplace, "/discover", {
    method: "POST",
    body: await readRequestBody(request)
  });
}
