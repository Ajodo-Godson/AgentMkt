import { request } from "./request";
import type { JobBalanceResponse, ServiceHealthResponse } from "./types";

export type ExtendedJobBalanceResponse = JobBalanceResponse & {
  payouts_sats?: number;
};

export async function getJobBalance(jobId: string) {
  return request<ExtendedJobBalanceResponse>(`/api/hub/job-balance/${encodeURIComponent(jobId)}`);
}

export async function getServiceHealth() {
  return request<ServiceHealthResponse>("/api/health");
}

export interface TopupResponse {
  bolt11: string;
  expires_at: string;
}

export async function createTopupInvoice(jobId: string, amountSats: number) {
  return request<TopupResponse>("/api/hub/topup", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, amount_sats: amountSats }),
  });
}

export interface TopupStatusResponse {
  paid: boolean;
  amount_sats: number;
}

export async function getTopupStatus(bolt11: string) {
  return request<TopupStatusResponse>("/api/hub/topup/status", {
    method: "POST",
    body: JSON.stringify({ bolt11 }),
  });
}
