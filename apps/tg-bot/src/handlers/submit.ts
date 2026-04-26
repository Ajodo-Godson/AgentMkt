import type TelegramBot from "node-telegram-bot-api";
import { submitHumanResult } from "../clients/hub.js";
import type { AssignmentState, StepResult } from "../types.js";

export function registerSubmitHandler(bot: TelegramBot, assignments: Map<string, AssignmentState>) {
  bot.on("message", async (message) => {
    if (message.text?.startsWith("/")) {
      return;
    }

    const assignment = Array.from(assignments.values()).find(
      (candidate) => candidate.chatId === message.chat.id && candidate.status === "accepted"
    );

    if (!assignment) {
      return;
    }

    const result = toStepResult(message);
    if (!result) {
      await bot.sendMessage(message.chat.id, "Send text, audio, voice, or a file so AgentMkt can submit your work.");
      return;
    }

    try {
      await submitHumanResult(assignment.holdInvoiceId, result);
      assignment.status = "submitted";
      assignments.set(assignment.holdInvoiceId, assignment);
      await bot.sendMessage(message.chat.id, "Submitted. AgentMkt will verify the work before settlement.");
    } catch (error) {
      console.error("Failed to submit human result", error);
      await bot.sendMessage(message.chat.id, "Submission failed. Try again or contact the demo operator.");
    }
  });
}

function toStepResult(message: TelegramBot.Message): StepResult | null {
  if (message.text) {
    return { kind: "text", text: message.text };
  }

  if (message.voice) {
    return {
      kind: "file",
      mime_type: message.voice.mime_type ?? "audio/ogg",
      storage_url: `telegram://${message.voice.file_id}`
    };
  }

  if (message.audio) {
    return {
      kind: "file",
      mime_type: message.audio.mime_type ?? "audio/mpeg",
      storage_url: `telegram://${message.audio.file_id}`
    };
  }

  if (message.document) {
    return {
      kind: "file",
      mime_type: message.document.mime_type ?? "application/octet-stream",
      storage_url: `telegram://${message.document.file_id}`
    };
  }

  return null;
}
