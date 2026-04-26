"use client";

import { Bot, CircleDollarSign, RadioTower, TerminalSquare, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { PlanPreview } from "./PlanPreview";
import { PlanTrace } from "./PlanTrace";
import { RatingPrompt } from "./RatingPrompt";
import { StatusBadge } from "./StatusBadge";
import { TreasuryPanel } from "./TreasuryPanel";
import { getServiceHealth } from "@/lib/hub";
import { confirmJob, createJob, getJob, clarifyJob } from "@/lib/orchestrator";
import { DEFAULT_PROMPT } from "@/lib/workers";
import type { JobSnapshot, ServiceHealthItem, ServiceHealthResponse } from "@/lib/types";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const buyerUserId = process.env.NEXT_PUBLIC_BUYER_USER_ID ?? "user_demo_buyer";

export function JobConsole({ initialJobId }: { initialJobId?: string }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [health, setHealth] = useState<ServiceHealthResponse | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const launchJob = useCallback(async () => {
    setIsLaunching(true);
    setError(null);
    try {
      const created = await createJob({
        user_id: buyerUserId,
        prompt: prompt.trim()
      });
      setJobId(created.job_id);
      window.history.pushState(null, "", `/jobs/${created.job_id}`);
      await loadJob(created.job_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to launch job");
    } finally {
      setIsLaunching(false);
    }
  }, [loadJob, prompt]);

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
      <aside className="left-rail border-r border-border-subtle bg-card/70 p-4 lg:sticky lg:top-0 lg:min-h-screen">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">AgentMkt</p>
            <p className="mono text-xs text-muted-foreground">routing desk</p>
          </div>
        </div>

        <nav className="space-y-1 text-sm">
          <RailItem active icon={TerminalSquare} label="Request" />
          <RailLink href="/workers" icon={Users} label="Workers" />
          <RailLink href="/workers/new" icon={RadioTower} label="List worker" />
        </nav>

        <div className="mt-8 rounded-md border border-border-subtle bg-background p-3">
          <p className="section-label mb-2">Services</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <ServiceLine item={health?.services.orchestrator} label="Orchestrator" />
            <ServiceLine item={health?.services.marketplace} label="Marketplace" />
            <ServiceLine item={health?.services.hub} label="Hub" />
            <ServiceLine item={health?.services.lexe} label="Lexe" />
            <div className="flex items-center justify-between border-t border-border-subtle pt-2">
              <span>Wallet balance</span>
              <span className="mono">{formatMaybeSats(snapshot?.debug?.wallet_balance_sats)}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-4 lg:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${health?.ok === false ? "bg-danger" : "bg-success"}`} />
              <span className="section-label">Quality-aware routing</span>
            </div>
            <h1 className="text-2xl font-semibold">AgentMkt Routing Desk</h1>
          </div>
          <div className="flex items-center gap-2">
            {snapshot ? <StatusBadge status={snapshot.job.status} /> : null}
            <span className="mono rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
              {jobId || "job_not_started"}
            </span>
          </div>
        </header>

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
                <h2 className="text-sm font-semibold">Trace</h2>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground transition hover:text-foreground">
                  Show orchestration state
                </summary>
                <div className="mt-3 space-y-2">
                  {traceLines.map((line) => (
                    <p className="mono rounded border border-border-subtle bg-background px-2 py-1 text-xs text-muted-foreground" key={line}>
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
        active ? "bg-muted text-foreground" : "text-muted-foreground"
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
