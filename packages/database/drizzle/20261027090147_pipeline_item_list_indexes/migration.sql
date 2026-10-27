DROP INDEX "PipelineItem_status_closedAt_idx";--> statement-breakpoint
CREATE INDEX "PipelineItem_pipeline_createdAt_idx" ON "PipelineItem" ("pipelineId","createdAt" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItem_pipeline_id_idx" ON "PipelineItem" ("pipelineId","id");