-- Manual board order within a stage. Metadata-only: a non-volatile default on PG11+ is stored in the catalog, so there
-- is no table rewrite and no NOT NULL scan; the ACCESS EXCLUSIVE lock lasts only the catalog update, bounded by
-- lock_timeout. The default (negative epoch milliseconds) means "newest on top", today's order, so rows written by old
-- code during a rolling deploy stay valid. The CHECK is NOT VALID so adding it scans nothing; the next migration
-- backfills and validates it.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD COLUMN IF NOT EXISTS "position" double precision DEFAULT (-(extract(epoch from now()) * 1000)) NOT NULL;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_position_finite_check" CHECK ("position" > '-Infinity'::float8 AND "position" < 'Infinity'::float8) NOT VALID;
