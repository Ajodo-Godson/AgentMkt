"use client";

import { CheckCircle2, CircleDashed, Clock, GitBranch, ShieldCheck, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { discoverWorkers } from "@/lib/marketplace";
import { getCapabilityLabel } from "@/lib/workers";
import type { JobSnapshot, Step, WorkerCandidate } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function PlanTrace({ snapshot }: { snapshot: JobSnapshot | null }) {
  const steps = useMemo(() => snapshot?.steps_progress ?? snapshot?.plan?.steps ?? [], [snapshot]);
  const activeStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending") ?? steps[0] ?? null;
  const activeCapability = activeStep?.capability_tag ?? null;
  const [candidates, setCandidates] = useState<WorkerCandidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  useEffect(() => {
    if (!activeCapability) {
      setCandidates([]);
      setCandidateError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingCandidates(true);
    setCandidateError(null);

    discoverWorkers({
      capability_tags: [activeCapability],
      include_external: true,
      limit: 10
    })
      .then((response) => {
        if (!cancelled) {
          setCandidates(response.candidates);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setCandidates([]);
          setCandidateError(caught instanceof Error ? caught.message : "Unable to load worker alternatives");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCandidates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCapability]);

  return (
    <section className="panel-strong route-panel overflow-hidden">
      <div className="border-b border-border-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Route</p>
            <h2 className="text-lg font-semibold">Execution plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">Built by the orchestrator from discovered workers and wallet state.</p>
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
              <p className="text-xs text-muted-foreground">
                Live marketplace discovery for {activeStep ? getCapabilityLabel(activeStep.capability_tag) : "the active step"}.
              </p>
            </div>
          </div>
          <div className={snapshot?.job.status === "planning" || isLoadingCandidates ? "scan-line" : ""}>
            {candidateError ? (
              <p className="p-4 text-sm text-danger">{candidateError}</p>
            ) : candidates.length > 0 ? (
              <div className="worker-table">
                <div className="worker-row worker-row-header">
                  <span>Worker</span>
                  <span>EWMA</span>
                  <span>Price</span>
                  <span>Jobs</span>
                  <span>Type</span>
                  <span>Source</span>
                </div>
                {candidates.map((candidate) => (
                  <CandidateRow
                    candidate={candidate}
                    key={candidate.worker_id}
                    selected={activeStep?.primary_worker_id === candidate.worker_id}
                  />
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {activeStep ? "No marketplace candidates returned for this capability." : "Submit a request to compare candidate workers."}
              </p>
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
              {index + 1}. {getCapabilityLabel(step.capability_tag)}
            </p>
            <p className="mono truncate text-xs text-muted-foreground">{step.primary_worker_id}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={step.status} />
            <span className="mono text-sm text-primary">{step.estimate_sats} sats</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            {step.human_required ? "Human step" : "Agent step"}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Hold ceiling {step.ceiling_sats} sats
          </span>
          {step.fallback_ids.length > 0 ? <span className="mono">fallbacks={step.fallback_ids.length}</span> : null}
        </div>
        {step.error ? <p className="mt-3 text-xs text-danger">{step.error}</p> : null}
      </div>
    </div>
  );
}

function CandidateRow({ candidate, selected }: { candidate: WorkerCandidate; selected: boolean }) {
  return (
    <div className={`worker-row ${selected ? "is-selected" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{candidate.display_name}</span>
          {selected ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Selected</span> : null}
        </div>
        <p className="mono mt-1 truncate text-xs text-muted-foreground">{candidate.worker_id}</p>
      </div>
      <span className="mono text-sm">{candidate.ewma.toFixed(1)}</span>
      <span className="mono text-sm">{candidate.base_price_sats}</span>
      <span className="mono text-sm">{candidate.total_jobs}</span>
      <span className="text-xs text-muted-foreground">{candidate.type}</span>
      <span className="text-xs text-muted-foreground">{candidate.source}</span>
      <div className="worker-row-mobile text-xs text-muted-foreground">
        EWMA {candidate.ewma.toFixed(1)}, {candidate.base_price_sats} sats, {candidate.total_jobs} jobs, {candidate.type}, {candidate.source}
      </div>
    </div>
  );
}
