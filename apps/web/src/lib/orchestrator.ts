import { request } from "./request";
import type { CreateJobRequest, CreateJobResponse, JobSnapshot } from "./types";

export async function createJob(input: CreateJobRequest) {
  return request<CreateJobResponse>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getJob(jobId: string) {
  return request<JobSnapshot>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export async function clarifyJob(jobId: string, answer: string) {
  return request<{ ok: true }>(`/api/jobs/${encodeURIComponent(jobId)}/clarify`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

export async function confirmJob(jobId: string, confirmed: boolean) {
  return request<{ ok: true }>(`/api/jobs/${encodeURIComponent(jobId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmed })
  });
}
