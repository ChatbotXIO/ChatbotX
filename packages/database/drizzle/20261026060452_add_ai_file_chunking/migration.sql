ALTER TABLE "AIEmbedding" ADD COLUMN "chunkIndex" integer;--> statement-breakpoint
ALTER TABLE "AIFile" ADD COLUMN "chunking" jsonb;--> statement-breakpoint
ALTER TABLE "AIFile" ADD COLUMN "chunkingConfig" jsonb;--> statement-breakpoint
ALTER TABLE "AIFile" ADD COLUMN "processingRun" jsonb;