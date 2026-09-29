-- ContactOnBroadcast is HASH-partitioned into 64 child tables
-- (ContactOnBroadcast_p0 .. ContactOnBroadcast_p63; see
-- drizzle/20260612235000_partition_contact_on_broadcast/migration.sql).
-- Postgres refuses `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
-- directly on a partitioned table/index, so the unsent-order index is
-- built per partition (CONCURRENTLY, one top-level statement each --
-- CONCURRENTLY cannot run inside a DO block or function) and then
-- attached to an `ON ONLY` parent index via `ALTER INDEX ... ATTACH
-- PARTITION`; Postgres marks the parent valid once every partition is
-- attached. The final DROP of the old parent index is plain
-- (non-concurrent): it is metadata-only but takes a brief ACCESS
-- EXCLUSIVE lock on the parent and its partitions, so it runs last.
DO $$
BEGIN
  -- Restart-safe: drop the ContactInbox index only when a prior failed
  -- CONCURRENTLY build left it INVALID, so a re-run never drops and rebuilds
  -- a healthy index (which would leave the audience query without it for the
  -- length of a full rebuild). A plain DROP of an INVALID index is
  -- metadata-only.
  IF EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = to_regclass('"ContactInbox_inboxId_id_idx"')
      AND NOT indisvalid
  ) THEN
    DROP INDEX IF EXISTS "ContactInbox_inboxId_id_idx";
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_id_idx" ON "ContactInbox" USING btree ("inboxId","id");
--> statement-breakpoint
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"ContactOnBroadcast_unsent_order_idx"');
BEGIN
  -- Self-recovery for a re-run: drop only a leftover per-partition child index
  -- that a prior failed CONCURRENTLY build left INVALID and unattached. An
  -- attached child cannot be dropped here (Postgres protects it), and a valid
  -- child is kept.
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"ContactOnBroadcast_p%s_unsent_order_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "ContactOnBroadcast_p%s_unsent_order_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_order_idx" ON ONLY "ContactOnBroadcast" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p0_unsent_order_idx" ON "ContactOnBroadcast_p0" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p1_unsent_order_idx" ON "ContactOnBroadcast_p1" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p2_unsent_order_idx" ON "ContactOnBroadcast_p2" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p3_unsent_order_idx" ON "ContactOnBroadcast_p3" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p4_unsent_order_idx" ON "ContactOnBroadcast_p4" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p5_unsent_order_idx" ON "ContactOnBroadcast_p5" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p6_unsent_order_idx" ON "ContactOnBroadcast_p6" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p7_unsent_order_idx" ON "ContactOnBroadcast_p7" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p8_unsent_order_idx" ON "ContactOnBroadcast_p8" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p9_unsent_order_idx" ON "ContactOnBroadcast_p9" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p10_unsent_order_idx" ON "ContactOnBroadcast_p10" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p11_unsent_order_idx" ON "ContactOnBroadcast_p11" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p12_unsent_order_idx" ON "ContactOnBroadcast_p12" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p13_unsent_order_idx" ON "ContactOnBroadcast_p13" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p14_unsent_order_idx" ON "ContactOnBroadcast_p14" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p15_unsent_order_idx" ON "ContactOnBroadcast_p15" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p16_unsent_order_idx" ON "ContactOnBroadcast_p16" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p17_unsent_order_idx" ON "ContactOnBroadcast_p17" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p18_unsent_order_idx" ON "ContactOnBroadcast_p18" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p19_unsent_order_idx" ON "ContactOnBroadcast_p19" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p20_unsent_order_idx" ON "ContactOnBroadcast_p20" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p21_unsent_order_idx" ON "ContactOnBroadcast_p21" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p22_unsent_order_idx" ON "ContactOnBroadcast_p22" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p23_unsent_order_idx" ON "ContactOnBroadcast_p23" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p24_unsent_order_idx" ON "ContactOnBroadcast_p24" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p25_unsent_order_idx" ON "ContactOnBroadcast_p25" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p26_unsent_order_idx" ON "ContactOnBroadcast_p26" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p27_unsent_order_idx" ON "ContactOnBroadcast_p27" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p28_unsent_order_idx" ON "ContactOnBroadcast_p28" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p29_unsent_order_idx" ON "ContactOnBroadcast_p29" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p30_unsent_order_idx" ON "ContactOnBroadcast_p30" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p31_unsent_order_idx" ON "ContactOnBroadcast_p31" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p32_unsent_order_idx" ON "ContactOnBroadcast_p32" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p33_unsent_order_idx" ON "ContactOnBroadcast_p33" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p34_unsent_order_idx" ON "ContactOnBroadcast_p34" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p35_unsent_order_idx" ON "ContactOnBroadcast_p35" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p36_unsent_order_idx" ON "ContactOnBroadcast_p36" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p37_unsent_order_idx" ON "ContactOnBroadcast_p37" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p38_unsent_order_idx" ON "ContactOnBroadcast_p38" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p39_unsent_order_idx" ON "ContactOnBroadcast_p39" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p40_unsent_order_idx" ON "ContactOnBroadcast_p40" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p41_unsent_order_idx" ON "ContactOnBroadcast_p41" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p42_unsent_order_idx" ON "ContactOnBroadcast_p42" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p43_unsent_order_idx" ON "ContactOnBroadcast_p43" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p44_unsent_order_idx" ON "ContactOnBroadcast_p44" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p45_unsent_order_idx" ON "ContactOnBroadcast_p45" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p46_unsent_order_idx" ON "ContactOnBroadcast_p46" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p47_unsent_order_idx" ON "ContactOnBroadcast_p47" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p48_unsent_order_idx" ON "ContactOnBroadcast_p48" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p49_unsent_order_idx" ON "ContactOnBroadcast_p49" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p50_unsent_order_idx" ON "ContactOnBroadcast_p50" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p51_unsent_order_idx" ON "ContactOnBroadcast_p51" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p52_unsent_order_idx" ON "ContactOnBroadcast_p52" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p53_unsent_order_idx" ON "ContactOnBroadcast_p53" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p54_unsent_order_idx" ON "ContactOnBroadcast_p54" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p55_unsent_order_idx" ON "ContactOnBroadcast_p55" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p56_unsent_order_idx" ON "ContactOnBroadcast_p56" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p57_unsent_order_idx" ON "ContactOnBroadcast_p57" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p58_unsent_order_idx" ON "ContactOnBroadcast_p58" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p59_unsent_order_idx" ON "ContactOnBroadcast_p59" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p60_unsent_order_idx" ON "ContactOnBroadcast_p60" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p61_unsent_order_idx" ON "ContactOnBroadcast_p61" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p62_unsent_order_idx" ON "ContactOnBroadcast_p62" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p63_unsent_order_idx" ON "ContactOnBroadcast_p63" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  -- ATTACH may run inside a loop (unlike CREATE INDEX CONCURRENTLY). Each
  -- attach is guarded so a re-run skips partitions already attached; the
  -- parent index is marked valid by Postgres once all 64 are attached.
  FOR i IN 0..63 LOOP
    child_name := format('ContactOnBroadcast_p%s_unsent_order_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"ContactOnBroadcast_unsent_order_idx"')
    ) THEN
      EXECUTE format(
        'ALTER INDEX "ContactOnBroadcast_unsent_order_idx" ATTACH PARTITION %I',
        child_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"ContactOnBroadcast_unsent_order_idx"'::regclass) THEN
    RAISE EXCEPTION 'ContactOnBroadcast_unsent_order_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "ContactOnBroadcast_unsent_idx";
