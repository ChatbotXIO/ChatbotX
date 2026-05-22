-- DROP TABLE IF EXISTS "ContactActiveMonthly";
-- DROP TABLE IF EXISTS "WorkspaceMac";
-- DROP TABLE IF EXISTS "BillingMac";
-- DROP TABLE IF EXISTS "Billing";
-- DROP TYPE IF EXISTS "BillingStatus";

-- 0. Billing record. Created elsewhere by the application; this migration only
--    seeds default rows for existing users. periodEnd NULL = open-ended window.
CREATE TYPE "BillingStatus" AS ENUM ('active', 'expired');
--> statement-breakpoint

CREATE TABLE "Billing" (
  "id"          bigint                      PRIMARY KEY,
  "createdAt"   timestamp(6) with time zone NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(6) with time zone NOT NULL DEFAULT now(),
  "userId"      bigint                      NOT NULL,
  "periodStart" timestamp(6) with time zone NOT NULL,
  "periodEnd"   timestamp(6) with time zone,
  "status"      "BillingStatus"             NOT NULL DEFAULT 'active',
  "meta"        jsonb                       NOT NULL DEFAULT '{}'
);
--> statement-breakpoint

ALTER TABLE "Billing"
  ADD CONSTRAINT "Billing_userId_User_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

CREATE INDEX "Billing_userId_periodStart_idx"
  ON "Billing" ("userId", "periodStart" DESC);
--> statement-breakpoint

-- 1. Billing-level MAC rollup. Single-column id PK so child rows reference it
--    with one column. UNIQUE(billingId, periodStart, periodEnd) enforces one
--    rollup row per billing per period window.
CREATE TABLE "BillingMac" (
  "id"          bigint                      PRIMARY KEY,
  "createdAt"   timestamp(6) with time zone NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(6) with time zone NOT NULL DEFAULT now(),
  "billingId"   bigint                      NOT NULL,
  "periodStart" timestamp(6) with time zone NOT NULL,
  "periodEnd"   timestamp(6) with time zone NOT NULL,
  "macCount"    integer                     NOT NULL DEFAULT 0
);
--> statement-breakpoint

ALTER TABLE "BillingMac"
  ADD CONSTRAINT "BillingMac_billingId_Billing_id_fkey"
  FOREIGN KEY ("billingId") REFERENCES "Billing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "BillingMac"
  ADD CONSTRAINT "BillingMac_billingId_periodStart_periodEnd_unique"
  UNIQUE ("billingId", "periodStart", "periodEnd");
--> statement-breakpoint

-- 2. Workspace-level MAC rollup. Period bounds are reached via
--    billingMacId -> BillingMac, not stored here.
CREATE TABLE "WorkspaceMac" (
  "id"           bigint                      PRIMARY KEY,
  "createdAt"    timestamp(6) with time zone NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(6) with time zone NOT NULL DEFAULT now(),
  "workspaceId"  bigint                      NOT NULL,
  "billingMacId" bigint                      NOT NULL,
  "macCount"     integer                     NOT NULL DEFAULT 0
);
--> statement-breakpoint

ALTER TABLE "WorkspaceMac"
  ADD CONSTRAINT "WorkspaceMac_workspaceId_Workspace_id_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "WorkspaceMac"
  ADD CONSTRAINT "WorkspaceMac_billingMacId_BillingMac_id_fkey"
  FOREIGN KEY ("billingMacId") REFERENCES "BillingMac"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "WorkspaceMac"
  ADD CONSTRAINT "WorkspaceMac_workspaceId_billingMacId_unique"
  UNIQUE ("workspaceId", "billingMacId");
--> statement-breakpoint

-- 3. Monthly presence (partitioned yearly by periodStart). The PK is
--    (workspaceId, periodStart, contactInboxId) — one row per contact per
--    period. workspaceMacId is a plain column, NOT part of the key: including
--    it would let the same contact insert twice under two WorkspaceMac ids and
--    double-count the billed MAC.
CREATE TABLE "ContactActiveMonthly" (
  "workspaceId"    bigint                      NOT NULL,
  "contactId"      bigint                      NOT NULL,
  "contactInboxId" bigint                      NOT NULL,
  "periodStart"    timestamp(6) with time zone NOT NULL,
  "inboxId"        bigint                      NOT NULL,
  "billingId"      bigint                      NOT NULL,
  "workspaceMacId" bigint                      NOT NULL,
  PRIMARY KEY ("workspaceId", "periodStart", "contactInboxId")
) PARTITION BY RANGE ("periodStart");
--> statement-breakpoint

CREATE TABLE "ContactActiveMonthly_default" PARTITION OF "ContactActiveMonthly" DEFAULT;
--> statement-breakpoint

-- 4. Initial partition: current year for monthly presence.
DO $$
DECLARE
  curr_year text        := to_char(date_trunc('year', now()), 'YYYY');
  curr_year_start text  := to_char(date_trunc('year', now()), 'YYYY-MM-DD');
  next_year_start text  := to_char(date_trunc('year', now()) + interval '1 year', 'YYYY-MM-DD');
BEGIN
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "ContactActiveMonthly" FOR VALUES FROM (%L) TO (%L)',
    'ContactActiveMonthly_' || curr_year, curr_year_start, next_year_start
  );
END$$;
--> statement-breakpoint

-- 5a. Seed Billing: one open-ended record per workspace owner. periodStart is
--     the owner's earliest owned-workspace createdAt, truncated to the minute.
--     IDs follow the Snowflake bit layout (epoch-ms << 22 | seq) using the full
--     Unix epoch, keeping them clear of app-generated (2026-epoch) IDs.
INSERT INTO "Billing" ("id", "createdAt", "updatedAt", "userId", "periodStart", "periodEnd", "status", "meta")
SELECT
  (extract(epoch FROM now())::bigint * 1000) * 4194304 + (row_number() OVER (ORDER BY ow.user_id)),
  now(),
  now(),
  ow.user_id,
  ow.period_start,
  NULL,
  'active',
  '{}'::jsonb
FROM (
  SELECT
    wm."userId" AS user_id,
    min(date_trunc('minute', w."createdAt")) AS period_start
  FROM "Workspace" w
  JOIN "WorkspaceMember" wm
    ON wm."workspaceId" = w."id" AND wm."role" = 'owner'
  GROUP BY wm."userId"
) ow;
--> statement-breakpoint

-- 5b. Backfill BillingMac: one current-period row per Billing record. The
--     anchor is Billing.periodStart truncated to the minute; periodStart is the
--     current period (anchor + N whole months elapsed), periodEnd = +1 month.
INSERT INTO "BillingMac" ("id", "createdAt", "updatedAt", "billingId", "periodStart", "periodEnd", "macCount")
SELECT
  (extract(epoch FROM now())::bigint * 1000) * 4194304 + (row_number() OVER (ORDER BY b."id")),
  now(),
  now(),
  b."id",
  p."periodStart",
  p."periodStart" + interval '1 month',
  0
FROM "Billing" b
CROSS JOIN LATERAL (
  SELECT date_trunc('minute', b."periodStart")
    + make_interval(months =>
        extract(year  FROM age(now(), date_trunc('minute', b."periodStart")))::int * 12
      + extract(month FROM age(now(), date_trunc('minute', b."periodStart")))::int
      ) AS "periodStart"
) p
ON CONFLICT ("billingId", "periodStart", "periodEnd") DO NOTHING;
--> statement-breakpoint

-- 5c. Backfill WorkspaceMac: one row per workspace, joined
--     workspace -> owner -> Billing -> BillingMac. billingMacId is that
--     BillingMac.id; macCount starts at 0.
INSERT INTO "WorkspaceMac" ("id", "createdAt", "updatedAt", "workspaceId", "billingMacId", "macCount")
SELECT DISTINCT ON (w."id")
  (extract(epoch FROM now())::bigint * 1000) * 4194304 + (row_number() OVER (ORDER BY w."id")),
  now(),
  now(),
  w."id",
  bm."id",
  0
FROM "Workspace" w
JOIN "WorkspaceMember" wm
  ON wm."workspaceId" = w."id" AND wm."role" = 'owner'
JOIN "Billing" b
  ON b."userId" = wm."userId"
JOIN "BillingMac" bm
  ON bm."billingId" = b."id"
ORDER BY w."id", b."periodStart" DESC
ON CONFLICT ("workspaceId", "billingMacId") DO NOTHING;
