"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { PlanPreview } from "./PlanPreview";
import { PlanTrace } from "./PlanTrace";
import { RatingPrompt } from "./RatingPrompt";
import { StatusBadge } from "./StatusBadge";
import { TreasuryPanel } from "./TreasuryPanel";
import {
  createTopupInvoice,
  getJobBalance,
  getServiceHealth,
  getTopupStatus,
  getWalletBalance,
  type ExtendedJobBalanceResponse
} from "@/lib/hub";
import { clarifyJob, confirmJob, createJob, getJob, startJob } from "@/lib/orchestrator";
import { connectWallet, userIdFromPubkey, type ConnectedWallet } from "@/lib/webln";
import { DEFAULT_PROMPT } from "@/lib/workers";
import type { JobSnapshot, ServiceHealthItem, ServiceHealthResponse } from "@/lib/types";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const buyerUserId = process.env.NEXT_PUBLIC_BUYER_USER_ID ?? "user_demo_buyer";
const DEFAULT_TOPUP_SATS = Number(process.env.NEXT_PUBLIC_DEFAULT_TOPUP_SATS ?? 1000);
const QUICK_TOPUP_OPTIONS = [500, 1000, 2000];

export function JobConsole({ initialJobId }: { initialJobId?: string }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [health, setHealth] = useState<ServiceHealthResponse | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [topupStatus, setTopupStatus] = useState<"idle" | "creating" | "awaiting" | "paid" | "error">("idle");
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupBolt11, setTopupBolt11] = useState<string | null>(null);
  const [topupJobId, setTopupJobId] = useState<string | null>(null);
  const [startingJob, setStartingJob] = useState(false);
  const [topupAmountInput, setTopupAmountInput] = useState(String(DEFAULT_TOPUP_SATS));
  const [accountBalance, setAccountBalance] = useState<ExtendedJobBalanceResponse | null>(null);
  const currentUserId = snapshot?.job.user_id ?? (wallet ? userIdFromPubkey(wallet.pubkey) : buyerUserId);

  const loadJob = useCallback(async (id: string) => {
    const nextSnapshot = await getJob(id);
    setSnapshot(nextSnapshot);
  }, []);

  const loadJobScopedBalance = useCallback(async (jobId: string) => {
    const nextBalance = await getJobBalance(jobId);
    setAccountBalance(nextBalance);
    return nextBalance;
  }, []);

  const loadUserBalance = useCallback(async (userId: string) => {
    const nextBalance = await getWalletBalance(userId);
    setAccountBalance(nextBalance);
    return nextBalance;
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await getServiceHealth());
    } catch (caught) {
      setHealth({
        ok: false,
        services: {
          orchestrator: { ok: false, detail: caught instanceof Error ? caught.message : "Unavailable" },
          marketplace: { ok: false, detail: "Unavailable" },
          hub: { ok: false, detail: "Unavailable" },
          lexe: { ok: false, detail: "Unavailable" }
        }
      });
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = window.setInterval(loadHealth, 10_000);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

  useEffect(() => {
    if (!initialJobId) {
      return;
    }

    setJobId(initialJobId);
    loadJob(initialJobId).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Unable to load job"));
  }, [initialJobId, loadJob]);

  useEffect(() => {
    if (!jobId || terminalStatuses.has(snapshot?.job.status ?? "")) {
      return;
    }

    const interval = window.setInterval(() => {
      loadJob(jobId).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Unable to poll job"));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [jobId, loadJob, snapshot?.job.status]);

  useEffect(() => {
    let cancelled = false;
    const loadBalance = jobId ? loadJobScopedBalance(jobId) : loadUserBalance(currentUserId);
    loadBalance.catch(() => {
      if (!cancelled) {
        setAccountBalance(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, jobId, loadJobScopedBalance, loadUserBalance, snapshot?.job.updated_at]);

  useEffect(() => {
    if (!topupBolt11 || !topupJobId || topupStatus !== "awaiting" || startingJob) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const status = await getTopupStatus(topupBolt11);
        if (!status.paid || cancelled) {
          return;
        }

        setStartingJob(true);
        setTopupStatus("paid");
        await startJob(topupJobId);
        await Promise.all([loadJob(topupJobId), loadJobScopedBalance(topupJobId)]);
      } catch (caught) {
        if (!cancelled) {
          setTopupStatus("error");
          setTopupError(caught instanceof Error ? caught.message : "Unable to confirm topup");
        }
      } finally {
        if (!cancelled) {
          setStartingJob(false);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadJob, loadJobScopedBalance, startingJob, topupBolt11, topupJobId, topupStatus]);

  const handleConnectWallet = useCallback(async () => {
    setWalletConnecting(true);
    setError(null);
    try {
      const nextWallet = await connectWallet();
      setWallet(nextWallet);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to connect wallet");
    } finally {
      setWalletConnecting(false);
    }
  }, []);

  const parsedTopupAmount = Number.parseInt(topupAmountInput, 10);
  const topupAmountSats = Number.isFinite(parsedTopupAmount) ? parsedTopupAmount : NaN;
  const topupAmountValid = Number.isInteger(topupAmountSats) && topupAmountSats > 0;

  const launchJob = useCallback(async () => {
    setIsLaunching(true);
    setError(null);
    setTopupError(null);
    setTopupStatus("idle");
    setTopupBolt11(null);
    setTopupJobId(null);
    try {
      if (!topupAmountValid) {
        throw new Error("Enter a valid topup amount in sats");
      }
      const userId = wallet ? userIdFromPubkey(wallet.pubkey) : buyerUserId;
      const created = await createJob({
        user_id: userId,
        prompt: prompt.trim()
      });
      setJobId(created.job_id);
      window.history.pushState(null, "", `/jobs/${created.job_id}`);
      await loadJob(created.job_id);
      const balance = await loadJobScopedBalance(created.job_id);
      if (balance.available_sats > 0) {
        setStartingJob(true);
        try {
          await startJob(created.job_id);
          await Promise.all([loadJob(created.job_id), loadJobScopedBalance(created.job_id)]);
        } finally {
          setStartingJob(false);
        }
        return;
      }
      setTopupStatus("creating");
      try {
        const invoice = await createTopupInvoice(created.job_id, topupAmountSats);
        setTopupStatus("awaiting");
        setTopupBolt11(invoice.bolt11);
        setTopupJobId(created.job_id);
      } catch (caught) {
        setTopupStatus("error");
        setTopupError(caught instanceof Error ? caught.message : "Topup invoice creation failed");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to launch job");
    } finally {
      setIsLaunching(false);
    }
  }, [loadJob, loadJobScopedBalance, prompt, topupAmountSats, topupAmountValid, wallet]);

  const handleConfirm = useCallback(
    async (confirmed: boolean) => {
      if (!jobId) {
        return;
      }

      setIsResponding(true);
      setError(null);
      try {
        await confirmJob(jobId, confirmed);
        await loadJob(jobId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to confirm job");
      } finally {
        setIsResponding(false);
      }
    },
    [jobId, loadJob]
  );

  const handleClarify = useCallback(
    async (answer: string) => {
      if (!jobId) {
        return;
      }

      setIsResponding(true);
      setError(null);
      try {
        await clarifyJob(jobId, answer);
        await loadJob(jobId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to submit clarification");
      } finally {
        setIsResponding(false);
      }
    },
    [jobId, loadJob]
  );

  const suggestedTopupSats = useMemo(() => {
    const estimate = snapshot?.plan?.total_estimate_sats;
    if (typeof estimate !== "number" || estimate <= 0) return null;
    return Math.max(100, Math.ceil(estimate * 1.2));
  }, [snapshot?.plan?.total_estimate_sats]);

  const traceLines = useMemo(() => buildTraceLines(snapshot), [snapshot]);

  return (
    <div className="console-grid text-foreground">
      <aside className="left-rail px-6 py-8 lg:sticky lg:top-0 lg:min-h-screen">
        <Link className="mb-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href="/">
          <span aria-hidden>←</span> Home
        </Link>

        <Link className="mb-12 flex items-baseline gap-2" href="/">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="display-serif text-xl tracking-tight text-foreground">AgentMkt</span>
        </Link>

        <nav className="space-y-3 text-sm">
          <RailItem active label="Dashboard" />
          <RailLink href="/workers" label="Marketplace" />
          <RailLink href="/workers/new" label="List worker" />
        </nav>

        <div className="mt-14">
          <p className="section-label mb-4">Wallet</p>
          {wallet ? (
            <div className="space-y-1 text-xs">
              <div className="text-success">Connected</div>
              <div className="mono truncate text-muted-foreground" title={wallet.pubkey}>
                {wallet.alias} · {wallet.pubkey.slice(0, 8)}…{wallet.pubkey.slice(-4)}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                className="text-sm text-foreground hover:text-primary disabled:opacity-60"
                disabled={walletConnecting}
                onClick={handleConnectWallet}
                type="button"
              >
                {walletConnecting ? "Connecting…" : "Connect Lightning wallet"} <span className="text-primary">→</span>
              </button>
              <p className="text-xs text-muted-foreground">
                Optional. You can also pay the topup invoice from any Lightning wallet (e.g. Lexe).
              </p>
            </div>
          )}

          <div className="mt-5 border-t border-[color:var(--blush-border)] pt-4">
            <label className="mb-2 block text-xs text-muted-foreground" htmlFor="topup-amount">
              Topup amount
            </label>
            <div className="flex items-center gap-2">
              <input
                className="mono h-9 w-full rounded-md border border-[color:var(--blush-border)] bg-card px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                id="topup-amount"
                inputMode="numeric"
                min={1}
                onChange={(event) => setTopupAmountInput(event.target.value)}
                placeholder={String(DEFAULT_TOPUP_SATS)}
                value={topupAmountInput}
              />
              <span className="text-xs text-muted-foreground">sats</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_TOPUP_OPTIONS.map((amount) => (
                <button
                  className="inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--blush-border)] bg-card px-3 text-xs font-medium text-foreground transition hover:bg-muted"
                  key={amount}
                  onClick={() => setTopupAmountInput(String(amount))}
                  type="button"
                >
                  {amount}
                </button>
              ))}
              {suggestedTopupSats ? (
                <button
                  className="inline-flex h-7 items-center justify-center rounded-full border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition hover:bg-primary/10"
                  onClick={() => setTopupAmountInput(String(suggestedTopupSats))}
                  type="button"
                >
                  Use estimate ({suggestedTopupSats})
                </button>
              ) : null}
            </div>
          </div>

          {topupStatus !== "idle" ? (
            <div className="mt-4 border-t border-[color:var(--blush-border)] pt-3 text-xs">
              {topupStatus === "creating" ? <p className="text-muted-foreground">Requesting invoice…</p> : null}
              {topupStatus === "awaiting" ? (
                <p className="text-muted-foreground">
                  Awaiting payment ({topupAmountValid ? topupAmountSats : DEFAULT_TOPUP_SATS} sats)
                </p>
              ) : null}
              {topupStatus === "paid" ? <p className="text-success">Paid · starting route…</p> : null}
              {topupStatus === "error" ? <p className="text-danger">Topup failed</p> : null}

              {topupBolt11 ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="mono min-h-20 w-full resize-y rounded-md border border-[color:var(--blush-border)] bg-card px-2 py-2 text-[11px] text-foreground"
                    readOnly
                    value={topupBolt11}
                  />
                  <button
                    className="inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--blush-border)] bg-card px-3 text-xs font-medium text-foreground transition hover:bg-muted"
                    onClick={() => {
                      void navigator.clipboard.writeText(topupBolt11);
                    }}
                    type="button"
                  >
                    Copy invoice
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {topupError ? <p className="mt-1 text-xs text-danger">{topupError}</p> : null}
        </div>

        <div className="mt-12">
          <p className="section-label mb-4">Services</p>
          <div className="space-y-2.5 text-xs">
            <ServiceLine item={health?.services.orchestrator} label="Orchestrator" />
            <ServiceLine item={health?.services.marketplace} label="Marketplace" />
            <ServiceLine item={health?.services.hub} label="Hub" />
            <ServiceLine item={health?.services.lexe} label="Lightning rail" />
            <div className="flex items-baseline justify-between gap-3 pt-3 text-muted-foreground">
              <span>Account balance</span>
              <span className="mono text-foreground">
                {formatMaybeSats(accountBalance?.available_sats ?? snapshot?.debug?.wallet_balance_sats)}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-8 py-10 lg:px-14 lg:py-14">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display-serif text-5xl text-foreground sm:text-6xl">Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            {snapshot ? <StatusBadge status={snapshot.job.status} /> : null}
            <span className="mono text-xs text-muted-foreground">{jobId || "no job"}</span>
          </div>
        </header>

        <div className="editorial-grid workspace-surface">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="section-num">01</span>
              <span className="section-label section-label-arrow">Work order</span>
            </div>
            <ChatPanel
              error={error}
              isLaunching={isLaunching}
              onLaunch={launchJob}
              onPromptChange={setPrompt}
              prompt={prompt}
              snapshot={snapshot}
            />
          </div>

          <div className="col-divider">
            <div className="mb-5 flex items-center gap-3">
              <span className="section-num">02</span>
              <span className="section-label section-label-arrow">Execution plan</span>
            </div>
            <PlanTrace snapshot={snapshot} />
          </div>

          <div className="col-divider">
            <div className="mb-5 flex items-center gap-3">
              <span className="section-num">03</span>
              <span className="section-label section-label-arrow">Hub balance</span>
            </div>
            <div className="space-y-10">
              <TreasuryPanel snapshot={snapshot} userId={currentUserId} />
              <RatingPrompt snapshot={snapshot} />
              <NetworkPulse health={health} />
              <section id="trace">
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground transition hover:text-foreground">
                    Job trace ({jobId || "no job"})
                  </summary>
                  <div className="mt-3 space-y-1">
                    {traceLines.map((line) => (
                      <p className="mono py-0.5 text-xs text-muted-foreground" key={line}>
                        {line}
                      </p>
                    ))}
                  </div>
                </details>
              </section>
            </div>
          </div>
        </div>
      </main>

      <PlanPreview isResponding={isResponding} onClarify={handleClarify} onConfirm={handleConfirm} snapshot={snapshot} />
    </div>
  );
}

function NetworkPulse({ health }: { health: ServiceHealthResponse | null }) {
  const services = health?.services;
  const upCount = services
    ? Object.values(services).filter((service) => service.ok).length
    : 0;
  const totalCount = services ? Object.values(services).length : 4;

  return (
    <section className="border-t border-border-subtle pt-6">
      <p className="section-label mb-3">Network</p>
      <p className="display-serif text-3xl text-foreground">
        {upCount} <span className="text-muted-foreground">/ {totalCount}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        services online · checked every 10s
      </p>
    </section>
  );
}

function RailItem({ active = false, label }: { active?: boolean; label: string }) {
  return (
    <div className={`flex items-center text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
      {active ? <span className="mr-2 inline-block h-3 w-px bg-primary" /> : <span className="mr-2 inline-block h-3 w-px bg-transparent" />}
      {label}
    </div>
  );
}

function RailLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="flex items-center text-sm text-muted-foreground transition hover:text-foreground" href={href}>
      <span className="mr-2 inline-block h-3 w-px bg-transparent" />
      {label}
    </Link>
  );
}

function ServiceLine({ item, label }: { item?: ServiceHealthItem; label: string }) {
  const ok = item?.ok === true;
  const unavailable = !item;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-success" : unavailable ? "text-muted-foreground" : "text-danger"}>
        {ok ? "ready" : unavailable ? "checking" : "down"}
      </span>
    </div>
  );
}

function buildTraceLines(snapshot: JobSnapshot | null): string[] {
  if (!snapshot) {
    return ["waiting for POST /api/jobs"];
  }

  const lines = [
    `${snapshot.job.id} status=${snapshot.job.status}`,
    `wallet_balance=${snapshot.debug?.wallet_balance_sats ?? "unknown"} held=${snapshot.job.locked_sats} settled=${snapshot.job.spent_sats}`
  ];

  if (snapshot.hub_bolt11) {
    lines.push(`hub_bolt11=${snapshot.hub_bolt11}`);
  }

  if (snapshot.debug?.cfo_verdict) {
    lines.push(`cfo_verdict=${snapshot.debug.cfo_verdict.kind}`);
  }

  if (snapshot.debug?.error) {
    lines.push(`error=${snapshot.debug.error}`);
  }

  if (snapshot.plan) {
    lines.push(`plan=${snapshot.plan.id} estimate=${snapshot.plan.total_estimate_sats}`);
    for (const step of snapshot.steps_progress) {
      lines.push(`${step.id} ${step.capability_tag} worker=${step.primary_worker_id} status=${step.status}`);
    }
  }

  if (snapshot.job.status === "completed" && snapshot.final_output) {
    lines.push("final_output=ready");
  }

  return lines;
}

function formatMaybeSats(value: number | null | undefined) {
  return typeof value === "number" ? `${value} sats` : "unavailable";
}
