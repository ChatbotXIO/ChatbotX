DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IntegrationInstagram' AND column_name = 'fallbackFlowId') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IntegrationInstagram' AND column_name = 'welcomeFlowId') THEN
      ALTER TABLE "IntegrationInstagram" RENAME COLUMN "fallbackFlowId" TO "welcomeFlowId";
    ELSE
      UPDATE "IntegrationInstagram" SET "welcomeFlowId" = "fallbackFlowId" WHERE "welcomeFlowId" IS NULL AND "fallbackFlowId" IS NOT NULL;
      ALTER TABLE "IntegrationInstagram" DROP COLUMN "fallbackFlowId";
    END IF;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IntegrationInstagram_fallbackFlowId_idx')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IntegrationInstagram_welcomeFlowId_idx') THEN
    ALTER INDEX "IntegrationInstagram_fallbackFlowId_idx" RENAME TO "IntegrationInstagram_welcomeFlowId_idx";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'IntegrationInstagram' AND constraint_name = 'IntegrationInstagram_fallbackFlowId_fkey') THEN
    ALTER TABLE "IntegrationInstagram" RENAME CONSTRAINT "IntegrationInstagram_fallbackFlowId_fkey" TO "IntegrationInstagram_welcomeFlowId_fkey";
  END IF;
END $$;--> statement-breakpoint
