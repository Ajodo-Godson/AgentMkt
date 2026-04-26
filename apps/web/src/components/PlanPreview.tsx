"use client";

import { AlertTriangle, Check, HelpCircle, ShieldAlert, X } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-4">
      <section className="w-full max-w-xl rounded-lg border border-warning/45 bg-card-elevated shadow-2xl">
        <div className="border-b border-border-subtle p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-warning/40 bg-warning/10">
              <ShieldAlert className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="section-label text-warning">Approval</p>
              <h2 className="text-lg font-semibold">Confirm CFO hold</h2>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {snapshot.debug?.cfo_verdict?.summary ?? "The orchestrator paused for approval before continuing."}
          </p>
        </div>

        {snapshot.plan ? (
          <div className="space-y-2 p-5">
            <div className="mb-3 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Approval is required by the orchestrator before this route can continue.
              </div>
            </div>
            {snapshot.plan.steps.map((step, index) => (
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background p-3" key={step.id}>
                <div>
                  <p className="text-sm font-medium">
                    {index + 1}. {step.dag_node.replaceAll("_", " ")}
                  </p>
                  <p className="mono text-xs text-muted-foreground">{step.primary_worker_id}</p>
                </div>
                <p className="mono text-sm text-primary">{step.estimate_sats} sats</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border-subtle p-5">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-4 text-sm text-foreground transition hover:bg-card"
            disabled={isResponding}
            onClick={() => onConfirm(false)}
            type="button"
          >
            <X className="h-4 w-4" />
            Stop route
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            disabled={isResponding}
            onClick={() => onConfirm(true)}
            type="button"
          >
            <Check className="h-4 w-4" />
            Confirm
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-4">
      <form className="w-full max-w-xl rounded-lg border border-info/45 bg-card-elevated shadow-2xl" onSubmit={submit}>
        <div className="border-b border-border-subtle p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-info/40 bg-info/10">
              <HelpCircle className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="section-label text-info">Clarification</p>
              <h2 className="text-lg font-semibold">The orchestrator needs more detail</h2>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            The backend does not expose the exact interrupt question yet. Add the missing context and AgentMkt will resume the job.
          </p>
        </div>

        <div className="p-5">
          <label className="mb-2 block text-sm text-muted-foreground" htmlFor="clarification">
            Clarification
          </label>
          <textarea
            className="form-control min-h-28 resize-y leading-6"
            id="clarification"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Add the source text, target language, deadline, or any missing constraints."
            value={answer}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle p-5">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            disabled={isResponding || answer.trim().length === 0}
            type="submit"
          >
            <Check className="h-4 w-4" />
            Submit clarification
          </button>
        </div>
      </form>
    </div>
  );
}
