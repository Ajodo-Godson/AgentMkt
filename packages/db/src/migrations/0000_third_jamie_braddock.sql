CREATE TABLE "hold_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"step_id" text NOT NULL,
	"amount_sats" integer NOT NULL,
	"bolt11" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"human_payout_bolt11" text,
	"human_submitted_result" jsonb,
	"paid_to_supplier_sats" integer,
	"fee_sats" integer,
	"preimage" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"step_id" text,
	"type" text NOT NULL,
	"amount_sats" integer NOT NULL,
	"bolt11" text,
	"preimage" text,
	"hold_invoice_id" uuid,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_invoices" (
	"bolt11" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"amount_sats" integer NOT NULL,
	"payment_index" text NOT NULL,
	"payment_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hold_invoices_job_idx" ON "hold_invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "hold_invoices_status_idx" ON "hold_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_entries_job_idx" ON "ledger_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_hold_idx" ON "ledger_entries" USING btree ("hold_invoice_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_bolt11_idx" ON "ledger_entries" USING btree ("bolt11");--> statement-breakpoint
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "topup_invoices_job_idx" ON "topup_invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "topup_invoices_payment_index_idx" ON "topup_invoices" USING btree ("payment_index");