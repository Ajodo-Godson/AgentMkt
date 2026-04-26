"use client";

import { Bot, CircleDollarSign, ListChecks, RadioTower, TerminalSquare, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { PlanPreview } from "./PlanPreview";
import { PlanTrace } from "./PlanTrace";
import { RatingPrompt } from "./RatingPrompt";
import { StatusBadge } from "./StatusBadge";
import { TreasuryPanel } from "./TreasuryPanel";
import { DEFAULT_PROMPT, DEMO_WALLET_AVAILABLE_SATS } from "@/lib/demo-data";
import { confirmJob, createJob, getJob } from "@/lib/orchestrator";
import type { JobSnapshot, RoutePreference } from "@/lib/types";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

export function JobConsole({ initialJobId }: { initialJobId?: string }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("balanced");
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async (id: string) => {
    const nextSnapshot = await getJob(id);
    setSnapshot(nextSnapshot);
  }, []);

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
        user_id: "user_demo_buyer",
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

      setIsConfirming(true);
      setError(null);
      try {
        await confirmJob(jobId, confirmed);
        await loadJob(jobId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to confirm job");
      } finally {
        setIsConfirming(false);
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
          <RailItem icon={ListChecks} label="Smoke test" />
        </nav>

        <div className="mt-8 rounded-md border border-border-subtle bg-background p-3">
          <p className="section-label mb-2">System</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Mock orchestration</span>
              <span className="text-success">ready</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Wallet balance</span>
              <span className="mono">{DEMO_WALLET_AVAILABLE_SATS}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-4 lg:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-success" />
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
            onRoutePreferenceChange={setRoutePreference}
            prompt={prompt}
            routePreference={routePreference}
            snapshot={snapshot}
          />
          <PlanTrace routePreference={routePreference} snapshot={snapshot} />
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
                  Show orchestration logs
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

      <PlanPreview isConfirming={isConfirming} onConfirm={handleConfirm} snapshot={snapshot} />
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

function buildTraceLines(snapshot: JobSnapshot | null): string[] {
  if (!snapshot) {
    return ["waiting for POST /jobs"];
  }

  const lines = [
    `${snapshot.job.id} status=${snapshot.job.status}`,
    `wallet_balance=${snapshot.debug?.wallet_balance_sats ?? "unknown"} reserved=${snapshot.job.locked_sats} settled=${snapshot.job.spent_sats}`
  ];

  if (snapshot.plan) {
    lines.push(`plan=${snapshot.plan.id} estimate=${snapshot.plan.total_estimate_sats}`);
    for (const step of snapshot.steps_progress) {
      lines.push(`${step.id} ${step.capability_tag} worker=${step.primary_worker_id} status=${step.status}`);
    }
  }

  if (snapshot.job.status === "completed") {
    lines.push("verifier=PASS settle=confirmed refund=available");
  }

  return lines;
}
