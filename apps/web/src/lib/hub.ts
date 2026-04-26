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
