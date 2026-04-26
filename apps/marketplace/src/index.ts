import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { discoverRoutes } from "./routes/discover.js";
import { workersRoutes } from "./routes/workers.js";
import { ratingsRoutes } from "./routes/ratings.js";
import { verifyRoutes } from "./routes/verify.js";
import { devUiHtml } from "./dev-ui.js";
import { log } from "./log.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "marketplace" }));
app.get("/", (c) => c.html(devUiHtml));

app.route("/", discoverRoutes);
app.route("/", workersRoutes);
app.route("/", ratingsRoutes);
app.route("/", verifyRoutes);

app.onError((err, c) => {
  log.error({ err: err.message, stack: err.stack }, "unhandled error");
  return c.json({ error: "internal", detail: err.message }, 500);
});

const port = Number(process.env.PORT_MARKETPLACE ?? 4003);
serve({ fetch: app.fetch, port }, (info) => {
  log.info({ port: info.port }, "marketplace listening");
});
