/**
 * H4 milestone smoke test.
 *
 * Verifies the hub can reach the Lexe sidecar and create a 1-sat invoice you
 * can pay from your personal wallet. Prints the bolt11 + payment_index so you
 * can paste them into your wallet and watch the status flip.
 *
 * Usage:
 *   pnpm smoke:1sat
 *
 * Then paste the printed bolt11 into Phoenix / Wallet of Satoshi / etc. and
 * watch this script transition from "pending" -> "completed". Once completed,
 * post the preimage to the team channel as the milestone proof.
 */

import { lexeClient } from "../src/lightning/lexe-client.js";
import { logger } from "../src/lib/logger.js";

async function main() {
  logger.info("checking sidecar health...");
  const h = await lexeClient.health();
  logger.info({ status: h.status }, "sidecar OK");

  const info = await lexeClient.nodeInfo();
  logger.info(
    {
      version: info.version,
      node_pk: info.node_pk,
      lightning_balance: info.lightning_balance,
      lightning_sendable: info.lightning_sendable_balance,
      onchain_balance: info.onchain_balance,
      channels: `${info.num_usable_channels}/${info.num_channels}`,
    },
    "node info",
  );

  logger.info("creating 1-sat invoice...");
  const inv = await lexeClient.createInvoice({
    sats: 1,
    description: "AgentMkt hub bootstrap test (1 sat)",
    expiresInSecs: 3600,
  });

  console.log("\n========================================================");
  console.log("Pay this invoice from your personal Lightning wallet:\n");
  console.log(inv.invoice);
  console.log("\npayment_index =", inv.index);
  console.log("payment_hash  =", inv.payment_hash);
  console.log("expires_at    =", new Date(inv.expires_at).toISOString());
  console.log("========================================================\n");

  logger.info("polling for payment confirmation (5 min ceiling)...");
  const final = await lexeClient.waitForPayment(inv.index, {
    timeoutMs: 5 * 60_000,
    intervalMs: 2_000,
  });

  if (final.status === "completed") {
    console.log("\n========================================================");
    console.log("MILESTONE PROOF — paste this into the team channel:\n");
    console.log("payment_index =", final.index);
    console.log("amount_sats   =", final.amount);
    console.log("preimage      =", (final as { preimage?: string }).preimage ?? "(not exposed by sidecar)");
    console.log("finalized_at  =", final.finalized_at ? new Date(final.finalized_at).toISOString() : "?");
    console.log("========================================================\n");
    process.exit(0);
  } else {
    logger.error({ final }, "payment did not complete");
    process.exit(2);
  }
}

main().catch((err) => {
  logger.fatal({ err }, "smoke-1sat failed");
  process.exit(1);
});
