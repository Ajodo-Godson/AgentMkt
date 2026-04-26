"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { submitRating } from "@/lib/marketplace";
import { getCapabilityLabel } from "@/lib/workers";
import type { JobSnapshot } from "@/lib/types";

interface RatingState {
  score?: number;
  newEwma?: number;
  error?: string;
  loading?: boolean;
}

export function RatingPrompt({ snapshot }: { snapshot: JobSnapshot | null }) {
  const [ratings, setRatings] = useState<Record<string, RatingState>>({});

  if (snapshot?.job.status !== "completed") {
    return null;
  }

  const steps = snapshot.steps_progress.filter((step) => step.status === "succeeded");

  const rate = async (stepId: string, score: number) => {
    const step = steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      return;
    }

    setRatings((current) => ({ ...current, [stepId]: { score, loading: true } }));
    try {
      const response = await submitRating({
        worker_id: step.primary_worker_id,
        capability_tag: step.capability_tag,
        job_id: snapshot.job.id,
        step_id: step.id,
        source: "user",
        score,
        reason: "Buyer closeout rating"
      });
      setRatings((current) => ({ ...current, [stepId]: { score, newEwma: response.new_ewma, loading: false } }));
    } catch (caught) {
      setRatings((current) => ({
        ...current,
        [stepId]: {
          score,
          error: caught instanceof Error ? caught.message : "Marketplace rejected the rating",
          loading: false
        }
      }));
    }
  };

  if (steps.length === 0) {
    return null;
  }

  return (
    <section className="panel-strong p-4">
      <div className="mb-4">
        <p className="section-label">Closeout</p>
        <h2 className="text-lg font-semibold">Rate workers</h2>
      </div>
      <div className="space-y-3">
        {steps.map((step) => {
          const state = ratings[step.id] ?? {};
          return (
            <div className="rounded-md border border-border-subtle bg-card p-3" key={step.id}>
              <p className="mb-1 text-sm font-medium">{step.primary_worker_id}</p>
              <p className="mb-2 text-xs text-muted-foreground">{getCapabilityLabel(step.capability_tag)}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    aria-label={`Rate ${step.primary_worker_id} ${score} stars`}
                    className="rounded-sm p-1 text-primary transition hover:bg-primary/10 disabled:opacity-60"
                    disabled={state.loading}
                    key={score}
                    onClick={() => rate(step.id, score)}
                    type="button"
                  >
                    <Star className={`h-5 w-5 ${score <= (state.score ?? 0) ? "fill-primary" : ""}`} />
                  </button>
                ))}
              </div>
              {state.newEwma !== undefined ? <p className="mt-2 text-xs text-success">Marketplace EWMA updated to {state.newEwma.toFixed(2)}.</p> : null}
              {state.error ? <p className="mt-2 text-xs text-danger">{state.error}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
