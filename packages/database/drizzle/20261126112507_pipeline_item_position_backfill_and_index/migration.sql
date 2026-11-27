-- Backfill PipelineItem.position with today's board order (createdAt DESC: newest = most negative = top), then validate
-- the CHECK added NOT VALID by the previous migration and build the stage index.
-- CONCURRENTLY cannot run in a transaction, so the migration runs unwrapped (same precedent as
-- 20261125025425_posts_concurrent_indexes): every statement autocommits, which lets the top-level DO block COMMIT per
-- batch. It is not atomic, so each statement is re-runnable: the backfill is idempotent, VALIDATE is a no-op once valid,
-- and a failed index build leaves an INVALID index that IF NOT EXISTS would skip, so the guard drops it first.
-- A re-run only rewrites rows whose position differs, and `done` runs to completion even though only `batch` is read
-- (data-modifying WITH statements always do), so a fully-skipped batch still advances the keyset.
-- Row locks are held per 5k-row batch only: inserts are never blocked, and WAL and replica lag stay bounded per batch.
DO $$
DECLARE
  last_id bigint := 0;
  batch_max bigint;
BEGIN
  LOOP
    PERFORM set_config('lock_timeout', '5s', true);
    WITH batch AS (
      SELECT id FROM "PipelineItem" WHERE id > last_id ORDER BY id LIMIT 5000 FOR UPDATE
    ), done AS (
      UPDATE "PipelineItem" p SET "position" = -(extract(epoch from p."createdAt") * 1000)
      FROM batch
      WHERE p.id = batch.id AND p."position" IS DISTINCT FROM -(extract(epoch from p."createdAt") * 1000)
      RETURNING p.id
    )
    SELECT max(id) INTO batch_max FROM batch;
    EXIT WHEN batch_max IS NULL;
    last_id := batch_max;
    COMMIT;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "PipelineItem" VALIDATE CONSTRAINT "PipelineItem_position_finite_check";--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"PipelineItem_stage_position_idx"') AND NOT indisvalid) THEN
    DROP INDEX "PipelineItem_stage_position_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PipelineItem_stage_position_idx" ON "PipelineItem" ("pipelineId","stageId","position","id");
