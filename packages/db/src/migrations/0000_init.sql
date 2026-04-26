CREATE TABLE "hold_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"step_id" text NOT NULL,
	"amount_sats" integer NOT NULL,
	"bolt11" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"budget_sats" integer NOT NULL,
	"locked_sats" integer DEFAULT 0 NOT NULL,
	"spent_sats" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'intake' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"step_id" text,
	"type" text NOT NULL,
	"amount_sats" integer NOT NULL,
	"bolt11" text,
	"preimage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"total_estimate_sats" integer NOT NULL,
	"assumptions" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"capability_tag" text NOT NULL,
	"job_id" text NOT NULL,
	"step_id" text NOT NULL,
	"source" text NOT NULL,
	"score" real NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_snapshots" (
	"worker_id" text NOT NULL,
	"capability_tag" text NOT NULL,
	"ewma" real NOT NULL,
	"total_jobs" integer DEFAULT 0 NOT NULL,
	"successful_jobs" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reputation_snapshots_pk" PRIMARY KEY("worker_id","capability_tag")
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"dag_node" text NOT NULL,
	"capability_tag" text NOT NULL,
	"primary_worker_id" text NOT NULL,
	"fallback_ids" text[] DEFAULT '{}' NOT NULL,
	"estimate_sats" integer NOT NULL,
	"ceiling_sats" integer NOT NULL,
	"depends_on" text[] DEFAULT '{}' NOT NULL,
	"human_required" boolean DEFAULT false NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retries_left" integer DEFAULT 2 NOT NULL,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"endpoint_url" text,
	"telegram_chat_id" text,
	"owner_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"capability_tags" text[] NOT NULL,
	"base_price_sats" integer NOT NULL,
	"stake_sats" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"listed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD CONSTRAINT "hold_invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_invoices" ADD CONSTRAINT "hold_invoices_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_snapshots" ADD CONSTRAINT "reputation_snapshots_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_primary_worker_id_workers_id_fk" FOREIGN KEY ("primary_worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;