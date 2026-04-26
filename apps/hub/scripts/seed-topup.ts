/**
 * Seed the already-funded Lexe wallet into the hub ledger.
 *
 * This records a synthetic topup row for the 21k-sat BOLT12 offer payment that
 * already landed in the P2 Lexe wallet. It also creates the minimal parent
 * records required by the shared DB foreign keys so the smoke script can create
 * holds for `job_bootstrap_funding`.
 */

import { closeDb, db, schema } from "@agentmkt/db";
import { recordTopupIdempotent } from "../src/ledger/postings.js";

const DEFAULT_JOB_ID = "job_bootstrap_funding";
const DEFAULT_PAYMENT_INDEX =
  "0000001777165998876-fr_56a86e638ef0f137daf7ceb0eabfca29bfe5365d4ef0fd2e6c29e2ee2c3694d6";
const DEFAULT_PAYMENT_HASH =
  "a21e5fcfae019670bb2e0f74fd6f1745051f4cf5c9c5261909c1a1f76c88a9b7";
const DEFAULT_PREIMAGE =
  "a5edd1f9c9915deed1200c108c6719cbb826790d74286b535129fa33745a384b";

const USER_ID = "user_p2_bootstrap";
const WORKER_ID = "worker_p2_fake_supplier";
const PLAN_ID = "plan_bootstrap_funding";
export const FORWARD_STEP_ID = "step_bootstrap_forward";
export const CANCEL_STEP_ID = "step_bootstrap_cancel";

function argValue(name: string): string | undefined {
  const ix = process.argv.indexOf(name);
  return ix >= 0 ? process.argv[ix + 1] : undefined;
}

async function seedParentRows(job_id: string, budget_sats: number): Promise<void> {
  await db
    .insert(schema.users)
    .values({ id: USER_ID })
    .onConflictDoNothing();

  await db
    .insert(schema.workers)
    .values({
      id: WORKER_ID,
      type: "agent",
      owner_user_id: USER_ID,
      display_name: "P2 fake supplier",
      capability_tags: ["summarization"],
      base_price_sats: 10,
      stake_sats: 0,
      source: "internal",
      status: "active",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.jobs)
    .values({
      id: job_id,
      user_id: USER_ID,
      prompt: "P2 bootstrap funding smoke job",
      budget_sats,
      locked_sats: 0,
      spent_sats: 0,
      status: "executing",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.plans)
    .values({
      id: PLAN_ID,
      job_id,
      version: 1,
      total_estimate_sats: 250,
      assumptions: ["Seeded by apps/hub/scripts/seed-topup.ts"],
      status: "approved",
    })
    .onConflictDoNothing();

  for (const [id, dag_node, ceiling_sats] of [
    [FORWARD_STEP_ID, "forward", 200],
    [CANCEL_STEP_ID, "cancel", 50],
  ] as const) {
    await db
      .insert(schema.steps)
      .values({
        id,
        plan_id: PLAN_ID,
        dag_node,
        capability_tag: "summarization",
        primary_worker_id: WORKER_ID,
        fallback_ids: [],
        estimate_sats: ceiling_sats,
        ceiling_sats,
        depends_on: [],
        human_required: false,
        optional: false,
        status: "pending",
        retries_left: 2,
      })
      .onConflictDoNothing();
  }
}

async function main(): Promise<void> {
  const job_id = argValue("--job_id") ?? process.env.SEED_TOPUP_JOB_ID ?? DEFAULT_JOB_ID;
  const amount_sats = Number.parseInt(
    argValue("--amount_sats") ?? process.env.SEED_TOPUP_AMOUNT_SATS ?? "21000",
    10,
  );
  const payment_index =
    argValue("--payment_index") ??
    process.env.SEED_TOPUP_PAYMENT_INDEX ??
    DEFAULT_PAYMENT_INDEX;
  const payment_hash =
    argValue("--payment_hash") ??
    process.env.SEED_TOPUP_PAYMENT_HASH ??
    DEFAULT_PAYMENT_HASH;
  const preimage =
    argValue("--preimage") ?? process.env.SEED_TOPUP_PREIMAGE ?? DEFAULT_PREIMAGE;

  if (!Number.isInteger(amount_sats) || amount_sats <= 0) {
    throw new Error(`amount_sats must be positive, got ${amount_sats}`);
  }

  await seedParentRows(job_id, amount_sats);
  const result = await recordTopupIdempotent({
    job_id,
    bolt11: `lexe-offer:${payment_index}`,
    amount_sats,
    preimage,
    meta: {
      kind: "bootstrap_offer_topup",
      payment_index,
      payment_hash,
      source: "lexe-cli-list-payments",
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        job_id,
        amount_sats,
        ledger_id: result.id,
        created: result.created,
        forward_step_id: FORWARD_STEP_ID,
        cancel_step_id: CANCEL_STEP_ID,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
