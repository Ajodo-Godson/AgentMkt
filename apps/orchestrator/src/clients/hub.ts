// HTTP client for P2's Hub service (base :4002).
// Only calls endpoints defined in section 6.2. Never invent new ones.
import type { StepResult } from "@agentmkt/contracts";
import { mockHub } from "./mock.js";

const BASE = process.env.HUB_BASE_URL ?? "http://localhost:4002";
const USE_MOCKS = process.env.USE_MOCKS === "true";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hub ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const hub = {
  topup: (req: { job_id: string; amount_sats: number }) =>
    USE_MOCKS
      ? mockHub.topup(req)
      : post<{ bolt11: string; expires_at: string }>("/hub/topup", req),

  topupStatus: (req: { bolt11: string }) =>
    USE_MOCKS
      ? mockHub.topupStatus(req)
      : post<{ paid: boolean; amount_sats: number }>("/hub/topup/status", req),

  hold: (req: { job_id: string; step_id: string; ceiling_sats: number }) =>
    USE_MOCKS
      ? mockHub.hold(req)
      : post<{ hold_invoice_id: string; bolt11: string }>("/hub/hold", req),

  forward: (req: {
    hold_invoice_id: string;
    supplier_endpoint: string;
    supplier_payload: unknown;
  }) =>
    USE_MOCKS
      ? mockHub.forward(req)
      : post<{ result: unknown; paid_to_supplier_sats: number; fee_sats: number }>(
          "/hub/forward",
          req
        ),

  settle: (req: { hold_invoice_id: string }) =>
    USE_MOCKS
      ? mockHub.settle(req)
      : post<{ settled_sats: number; fee_sats: number }>("/hub/settle", req),

  cancel: (req: { hold_invoice_id: string; reason: string }) =>
    USE_MOCKS
      ? mockHub.cancel(req)
      : post<{ refunded_sats: number }>("/hub/cancel", req),

  notifyHuman: (req: {
    hold_invoice_id: string;
    telegram_chat_id: string;
    brief: string;
    payout_sats: number;
  }) =>
    USE_MOCKS
      ? mockHub.notifyHuman(req)
      : post<{ notified: true }>("/hub/notify-human", req),

  humanSubmit: (req: { hold_invoice_id: string; result: StepResult }) =>
    post<{ ok: true }>("/hub/human-submit", req),

  jobBalance: async (job_id: string) => {
    const res = await fetch(`${BASE}/hub/job-balance/${job_id}`);
    if (!res.ok) throw new Error(`Hub /hub/job-balance/${job_id} → ${res.status}`);
    return res.json() as Promise<{
      topped_up_sats: number;
      held_sats: number;
      settled_sats: number;
      fees_sats: number;
      available_sats: number;
    }>;
  },
};
