"use client";

import { ArrowUpRight } from "lucide-react";
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
  const charCount = prompt.trim().length;

  return (
    <section>
      <div className="prompt-card">
        <textarea
          id="prompt"
          rows={5}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={DEFAULT_PROMPT}
        />
        <div className="prompt-card-footer">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {charCount > 0 ? `${charCount} chars · escrow on start` : "Escrow holds sats until the route settles"}
          </span>
          <button
            className="prompt-pill"
            disabled={isLaunching || charCount === 0}
            onClick={onLaunch}
            type="button"
          >
            {isLaunching ? "Funding route…" : "Fund and start route"}
            <span className="prompt-pill-arrow" aria-hidden>→</span>
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <div className="mt-12 border-t border-[color:var(--blush-border)] pt-6">
        <p className="section-label mb-3">Output</p>
        {completed && result ? (
          <div className="text-base leading-7 text-foreground">
            <p className="whitespace-pre-wrap">{result}</p>
            <a className="editorial-link mt-4 inline-flex items-center gap-1 text-xs" href="#trace">
              View trace
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        ) : failed ? (
          <p className="text-sm text-danger">{snapshot?.debug?.error ?? "Job failed."}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Output appears after topup, execution, and verification.
          </p>
        )}
      </div>
    </section>
  );
}
