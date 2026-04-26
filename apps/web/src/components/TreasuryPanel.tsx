import { BadgeCheck, Landmark, LockKeyhole, RotateCcw, ShieldAlert, TrendingDown, WalletCards } from "lucide-react";
import { DEMO_WALLET_AVAILABLE_SATS, PREMIUM_ROUTE_COST_SATS, STANDARD_ROUTE_ESTIMATE_SATS } from "@/lib/demo-data";
import type { JobSnapshot } from "@/lib/types";

export function TreasuryPanel({ snapshot }: { snapshot: JobSnapshot | null }) {
  const job = snapshot?.job;
  const estimate = snapshot?.plan?.total_estimate_sats ?? (snapshot ? STANDARD_ROUTE_ESTIMATE_SATS : 0);
  const reserved = job?.locked_sats ?? 0;
  const settled = job?.spent_sats ?? 0;
  const savings = estimate > 0 ? Math.max(0, PREMIUM_ROUTE_COST_SATS - estimate) : 0;
  const refundable = Math.max(0, DEMO_WALLET_AVAILABLE_SATS - reserved - settled);
  const walletUsed = Math.min(100, ((reserved + settled) / DEMO_WALLET_AVAILABLE_SATS) * 100);
  const approval = getApprovalState(snapshot);

  return (
    <section className="panel-strong wallet-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="section-label">Wallet</p>
          <h2 className="text-lg font-semibold">Payment state</h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
          <Landmark className="h-4 w-4 text-primary" />
        </div>
      </div>

      <div className="rounded-md border border-border-subtle bg-background p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Available wallet balance</span>
          <span className="mono">sats</span>
        </div>
        <p className="mono text-2xl font-semibold">{DEMO_WALLET_AVAILABLE_SATS}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${walletUsed}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <WalletMetric icon={WalletCards} label="Route estimate" value={estimate} />
        <WalletMetric icon={LockKeyhole} label="Reserved" value={reserved} />
        <WalletMetric icon={BadgeCheck} label="Settled" tone="text-success" value={settled} />
        <WalletMetric icon={TrendingDown} label="Savings" tone="text-info" value={savings} />
        <WalletMetric icon={RotateCcw} label="Refundable" value={refundable} />
        <WalletMetric icon={ShieldAlert} label="Risk" suffix="/100" tone={approval.scoreTone} value={approval.score} />
      </div>

      <div className={`mt-3 rounded-md border p-3 ${approval.boxTone}`}>
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4" />
          {approval.title}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{approval.detail}</p>
      </div>
    </section>
  );
}

function WalletMetric({
  icon: Icon,
  label,
  value,
  suffix = " sats",
  tone = "text-foreground"
}: {
  icon: typeof WalletCards;
  label: string;
  value: number;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mono text-base font-medium ${tone}`}>
        {value}
        {suffix}
      </p>
    </div>
  );
}

function getApprovalState(snapshot: JobSnapshot | null) {
  if (!snapshot) {
    return {
      title: "No approval needed",
      detail: "The CFO monitors wallet capacity and route risk. It asks for approval only when the route needs it.",
      score: 8,
      scoreTone: "text-success",
      boxTone: "border-success/25 bg-success/5"
    };
  }

  if (snapshot.job.status === "awaiting_user") {
    return {
      title: "Approval required",
      detail: "This route includes a human worker. Confirm before AgentMkt reserves funds for the human step.",
      score: 42,
      scoreTone: "text-warning",
      boxTone: "border-warning/35 bg-warning/10"
    };
  }

  if (snapshot.job.status === "completed") {
    return {
      title: "Route settled",
      detail: "Verification passed. The route settled below the premium alternative while preserving the human-quality step.",
      score: 4,
      scoreTone: "text-success",
      boxTone: "border-success/25 bg-success/5"
    };
  }

  return {
    title: "Monitoring route",
    detail: "AgentMkt is checking cost, quality, and wallet capacity as the route executes.",
    score: 18,
    scoreTone: "text-info",
    boxTone: "border-info/30 bg-info/10"
  };
}
