"use client";

import { BadgeCheck, Landmark, LockKeyhole, RotateCcw, ShieldAlert, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { getJobBalance, type ExtendedJobBalanceResponse } from "@/lib/hub";
import type { JobSnapshot } from "@/lib/types";

export function TreasuryPanel({ snapshot }: { snapshot: JobSnapshot | null }) {
  const [balance, setBalance] = useState<ExtendedJobBalanceResponse | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const job = snapshot?.job;
  const estimate = snapshot?.plan?.total_estimate_sats ?? null;
  const walletBalance = snapshot?.debug?.wallet_balance_sats ?? null;
  const reserved = balance?.held_sats ?? job?.locked_sats ?? null;
  const settled = balance?.settled_sats ?? job?.spent_sats ?? null;
  const available = balance?.available_sats ?? null;
  const fees = balance?.fees_sats ?? null;
  const walletUsed =
    typeof walletBalance === "number" && typeof reserved === "number" && typeof settled === "number" && walletBalance > 0
      ? Math.min(100, ((reserved + settled) / walletBalance) * 100)
      : 0;
  const approval = getApprovalState(snapshot);

  useEffect(() => {
    if (!job?.id) {
      setBalance(null);
      setBalanceError(null);
      return;
    }

    let cancelled = false;
    getJobBalance(job.id)
      .then((nextBalance) => {
        if (!cancelled) {
          setBalance(nextBalance);
          setBalanceError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setBalance(null);
          setBalanceError(caught instanceof Error ? caught.message : "Hub balance unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [job?.id, snapshot?.job.updated_at]);

  return (
    <section className="panel-strong wallet-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="section-label">Wallet</p>
          <h2 className="text-lg font-semibold">Payment state</h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
          <Landmark className="h-4 w-4 text-primary" />
        </div>
      </div>

      <div className="rounded-md border border-border-subtle bg-background p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Wallet balance</span>
          <span className="mono">sats</span>
        </div>
        <p className="mono text-2xl font-semibold">{formatMetric(walletBalance)}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${walletUsed}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <WalletMetric icon={WalletCards} label="Route estimate" value={formatMetric(estimate)} />
        <WalletMetric icon={LockKeyhole} label="Held" value={formatMetric(reserved)} />
        <WalletMetric icon={BadgeCheck} label="Settled" tone="text-success" value={formatMetric(settled)} />
        <WalletMetric icon={RotateCcw} label="Available" value={formatMetric(available)} />
        <WalletMetric icon={ShieldAlert} label="Fees" value={formatMetric(fees)} />
        <WalletMetric icon={WalletCards} label="Topup" value={formatMetric(balance?.topped_up_sats ?? null)} />
      </div>

      {balanceError ? <p className="mt-3 rounded-md border border-danger/35 bg-danger/10 p-3 text-xs text-danger">{balanceError}</p> : null}

      <div className={`mt-3 rounded-md border p-3 ${approval.boxTone}`}>
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4" />
          {approval.title}
        </div>
        <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{approval.detail}</p>
      </div>
    </section>
  );
}

function WalletMetric({
  icon: Icon,
  label,
  value,
  tone = "text-foreground"
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mono text-base font-medium ${tone}`}>{value}</p>
    </div>
  );
}

function getApprovalState(snapshot: JobSnapshot | null) {
  const verdict = snapshot?.debug?.cfo_verdict;

  if (!snapshot) {
    return {
      title: "No job selected",
      detail: "Submit a request to let the orchestrator evaluate route cost and wallet capacity.",
      boxTone: "border-border-subtle bg-background"
    };
  }

  if (snapshot.job.status === "awaiting_user" && verdict?.kind === "USER_CONFIRM") {
    return {
      title: "CFO approval required",
      detail: verdict.summary ?? "The orchestrator paused for approval.",
      boxTone: "border-warning/35 bg-warning/10"
    };
  }

  if (verdict?.kind === "REVISE") {
    return {
      title: "CFO requested a replan",
      detail: `${verdict.reason ?? "Route risk"}: ${verdict.detail ?? "The proposed route did not meet policy."}`,
      boxTone: "border-info/30 bg-info/10"
    };
  }

  if (snapshot.job.status === "completed") {
    return {
      title: "Route completed",
      detail: "The orchestrator completed synthesis after execution and settlement steps.",
      boxTone: "border-success/25 bg-success/5"
    };
  }

  if (snapshot.job.status === "failed") {
    return {
      title: "Route failed",
      detail: snapshot.debug?.error ?? "The orchestrator marked this job as failed.",
      boxTone: "border-danger/35 bg-danger/10"
    };
  }

  return {
    title: "Monitoring route",
    detail: "The CFO gate evaluates wallet capacity, step size, and worker trust before execution.",
    boxTone: "border-info/30 bg-info/10"
  };
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? `${value}` : "Unavailable";
}
