CREATE TABLE IF NOT EXISTS "MessageShard" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 5432,
	"database" text NOT NULL,
	"user" text NOT NULL,
	"credentialRef" text,
	"sslMode" text DEFAULT 'disable',
	"isActive" boolean DEFAULT false,
	"shardKey" integer,
	"readHost" text,
	"readPort" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ShardTimeRange" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"shardId" bigint NOT NULL,
	"startTime" timestamp(6) with time zone NOT NULL,
	"endTime" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MessageShard_isActive_idx" ON "MessageShard" ("isActive");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MessageShard_shardKey_idx" ON "MessageShard" ("shardKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ShardTimeRange_time_lookup_idx" ON "ShardTimeRange" ("startTime","endTime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ShardTimeRange_shardId_idx" ON "ShardTimeRange" ("shardId");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ShardTimeRange_shardId_MessageShard_id_fkey'
  ) THEN
    ALTER TABLE "ShardTimeRange" ADD CONSTRAINT "ShardTimeRange_shardId_MessageShard_id_fkey"
      FOREIGN KEY ("shardId") REFERENCES "MessageShard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShardTimeRange_no_overlap'
  ) THEN
    ALTER TABLE "ShardTimeRange" ADD CONSTRAINT "ShardTimeRange_no_overlap" EXCLUDE USING gist (
      "shardId" WITH =,
      tstzrange("startTime", COALESCE("endTime", 'infinity'::timestamptz)) WITH &&
    );
  END IF;
END $$;
