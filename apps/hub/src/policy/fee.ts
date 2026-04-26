// =============================================================================
// Marketplace fee policy.
//
// Hackathon spec: flat 5% of paid_to_supplier_sats, rounded down to nearest
// sat. Configurable via HUB_FEE_BPS env var (basis points; 500 = 5.00%).
// =============================================================================

import { env } from "../lib/env.js";

/**
 * Compute the marketplace fee for a given supplier payout, in integer sats.
 * Rounded DOWN per spec (a 100-sat payout at 5% yields 5 sats; a 99-sat
 * payout at 5% yields 4 sats, not 5).
 */
export function computeFee(paid_to_supplier_sats: number): number {
  if (!Number.isInteger(paid_to_supplier_sats) || paid_to_supplier_sats < 0) {
    throw new Error(
      `computeFee: paid_to_supplier_sats must be a non-negative integer, got ${paid_to_supplier_sats}`,
    );
  }
  return Math.floor((paid_to_supplier_sats * env.HUB_FEE_BPS) / 10_000);
}

/**
 * The maximum routing fee (sats) we'll tolerate paying through the Lightning
 * Network when forwarding to a supplier. We can't pre-cap with the Lexe
 * sidecar API (no `max_fee_sats` field), so this is checked AFTER the payment
 * completes and used to surface warnings.
 */
export function maxRoutingFeeForInvoice(invoice_amount_sats: number): number {
  // Per-invoice cap = max(2 sats, 1% of amount). Bounded by the global env cap.
  const perInvoice = Math.max(2, Math.floor(invoice_amount_sats * 0.01));
  return Math.min(perInvoice, env.HUB_MAX_ROUTING_FEE_SATS);
}
