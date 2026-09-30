SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "channelPostIntegrationType" AS ENUM('messenger', 'instagram', 'instagramFacebook');--> statement-breakpoint
CREATE TABLE "ContactInboxPost" (
	"workspaceId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"postId" bigint NOT NULL,
	"commentedAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "ContactInboxPost_pkey" PRIMARY KEY("workspaceId","contactInboxId","postId")
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactInboxPost_p%s" PARTITION OF "ContactInboxPost" FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "ChannelPost" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"integrationType" "channelPostIntegrationType" NOT NULL,
	"integrationId" bigint NOT NULL,
	"sourceAccountId" text NOT NULL,
	"externalPostId" text NOT NULL,
	"caption" text,
	"mediaType" text,
	"thumbnail" text,
	"permalink" text,
	"publishedAt" timestamp(6) with time zone,
	"metadataFetchedAt" timestamp(6) with time zone,
	"metadataAttemptedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX "ContactInboxPost_workspaceId_postId_idx" ON "ContactInboxPost" ("workspaceId","postId");--> statement-breakpoint
CREATE UNIQUE INDEX "ChannelPost_workspaceId_externalPostId_key" ON "ChannelPost" ("workspaceId","externalPostId");--> statement-breakpoint
CREATE INDEX "ChannelPost_workspaceId_sortAt_id_idx" ON "ChannelPost" ("workspaceId",COALESCE("publishedAt", "createdAt") DESC,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ChannelPost_inboxId_idx" ON "ChannelPost" ("inboxId");--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
DO $$
DECLARE
  partition_count bigint;
  primary_key_columns text[];
  partition_columns text[];
  partition_index_count bigint;
BEGIN
  SELECT COUNT(*)
    INTO partition_count
    FROM pg_inherits
   WHERE inhparent = '"ContactInboxPost"'::regclass;
  IF partition_count <> 64 THEN
    RAISE EXCEPTION 'ContactInboxPost expected 64 partitions, got %', partition_count;
  END IF;

  SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
    INTO primary_key_columns
	FROM pg_constraint constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
	WHERE constraint_record.conrelid = '"ContactInboxPost"'::regclass
		AND constraint_record.contype = 'p';
  IF primary_key_columns IS DISTINCT FROM ARRAY['workspaceId', 'contactInboxId', 'postId']::text[] THEN
    RAISE EXCEPTION 'ContactInboxPost primary key mismatch: %', primary_key_columns;
  END IF;

  SELECT array_agg(attribute.attname::text)
    INTO partition_columns
    FROM pg_partitioned_table partitioned_table
    CROSS JOIN LATERAL unnest(partitioned_table.partattrs::int2[]) partition_key(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = partitioned_table.partrelid AND attribute.attnum = partition_key.attnum
   WHERE partitioned_table.partrelid = '"ContactInboxPost"'::regclass
     AND partitioned_table.partstrat = 'h';
  IF partition_columns IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
    RAISE EXCEPTION 'ContactInboxPost partition key mismatch: %', partition_columns;
  END IF;

  SELECT COUNT(*)
    INTO partition_index_count
    FROM pg_inherits
   WHERE inhparent = '"ContactInboxPost_workspaceId_postId_idx"'::regclass;
  IF partition_index_count <> 64 THEN
    RAISE EXCEPTION 'ContactInboxPost_workspaceId_postId_idx expected 64 partition indexes, got %', partition_index_count;
  END IF;
END $$;
