import type {
  CapabilityTag,
  CfoVerdict,
  ConfirmRequest,
  CreateJobRequest,
  CreateJobResponse,
  DiscoverRequest,
  DiscoverResponse,
  GetJobResponse,
  Job,
  JobBalanceResponse,
  JobStatus,
  ListWorkerRequest,
  Plan,
  RatingRequest,
  RatingResponse,
  ReputationSnapshot,
  Step,
  StepResult,
  Worker,
  WorkerCandidate
} from "@agentmkt/contracts";

export type {
  CapabilityTag,
  CfoVerdict,
  ConfirmRequest,
  CreateJobRequest,
  CreateJobResponse,
  DiscoverRequest,
  DiscoverResponse,
  GetJobResponse,
  Job,
  JobBalanceResponse,
  JobStatus,
  ListWorkerRequest,
  Plan,
  RatingRequest,
  RatingResponse,
  ReputationSnapshot,
  Step,
  StepResult,
  Worker,
  WorkerCandidate
};

export interface JobSnapshot extends GetJobResponse {
  final_output?: string | null;
  hub_bolt11?: string | null;
  debug?: {
    wallet_balance_sats?: number | null;
    error?: string | null;
    plan_iterations?: number | null;
    cfo_verdict?: {
      kind: string;
      summary?: string;
      reason?: string;
      detail?: string;
    } | null;
  } | null;
}

export interface WorkerDetailResponse {
  worker: Worker;
  reputation: ReputationSnapshot[];
}

export interface ServiceHealthItem {
  ok: boolean;
  status?: number;
  detail?: unknown;
}

export interface ServiceHealthResponse {
  ok: boolean;
  services: {
    orchestrator: ServiceHealthItem;
    marketplace: ServiceHealthItem;
    hub: ServiceHealthItem;
    lexe: ServiceHealthItem;
  };
}
