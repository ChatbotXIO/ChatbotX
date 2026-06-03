-- Add MAC fields to UserQuota
ALTER TABLE "UserQuota" ADD COLUMN IF NOT EXISTS "macLimit" integer;
ALTER TABLE "UserQuota" ADD COLUMN IF NOT EXISTS "macUsed" integer NOT NULL DEFAULT 0;

-- WorkspaceMac: per-workspace MAC rollup per billing period
CREATE TABLE IF NOT EXISTS "WorkspaceMac" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "workspaceId" bigint NOT NULL,
  "periodStart" timestamp(6) with time zone NOT NULL,
  "periodEnd" timestamp(6) with time zone NOT NULL,
  "macCount" integer NOT NULL DEFAULT 0,
  CONSTRAINT "WorkspaceMac_workspaceId_periodStart_periodEnd_unique"
    UNIQUE ("workspaceId", "periodStart", "periodEnd"),
  CONSTRAINT "WorkspaceMac_workspaceId_Workspace_id_fk"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ContactActiveMonthly: partitioned presence tracking (one row per contact per period)
CREATE TABLE IF NOT EXISTS "ContactActiveMonthly" (
  "workspaceId" bigint NOT NULL,
  "contactId" bigint NOT NULL,
  "contactInboxId" bigint NOT NULL,
  "periodStart" timestamp(3) NOT NULL,
  "inboxId" bigint NOT NULL,
  "workspaceMacId" bigint NOT NULL,
  CONSTRAINT "ContactActiveMonthly_pkey"
    PRIMARY KEY ("workspaceId", "periodStart", "contactInboxId")
) PARTITION BY RANGE ("periodStart");

-- Create yearly partitions for current year and next year
DO $$
DECLARE
  current_year integer := EXTRACT(YEAR FROM NOW())::integer;
  next_year integer := current_year + 1;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS "ContactActiveMonthly_%s" PARTITION OF "ContactActiveMonthly" FOR VALUES FROM (%L) TO (%L)',
    current_year,
    current_year || '-01-01',
    (current_year + 1) || '-01-01'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS "ContactActiveMonthly_%s" PARTITION OF "ContactActiveMonthly" FOR VALUES FROM (%L) TO (%L)',
    next_year,
    next_year || '-01-01',
    (next_year + 1) || '-01-01'
  );
END $$;
