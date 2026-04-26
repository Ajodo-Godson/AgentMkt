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
ALTER TABLE "hold_invoices" ALTER COLUMN "bolt11" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "hold_invoices" ALTER COLUMN "status" SET DEFAULT 'held';--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "human_payout_bolt11" text;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "human_submitted_result" jsonb;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "paid_to_supplier_sats" integer;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "fee_sats" integer;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "preimage" text;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "hold_invoice_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "meta" jsonb;--> statement-breakpoint
CREATE INDEX "topup_invoices_job_idx" ON "topup_invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "topup_invoices_payment_index_idx" ON "topup_invoices" USING btree ("payment_index");--> statement-breakpoint
CREATE INDEX "hold_invoices_job_idx" ON "hold_invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "hold_invoices_status_idx" ON "hold_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_entries_job_idx" ON "ledger_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_hold_idx" ON "ledger_entries" USING btree ("hold_invoice_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_bolt11_idx" ON "ledger_entries" USING btree ("bolt11");--> statement-breakpoint
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries" USING btree ("type");