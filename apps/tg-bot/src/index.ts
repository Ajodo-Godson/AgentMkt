import { serve } from "@hono/node-server";
import { Hono } from "hono";
import TelegramBot from "node-telegram-bot-api";
import { registerAcceptHandler } from "./handlers/accept.js";
import { registerDeclineHandler } from "./handlers/decline.js";
import { registerNotifyHandler } from "./handlers/notify.js";
import { registerSubmitHandler } from "./handlers/submit.js";
import type { AssignmentState } from "./types.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = Number(process.env.PORT_TG_BOT ?? 4004);
const app = new Hono();
const assignments = new Map<string, AssignmentState>();

app.get("/health", (context) => context.json({ ok: true, assignments: assignments.size }));

if (!token) {
  console.warn("TELEGRAM_BOT_TOKEN is not set. HTTP health endpoint will run, but Telegram polling is disabled.");
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Telegram bot HTTP server listening on http://localhost:${info.port}`);
  });
} else {
  const bot = new TelegramBot(token, { polling: true });
  registerNotifyHandler(app, bot, assignments);
  registerAcceptHandler(bot, assignments);
  registerDeclineHandler(bot, assignments);
  registerSubmitHandler(bot, assignments);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Telegram bot listening on http://localhost:${info.port}`);
  });
}
