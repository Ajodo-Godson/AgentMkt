"use client";

import { FormEvent, useState } from "react";
import type { JobSnapshot } from "@/lib/types";

interface PlanPreviewProps {
  snapshot: JobSnapshot | null;
  isResponding: boolean;
  onConfirm: (confirmed: boolean) => void;
  onClarify: (answer: string) => void;
}

export function PlanPreview({ snapshot, isResponding, onConfirm, onClarify }: PlanPreviewProps) {
  const shouldShow = snapshot?.job.status === "awaiting_user";

  if (!shouldShow) {
    return null;
  }

  if (snapshot.debug?.cfo_verdict?.kind === "USER_CONFIRM") {
    return <ConfirmRoutePanel isResponding={isResponding} onConfirm={onConfirm} snapshot={snapshot} />;
  }

  return <ClarifyPanel isResponding={isResponding} onClarify={onClarify} />;
}

function ConfirmRoutePanel({
  isResponding,
  onConfirm,
  snapshot
}: {
  isResponding: boolean;
  onConfirm: (confirmed: boolean) => void;
  snapshot: JobSnapshot;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/15 px-4 backdrop-blur-sm">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card-elevated p-8 shadow-lg">
        <p className="section-label mb-3">Approval required</p>
        <h2 className="display-serif text-3xl text-foreground">Confirm the route.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {snapshot.debug?.cfo_verdict?.summary ?? "The orchestrator paused for approval."}
        </p>

        {snapshot.plan ? (
          <div className="mt-6 border-t border-border-subtle">
            {snapshot.plan.steps.map((step, index) => (
              <div className="flex items-center justify-between border-b border-border-subtle py-3" key={step.id}>
                <div>
                  <p className="text-sm">
                    {index + 1}. {step.dag_node.replaceAll("_", " ")}
                  </p>
                  <p className="mono text-xs text-muted-foreground">{step.primary_worker_id}</p>
                </div>
                <p className="mono text-xs text-muted-foreground">{step.estimate_sats} sats</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-6">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            disabled={isResponding}
            onClick={() => onConfirm(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="text-sm font-medium text-foreground hover:text-primary disabled:opacity-50"
            disabled={isResponding}
            onClick={() => onConfirm(true)}
            type="button"
          >
            Confirm <span className="text-primary">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ClarifyPanel({ isResponding, onClarify }: { isResponding: boolean; onClarify: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (answer.trim()) {
      onClarify(answer.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/15 px-4 backdrop-blur-sm">
      <form className="w-full max-w-lg rounded-lg border border-border bg-card-elevated p-8 shadow-lg" onSubmit={submit}>
        <p className="section-label mb-3">Clarification</p>
        <h2 className="display-serif text-3xl text-foreground">Tell us a bit more.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Add the missing context so AgentMkt can resume the job.
        </p>

        <textarea
          className="mt-6 block w-full resize-none border-0 border-b border-border bg-transparent py-3 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          id="clarification"
          rows={4}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Source text, target language, deadline, constraints…"
          value={answer}
        />

        <div className="mt-6 flex justify-end">
          <button
            className="text-sm font-medium text-foreground hover:text-primary disabled:opacity-50"
            disabled={isResponding || answer.trim().length === 0}
            type="submit"
          >
            Submit <span className="text-primary">→</span>
          </button>
        </div>
      </form>
    </div>
  );
}
