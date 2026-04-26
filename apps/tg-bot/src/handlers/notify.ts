import type TelegramBot from "node-telegram-bot-api";
import type { Hono } from "hono";
import type { AssignmentState, NotifyPayload } from "../types.js";

export function registerNotifyHandler(app: Hono, bot: TelegramBot, assignments: Map<string, AssignmentState>) {
  app.post("/tg/notify", async (context) => {
    const body = (await context.req.json()) as NotifyPayload;

    if (!body.hold_invoice_id || !body.telegram_chat_id || !body.brief || !Number.isInteger(body.payout_sats)) {
      return context.json({ error: "validation" }, 400);
    }

    const chatId = Number(body.telegram_chat_id);
    const message = await bot.sendMessage(
      chatId,
      `New AgentMkt human task\n\n${body.brief}\n\nPayout: ${body.payout_sats} sats`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Accept", callback_data: `accept:${body.hold_invoice_id}` },
              { text: "Decline", callback_data: `decline:${body.hold_invoice_id}` }
            ]
          ]
        }
      }
    );

    assignments.set(body.hold_invoice_id, {
      holdInvoiceId: body.hold_invoice_id,
      chatId,
      brief: body.brief,
      payoutSats: body.payout_sats,
      status: "notified",
      messageId: message.message_id,
      createdAt: Date.now()
    });

    return context.json({ delivered: true });
  });
}
