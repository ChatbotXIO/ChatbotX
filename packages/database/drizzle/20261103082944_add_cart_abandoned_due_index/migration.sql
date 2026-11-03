-- Partial index for the per-minute abandoned-cart scan (`claimAbandoned`), which
-- reads only carts that hold items and were not reminded yet. A cart is emptied,
-- not deleted, once an order is placed, so the previous index
-- ("Cart_abandoned_scan_idx", `abandonedNotifiedAt IS NULL` only) kept every
-- buyer's empty cart and the scan walked all of them each minute. The predicate
-- is written exactly as in the query so the planner can use the index. The old
-- index is dropped by the next migration.
--
-- Precondition: `jsonb_array_length` raises on a non-array, so no unreminded
-- cart may hold one. Expected result of this query: 0.
--   SELECT count(*) FROM "Cart" WHERE "abandonedNotifiedAt" IS NULL AND jsonb_typeof("items") <> 'array';
--
-- "Cart" is a hot table, so the index is built CONCURRENTLY: this file runs
-- unwrapped and every statement is re-runnable. A failed CONCURRENTLY build
-- leaves an INVALID index that IF NOT EXISTS would skip, so it is dropped first.
-- That plain DROP INDEX needs an ACCESS EXCLUSIVE lock, so only it runs under
-- lock_timeout. The CONCURRENTLY build takes no lock that blocks writers and
-- only waits for older transactions, so it runs without a timeout.
SET lock_timeout = '5s';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Cart_abandoned_due_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Cart_abandoned_due_idx";
  END IF;
END $$;--> statement-breakpoint
RESET lock_timeout;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Cart_abandoned_due_idx" ON "Cart" ("lastActivityAt") WHERE "abandonedNotifiedAt" IS NULL AND jsonb_array_length("items") > 0;
