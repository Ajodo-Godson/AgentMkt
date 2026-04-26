"use client";

import { Star } from "lucide-react";
import { getWorkerName } from "@/lib/demo-data";
import type { JobSnapshot } from "@/lib/types";
import { useState } from "react";

export function RatingPrompt({ snapshot }: { snapshot: JobSnapshot | null }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});

  if (snapshot?.job.status !== "completed") {
    return null;
  }

  const workers = Array.from(new Set(snapshot.steps_progress.map((step) => step.primary_worker_id)));

  return (
    <section className="panel-strong p-4">
      <div className="mb-4">
        <p className="section-label">Closeout</p>
        <h2 className="text-lg font-semibold">Rate the routed workers</h2>
      </div>
      <div className="space-y-3">
        {workers.map((workerId) => (
          <div className="rounded-md border border-border-subtle bg-background p-3" key={workerId}>
            <p className="mb-2 text-sm font-medium">{getWorkerName(workerId)}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  aria-label={`Rate ${getWorkerName(workerId)} ${score} stars`}
                  className="rounded-sm p-1 text-primary transition hover:bg-primary/10"
                  key={score}
                  onClick={() => setRatings((current) => ({ ...current, [workerId]: score }))}
                  type="button"
                >
                  <Star className={`h-5 w-5 ${score <= (ratings[workerId] ?? 0) ? "fill-primary" : ""}`} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Ratings stay local until P1 exposes the orchestrator rating forwarder.</p>
    </section>
  );
}
