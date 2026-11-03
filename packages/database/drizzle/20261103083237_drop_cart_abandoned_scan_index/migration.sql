-- "Cart_abandoned_scan_idx" only served the abandoned-cart scan, which now reads
-- "Cart_abandoned_due_idx" (previous migration). The old index is about 13x
-- larger (it also holds every emptied cart) and is rewritten on every cart edit.
-- Dropped CONCURRENTLY so writers are not blocked; it only waits for older
-- transactions, so there is no lock_timeout. Re-runnable: if interrupted, the
-- old index is left INVALID (the planner ignores it) and IF EXISTS cleans it up.
DROP INDEX CONCURRENTLY IF EXISTS "Cart_abandoned_scan_idx";
