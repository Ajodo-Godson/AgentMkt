"use client";

import { ArrowUpRight, SendHorizontal, Sparkles } from "lucide-react";
import { DEFAULT_PROMPT } from "@/lib/workers";
import type { JobSnapshot } from "@/lib/types";

interface ChatPanelProps {
  prompt: string;
  snapshot: JobSnapshot | null;
  isLaunching: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onLaunch: () => void;
}

export function ChatPanel({ prompt, snapshot, isLaunching, error, onPromptChange, onLaunch }: ChatPanelProps) {
  const completed = snapshot?.job.status === "completed";
  const failed = snapshot?.job.status === "failed";
  const result = snapshot?.final_output?.trim();

  return (
    <section className="panel-strong request-panel p-4">
      <div className="mb-4">
        <p className="section-label">Request</p>
        <h2 className="text-lg font-semibold">Work order</h2>
      </div>

      <label className="mb-2 block text-sm text-muted-foreground" htmlFor="prompt">
        Request
      </label>
      <textarea
        id="prompt"
        className="min-h-40 w-full resize-none rounded-md border border-border-subtle bg-card px-3 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={DEFAULT_PROMPT}
      />

      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        disabled={isLaunching || prompt.trim().length === 0}
        onClick={onLaunch}
        type="button"
      >
        <SendHorizontal className="h-4 w-4" />
        {isLaunching ? "Funding route" : "Fund and start route"}
      </button>

      {error ? <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}

      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Output
        </div>
        {completed && result ? (
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p className="whitespace-pre-wrap">{result}</p>
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href="#trace">
              View orchestration state
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : failed ? (
          <p className="text-sm leading-6 text-danger">{snapshot?.debug?.error ?? "The orchestrator marked this job as failed."}</p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Output appears here after topup, execution, and verification.
          </p>
        )}
      </div>
    </section>
  );
}
