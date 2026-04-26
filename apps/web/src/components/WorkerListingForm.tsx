"use client";

import { ArrowLeft, Bot, CheckCircle2, LinkIcon, PlusCircle, RadioTower, Send, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { getCapabilityLabel, saveUserWorker, workerCapabilityOptions } from "@/lib/workers";
import type { CapabilityTag, MarketplaceWorker } from "@/lib/types";

type WorkerType = "agent" | "human";

interface ListingFormState {
  displayName: string;
  ownerName: string;
  type: WorkerType;
  capability: CapabilityTag;
  basePriceSats: string;
  contact: string;
  description: string;
}

const initialState: ListingFormState = {
  displayName: "",
  ownerName: "user_demo_supplier",
  type: "agent",
  capability: "summarization",
  basePriceSats: "250",
  contact: "",
  description: ""
};

export function WorkerListingForm() {
  const [form, setForm] = useState<ListingFormState>(initialState);
  const [published, setPublished] = useState<MarketplaceWorker | null>(null);
  const [error, setError] = useState<string | null>(null);

  const price = Number.parseInt(form.basePriceSats, 10);
  const previewWorker = useMemo<MarketplaceWorker>(
    () => ({
      id: "worker_user_preview",
      displayName: form.displayName.trim() || "Unnamed worker",
      type: form.type,
      capabilities: [form.capability],
      basePriceSats: Number.isFinite(price) ? price : 0,
      rating: null,
      successRate: null,
      completedJobs: 0,
      latencyMs: form.type === "agent" ? 1000 : null,
      source: "user",
      status: "new",
      description: form.description.trim() || "Describe the work this supplier can complete.",
      contact: form.contact.trim() || (form.type === "agent" ? "https://example.com/mcp" : "telegram:@handle"),
      listedAt: new Date().toISOString(),
      reason: "Self-service listing."
    }),
    [form.capability, form.contact, form.description, form.displayName, form.type, price]
  );

  const updateForm = <Key extends keyof ListingFormState>(key: Key, value: ListingFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submitListing = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = form.displayName.trim();
    const trimmedOwner = form.ownerName.trim();
    const trimmedContact = form.contact.trim();
    const trimmedDescription = form.description.trim();

    if (!trimmedName || !trimmedOwner || !trimmedContact || !trimmedDescription) {
      setError("Complete the worker name, owner, contact, and description.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setError("Base price must be a positive number of sats.");
      return;
    }

    if (form.type === "agent" && !isProbablyUrl(trimmedContact)) {
      setError("Agent workers need an endpoint URL.");
      return;
    }

    if (form.type === "human" && !trimmedContact.startsWith("telegram:")) {
      setError("Human workers need a telegram: contact handle.");
      return;
    }

    const worker: MarketplaceWorker = {
      ...previewWorker,
      id: `worker_user_${Date.now()}`,
      displayName: trimmedName,
      basePriceSats: price,
      description: trimmedDescription,
      contact: trimmedContact,
      listedAt: new Date().toISOString(),
      reason: `Listed by ${trimmedOwner}.`
    };

    saveUserWorker(worker);
    setPublished(worker);
    setForm(initialState);
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
              <span className="section-label">Supplier intake</span>
            </div>
            <h1 className="text-2xl font-semibold">List a worker</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Publish an agent endpoint or human supplier into the marketplace directory for demo routing.
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
                <p className="text-sm font-semibold">{published.displayName} is listed</p>
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
                <p className="text-sm text-muted-foreground">New listings appear in the marketplace on this machine.</p>
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
                  onChange={(event) => updateForm("ownerName", event.target.value)}
                  value={form.ownerName}
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
              <Field label="Primary capability">
                <select
                  className="form-control"
                  onChange={(event) => updateForm("capability", event.target.value as CapabilityTag)}
                  value={form.capability}
                >
                  {workerCapabilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
              <Field label={form.type === "agent" ? "Endpoint URL" : "Telegram contact"}>
                <input
                  className="form-control"
                  onChange={(event) => updateForm("contact", event.target.value)}
                  placeholder={form.type === "agent" ? "https://supplier.example/mcp" : "telegram:@operator"}
                  value={form.contact}
                />
              </Field>
              <Field className="md:col-span-2" label="Listing description">
                <textarea
                  className="form-control min-h-28 resize-y leading-6"
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Summarizes research notes and returns verifier-ready bullet points."
                  value={form.description}
                />
              </Field>
            </div>

            {error ? <p className="mt-4 rounded-md border border-danger/45 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-5">
              <Link className="text-sm text-muted-foreground transition hover:text-foreground" href="/workers">
                Cancel
              </Link>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50"
                type="submit"
              >
                <Send className="h-4 w-4" />
                Publish listing
              </button>
            </div>
          </form>

          <aside className="panel p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                <RadioTower className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Preview</h2>
                <p className="text-sm text-muted-foreground">Marketplace row</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  {previewWorker.type === "agent" ? <Bot className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
                  <p className="text-sm font-semibold">{previewWorker.displayName}</p>
                  <span className="rounded-md border border-primary/35 bg-primary/10 px-2 py-0.5 text-xs text-primary">New</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{previewWorker.description}</p>
              </div>

              <div className="grid gap-3 text-sm">
                <PreviewLine icon={ShieldCheck} label="Capability" value={getCapabilityLabel(previewWorker.capabilities[0])} />
                <PreviewLine icon={PlusCircle} label="Base price" value={`${previewWorker.basePriceSats || 0} sats`} />
                <PreviewLine icon={LinkIcon} label="Contact" value={previewWorker.contact} />
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
        <p className="truncate text-sm text-foreground">{value}</p>
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
