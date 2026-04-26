import type TelegramBot from "node-telegram-bot-api";
import type { AssignmentState } from "../types.js";

export function registerDeclineHandler(bot: TelegramBot, assignments: Map<string, AssignmentState>) {
  bot.on("callback_query", async (query) => {
    const data = query.data ?? "";
    if (!data.startsWith("decline:")) {
      return;
    }

    const holdInvoiceId = data.slice("decline:".length);
    const assignment = assignments.get(holdInvoiceId);
    if (!assignment) {
      await bot.answerCallbackQuery(query.id, { text: "Task expired or unknown." });
      return;
    }

    assignment.status = "declined";
    assignments.set(holdInvoiceId, assignment);
    await bot.answerCallbackQuery(query.id, { text: "Declined" });
    await bot.sendMessage(assignment.chatId, "Declined. The hub will cancel or reroute the hold if the SLA expires.");
    console.log("Human worker declined task", { hold_invoice_id: holdInvoiceId });
  });
}
