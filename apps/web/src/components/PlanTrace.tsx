"use client";

import { CheckCircle2, CircleDashed, Clock, GitBranch, ShieldCheck, Timer } from "lucide-react";
import {
  capabilityLabels,
  getCandidatesForStep,
  getCostEfficiency,
  getQualityScore,
  getValueScore,
  getWorkerName,
  routePreferenceLabels
} from "@/lib/demo-data";
import type { JobSnapshot, RoutePreference, Step, WorkerCandidate } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function PlanTrace({ routePreference, snapshot }: { routePreference: RoutePreference; snapshot: JobSnapshot | null }) {
  const steps = snapshot?.steps_progress ?? snapshot?.plan?.steps ?? [];
  const activeStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending") ?? steps[0] ?? null;
  const candidates = getCandidatesForStep(activeStep);

  return (
    <section className="panel-strong route-panel overflow-hidden">
      <div className="border-b border-border-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Route</p>
            <h2 className="text-lg font-semibold">Execution plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">{routePreferenceLabels[routePreference].label} selection policy</p>
          </div>
          {snapshot ? <StatusBadge status={snapshot.job.status} /> : null}
        </div>
      </div>

      <div className="grid gap-4 p-4">
        {steps.length === 0 ? (
          <EmptyRoute />
        ) : (
          <div className="route-timeline">
            {steps.map((step, index) => (
              <StepRow active={step.id === activeStep?.id} index={index} key={step.id} step={step} />
            ))}
          </div>
        )}

        <div className="rounded-md border border-border-subtle bg-background">
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
            <div>
              <p className="text-sm font-medium">Worker alternatives</p>
              <p className="text-xs text-muted-foreground">Compared by quality, price, reliability, and route fit.</p>
            </div>
          </div>
          <div className={snapshot?.job.status === "planning" ? "scan-line" : ""}>
            {candidates.length > 0 ? (
              <div className="worker-table">
                <div className="worker-row worker-row-header">
                  <span>Worker</span>
                  <span>Quality</span>
                  <span>Price</span>
                  <span>Reliability</span>
                  <span>Fit</span>
                </div>
                {candidates.map((candidate) => (
                  <CandidateRow candidate={candidate} key={candidate.id} selected={activeStep?.primary_worker_id === candidate.id} />
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Submit a request to compare candidate workers.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyRoute() {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center">
      <GitBranch className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">No route yet</p>
      <p className="mt-1 text-sm text-muted-foreground">AgentMkt will build a route after you submit a request.</p>
    </div>
  );
}

function StepRow({ step, index, active }: { step: Step; index: number; active: boolean }) {
  const statusIcon = step.status === "succeeded" ? CheckCircle2 : step.status === "running" ? Clock : CircleDashed;
  const Icon = statusIcon;

  return (
    <div className={`route-step ${active ? "is-active" : ""}`}>
      <div className="route-step-marker">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 rounded-md border border-border-subtle bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {index + 1}. {capabilityLabels[step.capability_tag]}
            </p>
            <p className="truncate text-xs text-muted-foreground">{getWorkerName(step.primary_worker_id)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={step.status} />
            <span className="mono text-sm text-primary">{step.estimate_sats} sats</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            {step.human_required ? "Human SLA" : "Automated"}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Hold ceiling {step.ceiling_sats} sats
          </span>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ candidate, selected }: { candidate: WorkerCandidate; selected: boolean }) {
  return (
    <div className={`worker-row ${selected ? "is-selected" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{candidate.displayName}</span>
          {selected ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Selected</span> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{candidate.reason}</p>
      </div>
      <span className="mono text-sm">{getQualityScore(candidate)}</span>
      <span className="mono text-sm">{candidate.priceSats}</span>
      <span className="mono text-sm">{candidate.successRate}%</span>
      <span className="mono text-sm">{getValueScore(candidate)}</span>
      <div className="worker-row-mobile text-xs text-muted-foreground">
        Quality {getQualityScore(candidate)} · {candidate.priceSats} sats · {candidate.successRate}% pass · Fit{" "}
        {getCostEfficiency(candidate)}
      </div>
    </div>
  );
}
