"use client";

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  PlusCircle,
  Search,
  ShieldCheck,
  Star,
  Users,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getCapabilityLabel,
  getStoredUserWorkers,
  seededMarketplaceWorkers,
  workerCapabilityOptions
} from "@/lib/workers";
import type { CapabilityTag, MarketplaceWorker } from "@/lib/types";

type WorkerTypeFilter = "all" | "agent" | "human";
type SortKey = "recommended" | "price" | "rating" | "jobs";

export function WorkerMarketplace() {
  const [userWorkers, setUserWorkers] = useState<MarketplaceWorker[]>([]);
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState<CapabilityTag | "all">("all");
  const [type, setType] = useState<WorkerTypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setUserWorkers(getStoredUserWorkers());

    const handleStorage = () => setUserWorkers(getStoredUserWorkers());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const workers = useMemo(() => [...userWorkers, ...seededMarketplaceWorkers], [userWorkers]);
  const filteredWorkers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextWorkers = workers.filter((worker) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        worker.displayName.toLowerCase().includes(normalizedQuery) ||
        worker.description.toLowerCase().includes(normalizedQuery) ||
        worker.id.toLowerCase().includes(normalizedQuery);
      const matchesCapability = capability === "all" || worker.capabilities.includes(capability);
      const matchesType = type === "all" || worker.type === type;
      return matchesQuery && matchesCapability && matchesType;
    });

    return [...nextWorkers].sort((left, right) => {
      if (sort === "price") {
        return left.basePriceSats - right.basePriceSats;
      }

      if (sort === "rating") {
        return (right.rating ?? 0) - (left.rating ?? 0);
      }

      if (sort === "jobs") {
        return right.completedJobs - left.completedJobs;
      }

      return scoreWorker(right) - scoreWorker(left);
    });
  }, [capability, query, sort, type, workers]);

  const agentCount = workers.filter((worker) => worker.type === "agent").length;
  const humanCount = workers.length - agentCount;
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
              <span className="inline-flex h-2 w-2 rounded-full bg-success" />
              <span className="section-label">Active marketplace</span>
            </div>
            <h1 className="text-2xl font-semibold">Worker marketplace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Compare available agents and human workers by capability, price, quality, and route readiness.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50"
            href="/workers/new"
          >
            <PlusCircle className="h-4 w-4" />
            List worker
          </Link>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric icon={ShieldCheck} label="Workers" value={workers.length.toString()} detail={`${agentCount} agents, ${humanCount} human`} />
          <Metric icon={Zap} label="Median price" value={`${medianPrice} sats`} detail="Base route cost" />
          <Metric icon={CheckCircle2} label="User listings" value={userWorkers.length.toString()} detail="Saved in this browser" />
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
              <option value="rating">Highest rating</option>
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

          <div>
            {filteredWorkers.length > 0 ? (
              filteredWorkers.map((worker) => (
                <WorkerRow copied={copiedId === worker.id} key={worker.id} onCopy={copyWorkerId} worker={worker} />
              ))
            ) : (
              <div className="p-8 text-sm text-muted-foreground">No workers match the current filters.</div>
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
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
  worker: MarketplaceWorker;
}) {
  const WorkerIcon = worker.type === "agent" ? Bot : Users;
  const qualityLabel = worker.rating === null ? "New" : worker.rating.toFixed(1);
  const successLabel = worker.successRate === null ? "No jobs yet" : `${worker.successRate}% success`;

  return (
    <article className="grid gap-4 border-b border-border-subtle px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(260px,1.45fr)_minmax(220px,1fr)_110px_120px_124px] lg:items-center">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-background">
            <WorkerIcon className="h-4 w-4 text-primary" />
          </span>
          <h2 className="truncate text-sm font-semibold">{worker.displayName}</h2>
          <span className="rounded-md border border-border-subtle bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {worker.type}
          </span>
          {worker.status === "new" ? (
            <span className="rounded-md border border-primary/35 bg-primary/10 px-2 py-0.5 text-xs text-primary">New</span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{worker.description}</p>
        <p className="mono mt-2 truncate text-xs text-muted-foreground">{worker.id}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {worker.capabilities.map((item) => (
          <span className="rounded-md border border-border-subtle bg-background px-2 py-1 text-xs text-muted-foreground" key={item}>
            {getCapabilityLabel(item)}
          </span>
        ))}
      </div>

      <div>
        <p className="mono text-sm font-semibold">{worker.basePriceSats}</p>
        <p className="text-xs text-muted-foreground">sats base</p>
      </div>

      <div className="grid gap-1 text-sm">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-primary" />
          {qualityLabel}
        </span>
        <span className="text-xs text-muted-foreground">{successLabel}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {formatLatency(worker)}
        </span>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 text-xs font-medium text-foreground transition hover:bg-card-elevated focus:outline-none focus:ring-2 focus:ring-primary/40"
          onClick={() => onCopy(worker.id)}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy ID"}
        </button>
      </div>
    </article>
  );
}

function scoreWorker(worker: MarketplaceWorker): number {
  const rating = worker.rating ?? 3.5;
  const success = worker.successRate ?? 70;
  const jobs = Math.min(worker.completedJobs, 400) / 8;
  const pricePenalty = worker.basePriceSats / (worker.type === "human" ? 24 : 8);
  const newBoost = worker.status === "new" ? 6 : 0;
  return rating * 18 + success * 0.55 + jobs - pricePenalty + newBoost;
}

function getMedianPrice(workers: MarketplaceWorker[]): number {
  if (workers.length === 0) {
    return 0;
  }

  const prices = workers.map((worker) => worker.basePriceSats).sort((left, right) => left - right);
  const midpoint = Math.floor(prices.length / 2);
  if (prices.length % 2 === 0) {
    return Math.round((prices[midpoint - 1] + prices[midpoint]) / 2);
  }

  return prices[midpoint];
}

function formatLatency(worker: MarketplaceWorker): string {
  if (worker.type === "human") {
    return "manual";
  }

  if (worker.latencyMs === null) {
    return "pending";
  }

  return `${(worker.latencyMs / 1000).toFixed(1)}s p95`;
}
