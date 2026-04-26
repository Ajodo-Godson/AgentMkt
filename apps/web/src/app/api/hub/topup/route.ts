import { forwardJson, readRequestBody, serviceUrls } from "@/lib/server/proxy";

export async function POST(request: Request) {
  return forwardJson(serviceUrls.hub, "/hub/topup", {
    method: "POST",
    body: await readRequestBody(request),
  });
}
