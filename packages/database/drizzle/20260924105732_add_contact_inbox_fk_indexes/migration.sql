-- Adds a leading index on every `contactInboxId` foreign key whose
-- ON DELETE CASCADE check was seq-scanning the child table. Deleting a
-- ContactInbox row fires `DELETE FROM <child> WHERE "contactInboxId" = $1`
-- per row; with no index on that column each check walks every partition of
-- the child (e.g. the workspace-purge Contact batch, cascading
-- Contact -> ContactInbox -> ContactOnBroadcast).
--
-- All three tables are HASH-partitioned (ContactOnBroadcast 64,
-- SequenceDispatch 64, AutomationThrottle 32 partitions). Postgres refuses
-- `CREATE INDEX CONCURRENTLY` on a partitioned table, and a plain
-- `CREATE INDEX` on the parent takes a SHARE lock on every partition for the
-- whole build (blocking writes). So each index is built per partition
-- (CONCURRENTLY, one top-level statement each -- CONCURRENTLY cannot run inside
-- a DO block), then attached to an `ON ONLY` parent index via
-- `ALTER INDEX ... ATTACH PARTITION`; Postgres marks the parent valid once
-- every partition is attached. Same recipe as
-- drizzle/20260920111706_broadcast_send_order_indexes/migration.sql.
--
-- Every statement is idempotent: this migration runs unwrapped (no
-- transaction) because of CONCURRENTLY, so a failed build must be safely
-- re-runnable end to end.
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"ContactOnBroadcast_contactInboxId_idx"');
BEGIN
  -- Self-recovery for a re-run: drop only a leftover per-partition child index
  -- that a prior failed CONCURRENTLY build left INVALID and unattached. An
  -- attached child cannot be dropped here (Postgres protects it), and a valid
  -- child is kept.
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"ContactOnBroadcast_p%s_contactInboxId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "ContactOnBroadcast_p%s_contactInboxId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_contactInboxId_idx" ON ONLY "ContactOnBroadcast" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p0_contactInboxId_idx" ON "ContactOnBroadcast_p0" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p1_contactInboxId_idx" ON "ContactOnBroadcast_p1" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p2_contactInboxId_idx" ON "ContactOnBroadcast_p2" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p3_contactInboxId_idx" ON "ContactOnBroadcast_p3" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p4_contactInboxId_idx" ON "ContactOnBroadcast_p4" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p5_contactInboxId_idx" ON "ContactOnBroadcast_p5" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p6_contactInboxId_idx" ON "ContactOnBroadcast_p6" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p7_contactInboxId_idx" ON "ContactOnBroadcast_p7" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p8_contactInboxId_idx" ON "ContactOnBroadcast_p8" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p9_contactInboxId_idx" ON "ContactOnBroadcast_p9" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p10_contactInboxId_idx" ON "ContactOnBroadcast_p10" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p11_contactInboxId_idx" ON "ContactOnBroadcast_p11" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p12_contactInboxId_idx" ON "ContactOnBroadcast_p12" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p13_contactInboxId_idx" ON "ContactOnBroadcast_p13" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p14_contactInboxId_idx" ON "ContactOnBroadcast_p14" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p15_contactInboxId_idx" ON "ContactOnBroadcast_p15" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p16_contactInboxId_idx" ON "ContactOnBroadcast_p16" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p17_contactInboxId_idx" ON "ContactOnBroadcast_p17" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p18_contactInboxId_idx" ON "ContactOnBroadcast_p18" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p19_contactInboxId_idx" ON "ContactOnBroadcast_p19" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p20_contactInboxId_idx" ON "ContactOnBroadcast_p20" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p21_contactInboxId_idx" ON "ContactOnBroadcast_p21" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p22_contactInboxId_idx" ON "ContactOnBroadcast_p22" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p23_contactInboxId_idx" ON "ContactOnBroadcast_p23" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p24_contactInboxId_idx" ON "ContactOnBroadcast_p24" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p25_contactInboxId_idx" ON "ContactOnBroadcast_p25" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p26_contactInboxId_idx" ON "ContactOnBroadcast_p26" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p27_contactInboxId_idx" ON "ContactOnBroadcast_p27" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p28_contactInboxId_idx" ON "ContactOnBroadcast_p28" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p29_contactInboxId_idx" ON "ContactOnBroadcast_p29" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p30_contactInboxId_idx" ON "ContactOnBroadcast_p30" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p31_contactInboxId_idx" ON "ContactOnBroadcast_p31" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p32_contactInboxId_idx" ON "ContactOnBroadcast_p32" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p33_contactInboxId_idx" ON "ContactOnBroadcast_p33" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p34_contactInboxId_idx" ON "ContactOnBroadcast_p34" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p35_contactInboxId_idx" ON "ContactOnBroadcast_p35" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p36_contactInboxId_idx" ON "ContactOnBroadcast_p36" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p37_contactInboxId_idx" ON "ContactOnBroadcast_p37" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p38_contactInboxId_idx" ON "ContactOnBroadcast_p38" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p39_contactInboxId_idx" ON "ContactOnBroadcast_p39" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p40_contactInboxId_idx" ON "ContactOnBroadcast_p40" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p41_contactInboxId_idx" ON "ContactOnBroadcast_p41" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p42_contactInboxId_idx" ON "ContactOnBroadcast_p42" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p43_contactInboxId_idx" ON "ContactOnBroadcast_p43" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p44_contactInboxId_idx" ON "ContactOnBroadcast_p44" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p45_contactInboxId_idx" ON "ContactOnBroadcast_p45" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p46_contactInboxId_idx" ON "ContactOnBroadcast_p46" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p47_contactInboxId_idx" ON "ContactOnBroadcast_p47" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p48_contactInboxId_idx" ON "ContactOnBroadcast_p48" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p49_contactInboxId_idx" ON "ContactOnBroadcast_p49" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p50_contactInboxId_idx" ON "ContactOnBroadcast_p50" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p51_contactInboxId_idx" ON "ContactOnBroadcast_p51" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p52_contactInboxId_idx" ON "ContactOnBroadcast_p52" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p53_contactInboxId_idx" ON "ContactOnBroadcast_p53" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p54_contactInboxId_idx" ON "ContactOnBroadcast_p54" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p55_contactInboxId_idx" ON "ContactOnBroadcast_p55" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p56_contactInboxId_idx" ON "ContactOnBroadcast_p56" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p57_contactInboxId_idx" ON "ContactOnBroadcast_p57" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p58_contactInboxId_idx" ON "ContactOnBroadcast_p58" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p59_contactInboxId_idx" ON "ContactOnBroadcast_p59" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p60_contactInboxId_idx" ON "ContactOnBroadcast_p60" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p61_contactInboxId_idx" ON "ContactOnBroadcast_p61" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p62_contactInboxId_idx" ON "ContactOnBroadcast_p62" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p63_contactInboxId_idx" ON "ContactOnBroadcast_p63" USING btree ("contactInboxId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  -- ATTACH may run inside a loop (unlike CREATE INDEX CONCURRENTLY). Each
  -- attach is guarded so a re-run skips partitions already attached; the
  -- parent index is marked valid by Postgres once all 64 are attached.
  FOR i IN 0..63 LOOP
    child_name := format('ContactOnBroadcast_p%s_contactInboxId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"ContactOnBroadcast_contactInboxId_idx"')
    ) THEN
      EXECUTE format(
        'ALTER INDEX "ContactOnBroadcast_contactInboxId_idx" ATTACH PARTITION %I',
        child_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"ContactOnBroadcast_contactInboxId_idx"'::regclass) THEN
    RAISE EXCEPTION 'ContactOnBroadcast_contactInboxId_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"SequenceDispatch_contactInboxId_idx"');
BEGIN
  -- Self-recovery for a re-run: drop only a leftover per-partition child index
  -- that a prior failed CONCURRENTLY build left INVALID and unattached. An
  -- attached child cannot be dropped here (Postgres protects it), and a valid
  -- child is kept.
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"SequenceDispatch_p%s_contactInboxId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "SequenceDispatch_p%s_contactInboxId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SequenceDispatch_contactInboxId_idx" ON ONLY "SequenceDispatch" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p0_contactInboxId_idx" ON "SequenceDispatch_p0" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p1_contactInboxId_idx" ON "SequenceDispatch_p1" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p2_contactInboxId_idx" ON "SequenceDispatch_p2" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p3_contactInboxId_idx" ON "SequenceDispatch_p3" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p4_contactInboxId_idx" ON "SequenceDispatch_p4" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p5_contactInboxId_idx" ON "SequenceDispatch_p5" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p6_contactInboxId_idx" ON "SequenceDispatch_p6" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p7_contactInboxId_idx" ON "SequenceDispatch_p7" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p8_contactInboxId_idx" ON "SequenceDispatch_p8" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p9_contactInboxId_idx" ON "SequenceDispatch_p9" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p10_contactInboxId_idx" ON "SequenceDispatch_p10" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p11_contactInboxId_idx" ON "SequenceDispatch_p11" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p12_contactInboxId_idx" ON "SequenceDispatch_p12" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p13_contactInboxId_idx" ON "SequenceDispatch_p13" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p14_contactInboxId_idx" ON "SequenceDispatch_p14" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p15_contactInboxId_idx" ON "SequenceDispatch_p15" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p16_contactInboxId_idx" ON "SequenceDispatch_p16" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p17_contactInboxId_idx" ON "SequenceDispatch_p17" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p18_contactInboxId_idx" ON "SequenceDispatch_p18" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p19_contactInboxId_idx" ON "SequenceDispatch_p19" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p20_contactInboxId_idx" ON "SequenceDispatch_p20" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p21_contactInboxId_idx" ON "SequenceDispatch_p21" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p22_contactInboxId_idx" ON "SequenceDispatch_p22" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p23_contactInboxId_idx" ON "SequenceDispatch_p23" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p24_contactInboxId_idx" ON "SequenceDispatch_p24" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p25_contactInboxId_idx" ON "SequenceDispatch_p25" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p26_contactInboxId_idx" ON "SequenceDispatch_p26" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p27_contactInboxId_idx" ON "SequenceDispatch_p27" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p28_contactInboxId_idx" ON "SequenceDispatch_p28" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p29_contactInboxId_idx" ON "SequenceDispatch_p29" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p30_contactInboxId_idx" ON "SequenceDispatch_p30" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p31_contactInboxId_idx" ON "SequenceDispatch_p31" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p32_contactInboxId_idx" ON "SequenceDispatch_p32" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p33_contactInboxId_idx" ON "SequenceDispatch_p33" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p34_contactInboxId_idx" ON "SequenceDispatch_p34" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p35_contactInboxId_idx" ON "SequenceDispatch_p35" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p36_contactInboxId_idx" ON "SequenceDispatch_p36" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p37_contactInboxId_idx" ON "SequenceDispatch_p37" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p38_contactInboxId_idx" ON "SequenceDispatch_p38" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p39_contactInboxId_idx" ON "SequenceDispatch_p39" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p40_contactInboxId_idx" ON "SequenceDispatch_p40" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p41_contactInboxId_idx" ON "SequenceDispatch_p41" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p42_contactInboxId_idx" ON "SequenceDispatch_p42" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p43_contactInboxId_idx" ON "SequenceDispatch_p43" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p44_contactInboxId_idx" ON "SequenceDispatch_p44" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p45_contactInboxId_idx" ON "SequenceDispatch_p45" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p46_contactInboxId_idx" ON "SequenceDispatch_p46" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p47_contactInboxId_idx" ON "SequenceDispatch_p47" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p48_contactInboxId_idx" ON "SequenceDispatch_p48" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p49_contactInboxId_idx" ON "SequenceDispatch_p49" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p50_contactInboxId_idx" ON "SequenceDispatch_p50" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p51_contactInboxId_idx" ON "SequenceDispatch_p51" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p52_contactInboxId_idx" ON "SequenceDispatch_p52" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p53_contactInboxId_idx" ON "SequenceDispatch_p53" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p54_contactInboxId_idx" ON "SequenceDispatch_p54" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p55_contactInboxId_idx" ON "SequenceDispatch_p55" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p56_contactInboxId_idx" ON "SequenceDispatch_p56" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p57_contactInboxId_idx" ON "SequenceDispatch_p57" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p58_contactInboxId_idx" ON "SequenceDispatch_p58" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p59_contactInboxId_idx" ON "SequenceDispatch_p59" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p60_contactInboxId_idx" ON "SequenceDispatch_p60" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p61_contactInboxId_idx" ON "SequenceDispatch_p61" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p62_contactInboxId_idx" ON "SequenceDispatch_p62" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p63_contactInboxId_idx" ON "SequenceDispatch_p63" USING btree ("contactInboxId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  -- ATTACH may run inside a loop (unlike CREATE INDEX CONCURRENTLY). Each
  -- attach is guarded so a re-run skips partitions already attached; the
  -- parent index is marked valid by Postgres once all 64 are attached.
  FOR i IN 0..63 LOOP
    child_name := format('SequenceDispatch_p%s_contactInboxId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"SequenceDispatch_contactInboxId_idx"')
    ) THEN
      EXECUTE format(
        'ALTER INDEX "SequenceDispatch_contactInboxId_idx" ATTACH PARTITION %I',
        child_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"SequenceDispatch_contactInboxId_idx"'::regclass) THEN
    RAISE EXCEPTION 'SequenceDispatch_contactInboxId_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"AutomationThrottle_contactInboxId_idx"');
BEGIN
  -- Self-recovery for a re-run: drop only a leftover per-partition child index
  -- that a prior failed CONCURRENTLY build left INVALID and unattached. An
  -- attached child cannot be dropped here (Postgres protects it), and a valid
  -- child is kept.
  FOR i IN 0..31 LOOP
    child_oid := to_regclass(format('"AutomationThrottle_p%s_contactInboxId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "AutomationThrottle_p%s_contactInboxId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AutomationThrottle_contactInboxId_idx" ON ONLY "AutomationThrottle" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p0_contactInboxId_idx" ON "AutomationThrottle_p0" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p1_contactInboxId_idx" ON "AutomationThrottle_p1" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p2_contactInboxId_idx" ON "AutomationThrottle_p2" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p3_contactInboxId_idx" ON "AutomationThrottle_p3" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p4_contactInboxId_idx" ON "AutomationThrottle_p4" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p5_contactInboxId_idx" ON "AutomationThrottle_p5" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p6_contactInboxId_idx" ON "AutomationThrottle_p6" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p7_contactInboxId_idx" ON "AutomationThrottle_p7" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p8_contactInboxId_idx" ON "AutomationThrottle_p8" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p9_contactInboxId_idx" ON "AutomationThrottle_p9" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p10_contactInboxId_idx" ON "AutomationThrottle_p10" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p11_contactInboxId_idx" ON "AutomationThrottle_p11" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p12_contactInboxId_idx" ON "AutomationThrottle_p12" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p13_contactInboxId_idx" ON "AutomationThrottle_p13" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p14_contactInboxId_idx" ON "AutomationThrottle_p14" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p15_contactInboxId_idx" ON "AutomationThrottle_p15" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p16_contactInboxId_idx" ON "AutomationThrottle_p16" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p17_contactInboxId_idx" ON "AutomationThrottle_p17" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p18_contactInboxId_idx" ON "AutomationThrottle_p18" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p19_contactInboxId_idx" ON "AutomationThrottle_p19" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p20_contactInboxId_idx" ON "AutomationThrottle_p20" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p21_contactInboxId_idx" ON "AutomationThrottle_p21" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p22_contactInboxId_idx" ON "AutomationThrottle_p22" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p23_contactInboxId_idx" ON "AutomationThrottle_p23" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p24_contactInboxId_idx" ON "AutomationThrottle_p24" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p25_contactInboxId_idx" ON "AutomationThrottle_p25" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p26_contactInboxId_idx" ON "AutomationThrottle_p26" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p27_contactInboxId_idx" ON "AutomationThrottle_p27" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p28_contactInboxId_idx" ON "AutomationThrottle_p28" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p29_contactInboxId_idx" ON "AutomationThrottle_p29" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p30_contactInboxId_idx" ON "AutomationThrottle_p30" USING btree ("contactInboxId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationThrottle_p31_contactInboxId_idx" ON "AutomationThrottle_p31" USING btree ("contactInboxId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  -- ATTACH may run inside a loop (unlike CREATE INDEX CONCURRENTLY). Each
  -- attach is guarded so a re-run skips partitions already attached; the
  -- parent index is marked valid by Postgres once all 32 are attached.
  FOR i IN 0..31 LOOP
    child_name := format('AutomationThrottle_p%s_contactInboxId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"AutomationThrottle_contactInboxId_idx"')
    ) THEN
      EXECUTE format(
        'ALTER INDEX "AutomationThrottle_contactInboxId_idx" ATTACH PARTITION %I',
        child_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"AutomationThrottle_contactInboxId_idx"'::regclass) THEN
    RAISE EXCEPTION 'AutomationThrottle_contactInboxId_idx is not valid after attaching all partitions';
  END IF;
END $$;
