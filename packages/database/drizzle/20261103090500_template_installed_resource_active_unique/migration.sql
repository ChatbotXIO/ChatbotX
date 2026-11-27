-- Dedupe + unique index on TemplateInstalledResource (installationId, resourceKind, sourceResourceId) WHERE detachedAt IS NULL.
--
-- NON-TRANSACTIONAL: the index is built with the concurrent option so installs
-- are not blocked, which makes run-migrations.mjs run every statement unwrapped.
-- Each statement below is therefore individually re-runnable. If the index build
-- fails (a duplicate was written between the dedupe and the build) it leaves an
-- INVALID index; the statement before the build drops such a leftover, so just
-- re-run the migration.
--
-- Dedupe rule per duplicate group of ACTIVE rows:
--   winner  = wasExisting = false first, then the newest id;
--   merge   = winner gets the most restrictive permissions of the group
--             (allowEdit / allowDelete = AND across the group); it stays active;
--   losers  = NOT deleted: detachedAt is set, so they stop locking and are
--             skipped by uninstall/sync, but stay as an audit trail. Every
--             loser is logged with RAISE NOTICE (id, winner id, resourceId).
--
-- Preflight (read-only) to count groups before applying:
--   SELECT count(*) FROM (SELECT 1 FROM "TemplateInstalledResource"
--     WHERE "detachedAt" IS NULL
--     GROUP BY "installationId", "resourceKind", "sourceResourceId"
--     HAVING count(*) > 1) d;
-- Preflight for unknown resourceKind values (column is text typed in TS to
-- templateResourceKinds; no pgEnum):
--   SELECT "resourceKind", count(*) FROM "TemplateInstalledResource"
--     GROUP BY 1 ORDER BY 2 DESC;  -- compare against partials/template.ts
WITH ranked AS (
  SELECT "id",
    row_number() OVER w_order AS rn,
    count(*) OVER w_group AS group_size,
    bool_and("allowEdit") OVER w_group AS merged_edit,
    bool_and("allowDelete") OVER w_group AS merged_delete
  FROM "TemplateInstalledResource"
  WHERE "detachedAt" IS NULL
  WINDOW w_group AS (PARTITION BY "installationId", "resourceKind", "sourceResourceId"),
    w_order AS (PARTITION BY "installationId", "resourceKind", "sourceResourceId" ORDER BY "wasExisting" ASC, "id" DESC)
)
UPDATE "TemplateInstalledResource" t
SET "allowEdit" = r.merged_edit, "allowDelete" = r.merged_delete
FROM ranked r
WHERE t."id" = r."id" AND r.rn = 1 AND r.group_size > 1
  AND (t."allowEdit" <> r.merged_edit OR t."allowDelete" <> r.merged_delete);--> statement-breakpoint
DO $$
DECLARE loser record;
BEGIN
  FOR loser IN
    WITH ranked AS (
      SELECT "id", "installationId", "resourceKind", "sourceResourceId", "resourceId",
        row_number() OVER w_order AS rn,
        first_value("id") OVER w_order AS winner_id
      FROM "TemplateInstalledResource"
      WHERE "detachedAt" IS NULL
      WINDOW w_order AS (PARTITION BY "installationId", "resourceKind", "sourceResourceId" ORDER BY "wasExisting" ASC, "id" DESC)
    )
    SELECT * FROM ranked WHERE rn > 1
  LOOP
    RAISE NOTICE 'TemplateInstalledResource dedupe: detaching row % (installation %, kind %, source %, resource %) in favour of %',
      loser."id", loser."installationId", loser."resourceKind", loser."sourceResourceId", loser."resourceId", loser.winner_id;
    UPDATE "TemplateInstalledResource" SET "detachedAt" = now() WHERE "id" = loser."id";
  END LOOP;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'TemplateInstalledResource_active_source_key' AND NOT i.indisvalid
  ) THEN
    DROP INDEX "TemplateInstalledResource_active_source_key";
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "TemplateInstalledResource_active_source_key" ON "TemplateInstalledResource" ("installationId","resourceKind","sourceResourceId") WHERE "detachedAt" IS NULL;
