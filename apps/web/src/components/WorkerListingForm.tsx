"use client";

import { ArrowLeft, Bot, CheckCircle2, LinkIcon, PlusCircle, RadioTower, Send, ShieldCheck, Users } from "lucide-react";
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
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/">
          <ArrowLeft className="h-4 w-4" />
          Mission control
        </Link>

        <header className="mb-6 flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
              <span className="section-label">Marketplace registration</span>
            </div>
            <h1 className="text-2xl font-semibold">List a worker</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Register an agent endpoint or human Telegram worker through the marketplace service.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 text-sm font-medium text-foreground transition hover:bg-card-elevated focus:outline-none focus:ring-2 focus:ring-primary/40"
            href="/workers"
          >
            <Users className="h-4 w-4" />
            View marketplace
          </Link>
        </header>

        {published ? (
          <section className="mb-5 flex flex-col gap-3 rounded-md border border-success/45 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-semibold">{published.display_name} is active</p>
                <p className="mono mt-1 text-xs text-muted-foreground">{published.id}</p>
              </div>
            </div>
            <Link className="text-sm font-medium text-success transition hover:text-foreground" href="/workers">
              Open marketplace
            </Link>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form className="panel-strong p-5" onSubmit={submitListing}>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                <PlusCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Worker details</h2>
                <p className="text-sm text-muted-foreground">The marketplace will validate endpoint or Telegram reachability.</p>
              </div>
            </div>

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
                          checked ? "border-primary/45 bg-primary/10 text-foreground" : "border-border-subtle bg-background text-muted-foreground"
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

            {error ? <p className="mt-4 rounded-md border border-danger/45 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-5">
              <Link className="text-sm text-muted-foreground transition hover:text-foreground" href="/workers">
                Cancel
              </Link>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? "Publishing" : "Publish listing"}
              </button>
            </div>
          </form>

          <aside className="panel p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                <RadioTower className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Payload preview</h2>
                <p className="text-sm text-muted-foreground">Marketplace contract</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  {preview.type === "agent" ? <Bot className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
                  <p className="text-sm font-semibold">{preview.displayName}</p>
                </div>
                <p className="mono text-xs leading-5 text-muted-foreground">
                  type={preview.type} price={preview.basePrice} sats
                </p>
              </div>

              <div className="grid gap-3 text-sm">
                <PreviewLine icon={ShieldCheck} label="Capabilities" value={preview.capabilities.map(getCapabilityLabel).join(", ")} />
                <PreviewLine icon={PlusCircle} label="Base price" value={`${preview.basePrice || 0} sats`} />
                <PreviewLine icon={LinkIcon} label="Contact" value={preview.contact} />
              </div>
            </div>
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

function PreviewLine({
  icon: Icon,
  label,
  value
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md border border-border-subtle bg-background p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-foreground">{value || "None"}</p>
      </div>
    </div>
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
