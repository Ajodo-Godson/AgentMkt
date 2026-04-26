import type TelegramBot from "node-telegram-bot-api";
import type { AssignmentState } from "../types.js";

export function registerAcceptHandler(bot: TelegramBot, assignments: Map<string, AssignmentState>) {
  bot.on("callback_query", async (query) => {
    const data = query.data ?? "";
    if (!data.startsWith("accept:")) {
      return;
    }

    const holdInvoiceId = data.slice("accept:".length);
    const assignment = assignments.get(holdInvoiceId);
    if (!assignment) {
      await bot.answerCallbackQuery(query.id, { text: "Task expired or unknown." });
      return;
    }

    assignment.status = "accepted";
    assignments.set(holdInvoiceId, assignment);
    await bot.answerCallbackQuery(query.id, { text: "Accepted" });
    await bot.sendMessage(
      assignment.chatId,
      `Accepted. Reply to this message with your work for hold ${holdInvoiceId}. Text, audio, voice, or file uploads are supported.`
    );
  });
}
