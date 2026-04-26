import { ArrowLeft, PlusCircle } from "lucide-react";
import Link from "next/link";

export default function NewWorkerPage() {
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
              <PlusCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">List a worker</h1>
              <p className="text-sm text-muted-foreground">Pending orchestrator-approved listing flow.</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            The hackathon demo uses seeded suppliers and human workers. Self-service listing is a cut-list item and should not bypass
            the orchestrator boundary from the browser.
          </p>
        </section>
      </div>
    </main>
  );
}
