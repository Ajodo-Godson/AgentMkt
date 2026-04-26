// =============================================================================
// AgentMkt Payment Hub — entrypoint.
//
// Single Hono server on PORT_HUB (default 4002), wired with the routes in
// section 6.2 of the hackathon spec. Optionally spawns the Lexe sidecar as a
// child process at boot.
// =============================================================================

import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import {
  isSidecarBinaryPresent,
  startSidecar,
  stopSidecar,
  waitForSidecarHealth,
} from "./lib/sidecar.js";
import { lexeClient } from "./lightning/lexe-client.js";
import { closeDb } from "@agentmkt/db";

import { topupRoute } from "./routes/topup.js";
import { holdRoute } from "./routes/hold.js";
import { forwardRoute } from "./routes/forward.js";
import { settleRoute } from "./routes/settle.js";
import { cancelRoute } from "./routes/cancel.js";
import { notifyHumanRoute } from "./routes/notify-human.js";
import { humanSubmitRoute } from "./routes/human-submit.js";
import { balanceRoute } from "./routes/balance.js";
import { adminLedgerRoute } from "./routes/admin-ledger.js";
import { startHoldExpirySweeper } from "./ledger/expiry.js";

const app = new Hono();

// Light request logging — pino handles the structured side; this just gives
// us a one-liner per request in dev.
app.use("*", honoLogger((line) => logger.debug(line)));

// Health endpoints.
app.get("/health", (c) => c.json({ ok: true, service: "hub" }));

app.get("/health/lexe", async (c) => {
  try {
    const h = await lexeClient.health();
    const info = await lexeClient.nodeInfo();
    return c.json({
      ok: true,
      lexe_status: h.status,
      lexe_version: info.version,
      node_pk: info.node_pk,
      lightning_balance_sats: Number.parseInt(info.lightning_balance, 10),
      onchain_balance_sats: Number.parseInt(info.onchain_balance, 10),
      num_usable_channels: info.num_usable_channels,
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  }
});

// Mount the spec section 6.2 endpoints under /hub.
const hub = new Hono()
  .route("/", topupRoute)
  .route("/", holdRoute)
  .route("/", forwardRoute)
  .route("/", settleRoute)
  .route("/", cancelRoute)
  .route("/", notifyHumanRoute)
  .route("/", humanSubmitRoute)
  .route("/", balanceRoute)
  .route("/", adminLedgerRoute);
app.route("/hub", hub);

// 404 fallback.
app.notFound((c) =>
  c.json({ error: "not_found", detail: c.req.path }, 404),
);

// Last-resort error handler.
app.onError((err, c) => {
  logger.error({ err }, "unhandled hono error");
  return c.json(
    { error: "internal", detail: err.message },
    500,
  );
});

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
async function main(): Promise<void> {
  logger.info(
    {
      port: env.PORT_HUB,
      sidecar: env.LEXE_SIDECAR_URL,
      network: env.LEXE_NETWORK,
      use_mocks: env.USE_MOCKS,
    },
    "hub booting",
  );

  let expiryTimer: NodeJS.Timeout | null = null;

  if (env.LEXE_AUTOSPAWN && isSidecarBinaryPresent()) {
    startSidecar();
  } else if (!env.LEXE_AUTOSPAWN) {
    logger.info("Lexe sidecar autospawn disabled; expecting an external sidecar");
  } else {
    logger.warn(
      { binPath: "apps/hub/bin/lexe-sidecar" },
      "Sidecar binary not present. Run `apps/hub/scripts/install-sidecar.sh` or start it manually. Hub will boot but Lightning calls will fail.",
    );
  }

  // Don't block boot on sidecar health (it can come up async); just kick off
  // a non-fatal probe so we surface issues in logs early.
  waitForSidecarHealth(20_000).catch((e) => {
    logger.warn({ err: e }, "sidecar health probe failed");
  });

  expiryTimer = startHoldExpirySweeper(60_000);

  serve({ fetch: app.fetch, port: env.PORT_HUB }, (info) => {
    logger.info({ port: info.port }, `hub listening on http://localhost:${info.port}`);
  });

  // Graceful shutdown.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    if (expiryTimer) clearInterval(expiryTimer);
    stopSidecar();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal boot error");
  process.exit(1);
});
