"use client";

import { AlertTriangle, Check, ShieldAlert, X } from "lucide-react";
import type { JobSnapshot } from "@/lib/types";

interface PlanPreviewProps {
  snapshot: JobSnapshot | null;
  isConfirming: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function PlanPreview({ snapshot, isConfirming, onConfirm }: PlanPreviewProps) {
  const shouldShow = snapshot?.job.status === "awaiting_user" && snapshot.plan;

  if (!shouldShow || !snapshot.plan) {
    return null;
  }

  const overWallet = snapshot.debug?.cfo_verdict?.kind === "USER_CONFIRM";

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
              <h2 className="text-lg font-semibold">Confirm over-wallet route</h2>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Route estimate is{" "}
            <span className="mono font-semibold text-foreground">{snapshot.plan.total_estimate_sats} sats</span>.{" "}
            {overWallet
              ? "The COO proposal exceeds the current wallet balance, so AgentMkt asks for approval before continuing."
              : "AgentMkt paused this route and is waiting for confirmation before continuing."}
          </p>
        </div>

        <div className="space-y-2 p-5">
          <div className="mb-3 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Approval acknowledges that the proposed route exceeds available wallet balance.
            </div>
          </div>
          {snapshot.plan.steps.map((step, index) => (
            <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background p-3" key={step.id}>
              <div>
                <p className="text-sm font-medium">
                  {index + 1}. {step.dag_node.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-muted-foreground">{step.human_required ? "Human step" : "Agent step"}</p>
              </div>
              <p className="mono text-sm text-primary">{step.estimate_sats} sats</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle p-5">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-4 text-sm text-foreground transition hover:bg-card"
            disabled={isConfirming}
            onClick={() => onConfirm(false)}
            type="button"
          >
            <X className="h-4 w-4" />
            Stop route
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            disabled={isConfirming}
            onClick={() => onConfirm(true)}
            type="button"
          >
            <Check className="h-4 w-4" />
            Acknowledge
          </button>
        </div>
      </section>
    </div>
  );
}
