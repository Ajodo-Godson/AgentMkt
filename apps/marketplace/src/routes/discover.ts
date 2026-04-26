import { Hono } from "hono";
import { DiscoverRequestSchema } from "@agentmkt/contracts";
import { findInternalCandidates } from "../discovery/internal.js";
import { findExternalCandidates } from "../discovery/external-402index.js";
import { rank } from "../discovery/ranker.js";
import { log } from "../log.js";

export const discoverRoutes = new Hono();

discoverRoutes.post("/discover", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = DiscoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation", detail: parsed.error.flatten() },
      400,
    );
  }
  const req = parsed.data;

  const internalP = findInternalCandidates(req.capability_tags, {
    max_price_sats: req.max_price_sats,
    min_rating: req.min_rating,
  });
  const externalP = req.include_external
    ? findExternalCandidates(req.capability_tags, {
        max_price_sats: req.max_price_sats,
      })
    : Promise.resolve([]);

  const [internal, external] = await Promise.all([internalP, externalP]);
  const merged = [...internal, ...external];
  const ranked = rank(merged, req.limit);

  log.info(
    {
      capability_tags: req.capability_tags,
      internal_count: internal.length,
      external_count: external.length,
      returned: ranked.length,
    },
    "/discover",
  );

  return c.json({ candidates: ranked });
});
