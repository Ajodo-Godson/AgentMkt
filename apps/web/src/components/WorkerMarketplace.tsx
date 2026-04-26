"use client";

import { ArrowLeft, Copy, Search } from "lucide-react";
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-8 py-12 lg:px-16 lg:py-20">
        <Link className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <header className="mb-16 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-6 flex items-center gap-3">
              <span className="section-num">02</span>
              <span className="section-label">Marketplace</span>
            </div>
            <h1 className="display-serif text-5xl text-foreground sm:text-6xl lg:text-7xl">
              Workers, <em className="text-muted-foreground">priced by quality.</em>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              {workers.length} {workers.length === 1 ? "worker" : "workers"} listed{medianPrice !== null ? `, median price ${medianPrice} sats` : ""}{agentCount ? `. ${agentCount} agents` : ""}{humanCount ? `, ${humanCount} human` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={loadWorkers}
              type="button"
            >
              Refresh
            </button>
            <Link
              className="text-sm font-medium text-foreground hover:text-primary"
              href="/workers/new"
            >
              List worker <span className="text-primary">→</span>
            </Link>
          </div>
        </header>

        <section className="border-t border-border">
          <div className="grid gap-4 border-b border-border-subtle py-4 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-9 w-full border-0 bg-transparent pl-6 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
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

          <div className="hidden grid-cols-[minmax(260px,1.45fr)_minmax(220px,1fr)_110px_120px_124px] gap-4 border-b border-border-subtle py-3 text-xs uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Worker</span>
            <span>Capability</span>
            <span>Price</span>
            <span>Quality</span>
            <span className="text-right">Action</span>
          </div>

          <div className={isLoading ? "scan-line" : ""}>
            {error ? (
              <div className="py-10">
                <p className="display-serif text-3xl text-danger"><em>Marketplace unavailable.</em></p>
                <p className="mt-3 text-sm text-muted-foreground">{error}</p>
              </div>
            ) : filteredWorkers.length > 0 ? (
              filteredWorkers.map((worker) => (
                <WorkerRow copied={copiedId === worker.worker_id} key={worker.worker_id} onCopy={copyWorkerId} worker={worker} />
              ))
            ) : (
              <div className="py-10 text-sm text-muted-foreground">
                {isLoading ? "Loading marketplace workers." : "No workers match the current filters."}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
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
        className="h-9 w-full border-0 border-b border-border bg-transparent px-0 text-sm text-foreground outline-none focus:border-primary"
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
  return (
    <article className="grid gap-4 border-b border-border-subtle py-5 last:border-b-0 lg:grid-cols-[minmax(260px,1.45fr)_minmax(220px,1fr)_110px_120px_124px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="display-serif truncate text-2xl text-foreground">{worker.display_name}</h2>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{worker.type}</span>
        </div>
        <p className="mono mt-1 truncate text-xs text-muted-foreground">{worker.worker_id}</p>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {worker.capability_tags.map((item, index) => (
          <span key={item}>
            {getCapabilityLabel(item)}{index < worker.capability_tags.length - 1 ? " ·" : ""}
          </span>
        ))}
      </div>

      <p className="mono text-sm">{worker.base_price_sats} sats</p>

      <div className="text-sm">
        <span className="mono">{worker.ewma.toFixed(1)}</span>
        <span className="ml-3 text-xs text-muted-foreground">{worker.total_jobs} jobs</span>
      </div>

      <div className="flex items-center lg:justify-end">
        <button
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onCopy(worker.worker_id)}
          type="button"
        >
          <Copy className="h-3 w-3" />
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
