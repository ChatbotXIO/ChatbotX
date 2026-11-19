SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "contactInfoSourceType" AS ENUM('broadcast');--> statement-breakpoint
CREATE TYPE "contactInfoType" AS ENUM('phone', 'email');--> statement-breakpoint
CREATE TABLE "ContactInfoCapture" (
	"workspaceId" bigint,
	"sourceType" "contactInfoSourceType",
	"sourceId" bigint,
	"infoType" "contactInfoType",
	"contactId" bigint,
	"contactInboxId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"createdAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "ContactInfoCapture_pkey" PRIMARY KEY("workspaceId","sourceType","sourceId","infoType","contactId")
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactInfoCapture_p%s" PARTITION OF "ContactInfoCapture" FOR VALUES WITH (MODULUS 32, REMAINDER %s)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX "ContactInfoCapture_source_idx" ON "ContactInfoCapture" ("workspaceId","sourceType","sourceId","infoType","createdAt" DESC NULLS LAST,"contactId" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ContactInfoCapture_contact_idx" ON "ContactInfoCapture" ("workspaceId","contactId");--> statement-breakpoint
DO $$
DECLARE
  partition_count bigint;
  primary_key_columns text[];
  partition_columns text[];
  partition_index_count bigint;
  index_name text;
BEGIN
  SELECT COUNT(*) INTO partition_count FROM pg_inherits WHERE inhparent = '"ContactInfoCapture"'::regclass;
  IF partition_count <> 32 THEN
    RAISE EXCEPTION 'ContactInfoCapture expected 32 partitions, got %', partition_count;
  END IF;

  SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
    INTO primary_key_columns
    FROM pg_constraint constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
   WHERE constraint_record.conrelid = '"ContactInfoCapture"'::regclass
     AND constraint_record.contype = 'p';
  IF primary_key_columns IS DISTINCT FROM ARRAY['workspaceId', 'sourceType', 'sourceId', 'infoType', 'contactId']::text[] THEN
    RAISE EXCEPTION 'ContactInfoCapture primary key mismatch: %', primary_key_columns;
  END IF;

  SELECT array_agg(attribute.attname::text)
    INTO partition_columns
    FROM pg_partitioned_table partitioned_table
    CROSS JOIN LATERAL unnest(partitioned_table.partattrs::int2[]) partition_key(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = partitioned_table.partrelid AND attribute.attnum = partition_key.attnum
   WHERE partitioned_table.partrelid = '"ContactInfoCapture"'::regclass
     AND partitioned_table.partstrat = 'h';
  IF partition_columns IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
    RAISE EXCEPTION 'ContactInfoCapture partition key mismatch: %', partition_columns;
  END IF;

  FOREACH index_name IN ARRAY ARRAY['ContactInfoCapture_source_idx', 'ContactInfoCapture_contact_idx'] LOOP
    SELECT COUNT(*) INTO partition_index_count FROM pg_inherits WHERE inhparent = format('%I', index_name)::regclass;
    IF partition_index_count <> 32 THEN
      RAISE EXCEPTION '% expected 32 partition indexes, got %', index_name, partition_index_count;
    END IF;
  END LOOP;
END $$;
