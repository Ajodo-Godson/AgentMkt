import type { JobSnapshot } from "./types";

const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // Keep the HTTP status text when the service does not return JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export async function createJob(input: { user_id: string; prompt: string }) {
  return request<{ job_id: string }>("/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getJob(jobId: string) {
  return request<JobSnapshot>(`/jobs/${jobId}`);
}

export async function clarifyJob(jobId: string, answer: string) {
  return request<{ ok: true }>(`/jobs/${jobId}/clarify`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

export async function confirmJob(jobId: string, confirmed: boolean) {
  return request<{ ok: true }>(`/jobs/${jobId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmed })
  });
}
