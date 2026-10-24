-- Build "ContactOnBroadcast_conversationId_idx" without locking writes across all 64 HASH partitions.
-- PostgreSQL cannot create a partitioned index concurrently, so each child is
-- built concurrently then attached to an ON ONLY parent index.
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"ContactOnBroadcast_conversationId_idx"');
BEGIN
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"ContactOnBroadcast_p%s_conversationId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "ContactOnBroadcast_p%s_conversationId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_conversationId_idx" ON ONLY "ContactOnBroadcast" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p0_conversationId_idx" ON "ContactOnBroadcast_p0" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p1_conversationId_idx" ON "ContactOnBroadcast_p1" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p2_conversationId_idx" ON "ContactOnBroadcast_p2" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p3_conversationId_idx" ON "ContactOnBroadcast_p3" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p4_conversationId_idx" ON "ContactOnBroadcast_p4" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p5_conversationId_idx" ON "ContactOnBroadcast_p5" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p6_conversationId_idx" ON "ContactOnBroadcast_p6" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p7_conversationId_idx" ON "ContactOnBroadcast_p7" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p8_conversationId_idx" ON "ContactOnBroadcast_p8" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p9_conversationId_idx" ON "ContactOnBroadcast_p9" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p10_conversationId_idx" ON "ContactOnBroadcast_p10" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p11_conversationId_idx" ON "ContactOnBroadcast_p11" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p12_conversationId_idx" ON "ContactOnBroadcast_p12" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p13_conversationId_idx" ON "ContactOnBroadcast_p13" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p14_conversationId_idx" ON "ContactOnBroadcast_p14" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p15_conversationId_idx" ON "ContactOnBroadcast_p15" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p16_conversationId_idx" ON "ContactOnBroadcast_p16" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p17_conversationId_idx" ON "ContactOnBroadcast_p17" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p18_conversationId_idx" ON "ContactOnBroadcast_p18" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p19_conversationId_idx" ON "ContactOnBroadcast_p19" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p20_conversationId_idx" ON "ContactOnBroadcast_p20" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p21_conversationId_idx" ON "ContactOnBroadcast_p21" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p22_conversationId_idx" ON "ContactOnBroadcast_p22" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p23_conversationId_idx" ON "ContactOnBroadcast_p23" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p24_conversationId_idx" ON "ContactOnBroadcast_p24" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p25_conversationId_idx" ON "ContactOnBroadcast_p25" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p26_conversationId_idx" ON "ContactOnBroadcast_p26" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p27_conversationId_idx" ON "ContactOnBroadcast_p27" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p28_conversationId_idx" ON "ContactOnBroadcast_p28" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p29_conversationId_idx" ON "ContactOnBroadcast_p29" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p30_conversationId_idx" ON "ContactOnBroadcast_p30" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p31_conversationId_idx" ON "ContactOnBroadcast_p31" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p32_conversationId_idx" ON "ContactOnBroadcast_p32" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p33_conversationId_idx" ON "ContactOnBroadcast_p33" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p34_conversationId_idx" ON "ContactOnBroadcast_p34" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p35_conversationId_idx" ON "ContactOnBroadcast_p35" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p36_conversationId_idx" ON "ContactOnBroadcast_p36" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p37_conversationId_idx" ON "ContactOnBroadcast_p37" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p38_conversationId_idx" ON "ContactOnBroadcast_p38" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p39_conversationId_idx" ON "ContactOnBroadcast_p39" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p40_conversationId_idx" ON "ContactOnBroadcast_p40" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p41_conversationId_idx" ON "ContactOnBroadcast_p41" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p42_conversationId_idx" ON "ContactOnBroadcast_p42" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p43_conversationId_idx" ON "ContactOnBroadcast_p43" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p44_conversationId_idx" ON "ContactOnBroadcast_p44" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p45_conversationId_idx" ON "ContactOnBroadcast_p45" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p46_conversationId_idx" ON "ContactOnBroadcast_p46" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p47_conversationId_idx" ON "ContactOnBroadcast_p47" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p48_conversationId_idx" ON "ContactOnBroadcast_p48" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p49_conversationId_idx" ON "ContactOnBroadcast_p49" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p50_conversationId_idx" ON "ContactOnBroadcast_p50" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p51_conversationId_idx" ON "ContactOnBroadcast_p51" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p52_conversationId_idx" ON "ContactOnBroadcast_p52" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p53_conversationId_idx" ON "ContactOnBroadcast_p53" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p54_conversationId_idx" ON "ContactOnBroadcast_p54" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p55_conversationId_idx" ON "ContactOnBroadcast_p55" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p56_conversationId_idx" ON "ContactOnBroadcast_p56" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p57_conversationId_idx" ON "ContactOnBroadcast_p57" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p58_conversationId_idx" ON "ContactOnBroadcast_p58" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p59_conversationId_idx" ON "ContactOnBroadcast_p59" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p60_conversationId_idx" ON "ContactOnBroadcast_p60" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p61_conversationId_idx" ON "ContactOnBroadcast_p61" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p62_conversationId_idx" ON "ContactOnBroadcast_p62" USING btree ("conversationId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p63_conversationId_idx" ON "ContactOnBroadcast_p63" USING btree ("conversationId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  FOR i IN 0..63 LOOP
    child_name := format('ContactOnBroadcast_p%s_conversationId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"ContactOnBroadcast_conversationId_idx"')
    ) THEN
      EXECUTE format('ALTER INDEX "ContactOnBroadcast_conversationId_idx" ATTACH PARTITION %I', child_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"ContactOnBroadcast_conversationId_idx"'::regclass) THEN
    RAISE EXCEPTION 'ContactOnBroadcast_conversationId_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint

-- Build "SequenceDispatch_sequenceId_idx" without locking writes across all 64 HASH partitions.
-- PostgreSQL cannot create a partitioned index concurrently, so each child is
-- built concurrently then attached to an ON ONLY parent index.
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"SequenceDispatch_sequenceId_idx"');
BEGIN
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"SequenceDispatch_p%s_sequenceId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "SequenceDispatch_p%s_sequenceId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SequenceDispatch_sequenceId_idx" ON ONLY "SequenceDispatch" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p0_sequenceId_idx" ON "SequenceDispatch_p0" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p1_sequenceId_idx" ON "SequenceDispatch_p1" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p2_sequenceId_idx" ON "SequenceDispatch_p2" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p3_sequenceId_idx" ON "SequenceDispatch_p3" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p4_sequenceId_idx" ON "SequenceDispatch_p4" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p5_sequenceId_idx" ON "SequenceDispatch_p5" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p6_sequenceId_idx" ON "SequenceDispatch_p6" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p7_sequenceId_idx" ON "SequenceDispatch_p7" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p8_sequenceId_idx" ON "SequenceDispatch_p8" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p9_sequenceId_idx" ON "SequenceDispatch_p9" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p10_sequenceId_idx" ON "SequenceDispatch_p10" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p11_sequenceId_idx" ON "SequenceDispatch_p11" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p12_sequenceId_idx" ON "SequenceDispatch_p12" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p13_sequenceId_idx" ON "SequenceDispatch_p13" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p14_sequenceId_idx" ON "SequenceDispatch_p14" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p15_sequenceId_idx" ON "SequenceDispatch_p15" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p16_sequenceId_idx" ON "SequenceDispatch_p16" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p17_sequenceId_idx" ON "SequenceDispatch_p17" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p18_sequenceId_idx" ON "SequenceDispatch_p18" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p19_sequenceId_idx" ON "SequenceDispatch_p19" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p20_sequenceId_idx" ON "SequenceDispatch_p20" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p21_sequenceId_idx" ON "SequenceDispatch_p21" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p22_sequenceId_idx" ON "SequenceDispatch_p22" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p23_sequenceId_idx" ON "SequenceDispatch_p23" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p24_sequenceId_idx" ON "SequenceDispatch_p24" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p25_sequenceId_idx" ON "SequenceDispatch_p25" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p26_sequenceId_idx" ON "SequenceDispatch_p26" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p27_sequenceId_idx" ON "SequenceDispatch_p27" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p28_sequenceId_idx" ON "SequenceDispatch_p28" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p29_sequenceId_idx" ON "SequenceDispatch_p29" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p30_sequenceId_idx" ON "SequenceDispatch_p30" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p31_sequenceId_idx" ON "SequenceDispatch_p31" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p32_sequenceId_idx" ON "SequenceDispatch_p32" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p33_sequenceId_idx" ON "SequenceDispatch_p33" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p34_sequenceId_idx" ON "SequenceDispatch_p34" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p35_sequenceId_idx" ON "SequenceDispatch_p35" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p36_sequenceId_idx" ON "SequenceDispatch_p36" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p37_sequenceId_idx" ON "SequenceDispatch_p37" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p38_sequenceId_idx" ON "SequenceDispatch_p38" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p39_sequenceId_idx" ON "SequenceDispatch_p39" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p40_sequenceId_idx" ON "SequenceDispatch_p40" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p41_sequenceId_idx" ON "SequenceDispatch_p41" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p42_sequenceId_idx" ON "SequenceDispatch_p42" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p43_sequenceId_idx" ON "SequenceDispatch_p43" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p44_sequenceId_idx" ON "SequenceDispatch_p44" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p45_sequenceId_idx" ON "SequenceDispatch_p45" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p46_sequenceId_idx" ON "SequenceDispatch_p46" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p47_sequenceId_idx" ON "SequenceDispatch_p47" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p48_sequenceId_idx" ON "SequenceDispatch_p48" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p49_sequenceId_idx" ON "SequenceDispatch_p49" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p50_sequenceId_idx" ON "SequenceDispatch_p50" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p51_sequenceId_idx" ON "SequenceDispatch_p51" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p52_sequenceId_idx" ON "SequenceDispatch_p52" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p53_sequenceId_idx" ON "SequenceDispatch_p53" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p54_sequenceId_idx" ON "SequenceDispatch_p54" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p55_sequenceId_idx" ON "SequenceDispatch_p55" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p56_sequenceId_idx" ON "SequenceDispatch_p56" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p57_sequenceId_idx" ON "SequenceDispatch_p57" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p58_sequenceId_idx" ON "SequenceDispatch_p58" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p59_sequenceId_idx" ON "SequenceDispatch_p59" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p60_sequenceId_idx" ON "SequenceDispatch_p60" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p61_sequenceId_idx" ON "SequenceDispatch_p61" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p62_sequenceId_idx" ON "SequenceDispatch_p62" USING btree ("sequenceId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p63_sequenceId_idx" ON "SequenceDispatch_p63" USING btree ("sequenceId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  FOR i IN 0..63 LOOP
    child_name := format('SequenceDispatch_p%s_sequenceId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"SequenceDispatch_sequenceId_idx"')
    ) THEN
      EXECUTE format('ALTER INDEX "SequenceDispatch_sequenceId_idx" ATTACH PARTITION %I', child_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"SequenceDispatch_sequenceId_idx"'::regclass) THEN
    RAISE EXCEPTION 'SequenceDispatch_sequenceId_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint

-- Build "SequenceDispatch_stepId_idx" without locking writes across all 64 HASH partitions.
-- PostgreSQL cannot create a partitioned index concurrently, so each child is
-- built concurrently then attached to an ON ONLY parent index.
DO $$
DECLARE
  child_oid oid;
  parent_oid oid := to_regclass('"SequenceDispatch_stepId_idx"');
BEGIN
  FOR i IN 0..63 LOOP
    child_oid := to_regclass(format('"SequenceDispatch_p%s_stepId_idx"', i));
    IF child_oid IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = child_oid AND NOT indisvalid)
      AND (
        parent_oid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = child_oid AND inhparent = parent_oid
        )
      )
    THEN
      EXECUTE format('DROP INDEX IF EXISTS "SequenceDispatch_p%s_stepId_idx"', i);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SequenceDispatch_stepId_idx" ON ONLY "SequenceDispatch" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p0_stepId_idx" ON "SequenceDispatch_p0" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p1_stepId_idx" ON "SequenceDispatch_p1" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p2_stepId_idx" ON "SequenceDispatch_p2" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p3_stepId_idx" ON "SequenceDispatch_p3" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p4_stepId_idx" ON "SequenceDispatch_p4" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p5_stepId_idx" ON "SequenceDispatch_p5" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p6_stepId_idx" ON "SequenceDispatch_p6" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p7_stepId_idx" ON "SequenceDispatch_p7" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p8_stepId_idx" ON "SequenceDispatch_p8" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p9_stepId_idx" ON "SequenceDispatch_p9" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p10_stepId_idx" ON "SequenceDispatch_p10" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p11_stepId_idx" ON "SequenceDispatch_p11" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p12_stepId_idx" ON "SequenceDispatch_p12" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p13_stepId_idx" ON "SequenceDispatch_p13" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p14_stepId_idx" ON "SequenceDispatch_p14" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p15_stepId_idx" ON "SequenceDispatch_p15" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p16_stepId_idx" ON "SequenceDispatch_p16" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p17_stepId_idx" ON "SequenceDispatch_p17" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p18_stepId_idx" ON "SequenceDispatch_p18" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p19_stepId_idx" ON "SequenceDispatch_p19" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p20_stepId_idx" ON "SequenceDispatch_p20" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p21_stepId_idx" ON "SequenceDispatch_p21" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p22_stepId_idx" ON "SequenceDispatch_p22" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p23_stepId_idx" ON "SequenceDispatch_p23" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p24_stepId_idx" ON "SequenceDispatch_p24" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p25_stepId_idx" ON "SequenceDispatch_p25" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p26_stepId_idx" ON "SequenceDispatch_p26" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p27_stepId_idx" ON "SequenceDispatch_p27" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p28_stepId_idx" ON "SequenceDispatch_p28" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p29_stepId_idx" ON "SequenceDispatch_p29" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p30_stepId_idx" ON "SequenceDispatch_p30" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p31_stepId_idx" ON "SequenceDispatch_p31" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p32_stepId_idx" ON "SequenceDispatch_p32" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p33_stepId_idx" ON "SequenceDispatch_p33" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p34_stepId_idx" ON "SequenceDispatch_p34" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p35_stepId_idx" ON "SequenceDispatch_p35" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p36_stepId_idx" ON "SequenceDispatch_p36" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p37_stepId_idx" ON "SequenceDispatch_p37" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p38_stepId_idx" ON "SequenceDispatch_p38" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p39_stepId_idx" ON "SequenceDispatch_p39" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p40_stepId_idx" ON "SequenceDispatch_p40" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p41_stepId_idx" ON "SequenceDispatch_p41" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p42_stepId_idx" ON "SequenceDispatch_p42" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p43_stepId_idx" ON "SequenceDispatch_p43" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p44_stepId_idx" ON "SequenceDispatch_p44" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p45_stepId_idx" ON "SequenceDispatch_p45" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p46_stepId_idx" ON "SequenceDispatch_p46" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p47_stepId_idx" ON "SequenceDispatch_p47" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p48_stepId_idx" ON "SequenceDispatch_p48" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p49_stepId_idx" ON "SequenceDispatch_p49" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p50_stepId_idx" ON "SequenceDispatch_p50" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p51_stepId_idx" ON "SequenceDispatch_p51" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p52_stepId_idx" ON "SequenceDispatch_p52" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p53_stepId_idx" ON "SequenceDispatch_p53" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p54_stepId_idx" ON "SequenceDispatch_p54" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p55_stepId_idx" ON "SequenceDispatch_p55" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p56_stepId_idx" ON "SequenceDispatch_p56" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p57_stepId_idx" ON "SequenceDispatch_p57" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p58_stepId_idx" ON "SequenceDispatch_p58" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p59_stepId_idx" ON "SequenceDispatch_p59" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p60_stepId_idx" ON "SequenceDispatch_p60" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p61_stepId_idx" ON "SequenceDispatch_p61" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p62_stepId_idx" ON "SequenceDispatch_p62" USING btree ("stepId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceDispatch_p63_stepId_idx" ON "SequenceDispatch_p63" USING btree ("stepId");
--> statement-breakpoint
DO $$
DECLARE
  child_name text;
BEGIN
  FOR i IN 0..63 LOOP
    child_name := format('SequenceDispatch_p%s_stepId_idx', i);
    IF NOT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = to_regclass(format('"%s"', child_name))
        AND inhparent = to_regclass('"SequenceDispatch_stepId_idx"')
    ) THEN
      EXECUTE format('ALTER INDEX "SequenceDispatch_stepId_idx" ATTACH PARTITION %I', child_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index WHERE indexrelid = '"SequenceDispatch_stepId_idx"'::regclass) THEN
    RAISE EXCEPTION 'SequenceDispatch_stepId_idx is not valid after attaching all partitions';
  END IF;
END $$;
--> statement-breakpoint
