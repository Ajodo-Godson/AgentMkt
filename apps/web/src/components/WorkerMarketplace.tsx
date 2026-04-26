"use client";

import { ArrowLeft, Bot, CheckCircle2, Clock3, Copy, PlusCircle, Search, ShieldCheck, Star, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { discoverWorkers } from "@/lib/marketplace";
import { allCapabilityTags, getCapabilityLabel, workerCapabilityOptions } from "@/lib/workers";
import type { CapabilityTag, WorkerCandidate } from "@/lib/types";

type WorkerTypeFilter = "all" | "agent" | "human";
type SortKey = "recommended" | "price" | "rating" | "jobs";

export function WorkerMarketplace() {
  const [workers, setWorkers] = useState<WorkerCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState<CapabilityTag | "all">("all");
  const [type, setType] = useState<WorkerTypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await discoverWorkers({
        capability_tags: allCapabilityTags,
        include_external: true,
        limit: 50
      });
      setWorkers(response.candidates);
    } catch (caught) {
      setWorkers([]);
      setError(caught instanceof Error ? caught.message : "Marketplace unavailable");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const filteredWorkers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextWorkers = workers.filter((worker) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        worker.display_name.toLowerCase().includes(normalizedQuery) ||
        worker.worker_id.toLowerCase().includes(normalizedQuery);
      const matchesCapability = capability === "all" || worker.capability_tags.includes(capability);
      const matchesType = type === "all" || worker.type === type;
      return matchesQuery && matchesCapability && matchesType;
    });

    return [...nextWorkers].sort((left, right) => {
      if (sort === "price") {
        return left.base_price_sats - right.base_price_sats;
      }

      if (sort === "rating") {
        return right.ewma - left.ewma;
      }

      if (sort === "jobs") {
        return right.total_jobs - left.total_jobs;
      }

      return 0;
    });
  }, [capability, query, sort, type, workers]);

  const agentCount = workers.filter((worker) => worker.type === "agent").length;
  const humanCount = workers.filter((worker) => worker.type === "human").length;
  const medianPrice = getMedianPrice(workers);

  const copyWorkerId = async (workerId: string) => {
    try {
      await navigator.clipboard.writeText(workerId);
      setCopiedId(workerId);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/">
          <ArrowLeft className="h-4 w-4" />
          Mission control
        </Link>

        <header className="mb-6 flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${error ? "bg-danger" : "bg-success"}`} />
              <span className="section-label">Marketplace discovery</span>
            </div>
            <h1 className="text-2xl font-semibold">Worker marketplace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Live worker candidates from the marketplace discovery endpoint.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 text-sm font-medium text-foreground transition hover:bg-card-elevated focus:outline-none focus:ring-2 focus:ring-primary/40"
              onClick={loadWorkers}
              type="button"
            >
              Refresh
            </button>
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50"
              href="/workers/new"
            >
              <PlusCircle className="h-4 w-4" />
              List worker
            </Link>
          </div>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric icon={ShieldCheck} label="Returned" value={workers.length.toString()} detail={`${agentCount} agents, ${humanCount} human`} />
          <Metric icon={Zap} label="Median price" value={medianPrice === null ? "Unavailable" : `${medianPrice} sats`} detail="Base worker price" />
          <Metric icon={CheckCircle2} label="Source" value={error ? "Down" : "Live"} detail={error ?? "Marketplace /discover"} />
        </section>

        <section className="panel-strong overflow-hidden">
          <div className="grid gap-3 border-b border-border-subtle p-4 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-10 w-full rounded-md border border-border-subtle bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workers"
                value={query}
              />
            </label>
            <Select label="Capability" onChange={(value) => setCapability(value as CapabilityTag | "all")} value={capability}>
              <option value="all">All capabilities</option>
              {workerCapabilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Type" onChange={(value) => setType(value as WorkerTypeFilter)} value={type}>
              <option value="all">All workers</option>
              <option value="agent">Agents</option>
              <option value="human">Humans</option>
            </Select>
            <Select label="Sort" onChange={(value) => setSort(value as SortKey)} value={sort}>
              <option value="recommended">Recommended</option>
              <option value="price">Lowest price</option>
              <option value="rating">Highest EWMA</option>
              <option value="jobs">Most jobs</option>
            </Select>
          </div>

          <div className="hidden grid-cols-[minmax(260px,1.45fr)_minmax(220px,1fr)_110px_120px_124px] gap-4 border-b border-border-subtle bg-card px-4 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Worker</span>
            <span>Capability</span>
            <span>Price</span>
            <span>Quality</span>
            <span className="text-right">Action</span>
          </div>

          <div className={isLoading ? "scan-line" : ""}>
            {error ? (
              <div className="p-8 text-sm text-danger">{error}</div>
            ) : filteredWorkers.length > 0 ? (
              filteredWorkers.map((worker) => (
                <WorkerRow copied={copiedId === worker.worker_id} key={worker.worker_id} onCopy={copyWorkerId} worker={worker} />
              ))
            ) : (
              <div className="p-8 text-sm text-muted-foreground">
                {isLoading ? "Loading marketplace workers." : "No workers match the current filters."}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  detail,
  icon: Icon,
  label,
  value
}: {
  detail: string;
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="section-label">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Select({
  children,
  label,
  onChange,
  value
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-border-subtle bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function WorkerRow({
  copied,
  onCopy,
  worker
}: {
  copied: boolean;
  onCopy: (workerId: string) => void;
  worker: WorkerCandidate;
}) {
  const WorkerIcon = worker.type === "agent" ? Bot : Users;

  return (
    <article className="grid gap-4 border-b border-border-subtle px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(260px,1.45fr)_minmax(220px,1fr)_110px_120px_124px] lg:items-center">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-background">
            <WorkerIcon className="h-4 w-4 text-primary" />
          </span>
          <h2 className="truncate text-sm font-semibold">{worker.display_name}</h2>
          <span className="rounded-md border border-border-subtle bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {worker.type}
          </span>
          <span className="rounded-md border border-border-subtle bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {worker.source}
          </span>
        </div>
        <p className="mono mt-2 truncate text-xs text-muted-foreground">{worker.worker_id}</p>
        {worker.endpoint_url ? <p className="mt-1 truncate text-xs text-muted-foreground">{worker.endpoint_url}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {worker.capability_tags.map((item) => (
          <span className="rounded-md border border-border-subtle bg-background px-2 py-1 text-xs text-muted-foreground" key={item}>
            {getCapabilityLabel(item)}
          </span>
        ))}
      </div>

      <div>
        <p className="mono text-sm font-semibold">{worker.base_price_sats}</p>
        <p className="text-xs text-muted-foreground">sats base</p>
      </div>

      <div className="grid gap-1 text-sm">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-primary" />
          {worker.ewma.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">{worker.total_jobs} jobs</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {worker.type === "human" ? "manual" : "endpoint"}
        </span>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 text-xs font-medium text-foreground transition hover:bg-card-elevated focus:outline-none focus:ring-2 focus:ring-primary/40"
          onClick={() => onCopy(worker.worker_id)}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy ID"}
        </button>
      </div>
    </article>
  );
}

function getMedianPrice(workers: WorkerCandidate[]): number | null {
  if (workers.length === 0) {
    return null;
  }

  const prices = workers.map((worker) => worker.base_price_sats).sort((left, right) => left - right);
  const midpoint = Math.floor(prices.length / 2);
  if (prices.length % 2 === 0) {
    return Math.round((prices[midpoint - 1] + prices[midpoint]) / 2);
  }

  return prices[midpoint];
}
