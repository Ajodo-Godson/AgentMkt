export type StepResult =
  | { kind: "json"; data: unknown }
  | { kind: "text"; text: string }
  | { kind: "file"; mime_type: string; storage_url: string };

export interface NotifyPayload {
  hold_invoice_id: string;
  telegram_chat_id: string;
  brief: string;
  payout_sats: number;
}

export interface AssignmentState {
  holdInvoiceId: string;
  chatId: number;
  brief: string;
  payoutSats: number;
  status: "notified" | "accepted" | "declined" | "submitted";
  messageId?: number;
  createdAt: number;
}
