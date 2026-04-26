import { request } from "./request";
import type {
  DiscoverRequest,
  DiscoverResponse,
  ListWorkerRequest,
  RatingRequest,
  RatingResponse,
  Worker
} from "./types";

export async function discoverWorkers(input: DiscoverRequest) {
  return request<DiscoverResponse>("/api/marketplace/discover", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listWorker(input: ListWorkerRequest) {
  return request<{ worker: Worker }>("/api/marketplace/workers", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function submitRating(input: RatingRequest) {
  return request<RatingResponse>("/api/marketplace/ratings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
