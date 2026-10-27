DROP INDEX "PipelineItem_stage_createdAt_idx";--> statement-breakpoint
CREATE INDEX "PipelineItem_stage_createdAt_idx" ON "PipelineItem" ("pipelineId","stageId","createdAt" DESC,"id" DESC);