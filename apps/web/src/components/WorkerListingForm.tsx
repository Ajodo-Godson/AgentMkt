"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { listWorker } from "@/lib/marketplace";
import { getCapabilityLabel, workerCapabilityOptions } from "@/lib/workers";
import type { CapabilityTag, ListWorkerRequest, Worker } from "@/lib/types";

type WorkerType = "agent" | "human";

interface ListingFormState {
  displayName: string;
  ownerUserId: string;
  type: WorkerType;
  capabilities: CapabilityTag[];
  basePriceSats: string;
  stakeSats: string;
  endpointUrl: string;
  telegramChatId: string;
}

const initialState: ListingFormState = {
  displayName: "",
  ownerUserId: "user_demo_supplier_owner",
  type: "agent",
  capabilities: ["summarization"],
  basePriceSats: "250",
  stakeSats: "0",
  endpointUrl: "",
  telegramChatId: ""
};

export function WorkerListingForm() {
  const [form, setForm] = useState<ListingFormState>(initialState);
  const [published, setPublished] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const basePrice = Number.parseInt(form.basePriceSats, 10);
  const stake = Number.parseInt(form.stakeSats, 10);
  const preview = useMemo(
    () => ({
      displayName: form.displayName.trim() || "Unnamed worker",
      type: form.type,
      capabilities: form.capabilities,
      basePrice: Number.isFinite(basePrice) ? basePrice : 0,
      contact: form.type === "agent" ? form.endpointUrl.trim() || "https://supplier.example/service" : form.telegramChatId.trim() || "000000000"
    }),
    [basePrice, form.capabilities, form.displayName, form.endpointUrl, form.telegramChatId, form.type]
  );

  const updateForm = <Key extends keyof ListingFormState>(key: Key, value: ListingFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const toggleCapability = (capability: CapabilityTag) => {
    setForm((current) => {
      const exists = current.capabilities.includes(capability);
      const capabilities = exists
        ? current.capabilities.filter((candidate) => candidate !== capability)
        : [...current.capabilities, capability];
      return { ...current, capabilities };
    });
    setError(null);
  };

  const submitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = form.displayName.trim();
    const trimmedOwner = form.ownerUserId.trim();
    const endpointUrl = form.endpointUrl.trim();
    const telegramChatId = form.telegramChatId.trim();

    if (!trimmedName || !trimmedOwner) {
      setError("Worker name and owner user ID are required.");
      return;
    }

    if (form.capabilities.length === 0) {
      setError("Select at least one capability.");
      return;
    }

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setError("Base price must be a positive number of sats.");
      return;
    }

    if (!Number.isFinite(stake) || stake < 0) {
      setError("Stake must be zero or a positive number of sats.");
      return;
    }

    if (form.type === "agent" && !isProbablyUrl(endpointUrl)) {
      setError("Agent workers need a valid endpoint URL.");
      return;
    }

    if (form.type === "human" && !telegramChatId) {
      setError("Human workers need a Telegram chat ID.");
      return;
    }

    const payload: ListWorkerRequest =
      form.type === "agent"
        ? {
            type: "agent",
            endpoint_url: endpointUrl,
            owner_user_id: trimmedOwner,
            display_name: trimmedName,
            capability_tags: form.capabilities,
            base_price_sats: basePrice,
            stake_sats: stake
          }
        : {
            type: "human",
            telegram_chat_id: telegramChatId,
            owner_user_id: trimmedOwner,
            display_name: trimmedName,
            capability_tags: form.capabilities,
            base_price_sats: basePrice,
            stake_sats: stake
          };

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await listWorker(payload);
      setPublished(response.worker);
      setForm(initialState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Marketplace rejected the worker listing.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-8 py-12 lg:px-16 lg:py-20">
        <Link className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <header className="mb-16 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-6 flex items-center gap-3">
              <span className="section-num">03</span>
              <span className="section-label">List worker</span>
            </div>
            <h1 className="display-serif text-5xl text-foreground sm:text-6xl lg:text-7xl">
              Register an <em className="text-muted-foreground">agent or human.</em>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              Workers are paid only when their step settles. Pricing, capabilities, and contact channel are visible to the orchestrator immediately.
            </p>
          </div>
          <Link
            className="text-sm text-muted-foreground hover:text-foreground"
            href="/workers"
          >
            View marketplace <span className="text-primary">→</span>
          </Link>
        </header>

        {published ? (
          <section className="mb-10 border-y border-border-subtle py-4">
            <p className="text-sm">
              <span className="text-success">●</span>{" "}
              <span className="font-medium">{published.display_name}</span> is active.{" "}
              <span className="mono text-xs text-muted-foreground">{published.id}</span>{" "}
              <Link className="editorial-link ml-2 text-xs" href="/workers">
                View →
              </Link>
            </p>
          </section>
        ) : null}

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form className="border-t border-border pt-8" onSubmit={submitListing}>
            <p className="section-label mb-5">Worker details</p>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Worker name">
                <input
                  className="form-control"
                  onChange={(event) => updateForm("displayName", event.target.value)}
                  placeholder="Northstar Briefing Agent"
                  value={form.displayName}
                />
              </Field>
              <Field label="Owner user ID">
                <input
                  className="form-control mono"
                  onChange={(event) => updateForm("ownerUserId", event.target.value)}
                  value={form.ownerUserId}
                />
              </Field>
              <Field label="Worker type">
                <div className="segmented-control segmented-control-two">
                  <button
                    className={form.type === "agent" ? "is-selected" : ""}
                    onClick={() => updateForm("type", "agent")}
                    type="button"
                  >
                    Agent
                  </button>
                  <button
                    className={form.type === "human" ? "is-selected" : ""}
                    onClick={() => updateForm("type", "human")}
                    type="button"
                  >
                    Human
                  </button>
                </div>
              </Field>
              <Field label="Base price">
                <div className="relative">
                  <input
                    className="form-control mono pr-14"
                    min={1}
                    onChange={(event) => updateForm("basePriceSats", event.target.value)}
                    type="number"
                    value={form.basePriceSats}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    sats
                  </span>
                </div>
              </Field>
              <Field label="Stake">
                <div className="relative">
                  <input
                    className="form-control mono pr-14"
                    min={0}
                    onChange={(event) => updateForm("stakeSats", event.target.value)}
                    type="number"
                    value={form.stakeSats}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    sats
                  </span>
                </div>
              </Field>
              <Field label={form.type === "agent" ? "Endpoint URL" : "Telegram chat ID"}>
                <input
                  className="form-control"
                  onChange={(event) => updateForm(form.type === "agent" ? "endpointUrl" : "telegramChatId", event.target.value)}
                  placeholder={form.type === "agent" ? "https://supplier.example/service" : "000000000"}
                  value={form.type === "agent" ? form.endpointUrl : form.telegramChatId}
                />
              </Field>
              <Field className="md:col-span-2" label="Capabilities">
                <div className="grid gap-2 sm:grid-cols-2">
                  {workerCapabilityOptions.map((option) => {
                    const checked = form.capabilities.includes(option.value);
                    return (
                      <label
                        className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm transition ${
                          checked ? "border-primary/35 bg-primary/10 text-foreground" : "border-border-subtle bg-card text-muted-foreground"
                        }`}
                        key={option.value}
                      >
                        <input checked={checked} onChange={() => toggleCapability(option.value)} type="checkbox" />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </Field>
            </div>

            {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}

            <div className="mt-10 flex flex-wrap items-center justify-end gap-6 border-t border-border-subtle pt-6">
              <Link className="text-sm text-muted-foreground transition hover:text-foreground" href="/workers">
                Cancel
              </Link>
              <button
                className="text-sm font-medium text-foreground hover:text-primary disabled:opacity-50"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Publishing…" : "Publish listing"} <span className="text-primary">→</span>
              </button>
            </div>
          </form>

          <aside className="border-t border-border pt-8">
            <p className="section-label mb-4">Preview</p>

            <p className="display-serif mb-1 text-2xl text-foreground">{preview.displayName}</p>
            <p className="mb-6 text-xs uppercase tracking-wide text-muted-foreground">{preview.type}</p>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Capabilities</dt>
                <dd className="mt-1">{preview.capabilities.map(getCapabilityLabel).join(", ") || "None"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Base price</dt>
                <dd className="mono mt-1">{preview.basePrice || 0} sats</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="mt-1 truncate">{preview.contact || "None"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({
  children,
  className = "",
  label
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function isProbablyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
