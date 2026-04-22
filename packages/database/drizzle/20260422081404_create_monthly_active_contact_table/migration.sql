DROP TABLE IF EXISTS "ContactActivityEvent";
DROP TABLE IF EXISTS "ContactActivityHourly";
DROP TABLE IF EXISTS "ContactActiveDaily";
DROP TABLE IF EXISTS "ContactActiveMonthly";
DROP TABLE IF EXISTS "WorkspaceMacDaily";
DROP TABLE IF EXISTS "WorkspaceMacHourly";
DROP TABLE IF EXISTS "WorkspaceMacMonthly";

-- 1. Hourly activity aggregate (partitioned monthly by hourBucket).
--    One row per (workspace, contact, eventType, inbox, hour).
CREATE TABLE "ContactActivityHourly" (
  "workspaceId" bigint                    NOT NULL,
  "contactId"   bigint                    NOT NULL,
  "contactInboxId"   bigint                    NOT NULL,
  "eventType"   smallint                  NOT NULL,
  "inboxId"     bigint                      NOT NULL,
  "hourBucket"  timestamp(6) with time zone NOT NULL,
  PRIMARY KEY ("hourBucket", "workspaceId", "contactInboxId", "eventType", "inboxId")
) PARTITION BY RANGE ("hourBucket");
--> statement-breakpoint

CREATE INDEX "ContactActivityHourly_brin"
  ON "ContactActivityHourly"
  USING BRIN ("workspaceId", "hourBucket")
  WITH (pages_per_range = 32);
--> statement-breakpoint

CREATE TABLE "ContactActivityHourly_default" PARTITION OF "ContactActivityHourly" DEFAULT;
--> statement-breakpoint

-- 2. Monthly presence (partitioned yearly by periodStart). Ground truth of MAC. Billing-anchored.
CREATE TABLE "ContactActiveMonthly" (
  "workspaceId"    bigint                    NOT NULL,
  "contactId"      bigint                    NOT NULL,
  "contactInboxId"      bigint                    NOT NULL,
  "periodStart"    date                      NOT NULL,
  "periodEnd"      date                      NOT NULL,
  "inboxId"       bigint                    NOT NULL,
  "billingId"       bigint NOT NULL,
  PRIMARY KEY ("workspaceId", "periodStart", "contactInboxId", "billingId")
) PARTITION BY RANGE ("periodStart");
--> statement-breakpoint

CREATE TABLE "ContactActiveMonthly_default" PARTITION OF "ContactActiveMonthly" DEFAULT;
--> statement-breakpoint

-- 3. Dashboard rollups (not partitioned; one row per workspace+period).
CREATE TABLE "WorkspaceMacMonthly" (
  "workspaceId" bigint                      NOT NULL,
  "periodStart" date                        NOT NULL,
  "periodEnd"   date                        NOT NULL,
  "macCount"    integer                     NOT NULL DEFAULT 0,
  "billingId"   bigint NOT NULL,
  "updatedAt"   timestamp(6) with time zone NOT NULL DEFAULT now(),
  "lockedAt"    timestamp(6) with time zone,
  PRIMARY KEY ("workspaceId", "periodStart", "billingId")
);
--> statement-breakpoint

ALTER TABLE "WorkspaceMacMonthly"
  ADD CONSTRAINT "WorkspaceMacMonthly_workspaceId_Workspace_id_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

-- 4. Initial partitions: current month +/- 1 for hourly, current year for monthly.
-- Further partitions managed by the monthly maintenance job.
DO $$
DECLARE
  prev_month text := to_char(date_trunc('month', now()) - interval '1 month', 'YYYY_MM');
  prev_start text := to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM-DD');
  curr_month text := to_char(date_trunc('month', now()), 'YYYY_MM');
  curr_start text := to_char(date_trunc('month', now()), 'YYYY-MM-DD');
  next_month text := to_char(date_trunc('month', now()) + interval '1 month', 'YYYY_MM');
  next_start text := to_char(date_trunc('month', now()) + interval '1 month', 'YYYY-MM-DD');
  next2_start text := to_char(date_trunc('month', now()) + interval '2 month', 'YYYY-MM-DD');
  curr_year text := to_char(date_trunc('year', now()), 'YYYY');
  curr_year_start text := to_char(date_trunc('year', now()), 'YYYY-MM-DD');
  next_year_start text := to_char(date_trunc('year', now()) + interval '1 year', 'YYYY-MM-DD');
BEGIN
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "ContactActivityHourly" FOR VALUES FROM (%L) TO (%L)',
    'ContactActivityHourly_' || prev_month, prev_start, curr_start
  );
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "ContactActivityHourly" FOR VALUES FROM (%L) TO (%L)',
    'ContactActivityHourly_' || curr_month, curr_start, next_start
  );
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "ContactActivityHourly" FOR VALUES FROM (%L) TO (%L)',
    'ContactActivityHourly_' || next_month, next_start, next2_start
  );

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "ContactActiveMonthly" FOR VALUES FROM (%L) TO (%L)',
    'ContactActiveMonthly_' || curr_year, curr_year_start, next_year_start
  );
END$$;
