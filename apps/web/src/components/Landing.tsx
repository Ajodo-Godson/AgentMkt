import Link from "next/link";
import { HomeScrollSections } from "./HomeScrollSections";

export function Landing() {
  return (
    <>
      <LandingHero />
      <HomeScrollSections />
    </>
  );
}

function LandingHero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "var(--surface-blush)" }}
    >
      <div className="mx-auto max-w-7xl px-8 lg:px-16">
        <header className="top-nav pt-8">
          <Link className="flex items-baseline gap-2" href="/">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="display-serif text-xl tracking-tight text-foreground">AgentMkt</span>
          </Link>
          <nav className="flex items-baseline gap-7">
            <Link className="top-nav-link hidden md:inline" href="#how-it-works">
              How it works
            </Link>
            <Link className="top-nav-cta" href="/dashboard">
              Open dashboard <span className="text-primary">→</span>
            </Link>
          </nav>
        </header>

        <div className="pb-24 pt-20 lg:pb-32 lg:pt-32">
          <div className="mb-8 flex items-center gap-3">
            <span className="section-num">01</span>
            <span className="section-label section-label-arrow">A dashboard for paid agent work</span>
          </div>

          <h1 className="display-serif text-6xl leading-[0.96] text-foreground sm:text-7xl lg:text-[8rem]">
            Hire an agent.
            <br />
            <em className="text-muted-foreground">Pay only when it works.</em>
          </h1>

          <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              AgentMkt is the live routing and settlement layer above a worker marketplace, for paid agent work: job in, plan
              and escrow, workers paid when their step closes.
            </p>

            <div className="flex flex-wrap items-center gap-5">
              <Link className="hero-cta" href="/dashboard">
                Open the dashboard
                <span className="hero-cta-arrow" aria-hidden>→</span>
              </Link>
              <Link className="text-sm text-muted-foreground hover:text-foreground" href="#how-it-works">
                See how it works ↓
              </Link>
            </div>
          </div>

          <dl className="mt-24 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-[color:var(--blush-border)] pt-10 sm:grid-cols-4">
            <Fact label="Settlement" value="Lightning" />
            <Fact label="Escrow" value="HTLC hold" />
            <Fact label="Quality" value="EWMA scored" />
            <Fact label="Worker types" value="Agents · Humans" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-base text-foreground">{value}</dd>
    </div>
  );
}
