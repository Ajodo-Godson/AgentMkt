"use client";

import { useEffect, useState } from "react";
import { getJobBalance, getWalletBalance, type ExtendedJobBalanceResponse } from "@/lib/hub";
import type { JobSnapshot } from "@/lib/types";

export function TreasuryPanel({ snapshot, userId }: { snapshot: JobSnapshot | null; userId: string }) {
  const [balance, setBalance] = useState<ExtendedJobBalanceResponse | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const job = snapshot?.job;
  const estimate = snapshot?.plan?.total_estimate_sats ?? null;
  const accountBalance = balance?.available_sats ?? snapshot?.debug?.wallet_balance_sats ?? null;
  const reserved = balance?.held_sats ?? job?.locked_sats ?? null;
  const settled = balance?.settled_sats ?? job?.spent_sats ?? null;
  const available = balance?.available_sats ?? null;
  const fees = balance?.fees_sats ?? null;
  const toppedUp = balance?.topped_up_sats ?? null;
  const fundedTotal =
    typeof toppedUp === "number"
      ? toppedUp
      : typeof available === "number" && typeof reserved === "number" && typeof settled === "number"
        ? available + reserved + settled
        : null;
  const walletUsed =
    typeof fundedTotal === "number" && typeof reserved === "number" && typeof settled === "number" && fundedTotal > 0
      ? Math.min(100, ((reserved + settled) / fundedTotal) * 100)
      : 0;
  const approval = getApprovalState(snapshot);

  useEffect(() => {
    let cancelled = false;
    const loadBalance = job?.id ? getJobBalance(job.id) : getWalletBalance(userId);
    loadBalance
      .then((nextBalance) => {
        if (!cancelled) {
          setBalance(nextBalance);
          setBalanceError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setBalance(null);
          setBalanceError(caught instanceof Error ? caught.message : "Account balance unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [job?.id, snapshot?.job.updated_at, userId]);

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <span className="display-serif text-5xl text-foreground">{formatBigNumber(accountBalance)}</span>
        <span className="text-sm text-muted-foreground">sats</span>
      </div>

      <div className="mt-4 h-px w-full bg-border-subtle">
        <div className="h-px bg-primary transition-[width] duration-200" style={{ width: `${walletUsed}%` }} />
      </div>

      <dl className="mt-6 space-y-2.5 text-sm">
        <LedgerLine label="Estimate" value={formatMetric(estimate)} />
        <LedgerLine label="Held" value={formatMetric(reserved)} />
        <LedgerLine label="Settled" value={formatMetric(settled)} tone="text-success" />
        <LedgerLine label="Available" value={formatMetric(available)} />
        <LedgerLine label="Fees" value={formatMetric(fees)} />
        <LedgerLine label="Topup" value={formatMetric(toppedUp)} />
      </dl>

      {balanceError ? <p className="break-anywhere mt-4 text-xs text-danger">{balanceError}</p> : null}

      <div className="mt-8 border-t border-border-subtle pt-4">
        <p className={`text-sm font-medium ${approval.titleTone}`}>{approval.title}</p>
        <p className="break-anywhere mt-1 text-xs leading-5 text-muted-foreground">{approval.detail}</p>
      </div>
    </section>
  );
}

function LedgerLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`mono ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function getApprovalState(snapshot: JobSnapshot | null): {
  title: string;
  detail: string;
  titleTone: string;
} {
  const verdict = snapshot?.debug?.cfo_verdict;

  if (!snapshot) {
    return {
      title: "No job selected",
      detail: "No wallet movement yet.",
      titleTone: "text-muted-foreground"
    };
  }

  if (snapshot.job.status === "awaiting_user" && verdict?.kind === "USER_CONFIRM") {
    return {
      title: "CFO approval required",
      detail: verdict.summary ?? "The orchestrator paused for approval.",
      titleTone: "text-warning"
    };
  }

  if (snapshot.job.status === "awaiting_funds") {
    return {
      title: "Awaiting topup",
      detail: "Pay the topup invoice to add funds to this account before orchestration starts.",
      titleTone: "text-warning"
    };
  }

  if (verdict?.kind === "REVISE") {
    return {
      title: "CFO requested a replan",
      detail: `${verdict.reason ?? "Route risk"}: ${verdict.detail ?? "The proposed route did not meet policy."}`,
      titleTone: "text-info"
    };
  }

  if (snapshot.job.status === "completed") {
    return {
      title: "Route completed",
      detail: "Execution and settlement are complete.",
      titleTone: "text-success"
    };
  }

  if (snapshot.job.status === "failed") {
    return {
      title: "Route failed",
      detail: snapshot.debug?.error ?? "The orchestrator marked this job as failed.",
      titleTone: "text-danger"
    };
  }

  return {
    title: "Monitoring route",
    detail: "Watching holds, settlement, and available sats.",
    titleTone: "text-foreground"
  };
}

function formatBigNumber(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toLocaleString();
}

function formatMetric(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toLocaleString();
}
