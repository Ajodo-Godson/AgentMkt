import { ArrowLeft, RadioTower } from "lucide-react";
import Link from "next/link";

export default function WorkersPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-5xl">
        <Link className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/">
          <ArrowLeft className="h-4 w-4" />
          Mission control
        </Link>
        <section className="panel-strong p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <RadioTower className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Worker marketplace</h1>
              <p className="text-sm text-muted-foreground">Deferred until P1 exposes orchestrator-backed marketplace routes.</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            The browser must not call marketplace directly. This page is intentionally held behind the orchestrator boundary so auth,
            reputation, and discovery can be added in one place later.
          </p>
        </section>
      </div>
    </main>
  );
}
