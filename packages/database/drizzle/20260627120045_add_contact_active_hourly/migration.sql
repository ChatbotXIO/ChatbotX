CREATE TABLE IF NOT EXISTS "ContactActiveHourly" (
  "workspaceId" bigint NOT NULL,
  "contactId" bigint NOT NULL,
  "contactInboxId" bigint NOT NULL,
  "hourBucket" timestamp(3) NOT NULL,
  "inboxId" bigint NOT NULL,
  CONSTRAINT "ContactActiveHourly_pkey"
    PRIMARY KEY ("workspaceId", "hourBucket", "contactInboxId")
) PARTITION BY RANGE ("hourBucket");

-- Safety-net DEFAULT partition: guarantees an INSERT can never fail because a
-- monthly partition is missing. The maintenance cron should keep explicit
-- partitions ahead so this normally stays empty.
CREATE TABLE IF NOT EXISTS "ContactActiveHourly_default"
  PARTITION OF "ContactActiveHourly" DEFAULT;

-- Pre-create monthly partitions spanning the backfill range through now + 1
-- month so backfilled and near-future rows land in explicit partitions.
DO $$
DECLARE
  m date := date_trunc('month',
    COALESCE((SELECT MIN("periodStart") FROM "ContactActiveMonthly"), NOW()))::date;
  stop date := (date_trunc('month', NOW()) + INTERVAL '2 month')::date;
BEGIN
  WHILE m < stop LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS "ContactActiveHourly_%s" PARTITION OF "ContactActiveHourly" FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYY_MM'), m, (m + INTERVAL '1 month')::date
    );
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;

INSERT INTO "ContactActiveHourly"
  ("workspaceId", "contactId", "contactInboxId", "inboxId", "hourBucket")
SELECT "workspaceId", "contactId", "contactInboxId", "inboxId",
       date_trunc('hour', "periodStart")
FROM "ContactActiveMonthly"
ON CONFLICT DO NOTHING;
