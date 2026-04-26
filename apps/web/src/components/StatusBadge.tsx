import type { JobStatus, Step } from "@/lib/types";

type StatusKind = JobStatus | Step["status"];

const statusConfig: Record<string, { label: string; dot: string }> = {
  intake: { label: "Intake", dot: "bg-info" },
  awaiting_funds: { label: "Awaiting funds", dot: "bg-warning" },
  planning: { label: "Planning", dot: "bg-primary" },
  awaiting_user: { label: "Approval", dot: "bg-warning" },
  executing: { label: "Executing", dot: "bg-info" },
  completed: { label: "Ready", dot: "bg-success" },
  failed: { label: "Failed", dot: "bg-danger" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground" },
  pending: { label: "Pending", dot: "bg-muted-foreground" },
  running: { label: "Running", dot: "bg-primary" },
  succeeded: { label: "Passed", dot: "bg-success" },
  skipped: { label: "Skipped", dot: "bg-muted-foreground" }
};

export function StatusBadge({ status }: { status: StatusKind }) {
  const config = statusConfig[status] ?? statusConfig.pending;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
