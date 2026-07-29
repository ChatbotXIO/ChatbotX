CREATE TYPE "metaCatalogImportStatus" AS ENUM('idle', 'queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "importStatus" "metaCatalogImportStatus" DEFAULT 'idle'::"metaCatalogImportStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "importTotalCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "importedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "importFailedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "importError" text;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN "lastImportedAt" timestamp(6) with time zone;