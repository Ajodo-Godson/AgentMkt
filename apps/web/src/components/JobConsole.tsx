"use client";

import { Activity, Bot, CircleDollarSign, RadioTower, TerminalSquare, Users, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { PlanPreview } from "./PlanPreview";
import { PlanTrace } from "./PlanTrace";
import { RatingPrompt } from "./RatingPrompt";
import { StatusBadge } from "./StatusBadge";
import { TreasuryPanel } from "./TreasuryPanel";
import { createTopupInvoice, getServiceHealth } from "@/lib/hub";
import { clarifyJob, confirmJob, createJob, getJob } from "@/lib/orchestrator";
import { connectWallet, payInvoice, userIdFromPubkey, type ConnectedWallet } from "@/lib/webln";
import { DEFAULT_PROMPT } from "@/lib/workers";
import type { JobSnapshot, ServiceHealthItem, ServiceHealthResponse } from "@/lib/types";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const buyerUserId = process.env.NEXT_PUBLIC_BUYER_USER_ID ?? "user_demo_buyer";
const DEFAULT_TOPUP_SATS = Number(process.env.NEXT_PUBLIC_DEFAULT_TOPUP_SATS ?? 1000);

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

  const loadJob = useCallback(async (id: string) => {
    const nextSnapshot = await getJob(id);
    setSnapshot(nextSnapshot);
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

  const launchJob = useCallback(async () => {
    setIsLaunching(true);
    setError(null);
    setTopupError(null);
    setTopupStatus("idle");
    try {
      const userId = wallet ? userIdFromPubkey(wallet.pubkey) : buyerUserId;
      const created = await createJob({
        user_id: userId,
        prompt: prompt.trim()
      });
      setJobId(created.job_id);
      window.history.pushState(null, "", `/jobs/${created.job_id}`);
      await loadJob(created.job_id);

      if (wallet) {
        setTopupStatus("creating");
        try {
          const invoice = await createTopupInvoice(created.job_id, DEFAULT_TOPUP_SATS);
          setTopupStatus("awaiting");
          await payInvoice(invoice.bolt11);
          setTopupStatus("paid");
        } catch (caught) {
          setTopupStatus("error");
          setTopupError(caught instanceof Error ? caught.message : "Topup payment failed");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to launch job");
    } finally {
      setIsLaunching(false);
    }
  }, [loadJob, prompt, wallet]);

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

  const traceLines = useMemo(() => buildTraceLines(snapshot), [snapshot]);

  return (
    <div className="console-grid text-foreground">
      <aside className="left-rail border-r border-border-subtle bg-card p-4 lg:sticky lg:top-0 lg:min-h-screen">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">AgentMkt</p>
            <p className="text-xs text-muted-foreground">Paid work routing</p>
          </div>
        </div>

        <nav className="space-y-1 text-sm">
          <RailItem active icon={TerminalSquare} label="Routing desk" />
          <RailLink href="/workers" icon={Users} label="Marketplace" />
          <RailLink href="/workers/new" icon={RadioTower} label="List worker" />
        </nav>

        <div className="mt-8 rounded-md border border-border-subtle bg-muted/50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="section-label">Wallet</p>
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {wallet ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Connected</span>
                <span className="text-success">ready</span>
              </div>
              <div className="mono truncate text-muted-foreground" title={wallet.pubkey}>
                {wallet.alias} - {wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-4)}
              </div>
            </div>
          ) : (
            <button
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-card text-xs font-medium text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
              disabled={walletConnecting}
              onClick={handleConnectWallet}
              type="button"
            >
              <Wallet className="h-3.5 w-3.5" />
              {walletConnecting ? "Connecting..." : "Connect Lightning wallet"}
            </button>
          )}
          {topupStatus !== "idle" ? (
            <div className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-2 text-xs">
              <Zap className="h-3.5 w-3.5 text-primary" />
              {topupStatus === "creating" ? <span className="text-muted-foreground">Requesting topup...</span> : null}
              {topupStatus === "awaiting" ? <span className="text-muted-foreground">Confirm in Alby ({DEFAULT_TOPUP_SATS} sats)</span> : null}
              {topupStatus === "paid" ? <span className="text-success">Paid, {DEFAULT_TOPUP_SATS} sats</span> : null}
              {topupStatus === "error" ? <span className="text-danger">Topup failed</span> : null}
            </div>
          ) : null}
          {topupError ? <p className="mt-2 text-xs text-danger">{topupError}</p> : null}
        </div>

        <div className="mt-4 rounded-md border border-border-subtle bg-muted/50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="section-label">Services</p>
            <span className={`h-2 w-2 rounded-full ${health?.ok === false ? "bg-danger" : "bg-success"}`} />
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <ServiceLine item={health?.services.orchestrator} label="Orchestrator" />
            <ServiceLine item={health?.services.marketplace} label="Marketplace" />
            <ServiceLine item={health?.services.hub} label="Hub" />
            <ServiceLine item={health?.services.lexe} label="Lexe" />
            <div className="flex items-center justify-between border-t border-border-subtle pt-2">
              <span>Hub balance</span>
              <span className="mono">{formatMaybeSats(snapshot?.debug?.wallet_balance_sats)}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 lg:px-8 lg:py-7">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${health?.ok === false ? "bg-danger" : "bg-success"}`} />
              <span className="section-label">Quality-aware routing</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.01em]">Routing desk</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Submit a paid work request, inspect the selected route, and approve only when the CFO gate asks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {snapshot ? <StatusBadge status={snapshot.job.status} /> : null}
            <span className="mono rounded-md border border-border-subtle bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
              {jobId || "job_not_started"}
            </span>
          </div>
        </header>

        <section className="mb-5 rounded-md border border-primary/35 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-card">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Live marketplace routing</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Routes use orchestrator plans, marketplace candidates, and hub balances from the running services.
                </p>
              </div>
            </div>
            <Link
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-card px-3 text-sm font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
              href="/workers"
            >
              View workers
            </Link>
          </div>
        </section>

        <div className="job-grid">
          <ChatPanel
            error={error}
            isLaunching={isLaunching}
            onLaunch={launchJob}
            onPromptChange={setPrompt}
            prompt={prompt}
            snapshot={snapshot}
          />
          <PlanTrace snapshot={snapshot} />
          <div className="space-y-4">
            <TreasuryPanel snapshot={snapshot} />
            <RatingPrompt snapshot={snapshot} />
            <section className="panel p-4" id="trace">
              <div className="mb-3 flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Job trace</h2>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground transition hover:text-foreground">
                  Show latest state
                </summary>
                <div className="mt-3 space-y-2">
                  {traceLines.map((line) => (
                    <p className="mono rounded border border-border-subtle bg-muted/60 px-2 py-1 text-xs text-muted-foreground" key={line}>
                      {line}
                    </p>
                  ))}
                </div>
              </details>
            </section>
          </div>
        </div>
      </main>

      <PlanPreview isResponding={isResponding} onClarify={handleClarify} onConfirm={handleConfirm} snapshot={snapshot} />
    </div>
  );
}

function RailItem({ active = false, icon: Icon, label }: { active?: boolean; icon: typeof Bot; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function RailLink({ href, icon: Icon, label }: { href: string; icon: typeof Bot; label: string }) {
  return (
    <Link className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" href={href}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function ServiceLine({ item, label }: { item?: ServiceHealthItem; label: string }) {
  const ok = item?.ok === true;
  const unavailable = !item;

  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
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
