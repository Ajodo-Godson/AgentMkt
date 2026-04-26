import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, XCircle } from "lucide-react";
import type { JobStatus, Step } from "@/lib/types";

type StatusKind = JobStatus | Step["status"];

const statusConfig: Record<string, { label: string; tone: string; icon: typeof CircleDashed }> = {
  intake: { label: "Intake", tone: "border-info/35 text-info", icon: CircleDashed },
  planning: { label: "Planning", tone: "border-primary/45 text-primary", icon: Loader2 },
  awaiting_user: { label: "Approval", tone: "border-warning/45 text-warning", icon: AlertTriangle },
  executing: { label: "Executing", tone: "border-info/35 text-info", icon: Loader2 },
  completed: { label: "Ready", tone: "border-success/40 text-success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "border-danger/45 text-danger", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "border-muted-foreground/35 text-muted-foreground", icon: XCircle },
  pending: { label: "Pending", tone: "border-muted-foreground/25 text-muted-foreground", icon: Clock },
  running: { label: "Running", tone: "border-primary/45 text-primary", icon: Loader2 },
  succeeded: { label: "Passed", tone: "border-success/40 text-success", icon: CheckCircle2 },
  skipped: { label: "Skipped", tone: "border-muted-foreground/35 text-muted-foreground", icon: CircleDashed }
};

export function StatusBadge({ status }: { status: StatusKind }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  const Icon = config.icon;
  const spins = status === "planning" || status === "executing" || status === "running";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${config.tone}`}>
      <Icon className={`h-3.5 w-3.5 ${spins ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}
