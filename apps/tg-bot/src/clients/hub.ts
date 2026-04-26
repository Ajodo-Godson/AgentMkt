import type { StepResult } from "../types.js";

const HUB_BASE_URL = process.env.HUB_BASE_URL;

export async function submitHumanResult(holdInvoiceId: string, result: StepResult): Promise<void> {
  if (!HUB_BASE_URL) {
    console.log("HUB_BASE_URL not set; human submission would be sent", {
      hold_invoice_id: holdInvoiceId,
      result
    });
    return;
  }

  const response = await fetch(`${HUB_BASE_URL}/hub/human-submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      hold_invoice_id: holdInvoiceId,
      result
    })
  });

  if (!response.ok) {
    throw new Error(`Hub rejected human submission: ${response.status} ${response.statusText}`);
  }
}
