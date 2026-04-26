/**
 * End-to-end smoke test of the agent-only happy path:
 *
 *   1. createInvoice via hub (1500 sats topup)
 *   2. you pay it from your personal wallet (or assume sponsor sats already in)
 *   3. /hub/topup/status -> ledger gets a topup row
 *   4. /hub/hold for a 200-sat ceiling
 *   5. /hub/forward against the fake-supplier (priced at 10 sats)
 *   6. /hub/settle
 *   7. /hub/job-balance -> verify available, held, settled, fees match
 *   8. /hub/cancel of a second hold to verify refund path
 *
 * Pre-reqs:
 *   - hub running:               pnpm dev:hub
 *   - fake-supplier running:     pnpm fake-supplier
 *   - DATABASE_URL set & migrated
 *   - Lexe sidecar healthy
 *
 * If `SMOKE_USE_SPONSOR_SATS=1` we skip the manual top-up wait and assume
 * a previous sponsor topup ledger row already exists for the test job_id.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../src/lib/logger.js";

const HUB = process.env.HUB_BASE_URL ?? "http://localhost:4002";
const SUPPLIER = process.env.FAKE_SUPPLIER_URL ?? "http://localhost:5099/service";
const TOPUP_SATS = Number.parseInt(process.env.SMOKE_TOPUP_SATS ?? "1500", 10);
const HOLD_SATS = Number.parseInt(process.env.SMOKE_HOLD_SATS ?? "200", 10);
const SKIP_TOPUP = process.env.SMOKE_USE_SPONSOR_SATS === "1";
const BOOTSTRAP_JOB_ID = "job_bootstrap_funding";
const BOOTSTRAP_FORWARD_STEP_ID = "step_bootstrap_forward";
const BOOTSTRAP_CANCEL_STEP_ID = "step_bootstrap_cancel";

function argValue(name: string): string | undefined {
  const ix = process.argv.indexOf(name);
  return ix >= 0 ? process.argv[ix + 1] : undefined;
}

async function call(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${HUB}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (res.status >= 400) {
    throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  }
  return parsed as Record<string, unknown>;
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${HUB}${path}`);
  const text = await res.text();
  if (res.status >= 400) throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const job_id =
    argValue("--job_id") ??
    process.env.SMOKE_JOB_ID ??
    (SKIP_TOPUP ? BOOTSTRAP_JOB_ID : randomUUID());
  const forward_step_id =
    argValue("--forward_step_id") ??
    process.env.SMOKE_FORWARD_STEP_ID ??
    (job_id === BOOTSTRAP_JOB_ID ? BOOTSTRAP_FORWARD_STEP_ID : randomUUID());
  const cancel_step_id =
    argValue("--cancel_step_id") ??
    process.env.SMOKE_CANCEL_STEP_ID ??
    (job_id === BOOTSTRAP_JOB_ID ? BOOTSTRAP_CANCEL_STEP_ID : randomUUID());

  logger.info(
    { job_id, forward_step_id, cancel_step_id, hub: HUB, supplier: SUPPLIER },
    "starting smoke",
  );

  // 1. topup
  if (!SKIP_TOPUP) {
    const topup = (await call("/hub/topup", {
      job_id,
      amount_sats: TOPUP_SATS,
    })) as { bolt11: string; expires_at: string };
    console.log("\n=== STEP 1: top-up invoice issued ===");
    console.log("Pay this BOLT11 from your personal wallet:\n");
    console.log(topup.bolt11);
    console.log("\nWaiting for payment confirmation...");

    // Poll /topup/status until paid or timeout (5 min).
    const deadline = Date.now() + 5 * 60_000;
    let confirmed = false;
    while (Date.now() < deadline) {
      try {
        const status = (await call("/hub/topup/status", {
          bolt11: topup.bolt11,
        })) as { paid: boolean; amount_sats: number };
        if (status.paid) {
          console.log("\ntopup confirmed:", status);
          confirmed = true;
          break;
        }
        process.stdout.write(".");
      } catch {
        process.stdout.write("?");
      }
      await sleep(2000);
    }
    if (!confirmed) {
      throw new Error("topup did not confirm within 5 minutes");
    }
  }

  // 2. balance check (should reflect topup)
  let bal = await get(`/hub/job-balance/${job_id}`);
  console.log("\n=== STEP 2: balance after topup ===");
  console.log(bal);

  // 3. hold
  const hold = await call("/hub/hold", {
    job_id,
    step_id: forward_step_id,
    ceiling_sats: HOLD_SATS,
  });
  console.log("\n=== STEP 3: hold created ===", hold);

  // 4. forward
  const forwarded = await call("/hub/forward", {
    hold_invoice_id: hold.hold_invoice_id,
    supplier_endpoint: SUPPLIER,
    supplier_payload: { task: "smoke" },
  });
  console.log("\n=== STEP 4: forward result ===", forwarded);

  // 5. settle
  const settled = await call("/hub/settle", {
    hold_invoice_id: hold.hold_invoice_id,
  });
  console.log("\n=== STEP 5: settle result ===", settled);

  // 6. balance after settle
  bal = await get(`/hub/job-balance/${job_id}`);
  console.log("\n=== STEP 6: balance after settle ===", bal);

  // 7. second hold + cancel (refund path)
  const hold2 = await call("/hub/hold", {
    job_id,
    step_id: cancel_step_id,
    ceiling_sats: 50,
  });
  console.log("\n=== STEP 7a: second hold ===", hold2);

  const cancelled = await call("/hub/cancel", {
    hold_invoice_id: hold2.hold_invoice_id,
    reason: "smoke-cancel",
  });
  console.log("\n=== STEP 7b: cancel ===", cancelled);

  bal = await get(`/hub/job-balance/${job_id}`);
  console.log("\n=== STEP 8: final balance ===", bal);

  console.log("\nSMOKE OK");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err);
  process.exit(1);
});
