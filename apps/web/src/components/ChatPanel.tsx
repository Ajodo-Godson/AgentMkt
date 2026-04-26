"use client";

import { ArrowUpRight, SendHorizontal, Sparkles } from "lucide-react";
import { DEFAULT_PROMPT, routePreferenceLabels } from "@/lib/demo-data";
import type { JobSnapshot, RoutePreference } from "@/lib/types";

interface ChatPanelProps {
  prompt: string;
  routePreference: RoutePreference;
  snapshot: JobSnapshot | null;
  isLaunching: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onRoutePreferenceChange: (value: RoutePreference) => void;
  onLaunch: () => void;
}

const routePreferences = Object.entries(routePreferenceLabels) as Array<[RoutePreference, (typeof routePreferenceLabels)[RoutePreference]]>;

export function ChatPanel({
  prompt,
  routePreference,
  snapshot,
  isLaunching,
  error,
  onPromptChange,
  onRoutePreferenceChange,
  onLaunch
}: ChatPanelProps) {
  const completed = snapshot?.job.status === "completed";

  return (
    <section className="panel-strong request-panel p-4">
      <div className="mb-4">
        <p className="section-label">Request</p>
        <h2 className="text-lg font-semibold">What should AgentMkt do?</h2>
      </div>

      <label className="mb-2 block text-sm text-muted-foreground" htmlFor="prompt">
        Work request
      </label>
      <textarea
        id="prompt"
        className="min-h-40 w-full resize-none rounded-md border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={DEFAULT_PROMPT}
      />

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Route preference</p>
          <p className="text-xs text-muted-foreground">{routePreferenceLabels[routePreference].detail}</p>
        </div>
        <div className="segmented-control">
          {routePreferences.map(([value, config]) => (
            <button
              className={routePreference === value ? "is-selected" : ""}
              key={value}
              onClick={() => onRoutePreferenceChange(value)}
              type="button"
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        disabled={isLaunching || prompt.trim().length === 0}
        onClick={onLaunch}
        type="button"
      >
        <SendHorizontal className="h-4 w-4" />
        {isLaunching ? "Routing request" : "Start routing"}
      </button>

      {error ? <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}

      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Result
        </div>
        {completed ? (
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>
              Summary, French translation, and native voiceover completed. Verification passed and funds were settled through the
              selected route.
            </p>
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href="#trace">
              View execution log
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Results appear here after verification. The route panel will show selected workers, alternatives, and payment state while
            the job runs.
          </p>
        )}
      </div>
    </section>
  );
}
