CREATE TABLE "MessageShard" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 5432,
	"database" text NOT NULL,
	"user" text NOT NULL,
	"isActive" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "ShardTimeRange" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"shardId" bigint NOT NULL,
	"startTime" timestamp(6) with time zone NOT NULL,
	"endTime" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX "MessageShard_isActive_idx" ON "MessageShard" ("isActive");--> statement-breakpoint
CREATE INDEX "ShardTimeRange_time_lookup_idx" ON "ShardTimeRange" ("startTime","endTime");--> statement-breakpoint
CREATE INDEX "ShardTimeRange_shardId_idx" ON "ShardTimeRange" ("shardId");--> statement-breakpoint
ALTER TABLE "ShardTimeRange" ADD CONSTRAINT "ShardTimeRange_shardId_MessageShard_id_fkey" FOREIGN KEY ("shardId") REFERENCES "MessageShard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- Partial unique index: enforce only ONE active shard at a time
CREATE UNIQUE INDEX "MessageShard_single_active_idx" ON "MessageShard" ("isActive") WHERE "isActive" = true;
--> statement-breakpoint
-- Enable btree_gist extension for exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Exclusion constraint: prevent overlapping time ranges
ALTER TABLE "ShardTimeRange" ADD CONSTRAINT "ShardTimeRange_no_overlap" EXCLUDE USING gist (
  tstzrange("startTime", COALESCE("endTime", 'infinity'::timestamptz)) WITH &&
);
