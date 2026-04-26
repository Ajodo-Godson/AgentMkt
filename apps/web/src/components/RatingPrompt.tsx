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
    <section className="border-t border-border-subtle pt-6">
      <p className="section-label mb-4">Rate workers</p>
      <div className="space-y-5">
        {steps.map((step) => {
          const state = ratings[step.id] ?? {};
          return (
            <div key={step.id}>
              <p className="text-sm font-medium">{step.primary_worker_id}</p>
              <p className="mb-1 text-xs text-muted-foreground">{getCapabilityLabel(step.capability_tag)}</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    aria-label={`Rate ${step.primary_worker_id} ${score} stars`}
                    className="rounded-sm p-0.5 text-primary transition hover:bg-primary/10"
                    disabled={state.loading}
                    key={score}
                    onClick={() => rate(step.id, score)}
                    type="button"
                  >
                    <Star className={`h-4 w-4 ${score <= (state.score ?? 0) ? "fill-primary" : ""}`} />
                  </button>
                ))}
              </div>
              {state.newEwma !== undefined ? <p className="mt-1 text-xs text-success">EWMA updated to {state.newEwma.toFixed(2)}</p> : null}
              {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
