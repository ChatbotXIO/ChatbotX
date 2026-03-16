-- NOTE: This migration adds sequence feature with partitioned tables
-- WARNING: Dropping tables will delete all sequence-related data.

-- Drop existing tables if they exist (for re-runnable migrations in dev)
DROP TABLE IF EXISTS "SequenceDispatch" CASCADE;
DROP TABLE IF EXISTS "SequenceEvent" CASCADE;
DROP TABLE IF EXISTS "ContactsOnSequence" CASCADE;
DROP TABLE IF EXISTS "SequenceStep" CASCADE;
DROP TABLE IF EXISTS "Sequence" CASCADE;

-- Add 'sequence' value to FolderType enum if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'FolderType' AND e.enumlabel = 'sequence') THEN
    ALTER TYPE "FolderType" ADD VALUE 'sequence';
  END IF;
END $$;

-- CreateTable: Sequence
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chatbotId" TEXT NOT NULL,
    "createdAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SequenceStep
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "createdAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "delayUnit" TEXT DEFAULT 'days',
    "specificDateTime" timestamp(6) with time zone,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "anytime" BOOLEAN NOT NULL DEFAULT true,
    "sendTimeStart" TEXT,
    "sendTimeEnd" TEXT,
    "sendDays" TEXT DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    "flowId" TEXT,
    "sequenceId" TEXT NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ContactsOnSequence (partitioned by HASH on chatbotId, 64 buckets)
CREATE TABLE "ContactsOnSequence" (
    "id" TEXT NOT NULL,
    "createdAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolledAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" timestamp(6) with time zone,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextRunAt" timestamp(6) with time zone,
    "lastStepId" TEXT,
    "nextStepId" TEXT,
    "lockedAt" timestamp(6) with time zone,
    "lockOwner" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "contactId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "ContactsOnSequence_pkey" PRIMARY KEY ("id", "chatbotId")
) PARTITION BY HASH ("chatbotId");

-- Create 64 partitions for ContactsOnSequence
CREATE TABLE "ContactsOnSequence_p00" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE "ContactsOnSequence_p01" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 1);
CREATE TABLE "ContactsOnSequence_p02" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 2);
CREATE TABLE "ContactsOnSequence_p03" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 3);
CREATE TABLE "ContactsOnSequence_p04" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 4);
CREATE TABLE "ContactsOnSequence_p05" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 5);
CREATE TABLE "ContactsOnSequence_p06" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 6);
CREATE TABLE "ContactsOnSequence_p07" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 7);
CREATE TABLE "ContactsOnSequence_p08" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 8);
CREATE TABLE "ContactsOnSequence_p09" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 9);
CREATE TABLE "ContactsOnSequence_p10" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 10);
CREATE TABLE "ContactsOnSequence_p11" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 11);
CREATE TABLE "ContactsOnSequence_p12" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 12);
CREATE TABLE "ContactsOnSequence_p13" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 13);
CREATE TABLE "ContactsOnSequence_p14" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 14);
CREATE TABLE "ContactsOnSequence_p15" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 15);
CREATE TABLE "ContactsOnSequence_p16" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 16);
CREATE TABLE "ContactsOnSequence_p17" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 17);
CREATE TABLE "ContactsOnSequence_p18" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 18);
CREATE TABLE "ContactsOnSequence_p19" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 19);
CREATE TABLE "ContactsOnSequence_p20" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 20);
CREATE TABLE "ContactsOnSequence_p21" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 21);
CREATE TABLE "ContactsOnSequence_p22" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 22);
CREATE TABLE "ContactsOnSequence_p23" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 23);
CREATE TABLE "ContactsOnSequence_p24" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 24);
CREATE TABLE "ContactsOnSequence_p25" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 25);
CREATE TABLE "ContactsOnSequence_p26" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 26);
CREATE TABLE "ContactsOnSequence_p27" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 27);
CREATE TABLE "ContactsOnSequence_p28" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 28);
CREATE TABLE "ContactsOnSequence_p29" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 29);
CREATE TABLE "ContactsOnSequence_p30" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 30);
CREATE TABLE "ContactsOnSequence_p31" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 31);
CREATE TABLE "ContactsOnSequence_p32" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 32);
CREATE TABLE "ContactsOnSequence_p33" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 33);
CREATE TABLE "ContactsOnSequence_p34" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 34);
CREATE TABLE "ContactsOnSequence_p35" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 35);
CREATE TABLE "ContactsOnSequence_p36" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 36);
CREATE TABLE "ContactsOnSequence_p37" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 37);
CREATE TABLE "ContactsOnSequence_p38" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 38);
CREATE TABLE "ContactsOnSequence_p39" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 39);
CREATE TABLE "ContactsOnSequence_p40" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 40);
CREATE TABLE "ContactsOnSequence_p41" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 41);
CREATE TABLE "ContactsOnSequence_p42" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 42);
CREATE TABLE "ContactsOnSequence_p43" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 43);
CREATE TABLE "ContactsOnSequence_p44" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 44);
CREATE TABLE "ContactsOnSequence_p45" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 45);
CREATE TABLE "ContactsOnSequence_p46" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 46);
CREATE TABLE "ContactsOnSequence_p47" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 47);
CREATE TABLE "ContactsOnSequence_p48" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 48);
CREATE TABLE "ContactsOnSequence_p49" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 49);
CREATE TABLE "ContactsOnSequence_p50" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 50);
CREATE TABLE "ContactsOnSequence_p51" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 51);
CREATE TABLE "ContactsOnSequence_p52" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 52);
CREATE TABLE "ContactsOnSequence_p53" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 53);
CREATE TABLE "ContactsOnSequence_p54" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 54);
CREATE TABLE "ContactsOnSequence_p55" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 55);
CREATE TABLE "ContactsOnSequence_p56" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 56);
CREATE TABLE "ContactsOnSequence_p57" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 57);
CREATE TABLE "ContactsOnSequence_p58" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 58);
CREATE TABLE "ContactsOnSequence_p59" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 59);
CREATE TABLE "ContactsOnSequence_p60" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 60);
CREATE TABLE "ContactsOnSequence_p61" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 61);
CREATE TABLE "ContactsOnSequence_p62" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 62);
CREATE TABLE "ContactsOnSequence_p63" PARTITION OF "ContactsOnSequence" FOR VALUES WITH (MODULUS 64, REMAINDER 63);

-- CreateTable: SequenceEvent (partitioned by HASH on chatbotId, 64 buckets)
CREATE TABLE "SequenceEvent" (
    "id" TEXT NOT NULL,
    "createdAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "chatbotId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepId" TEXT,
    "dispatchId" TEXT,

    CONSTRAINT "SequenceEvent_pkey" PRIMARY KEY ("id", "chatbotId")
) PARTITION BY HASH ("chatbotId");

-- Create 64 partitions for SequenceEvent
CREATE TABLE "SequenceEvent_p00" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE "SequenceEvent_p01" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 1);
CREATE TABLE "SequenceEvent_p02" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 2);
CREATE TABLE "SequenceEvent_p03" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 3);
CREATE TABLE "SequenceEvent_p04" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 4);
CREATE TABLE "SequenceEvent_p05" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 5);
CREATE TABLE "SequenceEvent_p06" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 6);
CREATE TABLE "SequenceEvent_p07" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 7);
CREATE TABLE "SequenceEvent_p08" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 8);
CREATE TABLE "SequenceEvent_p09" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 9);
CREATE TABLE "SequenceEvent_p10" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 10);
CREATE TABLE "SequenceEvent_p11" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 11);
CREATE TABLE "SequenceEvent_p12" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 12);
CREATE TABLE "SequenceEvent_p13" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 13);
CREATE TABLE "SequenceEvent_p14" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 14);
CREATE TABLE "SequenceEvent_p15" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 15);
CREATE TABLE "SequenceEvent_p16" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 16);
CREATE TABLE "SequenceEvent_p17" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 17);
CREATE TABLE "SequenceEvent_p18" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 18);
CREATE TABLE "SequenceEvent_p19" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 19);
CREATE TABLE "SequenceEvent_p20" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 20);
CREATE TABLE "SequenceEvent_p21" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 21);
CREATE TABLE "SequenceEvent_p22" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 22);
CREATE TABLE "SequenceEvent_p23" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 23);
CREATE TABLE "SequenceEvent_p24" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 24);
CREATE TABLE "SequenceEvent_p25" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 25);
CREATE TABLE "SequenceEvent_p26" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 26);
CREATE TABLE "SequenceEvent_p27" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 27);
CREATE TABLE "SequenceEvent_p28" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 28);
CREATE TABLE "SequenceEvent_p29" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 29);
CREATE TABLE "SequenceEvent_p30" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 30);
CREATE TABLE "SequenceEvent_p31" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 31);
CREATE TABLE "SequenceEvent_p32" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 32);
CREATE TABLE "SequenceEvent_p33" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 33);
CREATE TABLE "SequenceEvent_p34" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 34);
CREATE TABLE "SequenceEvent_p35" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 35);
CREATE TABLE "SequenceEvent_p36" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 36);
CREATE TABLE "SequenceEvent_p37" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 37);
CREATE TABLE "SequenceEvent_p38" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 38);
CREATE TABLE "SequenceEvent_p39" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 39);
CREATE TABLE "SequenceEvent_p40" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 40);
CREATE TABLE "SequenceEvent_p41" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 41);
CREATE TABLE "SequenceEvent_p42" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 42);
CREATE TABLE "SequenceEvent_p43" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 43);
CREATE TABLE "SequenceEvent_p44" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 44);
CREATE TABLE "SequenceEvent_p45" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 45);
CREATE TABLE "SequenceEvent_p46" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 46);
CREATE TABLE "SequenceEvent_p47" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 47);
CREATE TABLE "SequenceEvent_p48" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 48);
CREATE TABLE "SequenceEvent_p49" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 49);
CREATE TABLE "SequenceEvent_p50" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 50);
CREATE TABLE "SequenceEvent_p51" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 51);
CREATE TABLE "SequenceEvent_p52" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 52);
CREATE TABLE "SequenceEvent_p53" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 53);
CREATE TABLE "SequenceEvent_p54" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 54);
CREATE TABLE "SequenceEvent_p55" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 55);
CREATE TABLE "SequenceEvent_p56" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 56);
CREATE TABLE "SequenceEvent_p57" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 57);
CREATE TABLE "SequenceEvent_p58" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 58);
CREATE TABLE "SequenceEvent_p59" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 59);
CREATE TABLE "SequenceEvent_p60" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 60);
CREATE TABLE "SequenceEvent_p61" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 61);
CREATE TABLE "SequenceEvent_p62" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 62);
CREATE TABLE "SequenceEvent_p63" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 63);

-- CreateTable: SequenceDispatch (partitioned by HASH on chatbotId, 64 buckets)
CREATE TABLE "SequenceDispatch" (
    "id" TEXT NOT NULL,
    "createdAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runAtMs" BIGINT NOT NULL DEFAULT 0,
    "bucket" SMALLINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" timestamp(6) with time zone,
    "lockOwner" TEXT,
    "completedAt" timestamp(6) with time zone,
    "chatbotId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,

    CONSTRAINT "SequenceDispatch_pkey" PRIMARY KEY ("id", "chatbotId")
) PARTITION BY HASH ("chatbotId");

-- Create 64 partitions for SequenceDispatch
CREATE TABLE "SequenceDispatch_p00" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE "SequenceDispatch_p01" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 1);
CREATE TABLE "SequenceDispatch_p02" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 2);
CREATE TABLE "SequenceDispatch_p03" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 3);
CREATE TABLE "SequenceDispatch_p04" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 4);
CREATE TABLE "SequenceDispatch_p05" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 5);
CREATE TABLE "SequenceDispatch_p06" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 6);
CREATE TABLE "SequenceDispatch_p07" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 7);
CREATE TABLE "SequenceDispatch_p08" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 8);
CREATE TABLE "SequenceDispatch_p09" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 9);
CREATE TABLE "SequenceDispatch_p10" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 10);
CREATE TABLE "SequenceDispatch_p11" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 11);
CREATE TABLE "SequenceDispatch_p12" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 12);
CREATE TABLE "SequenceDispatch_p13" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 13);
CREATE TABLE "SequenceDispatch_p14" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 14);
CREATE TABLE "SequenceDispatch_p15" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 15);
CREATE TABLE "SequenceDispatch_p16" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 16);
CREATE TABLE "SequenceDispatch_p17" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 17);
CREATE TABLE "SequenceDispatch_p18" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 18);
CREATE TABLE "SequenceDispatch_p19" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 19);
CREATE TABLE "SequenceDispatch_p20" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 20);
CREATE TABLE "SequenceDispatch_p21" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 21);
CREATE TABLE "SequenceDispatch_p22" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 22);
CREATE TABLE "SequenceDispatch_p23" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 23);
CREATE TABLE "SequenceDispatch_p24" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 24);
CREATE TABLE "SequenceDispatch_p25" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 25);
CREATE TABLE "SequenceDispatch_p26" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 26);
CREATE TABLE "SequenceDispatch_p27" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 27);
CREATE TABLE "SequenceDispatch_p28" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 28);
CREATE TABLE "SequenceDispatch_p29" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 29);
CREATE TABLE "SequenceDispatch_p30" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 30);
CREATE TABLE "SequenceDispatch_p31" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 31);
CREATE TABLE "SequenceDispatch_p32" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 32);
CREATE TABLE "SequenceDispatch_p33" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 33);
CREATE TABLE "SequenceDispatch_p34" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 34);
CREATE TABLE "SequenceDispatch_p35" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 35);
CREATE TABLE "SequenceDispatch_p36" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 36);
CREATE TABLE "SequenceDispatch_p37" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 37);
CREATE TABLE "SequenceDispatch_p38" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 38);
CREATE TABLE "SequenceDispatch_p39" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 39);
CREATE TABLE "SequenceDispatch_p40" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 40);
CREATE TABLE "SequenceDispatch_p41" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 41);
CREATE TABLE "SequenceDispatch_p42" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 42);
CREATE TABLE "SequenceDispatch_p43" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 43);
CREATE TABLE "SequenceDispatch_p44" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 44);
CREATE TABLE "SequenceDispatch_p45" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 45);
CREATE TABLE "SequenceDispatch_p46" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 46);
CREATE TABLE "SequenceDispatch_p47" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 47);
CREATE TABLE "SequenceDispatch_p48" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 48);
CREATE TABLE "SequenceDispatch_p49" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 49);
CREATE TABLE "SequenceDispatch_p50" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 50);
CREATE TABLE "SequenceDispatch_p51" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 51);
CREATE TABLE "SequenceDispatch_p52" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 52);
CREATE TABLE "SequenceDispatch_p53" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 53);
CREATE TABLE "SequenceDispatch_p54" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 54);
CREATE TABLE "SequenceDispatch_p55" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 55);
CREATE TABLE "SequenceDispatch_p56" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 56);
CREATE TABLE "SequenceDispatch_p57" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 57);
CREATE TABLE "SequenceDispatch_p58" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 58);
CREATE TABLE "SequenceDispatch_p59" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 59);
CREATE TABLE "SequenceDispatch_p60" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 60);
CREATE TABLE "SequenceDispatch_p61" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 61);
CREATE TABLE "SequenceDispatch_p62" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 62);
CREATE TABLE "SequenceDispatch_p63" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 63);

-- CreateIndex for Sequence
CREATE INDEX "Sequence_folderId_idx" ON "Sequence"("folderId");
CREATE UNIQUE INDEX "Sequence_chatbotId_name_key" ON "Sequence"("chatbotId", "name");

-- CreateIndex for SequenceStep
CREATE INDEX "SequenceStep_sequenceId_idx" ON "SequenceStep"("sequenceId");
CREATE INDEX "SequenceStep_flowId_idx" ON "SequenceStep"("flowId");

-- CreateIndex for ContactsOnSequence
CREATE INDEX "ContactsOnSequence_sequenceId_idx" ON "ContactsOnSequence"("sequenceId");
CREATE INDEX "ContactsOnSequence_contactId_idx" ON "ContactsOnSequence"("contactId");
CREATE INDEX "ContactsOnSequence_chatbotId_idx" ON "ContactsOnSequence"("chatbotId");
CREATE INDEX "ContactsOnSequence_status_nextRunAt_idx" ON "ContactsOnSequence"("status", "nextRunAt") WHERE "nextRunAt" IS NOT NULL;
CREATE INDEX "ContactsOnSequence_chatbotId_status_nextRunAt_idx" ON "ContactsOnSequence"("chatbotId", "status", "nextRunAt") WHERE "nextRunAt" IS NOT NULL;
CREATE UNIQUE INDEX "ContactsOnSequence_contactId_sequenceId_chatbotId_key" ON "ContactsOnSequence"("contactId", "sequenceId", "chatbotId");

-- CreateIndex for SequenceEvent
CREATE INDEX "SequenceEvent_chatbotId_occurredAt_idx" ON "SequenceEvent"("chatbotId", "occurredAt");
CREATE INDEX "SequenceEvent_contactId_occurredAt_idx" ON "SequenceEvent"("contactId", "occurredAt");
CREATE INDEX "SequenceEvent_sequenceId_eventType_idx" ON "SequenceEvent"("sequenceId", "eventType");

-- CreateIndex for SequenceDispatch (critical for scheduler)
CREATE INDEX "SequenceDispatch_status_runAtMs_idx" ON "SequenceDispatch"("status", "runAtMs") WHERE "status" IN ('pending', 'running');
CREATE INDEX "SequenceDispatch_chatbotId_status_runAtMs_idx" ON "SequenceDispatch"("chatbotId", "status", "runAtMs") WHERE "status" IN ('pending', 'running');
CREATE UNIQUE INDEX "SequenceDispatch_idempotencyKey_key" ON "SequenceDispatch"("idempotencyKey", "chatbotId");
CREATE INDEX "SequenceDispatch_enrollmentId_idx" ON "SequenceDispatch"("enrollmentId");
CREATE INDEX "SequenceDispatch_bucket_status_runAtMs_idx" ON "SequenceDispatch"("bucket", "status", "runAtMs");

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
