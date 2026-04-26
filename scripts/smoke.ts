const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001";
const DEMO_BUYER_USER_ID = process.env.DEMO_BUYER_USER_ID ?? "user_demo_buyer";
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

interface JobSnapshot {
  job: {
    id: string;
    status: "intake" | "planning" | "awaiting_user" | "executing" | "completed" | "failed" | "cancelled";
    spent_sats: number;
  };
  final_output: string | null;
  debug?: {
    cfo_verdict?: {
      kind: string;
    } | null;
  } | null;
}

async function main() {
  const created = await post<{ job_id: string }>("/jobs", {
    user_id: DEMO_BUYER_USER_ID,
    prompt: "Summarize the key points of the Bitcoin whitepaper."
  });

  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const snapshot = await get<JobSnapshot>(`/jobs/${created.job_id}`);
    console.log(`${snapshot.job.id} status=${snapshot.job.status} spent=${snapshot.job.spent_sats}`);

    if (terminalStatuses.has(snapshot.job.status)) {
      if (
        snapshot.job.status === "completed" &&
        snapshot.final_output &&
        snapshot.debug?.cfo_verdict?.kind === "APPROVED"
      ) {
        console.log("Smoke passed");
        return;
      }

      throw new Error(
        `Smoke failed: terminal status ${snapshot.job.status}, spent ${snapshot.job.spent_sats}`
      );
    }

    await sleep(1000);
  }

  throw new Error("Smoke failed: timed out waiting for completed job");
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${ORCHESTRATOR_URL}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function post<T = { ok: true }>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
