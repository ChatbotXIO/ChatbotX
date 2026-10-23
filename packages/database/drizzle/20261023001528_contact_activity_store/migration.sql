SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "contactActivityReferenceType" AS ENUM('flow', 'flowNode', 'automatedResponse', 'whatsappFlow', 'emailTopic');--> statement-breakpoint
CREATE TYPE "contactActivityType" AS ENUM('flowExecuted', 'flowNodeExecuted', 'automatedResponseMatched', 'formCompleted', 'messageSent', 'messageDelivered', 'messageOpened', 'messageClicked');--> statement-breakpoint
CREATE TABLE "ContactActivity" (
	"workspaceId" bigint,
	"contactId" bigint,
	"activityType" "contactActivityType",
	"referenceType" "contactActivityReferenceType",
	"parentReferenceId" bigint,
	"referenceId" bigint,
	"firstOccurredAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "ContactActivity_pkey" PRIMARY KEY("workspaceId","contactId","activityType","referenceType","parentReferenceId","referenceId"),
	CONSTRAINT "ContactActivity_allowed_pair_check" CHECK (("activityType" = 'flowExecuted' AND "referenceType" = 'flow' AND "parentReferenceId" = 0) OR ("activityType" = 'flowNodeExecuted' AND "referenceType" = 'flowNode' AND "parentReferenceId" <> 0) OR ("activityType" = 'automatedResponseMatched' AND "referenceType" = 'automatedResponse' AND "parentReferenceId" = 0) OR ("activityType" = 'formCompleted' AND "referenceType" = 'whatsappFlow' AND "parentReferenceId" = 0) OR ("activityType" = 'messageSent' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageDelivered' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageOpened' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageClicked' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0))
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactActivity_p%s" PARTITION OF "ContactActivity" FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "ContactKeywordMessage" (
	"workspaceId" bigint,
	"contactId" bigint,
	"messageId" bigint,
	"automatedResponseId" bigint NOT NULL,
	"text" text NOT NULL,
	"normalizedText" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "ContactKeywordMessage_pkey" PRIMARY KEY("workspaceId","contactId","messageId")
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactKeywordMessage_p%s" PARTITION OF "ContactKeywordMessage" FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "ContactState" (
	"workspaceId" bigint,
	"contactId" bigint,
	"lastDeliveredAt" timestamp(6) with time zone,
	CONSTRAINT "ContactState_pkey" PRIMARY KEY("workspaceId","contactId")
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactState_p%s" PARTITION OF "ContactState" FOR VALUES WITH (MODULUS 64, REMAINDER %s) WITH (fillfactor = 80)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX "ContactActivity_reference_idx" ON "ContactActivity" ("workspaceId","activityType","referenceType","parentReferenceId","referenceId","contactId");--> statement-breakpoint
CREATE INDEX "ContactKeywordMessage_text_trgm_idx" ON "ContactKeywordMessage" USING gin ("normalizedText" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ContactKeywordMessage_text_prefix_idx" ON "ContactKeywordMessage" ("workspaceId","normalizedText" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "ContactState_lastDeliveredAt_idx" ON "ContactState" ("workspaceId","lastDeliveredAt") WHERE "lastDeliveredAt" IS NOT NULL;--> statement-breakpoint
-- One ALTER so the table lock is taken once. The FK is re-added NOT VALID: the
-- previous (valid) FK already guaranteed every existing row, new writes are
-- enforced, and validating here would scan the whole table under the lock held
-- by this transaction. Run `ALTER TABLE "AnalyticsEmailTopic" VALIDATE CONSTRAINT
-- "AnalyticsEmailTopic_topicId_EmailTopic_id_fkey"` separately (see docs).
ALTER TABLE "AnalyticsEmailTopic"
  ADD COLUMN "topicReferenceId" bigint,
  ALTER COLUMN "topicId" DROP NOT NULL,
  DROP CONSTRAINT "AnalyticsEmailTopic_topicId_EmailTopic_id_fkey",
  ADD CONSTRAINT "AnalyticsEmailTopic_topicId_EmailTopic_id_fkey" FOREIGN KEY ("topicId") REFERENCES "EmailTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
--> statement-breakpoint
DO $$
DECLARE
  partition_count bigint;
  primary_key_columns text[];
  partition_columns text[];
  partition_index_count bigint;
BEGIN
  SELECT COUNT(*) INTO partition_count FROM pg_inherits WHERE inhparent = '"ContactActivity"'::regclass;
  IF partition_count <> 64 THEN
    RAISE EXCEPTION 'ContactActivity expected 64 partitions, got %', partition_count;
  END IF;

  SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
    INTO primary_key_columns
    FROM pg_constraint constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
   WHERE constraint_record.conrelid = '"ContactActivity"'::regclass
     AND constraint_record.contype = 'p';
  IF primary_key_columns IS DISTINCT FROM ARRAY['workspaceId', 'contactId', 'activityType', 'referenceType', 'parentReferenceId', 'referenceId']::text[] THEN
    RAISE EXCEPTION 'ContactActivity primary key mismatch: %', primary_key_columns;
  END IF;

  SELECT array_agg(attribute.attname::text)
    INTO partition_columns
    FROM pg_partitioned_table partitioned_table
    CROSS JOIN LATERAL unnest(partitioned_table.partattrs::int2[]) partition_key(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = partitioned_table.partrelid AND attribute.attnum = partition_key.attnum
   WHERE partitioned_table.partrelid = '"ContactActivity"'::regclass
     AND partitioned_table.partstrat = 'h';
  IF partition_columns IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
    RAISE EXCEPTION 'ContactActivity partition key mismatch: %', partition_columns;
  END IF;

  SELECT COUNT(*) INTO partition_index_count FROM pg_inherits WHERE inhparent = '"ContactActivity_reference_idx"'::regclass;
  IF partition_index_count <> 64 THEN
    RAISE EXCEPTION 'ContactActivity_reference_idx expected 64 partition indexes, got %', partition_index_count;
  END IF;

  SELECT COUNT(*) INTO partition_count FROM pg_inherits WHERE inhparent = '"ContactKeywordMessage"'::regclass;
  IF partition_count <> 64 THEN
    RAISE EXCEPTION 'ContactKeywordMessage expected 64 partitions, got %', partition_count;
  END IF;

  SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
    INTO primary_key_columns
    FROM pg_constraint constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
   WHERE constraint_record.conrelid = '"ContactKeywordMessage"'::regclass
     AND constraint_record.contype = 'p';
  IF primary_key_columns IS DISTINCT FROM ARRAY['workspaceId', 'contactId', 'messageId']::text[] THEN
    RAISE EXCEPTION 'ContactKeywordMessage primary key mismatch: %', primary_key_columns;
  END IF;

  SELECT array_agg(attribute.attname::text)
    INTO partition_columns
    FROM pg_partitioned_table partitioned_table
    CROSS JOIN LATERAL unnest(partitioned_table.partattrs::int2[]) partition_key(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = partitioned_table.partrelid AND attribute.attnum = partition_key.attnum
   WHERE partitioned_table.partrelid = '"ContactKeywordMessage"'::regclass
     AND partitioned_table.partstrat = 'h';
  IF partition_columns IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
    RAISE EXCEPTION 'ContactKeywordMessage partition key mismatch: %', partition_columns;
  END IF;

  SELECT COUNT(*) INTO partition_index_count FROM pg_inherits WHERE inhparent = '"ContactKeywordMessage_text_trgm_idx"'::regclass;
  IF partition_index_count <> 64 THEN
    RAISE EXCEPTION 'ContactKeywordMessage_text_trgm_idx expected 64 partition indexes, got %', partition_index_count;
  END IF;

  SELECT COUNT(*) INTO partition_index_count FROM pg_inherits WHERE inhparent = '"ContactKeywordMessage_text_prefix_idx"'::regclass;
  IF partition_index_count <> 64 THEN
    RAISE EXCEPTION 'ContactKeywordMessage_text_prefix_idx expected 64 partition indexes, got %', partition_index_count;
  END IF;

  SELECT COUNT(*) INTO partition_count FROM pg_inherits WHERE inhparent = '"ContactState"'::regclass;
  IF partition_count <> 64 THEN
    RAISE EXCEPTION 'ContactState expected 64 partitions, got %', partition_count;
  END IF;

  SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
    INTO primary_key_columns
    FROM pg_constraint constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
   WHERE constraint_record.conrelid = '"ContactState"'::regclass
     AND constraint_record.contype = 'p';
  IF primary_key_columns IS DISTINCT FROM ARRAY['workspaceId', 'contactId']::text[] THEN
    RAISE EXCEPTION 'ContactState primary key mismatch: %', primary_key_columns;
  END IF;

  SELECT array_agg(attribute.attname::text)
    INTO partition_columns
    FROM pg_partitioned_table partitioned_table
    CROSS JOIN LATERAL unnest(partitioned_table.partattrs::int2[]) partition_key(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = partitioned_table.partrelid AND attribute.attnum = partition_key.attnum
   WHERE partitioned_table.partrelid = '"ContactState"'::regclass
     AND partitioned_table.partstrat = 'h';
  IF partition_columns IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
    RAISE EXCEPTION 'ContactState partition key mismatch: %', partition_columns;
  END IF;

  SELECT COUNT(*) INTO partition_index_count FROM pg_inherits WHERE inhparent = '"ContactState_lastDeliveredAt_idx"'::regclass;
  IF partition_index_count <> 64 THEN
    RAISE EXCEPTION 'ContactState_lastDeliveredAt_idx expected 64 partition indexes, got %', partition_index_count;
  END IF;
END $$;
