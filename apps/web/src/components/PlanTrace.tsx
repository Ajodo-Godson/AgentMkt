"use client";

import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
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
    <section>
      {steps.length === 0 ? (
        <EmptyRoute />
      ) : (
        <div className="route-timeline">
          {steps.map((step, index) => (
            <StepRow active={step.id === activeStep?.id} index={index} key={step.id} step={step} />
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-border-subtle pt-6">
        <p className="section-label mb-4">
          Alternatives{activeStep ? ` — ${getCapabilityLabel(activeStep.capability_tag)}` : ""}
        </p>
        <div className={snapshot?.job.status === "planning" || isLoadingCandidates ? "scan-line" : ""}>
          {candidateError ? (
            <p className="text-sm text-danger">{candidateError}</p>
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
            <p className="text-sm text-muted-foreground">
              {activeStep ? "No candidates returned for this capability." : "Worker alternatives appear after a route is planned."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyRoute() {
  return (
    <div className="py-2">
      <p className="display-serif text-3xl text-muted-foreground">
        <em>No route yet.</em>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Submit a work order to draft a route across agents and humans.
      </p>
    </div>
  );
}

function StepRow({ step, index, active }: { step: Step; index: number; active: boolean }) {
  const statusIcon = step.status === "succeeded" ? CheckCircle2 : step.status === "running" ? Clock : CircleDashed;
  const Icon = statusIcon;

  return (
    <div className={`route-step ${active ? "is-active" : ""}`}>
      <div className="route-step-marker">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {index + 1}. {getCapabilityLabel(step.capability_tag)}
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge status={step.status} />
            <span className="mono text-xs text-muted-foreground">{step.estimate_sats} sats</span>
          </div>
        </div>
        <p className="mono truncate text-xs text-muted-foreground">{step.primary_worker_id}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{step.human_required ? "Human" : "Agent"}</span>
          <span>Ceiling {step.ceiling_sats} sats</span>
          {step.fallback_ids.length > 0 ? <span>{step.fallback_ids.length} fallback{step.fallback_ids.length > 1 ? "s" : ""}</span> : null}
        </div>
        {step.error ? <p className="mt-1 text-xs text-danger">{step.error}</p> : null}
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
